// Run before any remote migration (npm run deploy does). Fails when:
//  1. a migration contains a statement that can delete data (on D1 a DROP TABLE cascades through
//     every ON DELETE CASCADE child, so rebuilding `issues` would wipe comments, labels and history)
//     and the file has no `-- reviewed: <why this is safe>` line;
//  2. db/schema.ts no longer matches the latest migration snapshot, which means a schema change has
//     no migration, or a snapshot is stale (the next `void db generate` would then emit a bad diff).
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'db/migrations');
const problems = [];

const DANGEROUS = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE (cascades through ON DELETE CASCADE children on D1)'],
  [/__new_/i, 'a table rebuild (__new_ copy, then DROP TABLE)'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
  [/\bPRAGMA\s+foreign_keys\b/i, 'PRAGMA foreign_keys (not honoured on D1)'],
];

const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
for (const name of files) {
  const sql = readFileSync(path.join(dir, name), 'utf8');
  const reviewed = /^--\s*reviewed:\s*\S/m.test(sql);
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const [pattern, label] of DANGEROUS) {
    if (pattern.test(code) && !reviewed) {
      problems.push(`${name}: contains ${label}. Rewrite it without data loss, or add "-- reviewed: <why it is safe>".`);
    }
  }
}

// Schema vs latest snapshot.
const require = createRequire(path.join(root, 'package.json'));
const { generateSQLiteDrizzleJson } = require('drizzle-kit/api');
const schema = await import(path.join(root, 'db/schema.ts'));
const current = await generateSQLiteDrizzleJson(schema);
const journal = JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8'));
const lastTag = journal.entries.at(-1)?.tag;
const snapshotName = readdirSync(path.join(dir, 'meta')).find(
  (name) => lastTag && name.startsWith(lastTag.split('_')[0]) && name.endsWith('_snapshot.json'),
);
if (!snapshotName) {
  problems.push(`No snapshot found for the latest migration ${lastTag}.`);
} else {
  const snapshot = JSON.parse(readFileSync(path.join(dir, 'meta', snapshotName), 'utf8'));
  const shape = (json) =>
    Object.fromEntries(
      Object.entries(json.tables)
        .map(([table, value]) => [
          table,
          {
            columns: Object.keys(value.columns).sort(),
            indexes: Object.keys(value.indexes ?? {}).sort(),
          },
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  const want = shape(current);
  const have = shape(snapshot);
  for (const table of new Set([...Object.keys(want), ...Object.keys(have)])) {
    const a = JSON.stringify(want[table] ?? null);
    const b = JSON.stringify(have[table] ?? null);
    if (a !== b) {
      problems.push(
        `Table "${table}" in db/schema.ts differs from snapshot ${snapshotName}. Run \`npx void db generate\` (or repair the snapshot) before deploying.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('Migration check failed:\n' + problems.map((line) => `  - ${line}`).join('\n'));
  process.exit(1);
}
console.log(`Migration check passed: ${files.length} migrations, schema matches ${snapshotName}.`);
