import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function login(email) {
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
  await page.goto(`${base}/login`);
  const field = page.getByLabel('Email');
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  for (let attempt = 0; attempt < 40; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await field.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await field.fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general');
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await page.waitForURL('**/office');
  await page.getByRole('heading', { name: 'The floor' }).waitFor({ timeout: 20000 });
  return { context, page, errors };
}

const alade = await login('alade@kora.app');

// Move to Focus from the room list.
await alade.page.getByRole('button', { name: /Focus room/i }).click();
await alade.page.waitForTimeout(1600);
const focusActive = await alade.page
  .getByRole('button', { name: /Focus room/i })
  .evaluate((node) => node.className.includes('bg-white/12'));
await alade.page.screenshot({ path: '/tmp/kora-office-focus.png' });

// Set status and activity.
await alade.page.locator('section').filter({ hasText: 'Your status' }).getByRole('button', { name: 'Focus', exact: true }).click();
const activity = alade.page.getByLabel('What are you doing?');
await activity.fill('Designing the Studio');
await activity.press('Enter');
await alade.page.waitForTimeout(1600);

// Select a teammate.
await alade.page.getByRole('button', { name: /Amina Diallo,/ }).click();
const profileVisible = await alade.page.getByRole('button', { name: 'Message' }).isVisible();

// Start a huddle.
await alade.page.getByRole('button', { name: /Start huddle/i }).click();
await alade.page.getByText('Huddle live').first().waitFor({ timeout: 30000 });
await alade.page.waitForTimeout(1500);
await alade.page.screenshot({ path: '/tmp/kora-office-call.png' });

const amina = await login('amina@kora.app');
const join = amina.page.getByRole('button', { name: /Join huddle/i }).first();
await join.waitFor({ timeout: 15000 });
await join.click();
await amina.page.getByText('Huddle live').first().waitFor({ timeout: 20000 });
await amina.page.waitForTimeout(3500);
const roomText = await alade.page.getByText(/in the room/i).first().innerText();
await alade.page.screenshot({ path: '/tmp/kora-office-call-2.png' });

await amina.page.getByRole('button', { name: 'Leave', exact: true }).click();
await amina.page.waitForTimeout(2000);

console.log(
  JSON.stringify(
    {
      focusActive,
      profileVisible,
      roomText,
      errors: [...alade.errors, ...amina.errors],
    },
    null,
    2,
  ),
);
await browser.close();
