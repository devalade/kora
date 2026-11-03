import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(base, { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/kora-landing.png', fullPage: true });

await page.getByRole('link', { name: 'Sign in' }).first().click();
await page.waitForURL('**/login');
await page.getByRole('button', { name: /Try the demo workspace/i }).click();
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL('**/app', { timeout: 20000 });
await page.screenshot({ path: '/tmp/kora-workspaces.png', fullPage: true });

await page.getByRole('link', { name: /Kora Studio/i }).click();
await page.waitForURL('**/app/kora-studio/ch-general', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/kora-app.png', fullPage: false });

const marker = `Smoke test ${Date.now()}`;
const composer = page.getByRole('textbox', { name: /Message #general/i });
await composer.fill(marker);
await composer.press('Enter');
await page.getByText(marker, { exact: true }).waitFor({ timeout: 10000 });

await page.getByRole('button', { name: /3 replies/i }).first().click();
await page.getByText('Thread', { exact: true }).waitFor({ timeout: 5000 });
await page.getByPlaceholder('Reply in thread').waitFor({ timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/kora-thread.png', fullPage: false });
const replyMarker = `Thread reply ${Date.now()}`;
const replyBox = page.getByPlaceholder('Reply in thread');
await replyBox.fill(replyMarker);
await replyBox.press('Enter');
await page.getByText(replyMarker, { exact: true }).waitFor({ timeout: 10000 });

await page.keyboard.press('Escape');
await page.keyboard.press('Meta+k');
await page.getByPlaceholder(/Search messages/i).fill('signups');
await page.waitForTimeout(1200);
await page.getByText(/The launch page is up/i).first().waitFor({ timeout: 8000 });
await page.screenshot({ path: '/tmp/kora-search.png', fullPage: false });

console.log(JSON.stringify({ marker, replyMarker, errors }, null, 2));
await browser.close();
