// `npm run dev`: the app (Vite, port 5174 by default) and the realtime worker (wrangler, port 8787)
// together. Stopping one stops both.
import { spawn } from 'node:child_process';

const children = [
  spawn('npx', ['vite', ...process.argv.slice(2)], { stdio: 'inherit' }),
  spawn('npx', ['wrangler', 'dev', '-c', 'realtime/wrangler.jsonc', '--port', '8787', '--local'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  }),
];

function stop(code = 0) {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exit(code);
}
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
