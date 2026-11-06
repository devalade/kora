// Roles, the issue trash, and description conflicts.
//  - A member cannot delete someone else's issue or change the workflow (checked on the server).
//  - A member can delete their own issue; it goes to the trash and can be restored.
//  - The owner can make a member an admin, who then gets the workflow controls.
//  - Two people editing one description: the second save gets a conflict instead of overwriting.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];
const stamp = Date.now().toString(36);

async function signIn(email) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app');
  return page;
}

// Calls a server function the way the app does, from the signed-in page (dev server only).
async function callServer(page, name, data) {
  return page.evaluate(
    async ([fnName, payload]) => {
      const module = await import('/app/lib/tasks.ts');
      try {
        return { ok: true, value: await module[fnName]({ data: payload }) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    [name, data],
  );
}

async function createIssue(page, title) {
  await page.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
  await page.keyboard.press('c');
  const modal = page.getByRole('dialog', { name: 'New issue' });
  await modal.getByLabel('Issue title', { exact: true }).fill(title);
  await modal.getByRole('button', { name: 'Create issue' }).click();
  await modal.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'View issue', exact: true }).click();
  await page.waitForURL(/\/tasks\/[A-Z]+-\d+$/);
  await page.waitForTimeout(800);
  return page.url().split('/').pop();
}

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');

// 1. Member vs someone else's issue: no delete in the menu, and the server refuses.
const aladeKey = await createIssue(alade, `Owner issue ${stamp}`);
const aladeIssueId = await alade.evaluate(() => document.querySelector('[data-issue-id]')?.getAttribute('data-issue-id'));
await amina.goto(`${base}/app/kora-studio/tasks/${aladeKey}`, { waitUntil: 'networkidle' });
await amina.getByRole('button', { name: 'More actions' }).click();
const memberSeesDelete = await amina.getByRole('menuitem', { name: /Delete issue/ }).count();
await amina.keyboard.press('Escape');
const issueIdForKey = async (page, key) => {
  const result = await callServer(page, 'getIssueFn', { slug: 'kora-studio', issueKey: key });
  return result.ok ? result.value.issue.id : null;
};
const ownerIssueId = aladeIssueId ?? (await issueIdForKey(amina, aladeKey));
const memberDelete = await callServer(amina, 'deleteIssueFn', { issueId: ownerIssueId });
const memberWorkflow = await callServer(amina, 'createTaskStatusFn', {
  slug: 'kora-studio',
  name: `Sneaky ${stamp}`,
  category: 'started',
  color: '#5b8def',
});

// 2. Member deletes their own issue: trash, then restore.
const aminaKey = await createIssue(amina, `Member issue ${stamp}`);
await amina.getByRole('button', { name: 'More actions' }).click();
await amina.getByRole('menuitem', { name: /Delete issue/ }).click();
await amina.getByRole('dialog', { name: 'Delete this issue?' }).getByRole('button', { name: 'Delete issue' }).click();
await amina.waitForURL(/\/tasks(\?|$)/);
await amina.goto(`${base}/app/kora-studio/tasks/trash`, { waitUntil: 'networkidle' });
const inTrash = await amina.getByText(`Member issue ${stamp}`).count();
await amina.getByRole('button', { name: `Restore ${aminaKey}` }).click();
await amina.getByText(`${aminaKey} restored.`).waitFor({ timeout: 8000 });
await amina.goto(`${base}/app/kora-studio/tasks/${aminaKey}`, { waitUntil: 'networkidle' });
const restored = await amina.getByLabel('Issue title', { exact: true }).inputValue();

// 3. Owner promotes Amina to admin; she then sees the workflow controls. Then demote again.
await alade.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
await alade.getByRole('button', { name: /Kora Studio/ }).first().click();
await alade.getByRole('button', { name: 'Members & roles' }).click();
const members = alade.getByRole('dialog', { name: 'Members & roles' });
await members.getByLabel('Role for Amina Diallo').selectOption('admin');
await alade.getByText('Amina Diallo is now an admin.').waitFor({ timeout: 8000 });
await amina.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
const adminSeesWorkflow = await amina.getByRole('button', { name: 'Manage statuses' }).count();
await members.getByLabel('Role for Amina Diallo').selectOption('member');
await alade.getByText('Amina Diallo is now a member.').waitFor({ timeout: 8000 });
await amina.reload({ waitUntil: 'networkidle' });
const memberSeesWorkflow = await amina.getByRole('button', { name: 'Manage statuses' }).count();

// 4. Description conflict: Alade saves first; Amina's save, based on the old text, conflicts.
await alade.goto(`${base}/app/kora-studio/tasks/${aladeKey}`, { waitUntil: 'networkidle' });
await amina.goto(`${base}/app/kora-studio/tasks/${aladeKey}`, { waitUntil: 'networkidle' });
await alade.getByLabel('Issue description').click();
await amina.getByLabel('Issue description').click();
await alade.keyboard.type('Owner text');
await alade.locator('body').click({ position: { x: 5, y: 400 } });
await alade.waitForTimeout(1500);
await amina.keyboard.type('Member text');
await amina.locator('body').click({ position: { x: 5, y: 400 } });
const conflictShown = await amina
  .getByRole('alert')
  .filter({ hasText: 'changed this description while you were editing' })
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
await amina.getByRole('button', { name: 'Keep mine' }).click();
await amina.waitForTimeout(1500);
const afterKeep = await callServer(amina, 'getIssueFn', { slug: 'kora-studio', issueKey: aladeKey });

// Clean up: both test issues go to the trash, then are removed for good below by the caller's SQL.
await callServer(alade, 'deleteIssueFn', { issueId: ownerIssueId });
const aminaIssueId = await issueIdForKey(amina, aminaKey);
if (aminaIssueId) await callServer(amina, 'deleteIssueFn', { issueId: aminaIssueId });

const result = {
  memberSeesDelete,
  memberDeleteRefused: !memberDelete.ok && /creator|admin/i.test(memberDelete.message),
  memberWorkflowRefused: !memberWorkflow.ok && /admins/i.test(memberWorkflow.message),
  inTrash,
  restored: restored === `Member issue ${stamp}`,
  adminSeesWorkflow,
  memberSeesWorkflow,
  conflictShown,
  keptMine: afterKeep.ok && afterKeep.value.issue.description.includes('Member text'),
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(
  result.memberSeesDelete === 0 &&
    result.memberDeleteRefused &&
    result.memberWorkflowRefused &&
    result.inTrash === 1 &&
    result.restored &&
    result.adminSeesWorkflow === 1 &&
    result.memberSeesWorkflow === 0 &&
    result.conflictShown &&
    result.keptMine &&
    errors.length === 0
    ? 0
    : 1,
);
