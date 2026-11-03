import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const base = 'http://localhost:5174';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAWklEQVR4nO3BMQEAAADCoPVPbQhfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAM1AAAB9f3l1AAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync('/tmp/kora-test.png', png);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Try the demo/i }).click();
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
await page.getByRole('link', { name: /Kora Studio/i }).click();
await page.waitForURL('**/ch-general');
await page.getByRole('textbox', { name: /Message #general/i }).waitFor();

const marker = `Upload test ${Date.now()}`;
await page.locator('input[type=file]').setInputFiles('/tmp/kora-test.png');
await page.getByText('kora-test.png').waitFor({ timeout: 15000 });
await page.getByRole('textbox', { name: /Message #general/i }).fill(marker);
await page.getByRole('textbox', { name: /Message #general/i }).press('Enter');
await page.getByText(marker, { exact: true }).waitFor({ timeout: 15000 });
const image = page.locator('img[alt="kora-test.png"]').last();
await image.waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const size = await image.evaluate((node) => ({
  width: node.naturalWidth,
  height: node.naturalHeight,
  src: node.getAttribute('src'),
}));
await page.screenshot({ path: '/tmp/kora-upload.png' });
console.log(JSON.stringify({ size, errors }, null, 2));
await browser.close();
