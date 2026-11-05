// Typing indicators with two accounts: a thread reply shows in that thread (and not in the channel),
// and an issue comment shows on the issue page until the comment is posted.
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

const result = {
  threadPanelFound,
  threadTyping,
  channelTypingLeak,
  threadCleared,
  issueTyping,
  commentArrived,
  issueCleared,
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
    errors.length === 0
    ? 0
    : 1,
);
