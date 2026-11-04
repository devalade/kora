import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
await page.getByRole('link', { name: /Kora Studio/i }).click();
await page.waitForURL('**/ch-general');
await page.getByRole('link', { name: 'Tasks' }).first().click();
await page.waitForURL('**/tasks');
await page.getByRole('heading', { name: 'All issues' }).waitFor({ timeout: 20000 });

// Search.
const search = page.getByLabel('Filter issues');
await search.fill('Studio');
await page.waitForTimeout(500);
const searchVisible = await page.getByText('Ship the Studio virtual office').isVisible();
const searchHidden = await page.getByText('Command menu for tasks').count();

// Clear and filter status.
await search.fill('');
await page.getByRole('button', { name: /^Todo/ }).click();
await page.waitForTimeout(500);
const todoVisible = await page.getByText('Command menu for tasks').isVisible();
const progressHidden = await page.getByText('Tasks: list and board views').count();
await page.getByRole('button', { name: /^All \d+/ }).click();

// Board view.
await page.getByRole('button', { name: 'Board', exact: true }).last().click();
await page.waitForTimeout(800);
const boardCard = page.locator('button[data-issue-id][draggable="true"]').first();
const cardTitle = await boardCard.innerText();
await page.locator('section[data-status="in_progress"]').first().waitFor();
const dragResult = await page
  .locator('button[data-issue-id][draggable="true"]')
  .filter({ hasText: 'Command menu for tasks' })
  .dragTo(page.locator('section[data-status="in_progress"]'))
  .then(() => true)
  .catch(() => false);

// Command menu.
await page.keyboard.press('Meta+k');
await page.getByRole('dialog', { name: 'Command menu' }).waitFor({ timeout: 5000 });
await page.keyboard.press('Escape');
const commandClosed = (await page.getByRole('dialog', { name: 'Command menu' }).count()) === 0;

// Create issue with keyboard shortcut.
await page.keyboard.press('c');
await page.getByRole('dialog', { name: 'New issue' }).waitFor({ timeout: 5000 });
await page.getByPlaceholder('Issue title').fill('Keyboard created issue');
await page.getByRole('button', { name: 'Create issue' }).click();
await page.waitForTimeout(1800);
const created = await page.getByText('Keyboard created issue').count();

await page.screenshot({ path: '/tmp/kora-tasks-final.png' });

console.log(
  JSON.stringify(
    {
      searchVisible,
      searchHidden,
      todoVisible,
      progressHidden,
      dragResult,
      boardCard: cardTitle.replace(/\s+/g, ' ').slice(0, 80),
      commandClosed,
      created,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
