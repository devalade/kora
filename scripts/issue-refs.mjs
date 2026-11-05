// Issue references in chat: `#` autocomplete, chip + embed card, live status, history and inbox rows.
// Needs the dev server on :5174, the seeded demo data and the sqlite3 CLI. Cleans up what it creates.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const dbPath =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const shots =
  process.env.SHOTS ??
  '/private/tmp/claude-502/-Users-macuser-Works-personal-kora/fe552ea5-e7d5-4812-bed4-850e6e6cbb3b/scratchpad/refs';
mkdirSync(shots, { recursive: true });

const sql = (query) => execFileSync('sqlite3', [dbPath, query], { encoding: 'utf8' }).trim();
// The message shows up on the poll before the server has written its history and inbox rows.
async function settled(read, done = Boolean) {
  let value = read();
  for (let attempt = 0; attempt < 20 && !done(value); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = read();
  }
  return value;
}
const marker = `refs-${Date.now() % 100000}`;
// KOR-2 is assigned to Amina and created by Alade, so Amina is its follower and Alade is the actor.
const ISSUE_KEY = 'KOR-2';
const ISSUE_NUMBER = 2;
const originalStatus = sql(
  `select i.status from issues i join teams t on t.id=i.team_id where t.key='KOR' and i.number=${ISSUE_NUMBER} and i.workspace_id='ws-kora'`,
);
const issueId = sql(
  `select i.id from issues i join teams t on t.id=i.team_id where t.key='KOR' and i.number=${ISSUE_NUMBER} and i.workspace_id='ws-kora'`,
);

const browser = await chromium.launch();
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/login`);
  const emailField = page.getByLabel('Email');
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  for (let attempt = 0; attempt < 30; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await emailField.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await emailField.fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general');
  await page.getByRole('textbox', { name: /Message #general/i }).waitFor();
  return { context, page, errors };
}

const alade = await login('alade@kora.app');
const amina = await login('amina@kora.app');
const composer = alade.page.getByPlaceholder('Message #general');
const menu = alade.page.getByRole('listbox', { name: 'Link an issue or channel' });

try {
  // 1. Autocomplete: `#KOR` lists issues, `#gen` lists the channel, `#kor2` finds KOR-2 by key.
  await composer.click();
  await composer.pressSequentially('Please take a look');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('#KOR');
  await menu.waitFor({ timeout: 10000 });
  const options = menu.getByRole('option');
  await options.first().waitFor();
  check('# menu lists issues', (await menu.getByText('Issues', { exact: true }).count()) === 1);
  check('first option is a KOR issue', /KOR-\d+/.test(await options.first().innerText()));
  await alade.page.waitForTimeout(400);
  await alade.page.screenshot({ path: `${shots}/composer-menu-1440.png` });

  await composer.pressSequentially(`-${ISSUE_NUMBER}`);
  await menu.getByRole('option', { name: new RegExp(`${ISSUE_KEY}\\b`) }).first().waitFor();
  await menu.getByRole('option', { name: new RegExp(`${ISSUE_KEY}\\b`) }).first().click();
  await alade.page.waitForTimeout(200); // the caret moves on the next frame
  check('menu closes after a pick', (await menu.count()) === 0);
  check(
    'plain key text inserted',
    (await composer.inputValue()) === `Please take a look\n${ISSUE_KEY} `,
    JSON.stringify(await composer.inputValue()),
  );

  // Both sections together, then a key written without a dash, then clean up the draft.
  await composer.pressSequentially('#');
  await menu.waitFor();
  check(
    '# alone shows channels and issues',
    (await menu.getByText('Channels', { exact: true }).count()) === 1 &&
      (await menu.getByText('Issues', { exact: true }).count()) === 1,
  );
  await composer.press('Escape');
  await composer.press('Backspace');
  await composer.pressSequentially('#kor2');
  await menu.getByRole('option', { name: /KOR-2\b/ }).first().waitFor();
  check('kor2 matches KOR-2', /KOR-2\b/.test(await menu.getByRole('option').first().innerText()));
  await composer.press('Escape');
  for (let i = 0; i < 5; i++) await composer.press('Backspace');
  await composer.pressSequentially('#gen');
  await menu.getByText('general', { exact: true }).waitFor();
  check('#gen suggests the channel', true);
  await composer.press('Escape');
  for (let i = 0; i < 4; i++) await composer.press('Backspace');
  check('draft restored', (await composer.inputValue()) === `Please take a look\n${ISSUE_KEY} `);
  // The marker goes on the first line and an inline key renders a chip; the key alone on the
  // second line renders an embed card, so one message covers both forms.
  await composer.fill(`Please take a look ${marker} at ${ISSUE_KEY}\n${ISSUE_KEY}`);
  await composer.press('Enter');

  const row = alade.page.locator('.message-row').filter({ hasText: `Please take a look ${marker}` });
  await row.waitFor({ timeout: 10000 });
  const links = row.locator(`a[href$="/tasks/${ISSUE_KEY}"]`);
  await links.nth(1).waitFor({ timeout: 10000 });
  check('chip and embed card both rendered', (await links.count()) === 2, `${await links.count()} links`);
  check('chip shows the title', (await links.first().innerText()).includes(ISSUE_KEY));
  await row.scrollIntoViewIfNeeded();
  await alade.page.waitForTimeout(300);
  await alade.page.screenshot({ path: `${shots}/message-1440.png` });

  // 2. Amina sees the chip, then watches its status change.
  const aminaRow = amina.page.locator('.message-row').filter({ hasText: `Please take a look ${marker}` });
  await aminaRow.waitFor({ timeout: 15000 });
  const aminaChip = aminaRow.locator(`a[href$="/tasks/${ISSUE_KEY}"]`).first();
  const before = (await aminaChip.getAttribute('title')) ?? '';
  const nextStatus = originalStatus === 'in_review' ? 'in_progress' : 'in_review';
  sql(`update issues set status='${nextStatus}' where id='${issueId}'`);
  const nextName = sql(`select name from task_statuses where id='${nextStatus}' and workspace_id='ws-kora'`);
  let after = before;
  for (let attempt = 0; attempt < 20 && !after.includes(nextName); attempt++) {
    await amina.page.waitForTimeout(500);
    after = (await aminaChip.getAttribute('title')) ?? '';
  }
  check('second account sees the status change', after.includes(nextName), `${before} -> ${after}`);
  check('embed card shows the new status', (await aminaRow.getByText(nextName, { exact: true }).count()) >= 1);

  // 3. History and inbox rows.
  const messageId = sql(`select id from messages where body like '%${marker}%' order by created_at desc limit 1`);
  const events = await settled(() =>
    sql(
      `select kind||'|'||actor_id||'|'||to_value from issue_events where issue_id='${issueId}' and to_value like '%${messageId}%'`,
    ),
  );
  check('mentioned event written', events.startsWith('mentioned|u-alade|') && events.includes('"channelName":"general"'), events);
  const mentionedBy = await settled(() =>
    sql(
      `select user_id from notifications where kind='issue_mentioned' and message_id='${messageId}' and issue_id='${issueId}'`,
    ),
  );
  const followers = mentionedBy.split('\n');
  check(
    'issue followers notified, actor skipped',
    followers.includes('u-amina') && !followers.includes('u-alade'),
    followers.join(','),
  );

  // 4. @mention and thread reply notifications.
  await composer.fill(`@amina ping ${marker}`);
  await composer.press('Enter');
  await alade.page.locator('.message-row').filter({ hasText: `ping ${marker}` }).waitFor({ timeout: 10000 });
  const pingId = sql(`select id from messages where body='@amina ping ${marker}'`);
  check(
    'teammate mention notified',
    (await settled(() =>
      sql(`select user_id from notifications where kind='message_mention' and message_id='${pingId}'`),
    )) === 'u-amina',
  );

  const aminaComposer = amina.page.getByPlaceholder('Message #general');
  await aminaComposer.fill(`Thread parent ${marker}`);
  await aminaComposer.press('Enter');
  const parentRow = alade.page.locator('.message-row').filter({ hasText: `Thread parent ${marker}` });
  await parentRow.waitFor({ timeout: 15000 });
  await parentRow.hover();
  await parentRow.getByRole('button', { name: 'Reply in thread' }).click();
  const reply = alade.page.getByPlaceholder('Reply in thread');
  await reply.waitFor();
  await alade.page.waitForTimeout(1200); // the panel loads its thread before it accepts a reply
  await reply.fill(`Thread answer ${marker} see ${ISSUE_KEY}`);
  await reply.press('Enter');
  await alade.page.getByText(`Thread answer ${marker}`).waitFor({ timeout: 10000 });
  const replyId = await settled(() => sql(`select id from messages where body like 'Thread answer ${marker}%'`));
  check(
    'thread reply notified the parent author',
    (await settled(() =>
      sql(`select user_id from notifications where kind='thread_reply' and message_id='${replyId}'`),
    )) === 'u-amina',
    `reply ${replyId}`,
  );
  check(
    'thread reply with a key also reached issue followers',
    (await settled(() =>
      sql(
        `select count(*) from notifications where kind='issue_mentioned' and message_id='${replyId}' and user_id='u-amina'`,
      ),
      (count) => count === '1',
    )) === '1',
  );
  await alade.page.getByText(`Thread answer ${marker}`).locator('xpath=ancestor::article[1]').locator(`a[href$="/tasks/${ISSUE_KEY}"]`).first().waitFor({ timeout: 6000 });
  check('chip renders in the thread panel', true);

  // 5. Unknown keys stay plain text.
  await composer.fill(`Nothing here: ZZZ-99 ${marker}`);
  await composer.press('Enter');
  const plain = alade.page.locator('.message-row').filter({ hasText: `ZZZ-99 ${marker}` });
  await plain.waitFor({ timeout: 10000 });
  await alade.page.waitForTimeout(2500);
  check('unknown key is not a link', (await plain.locator('a').count()) === 0);

  // 6. Phone width.
  await alade.page.setViewportSize({ width: 390, height: 844 });
  await alade.page.reload();
  await composer.waitFor();
  await alade.page.waitForTimeout(500);
  await row.scrollIntoViewIfNeeded();
  await alade.page.screenshot({ path: `${shots}/message-390.png` });
  await composer.click();
  await composer.fill('');
  await composer.pressSequentially('#KOR');
  await menu.waitFor();
  await alade.page.waitForTimeout(400);
  await alade.page.screenshot({ path: `${shots}/composer-menu-390.png` });
  const box = await menu.boundingBox();
  check('menu fits a phone screen', Boolean(box) && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await composer.press('Escape');
  await composer.fill('');
  const overflow = await alade.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('no horizontal page scroll at 390', !overflow);
} catch (error) {
  console.log('ERROR', error instanceof Error ? error.message : error);
  await alade.page.screenshot({ path: `${shots}/failure.png` }).catch(() => undefined);
  failures.push('exception');
} finally {
  sql(`update issues set status='${originalStatus}' where id='${issueId}'`);
  const ids = sql(`select id from messages where body like '%${marker}%'`).split('\n').filter(Boolean);
  if (ids.length > 0) {
    const list = ids.map((id) => `'${id}'`).join(',');
    sql(`delete from notifications where message_id in (${list})`);
    sql(`delete from issue_events where kind='mentioned' and (${ids.map((id) => `to_value like '%${id}%'`).join(' or ')})`);
    sql(`delete from messages where id in (${list})`);
  }
  const errors = [...alade.errors, ...amina.errors].filter((line) => !/Failed to load resource/.test(line));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 5));
  await browser.close();
}

console.log(failures.length === 0 ? 'issue-refs: pass' : `issue-refs: FAIL ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
