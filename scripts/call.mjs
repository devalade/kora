import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function login(email, password) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  const emailField = page.getByLabel('Email');
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  for (let attempt = 0; attempt < 30; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await emailField.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await emailField.fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 20000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general', { timeout: 20000 });
  await page.getByRole('textbox', { name: /Message #general/i }).waitFor({ timeout: 20000 });
  return { context, page, errors };
}

const alade = await login('alade@kora.app', 'demo1234');
const amina = await login('amina@kora.app', 'demo1234');

await alade.page.getByRole('button', { name: /Huddle/i }).click();
await alade.page.getByRole('banner').getByText('Huddle live').waitFor({ timeout: 20000 });
await alade.page.waitForTimeout(1500);
await alade.page.screenshot({ path: '/tmp/kora-call-a-alone.png' });

await amina.page.waitForTimeout(2500);
const joinButton = amina.page.getByRole('button', { name: /Join huddle/i }).first();
await joinButton.waitFor({ timeout: 15000 });
await joinButton.click();
await amina.page.getByRole('banner').getByText('Huddle live').waitFor({ timeout: 20000 });
await amina.page.waitForTimeout(5000);

const aVideos = await alade.page.locator('video').evaluateAll((nodes) =>
  nodes.map((node) => ({ w: node.videoWidth, h: node.videoHeight, muted: node.muted })),
);
const bVideos = await amina.page.locator('video').evaluateAll((nodes) =>
  nodes.map((node) => ({ w: node.videoWidth, h: node.videoHeight, muted: node.muted })),
);

await alade.page.screenshot({ path: '/tmp/kora-call-a.png' });
await amina.page.screenshot({ path: '/tmp/kora-call-b.png' });

await amina.page.getByRole('button', { name: 'Leave', exact: true }).click();
await amina.page.waitForTimeout(2500);
const aAfter = await alade.page.getByText(/in the room/i).innerText();

console.log(
  JSON.stringify(
    {
      aVideos,
      bVideos,
      aAfter,
      errors: [...alade.errors, ...amina.errors],
    },
    null,
    2,
  ),
);
await browser.close();
