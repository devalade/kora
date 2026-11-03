import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
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
  await page.getByRole('heading', { name: 'The floor' }).waitFor({ timeout: 20000 });
  return page;
}

const alade = await login('alade@kora.app');
const amina = await login('amina@kora.app');

await amina.getByRole('button', { name: /Lounge/i }).first().click();
await amina.waitForTimeout(1200);
await amina.getByLabel('What are you doing?').fill('Writing launch notes');
await amina.getByLabel('What are you doing?').press('Enter');

await alade
  .locator('button[aria-label="Amina Diallo, Writing launch notes"]')
  .waitFor({ timeout: 12000 });

console.log('live update received');
await alade.screenshot({ path: '/tmp/kora-office-live.png' });
await browser.close();
