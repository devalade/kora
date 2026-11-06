// Typing indicators with two accounts: a thread reply shows in that thread (and not in the channel),
// an issue comment shows on the issue page until the comment is posted, the sidebar shows dots on a
// channel or DM someone is typing in, and the issue page says who is editing the description.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];

async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app', { timeout: 20000 });
  return page;
}

async function seen(page, text, timeout = 8000) {
  return page
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false);
}

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');

// Thread typing.
for (const page of [alade, amina]) {
  await page.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /\d+ replies/i }).first().click();
  await page.getByPlaceholder('Reply in thread').waitFor({ timeout: 10000 });
}
await amina.getByPlaceholder('Reply in thread').pressSequentially('Typing in the thread', { delay: 60 });
const threadPanel = alade.locator('aside').filter({ has: alade.getByPlaceholder('Reply in thread') });
const threadPanelFound = await threadPanel.count();
const threadTyping = await seen(threadPanel, 'Amina is typing');
const channelArea = alade.locator('main section').first();
const channelTypingLeak = await channelArea.getByText('Amina is typing').count();
await amina.getByPlaceholder('Reply in thread').fill('');
const threadCleared = await threadPanel
  .getByText('Amina is typing')
  .waitFor({ state: 'detached', timeout: 10000 })
  .then(() => true)
  .catch(() => false);

// Issue comment typing.
for (const page of [alade, amina]) {
  await page.goto(`${base}/app/kora-studio/tasks/KOR-1`, { waitUntil: 'networkidle' });
  await page.getByLabel('Leave a comment').waitFor({ timeout: 10000 });
}
const comment = `Typing test ${Date.now()}`;
await amina.getByLabel('Leave a comment').pressSequentially(comment, { delay: 50 });
const issueTyping = await seen(alade, 'Amina is typing');
await amina.getByRole('button', { name: 'Comment' }).click();
const commentArrived = await seen(alade, comment, 10000);
const issueCleared = await alade
  .getByText('Amina is typing')
  .waitFor({ state: 'detached', timeout: 6000 })
  .then(() => true)
  .catch(() => false);

// Sidebar dots: Alade is in #product while Amina types in #general, then in their DM.
await alade.goto(`${base}/app/kora-studio/ch-product`, { waitUntil: 'networkidle' });
await amina.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
const sidebar = alade.locator('aside');
const generalComposer = amina.getByPlaceholder('Message #general');
await generalComposer.pressSequentially('Typing test sidebar', { delay: 50 });
const sidebarChannelDots = await sidebar
  .getByRole('status', { name: 'Amina is typing' })
  .first()
  .waitFor({ timeout: 6000 })
  .then(() => true)
  .catch(() => false);
await generalComposer.fill('');
await amina.goto(`${base}/app/kora-studio/ch-dm-alade-amina`, { waitUntil: 'networkidle' });
const dmComposer = amina.locator('textarea').first();
await dmComposer.pressSequentially(`Typing test dm ${Date.now()}`, { delay: 50 });
const sidebarDmTyping = await sidebar
  .getByText('typing…')
  .first()
  .waitFor({ timeout: 6000 })
  .then(() => true)
  .catch(() => false);
// Sending clears the dots at once, without waiting for them to expire.
await dmComposer.press('Enter');
const sentAt = Date.now();
const sidebarDmCleared = await sidebar
  .getByText('typing…')
  .waitFor({ state: 'detached', timeout: 2500 })
  .then(() => Date.now() - sentAt)
  .catch(() => false);

// Description editing on a throwaway issue.
await amina.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await amina.locator('[data-issue-id]').first().waitFor({ timeout: 20000 });
await amina.keyboard.press('c');
const modal = amina.getByRole('dialog', { name: 'New issue' });
await modal.waitFor();
await modal.getByLabel('Issue title', { exact: true }).fill(`Typing test issue ${Date.now()}`);
await modal.getByRole('button', { name: 'Create issue' }).click();
await modal.waitFor({ state: 'detached' });
await amina.getByRole('button', { name: 'View issue', exact: true }).click();
await amina.waitForURL(/\/tasks\/KOR-\d+$/);
await alade.goto(amina.url(), { waitUntil: 'networkidle' });
await amina.waitForTimeout(500);
await amina.getByLabel('Issue description').click();
await amina.keyboard.type('Draft notes for the release', { delay: 50 });
const descriptionEditing = await seen(alade, 'editing the description');
const descriptionNotComment = (await alade.getByText('Amina is typing').count()) === 0;
const descriptionEditingCleared = await alade
  .getByText('editing the description')
  .first()
  .waitFor({ state: 'detached', timeout: 10000 })
  .then(() => true)
  .catch((error) => {
    errors.push(`description editing did not clear: ${error.message.split('\n')[0]}`);
    return false;
  });

const result = {
  threadPanelFound,
  threadTyping,
  channelTypingLeak,
  threadCleared,
  issueTyping,
  commentArrived,
  issueCleared,
  sidebarChannelDots,
  sidebarDmTyping,
  sidebarDmCleared,
  descriptionEditing,
  descriptionNotComment,
  descriptionEditingCleared,
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(
  threadPanelFound === 1 &&
    threadTyping &&
    channelTypingLeak === 0 &&
    threadCleared &&
    issueTyping &&
    commentArrived &&
    issueCleared &&
    sidebarChannelDots &&
    sidebarDmTyping &&
    sidebarDmCleared !== false &&
    descriptionEditing &&
    descriptionNotComment &&
    descriptionEditingCleared &&
    errors.length === 0
    ? 0
    : 1,
);
