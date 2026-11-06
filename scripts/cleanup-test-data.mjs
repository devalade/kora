// Removes what the verification scripts leave in the LOCAL database: throwaway accounts and their
// workspaces, test issues, test messages and rate-limit rows. It only ever opens the local
// Miniflare D1 file; it cannot reach the deployed database.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.void/v3/d1/miniflare-D1DatabaseObject');
const file = readdirSync(dir)
  .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map((name) => path.join(dir, name))
  .find((candidate) => {
    try {
      return execFileSync('sqlite3', [candidate, "select count(*) from sqlite_master where name='issues';"])
        .toString()
        .trim() === '1';
    } catch {
      return false;
    }
  });
if (!file) {
  console.error('No local app database found under .void/. Nothing to clean.');
  process.exit(1);
}

const TEST_EMAILS = ['first-run-%', 'stranger-%', 'dbg-%', 'auth-security-%', 'throwaway-%'];
const TEST_TITLES = [
  'Owner issue %', 'Member issue %', 'Smoke test issue', 'Smoke test child', 'History issue %',
  'First issue in a new workspace', 'Second issue', 'Cap filler %', 'Cap needle %', 'Realtime issue %', 'Date picker check %',
];
const TEST_MESSAGES = ['Smoke test %', 'Thread reply %', 'Upload test %', 'Typing test %', 'Jump check %',
  'Bottom check %', 'VISUALCHECK%', 'Realtime check %', '@alade Realtime check %', 'Private realtime %'];

const list = (column, patterns) => patterns.map((p) => `${column} like '${p.replace(/'/g, "''")}'`).join(' or ');
const sql = `
PRAGMA foreign_keys=ON;
create temp table doomed_users as select id from users where ${list('email', TEST_EMAILS)};
delete from workspaces where created_by in (select id from doomed_users);
delete from users where id in (select id from doomed_users);
select 'users removed', changes();
delete from issues where ${list('title', TEST_TITLES)};
select 'issues removed', changes();
delete from messages where ${list('body', TEST_MESSAGES)};
select 'messages removed', changes();
delete from issue_comments where body like 'Typing test %';
select 'issue comments removed', changes();
delete from projects where name like 'History test %';
delete from channels where kind = 'private' and name like 'rt-%';
delete from login_attempts;
select 'rate-limit rows removed', changes();
`;
console.log(execFileSync('sqlite3', [file], { input: sql }).toString().trim());
