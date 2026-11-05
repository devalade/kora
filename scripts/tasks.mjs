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

// Unique titles keep "Add existing issue" from picking a child left behind by an earlier run.
const stamp = Date.now().toString(36);
const parentTitle = `Smoke test issue ${stamp}`;
const childTitle = `Smoke test child ${stamp}`;

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

// New issues open in a modal over the current view, like Linear.
async function createInModal(title) {
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.press('c');
  const modal = page.getByRole('dialog', { name: 'New issue' });
  await modal.waitFor();
  await modal.getByLabel('Issue title', { exact: true }).fill(title);
  return modal;
}

const modal = await createInModal(parentTitle);
await modal.locator('.tiptap').click();
await page.keyboard.type('Created by the smoke test.');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('[ ] One ');
await page.keyboard.press('Enter');
await page.keyboard.type('Two');
await modal.getByRole('button', { name: 'Create issue' }).click();
await modal.waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'View issue', exact: true }).click();
await page.waitForURL(/\/tasks\/KOR-\d+$/);
const parentKey = page.url().split('/').pop();
const createdTitle = await page.getByLabel('Issue title', { exact: true }).inputValue();
const createdTasks = await page.getByRole('checkbox').count();
await page.getByLabel('Leave a comment').fill('Smoke test comment.');
await page.getByRole('button', { name: 'Comment' }).click();
await page.waitForTimeout(500);
const createdComment = await page.getByText('Smoke test comment.').count();

// Sub-issues are ordinary issues: create one on its own, then attach it from the parent.
const childModal = await createInModal(childTitle);
await childModal.getByRole('button', { name: 'Create issue' }).click();
await childModal.waitFor({ state: 'detached' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Add existing issue' }).click();
await page.getByPlaceholder('Add existing issue…').fill(childTitle);
await page.keyboard.press('Enter');
const subIssues = page.locator('section[aria-labelledby="sub-issues-heading"]');
await subIssues.getByText(childTitle).waitFor({ timeout: 8000 });
const attached = await subIssues.getByText(childTitle).count();
const childKey = (await subIssues.locator('a').first().getAttribute('href')).split('/').pop();
await subIssues.getByText(childTitle).click();
await page.waitForURL(new RegExp(`/tasks/${childKey}$`));
const childBreadcrumb = await page
  .getByRole('navigation', { name: 'Breadcrumb' })
  .getByRole('link', { name: parentKey })
  .waitFor({ timeout: 8000 })
  .then(() => 1)
  .catch(() => 0);
await page.goBack();
await page.waitForURL(new RegExp(`/tasks/${parentKey}$`));
await subIssues.getByText(childTitle).hover();
await subIssues.getByRole('button', { name: `Remove ${childKey} from sub-issues` }).click();
const detached = await subIssues
  .getByText(childTitle)
  .waitFor({ state: 'detached', timeout: 8000 })
  .then(() => true)
  .catch(() => false);

async function deleteCurrentIssue() {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Delete issue/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this issue?' });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: 'Delete issue' }).click();
  await page.waitForURL(/\/tasks(\?|$)/);
}
await deleteCurrentIssue();
await page.goto(page.url().replace(/\/tasks.*$/, `/tasks/${childKey}`));
await page.getByLabel('Issue title', { exact: true }).waitFor();
// A full page load paints the server HTML before React hydrates; clicking a menu before
// hydration attaches does nothing, so wait for the button to be interactive.
await page.waitForFunction(() => {
  const button = document.querySelector('[aria-label="More actions"]');
  return Boolean(button && Object.keys(button).some((key) => key.startsWith('__reactProps')));
});
await deleteCurrentIssue();
await page.getByRole('heading', { name: /All issues/ }).waitFor();
const deleted =
  (await page.getByText(parentTitle).count()) === 0 && (await page.getByText(childTitle).count()) === 0;

await page.getByRole('button', { name: 'Manage statuses' }).click();
await page.getByLabel('New status name').fill('QA Smoke');
await page.getByRole('dialog').getByRole('button', { name: 'Add status' }).click();
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
const mobileTitle = await mobile.getByLabel('Issue title', { exact: true }).inputValue();

console.log(
  JSON.stringify(
    {
      initialRows,
      searchVisible,
      boardColumns,
      createdTitle,
      createdTasks,
      createdComment,
      attached,
      childBreadcrumb,
      detached,
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
const passed =
  createdTitle === parentTitle &&
  createdTasks === 2 &&
  createdComment === 1 &&
  attached === 1 &&
  childBreadcrumb === 1 &&
  detached &&
  deleted &&
  statusAdded === 1 &&
  statusDeleted &&
  mobileOverflow === 0 &&
  errors.length === 0;
process.exit(passed ? 0 : 1);
