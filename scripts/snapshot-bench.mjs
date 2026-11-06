// Times workspaceSnapshotFn: signs in, captures the page's own snapshot request, replays it N times.
// Usage: node scripts/snapshot-bench.mjs [runs]
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const runs = Number(process.argv[2] ?? 40);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('alade@kora.app');
await page.getByLabel('Password').fill('demo1234');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL('**/app', { timeout: 20000 });
const captured = page.waitForRequest((r) => r.url().includes('_serverFn') && Buffer.from(r.url().split('/_serverFn/')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString().includes('workspaceSnapshotFn'), { timeout: 15000 });
await page.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'domcontentloaded' });
const request = await captured;
const url = request.url();
const headers = await request.allHeaders();
await page.close();
const times = [];
let bytes = 0;
for (let i = 0; i < runs; i++) {
  const start = performance.now();
  const response = await context.request.get(url, { headers });
  const body = await response.body();
  times.push(performance.now() - start);
  bytes = body.length;
  if (i === 0 && process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, body);
  if (i === 0) console.log('queries:', body.toString().slice(-40));
  if (!response.ok()) throw new Error(`snapshot failed: ${response.status()}`);
}
times.sort((a, b) => a - b);
const pick = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
console.log(`snapshot x${runs}: median ${pick(0.5)} ms, p95 ${pick(0.95)} ms, min ${times[0].toFixed(1)} ms, ${bytes} bytes`);
await browser.close();
