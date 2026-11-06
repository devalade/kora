import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const domain = process.env.VITE_KORA_DOMAIN || 'kora.zecreator.com';
const source = 'realtime/wrangler.jsonc';
const target = 'realtime/.wrangler.deploy.json';

const config = JSON.parse(
  readFileSync(source, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n'),
);
config.routes = [{ pattern: `realtime.${domain}`, custom_domain: true }];
config.vars = { ...config.vars, APP_ORIGIN: `https://${domain}` };
writeFileSync(target, JSON.stringify(config, null, 2));

const result = spawnSync('npx', ['wrangler', 'deploy', '-c', target, ...process.argv.slice(2)], { stdio: 'inherit' });
rmSync(target, { force: true });
process.exit(result.status ?? 1);
