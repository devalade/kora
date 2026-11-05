// Projects and the issue history line: create a project, add an issue to it from the panel,
// change its priority, and check that both changes show up as history lines and in the project.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const stamp = Date.now().toString(36);
const projectName = `History test ${stamp}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('alade@kora.app');
await page.getByLabel('Password').fill('demo1234');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL('**/app');

// 1. Create a project on the Projects page.
await page.goto(`${base}/app/kora-studio/tasks/projects`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New project' }).first().click();
const dialog = page.getByRole('dialog', { name: 'New project' });
await dialog.getByLabel('Name').fill(projectName);
await dialog.getByRole('button', { name: 'Create project' }).click();
await dialog.waitFor({ state: 'detached' });
const projectListed = await page
  .getByRole('table', { name: 'Projects' })
  .getByText(projectName)
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);

// 2. Create an issue, open it.
await page.keyboard.press('c');
const modal = page.getByRole('dialog', { name: 'New issue' });
await modal.getByLabel('Issue title', { exact: true }).fill(`History issue ${stamp}`);
await modal.getByRole('button', { name: 'Create issue' }).click();
await modal.waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'View issue', exact: true }).click();
await page.waitForURL(/\/tasks\/KOR-\d+$/);
const panel = page.getByRole('complementary', { name: 'Issue properties' });

// 3. Add it to the project and set a priority from the panel.
await panel.getByRole('button', { name: 'Project' }).click();
await page.getByPlaceholder('Add to project…').fill(projectName);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await panel.getByRole('button', { name: 'Priority' }).click();
await page.getByPlaceholder('Set priority…').fill('Urgent');
await page.keyboard.press('Enter');

const activity = page.locator('section[aria-labelledby="activity-heading"]');
const seen = (text) =>
  activity
    .getByText(text)
    .first()
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
const createdLine = await seen('created the issue');
const projectLine = await seen(`added to project`);
const priorityLine = await seen('set priority to');

// 4. The project counts the issue.
await page.goto(`${base}/app/kora-studio/tasks/projects`, { waitUntil: 'networkidle' });
const row = page.getByRole('row').filter({ hasText: projectName });
const issueCount = (await row.getByRole('cell').last().innerText()).trim();

// Clean up through the UI: delete the issue (its history goes with it), then the project.
await page.goBack();
await page.getByRole('button', { name: 'More actions' }).click();
await page.getByRole('menuitem', { name: /Delete issue/ }).click();
const confirm = page.getByRole('dialog', { name: 'Delete this issue?' });
await confirm.getByRole('button', { name: 'Delete issue' }).click();
await page.waitForURL(/\/tasks(\?|$)/);
await page.goto(`${base}/app/kora-studio/tasks/projects`, { waitUntil: 'networkidle' });
await page.getByRole('row').filter({ hasText: projectName }).hover();
await page.getByRole('button', { name: `Delete ${projectName}` }).click();
await page.getByRole('dialog', { name: 'Delete this project?' }).getByRole('button', { name: 'Delete project' }).click();
const projectGone = await page
  .getByRole('row')
  .filter({ hasText: projectName })
  .waitFor({ state: 'detached', timeout: 8000 })
  .then(() => true)
  .catch(() => false);
await browser.close();

const result = { projectListed, createdLine, projectLine, priorityLine, issueCount, projectGone, errors };
console.log(JSON.stringify(result, null, 2));
process.exit(
  projectListed && createdLine && projectLine && priorityLine && issueCount === '1' && projectGone && errors.length === 0
    ? 0
    : 1,
);
