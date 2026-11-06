// Markdown comments: the comment box formats as you type (like the description), Cmd/Ctrl+Enter
// posts, the saved comment renders formatted with issue chips, and the inbox preview is plain text.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(`${email}: ${message.text()}`);
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app', { timeout: 20000 });
  return page;
}

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');

// Amina creates a throwaway issue and assigns it to Alade, so Alade follows it.
await amina.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await amina.locator('[data-issue-id]').first().waitFor({ timeout: 20000 });
await amina.keyboard.press('c');
const modal = amina.getByRole('dialog', { name: 'New issue' });
await modal.waitFor();
await modal.getByLabel('Issue title', { exact: true }).fill(`Comment test issue ${Date.now()}`);
await modal.getByRole('button', { name: 'Assignee' }).click();
await amina.getByRole('option', { name: /Alade/ }).first().click();
await modal.getByRole('button', { name: 'Create issue' }).click();
await modal.waitFor({ state: 'detached' });
await amina.getByRole('button', { name: 'View issue', exact: true }).click();
await amina.waitForURL(/\/tasks\/KOR-\d+$/);
const issueUrl = amina.url();
await alade.goto(issueUrl, { waitUntil: 'networkidle' });

const box = amina.getByLabel('Leave a comment');
await box.click();
const keys = amina.keyboard;
await keys.type('Comment test **bold** and `code` for KOR-1 ');
await keys.press('Enter');
await keys.type('- [ ] first step');
await keys.press('Enter');
await keys.type('second step');
const live = await box.evaluate((element) => ({
  strong: Boolean(element.querySelector('strong')),
  code: Boolean(element.querySelector('code')),
  checklist: element.querySelectorAll('[data-type="taskItem"], li[data-checked]').length,
}));
check('the comment box formats bold as you type', live.strong);
check('the comment box formats inline code as you type', live.code);
check('the comment box makes a checklist from "- [ ] "', live.checklist === 2, `${live.checklist} items`);

await keys.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
const comment = alade.locator('li').filter({ hasText: 'Comment test' }).last();
const arrived = await comment
  .waitFor({ timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check('Cmd+Enter posts and the comment reaches the other person live', arrived);
if (arrived) {
  check('the saved comment shows bold', (await comment.locator('strong', { hasText: 'bold' }).count()) === 1);
  check('the saved comment shows inline code', (await comment.locator('code', { hasText: 'code' }).count()) === 1);
  check('the saved comment shows two checkboxes', (await comment.getByRole('checkbox').count()) === 2);
  check('KOR-1 renders as an issue chip', (await comment.locator('a[href*="/tasks/KOR-1"]').count()) >= 1);
  const raw = await comment.innerText();
  check('no Markdown markers show in the saved comment', !/\*\*|`|\[ \]/.test(raw), raw.replace(/\s+/g, ' ').slice(0, 80));
}
const emptied = await box.evaluate((element) => element.textContent?.trim() === '');
check('the comment box is empty after posting', emptied);
check('the comment box keeps focus after posting', await box.evaluate((element) => element.contains(document.activeElement)));

// Alade's inbox quotes the comment without Markdown.
await alade.goto(`${base}/app/kora-studio/inbox`, { waitUntil: 'networkidle' });
const preview = alade.getByText(/Comment test bold and code/).first();
check(
  'the inbox preview is plain text',
  await preview
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false),
);

check('no page errors', errors.length === 0, errors.join('; '));
await browser.close();
process.exit(results.every((result) => result.ok) ? 0 : 1);
