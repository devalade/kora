import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/login`);
  const emailField = page.getByLabel('Email');
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  for (let attempt = 0; attempt < 30; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await emailField.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await emailField.fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(6000);
  if (!page.url().endsWith('/app')) {
    console.log('LOGIN FAILED', email, page.url());
    console.log((await page.locator('body').innerText()).slice(0, 900));
    await page.screenshot({ path: `/tmp/kora-login-fail-${email.split('@')[0]}.png` });
  }
  await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general');
  await page.getByRole('textbox', { name: /Message #general/i }).waitFor();
  return { context, page, errors };
}

const alade = await login('alade@kora.app');
const amina = await login('amina@kora.app');

// Typing indicator.
await amina.page.getByRole('textbox', { name: /Message #general/i }).fill('typing check');
await alade.page.getByText(/Amina is typing/i).waitFor({ timeout: 10000 });
await amina.page.getByRole('textbox', { name: /Message #general/i }).fill('');

// Direct message unread.
await amina.page.locator('nav').getByRole('link', { name: /Alade Yessoufou/i }).click();
await amina.page.waitForURL(/ch-/);
await amina.page.getByRole('textbox', { name: /Message Alade/i }).fill('Ping from the DM test');
await amina.page.getByRole('textbox', { name: /Message Alade/i }).press('Enter');
await alade.page.locator('nav').getByText('Amina Diallo').first().waitFor({ timeout: 10000 });
const badge = await alade.page.locator('nav').getByText('Amina Diallo').first().locator('..').innerText();

// Reaction.
const row = alade.page.locator('.message-row').filter({ hasText: 'Shipping the message API' });
await row.hover();
await row.getByRole('button', { name: 'React with 🎉' }).click();
await alade.page.waitForTimeout(2500);
const reactionVisible = await alade.page.locator('.message-row').filter({ hasText: 'Shipping the message API' }).getByText('🎉').first().isVisible();

// Create a channel.
await alade.page.getByLabel('Create channel', { exact: true }).first().click();
const roomName = `qa-room-${Date.now() % 10000}`;
await alade.page.getByPlaceholder('launch-plan').fill(roomName);
await alade.page.getByRole('dialog').getByRole('button', { name: 'Create channel', exact: true }).click();
await alade.page.waitForURL(/\/app\/kora-studio\/ch-/);
await alade.page.getByRole('heading', { name: `#${roomName}`, exact: true }).waitFor({ timeout: 15000 });
await alade.page.waitForTimeout(800);
await alade.page.getByRole('textbox', { name: new RegExp(`Message #${roomName}`) }).fill('First message in the new room');
await alade.page.getByRole('textbox', { name: new RegExp(`Message #${roomName}`) }).press('Enter');
await alade.page.getByText('First message in the new room', { exact: true }).waitFor({ timeout: 10000 });
await alade.page.screenshot({ path: '/tmp/kora-new-channel.png' });

console.log(
  JSON.stringify(
    {
      typing: true,
      dmBadgeRow: badge.replace(/\s+/g, ' ').trim(),
      reactionVisible,
      errors: [...alade.errors, ...amina.errors],
    },
    null,
    2,
  ),
);
await browser.close();
