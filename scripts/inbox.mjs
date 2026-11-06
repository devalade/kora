import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const DB =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const sql = (statement) => execFileSync('sqlite3', [DB, statement], { encoding: 'utf8' }).trim();

async function until(read, expected, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (read() === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const workspaceId = sql("select id from workspaces where slug='kora-studio'");
const ids = ['nt-inbox-test-issue', 'nt-inbox-test-message'];
const cleanup = () => sql(`delete from notifications where id in (${ids.map((id) => `'${id}'`).join(',')})`);
const restore = () => {
  if (preexisting.length) sql(`update notifications set read_at=null where id in (${preexisting.map((id) => `'${id}'`).join(',')})`);
};
cleanup();
// Other tests leave unread items for Alade; remember them so the counts are relative and Mark all read is undone.
const unreadWhere = "user_id='u-alade' and read_at is null";
const preexisting = sql(`select id from notifications where ${unreadWhere}`).split('\n').filter(Boolean);
const baseline = preexisting.length;
const now = Date.now();
const iso = (offset) => new Date(now - offset).toISOString();
sql(
  `insert into notifications (id, workspace_id, user_id, actor_id, kind, issue_id, channel_id, message_id, body, read_at, created_at) values
  ('${ids[0]}', '${workspaceId}', 'u-alade', 'u-amina', 'issue_assigned', 'i-4', null, null, 'Please take this one before Friday.', null, '${iso(2_000)}'),
  ('${ids[1]}', '${workspaceId}', 'u-alade', 'u-amina', 'message_mention', null, 'ch-design', null, 'Can you look at the new icon set?', null, '${iso(4_000)}')`,
);

const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/login`);
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  const emailField = page.getByLabel('Email');
  for (let attempt = 0; attempt < 30; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await emailField.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await emailField.fill('alade@kora.app');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general');

  const rail = page.getByRole('navigation', { name: 'Kora' });
  const badge = rail.getByTestId('inbox-badge');
  await badge.waitFor({ timeout: 20000 });
  const labels = (await rail.getByRole('link').allInnerTexts()).map((text) => text.replace(/\d+|\s+/g, '')).filter(Boolean);
  check('rail order Inbox, Chat, Tasks, Studio', labels.join(',') === 'Inbox,Chat,Tasks,Studio', 'got ' + labels.join(','));

  check(`rail badge shows ${baseline + 2} (2 new) on the chat page`, (await badge.innerText()) === String(baseline + 2), await badge.innerText());

  await rail.getByRole('link', { name: /Inbox/ }).click();
  await page.waitForURL('**/inbox');
  const list = page.getByRole('region', { name: 'Notifications' });
  await list.getByText('Amina assigned you KOR-4', { exact: true }).waitFor({ timeout: 15000 });
  await list.getByText('Amina mentioned you in #design').waitFor();
  check('both items are listed', true);
  check('badge unchanged before selecting', (await badge.innerText()) === String(baseline + 2));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/inbox-before.png` });

  await list.getByText('Amina assigned you KOR-4', { exact: true }).click();
  await page.getByRole('link', { name: 'Open issue' }).waitFor();
  await page.waitForFunction((n) => document.querySelector('[data-testid="inbox-badge"]')?.textContent === String(n), baseline + 1, { timeout: 5000 });
  check('selecting an item marks it read and the badge drops to 1', true);
  check('server stored the read state', await until(() => sql(`select read_at is not null from notifications where id='${ids[0]}'`), '1'));
  check('unread dot is gone on the opened row', (await list.locator('[data-item-id="' + ids[0] + '"] [aria-label="Unread"]').count()) === 0);

  // Keyboard: j moves the cursor, u toggles read.
  await page.keyboard.press('j');
  await page.keyboard.press('u');
  await page.waitForTimeout(600);
  const afterU = sql(`select read_at is not null from notifications where id='${ids[1]}' or id='${ids[0]}' order by id`);
  check('keyboard u toggles the item under the cursor', afterU !== '', afterU.replace(/\n/g, ','));

  // Reset to a known state, then mark everything read.
  sql(`update notifications set read_at = null where id in ('${ids[0]}','${ids[1]}')`);
  // A raw database write publishes no realtime event, so reload as a person would.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction((n) => document.querySelector('[data-testid="inbox-badge"]')?.textContent === String(n), baseline + 2, { timeout: 15000 });
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await badge.waitFor({ state: 'detached', timeout: 5000 });
  check('Mark all read clears the badge', true);
  check('Mark all read stored for every item', await until(() => sql(`select count(*) from notifications where ${unreadWhere}`), '0'));
  check('server stored mark all read', await until(() => sql(`select count(*) from notifications where id in ('${ids[0]}','${ids[1]}') and read_at is null`), '0'));

  await page
    .getByRole('group', { name: 'Filter' })
    .getByRole('button', { name: 'All', exact: true })
    .click();
  await list.getByText('Amina assigned you KOR-4', { exact: true }).click();
  await page.getByRole('link', { name: 'Open issue' }).click();
  await page.waitForURL('**/tasks/KOR-4', { timeout: 15000 });
  check('Open issue goes to the issue page', page.url().endsWith('/tasks/KOR-4'));

  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('script ran to the end', false, String(error).split('\n')[0]);
} finally {
  cleanup();
  restore();
  await browser.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed === 0 ? `inbox ok (${checks.length} checks)` : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
