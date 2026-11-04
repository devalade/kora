import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

async function signIn(target) {
  await target.goto(`${base}/login`);
  const email = target.getByLabel('Email');
  for (let attempt = 0; attempt < 40; attempt++) {
    await target
      .getByRole('button', { name: /Try the demo workspace/i })
      .click({ timeout: 1000 })
      .catch(() => undefined);
    if (await email.inputValue().catch(() => '')) break;
    await target.waitForTimeout(200);
  }
  await target.getByRole('button', { name: 'Sign in', exact: true }).click();
  await target.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await target.getByRole('link', { name: /Kora Studio/i }).click();
  await target.waitForURL('**/ch-general');
}

await signIn(page);
await page.getByRole('link', { name: 'Tasks' }).first().click();
await page.waitForURL(/\/tasks(\?|$)/);
await page.locator('[data-issue-id]').first().waitFor({ timeout: 20000 });

const initialRows = await page.locator('[data-issue-id]').count();
if (initialRows < 10) throw new Error(`Expected seeded task rows, saw ${initialRows}.`);

const search = page.getByLabel('Filter issues');
await search.fill('Studio');
await page.waitForTimeout(400);
const searchVisible = await page.getByText('Ship the Studio virtual office').isVisible();
await search.fill('');

await page.getByRole('button', { name: 'Board', exact: true }).last().click();
await page.waitForTimeout(600);
const boardColumns = await page.locator('section[data-status]').count();
await page.getByRole('button', { name: 'List', exact: true }).click();
await page.waitForTimeout(600);

await page.getByRole('link', { name: /New issue/ }).first().click();
await page.waitForURL('**/tasks/new');
await page.getByLabel('Issue title').fill('Smoke test issue');
await page.getByLabel('Issue description').fill('Created by the smoke test.');
await page.getByRole('button', { name: /Create issue/ }).click();
await page.waitForURL(/\/tasks\/KOR-\d+$/);
const createdTitle = await page.getByLabel('Issue title').inputValue();
await page.getByLabel('Leave a comment').fill('Smoke test comment.');
await page.getByRole('button', { name: 'Comment' }).click();
await page.waitForTimeout(500);
const createdComment = await page.getByText('Smoke test comment.').count();

await page.getByRole('button', { name: 'Delete issue' }).first().click();
await page.getByRole('dialog', { name: 'Delete this issue?' }).waitFor();
await page.getByRole('dialog', { name: 'Delete this issue?' }).getByRole('button', { name: 'Delete issue' }).click();
await page.waitForURL(/\/tasks(\?|$)/);
await page.getByRole('heading', { name: /All issues/ }).waitFor();
const deleted = (await page.getByText('Smoke test issue').count()) === 0;

await page.getByRole('button', { name: /Manage/ }).click();
await page.getByLabel('New status name').fill('QA Smoke');
await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(1000);
const statusAdded = await page.getByLabel('Delete QA Smoke').count();
await page.getByLabel('Delete QA Smoke').click();
await page.getByRole('button', { name: 'Remove status' }).click();
await page.waitForTimeout(1000);
const statusDeleted = (await page.getByLabel('Delete QA Smoke').count()) === 0;
await page.getByRole('button', { name: 'Done', exact: true }).click();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await signIn(mobile);
await mobile.getByRole('button', { name: 'Open navigation' }).click();
await mobile.getByRole('link', { name: 'Tasks' }).first().click();
await mobile.waitForURL(/\/tasks(\?|$)/);
await mobile.locator('[data-issue-id]').first().waitFor({ timeout: 20000 });
await mobile.locator('[data-issue-id]').first().click();
await mobile.waitForURL(/\/tasks\/[A-Z]+-\d+$/);
const mobileOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
const mobileTitle = await mobile.getByLabel('Issue title').inputValue();

console.log(
  JSON.stringify(
    {
      initialRows,
      searchVisible,
      boardColumns,
      createdTitle,
      createdComment,
      deleted,
      statusAdded,
      statusDeleted,
      mobileOverflow,
      mobileTitle,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length > 0) process.exit(1);
