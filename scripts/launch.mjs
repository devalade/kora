// The launch list, end to end, in a brand-new workspace with two fresh accounts: edit and delete
// messages (an admin deleting someone else's), the reaction picker, copied message links, drafts,
// paste and drop uploads, the 25 MB check, the "New" divider, tab titles, browser notifications,
// mute, rename and leave a channel, rename the workspace, reset the invite link, remove a member,
// forgot and reset password through the dev inbox, change password, write rate limits, the 404
// and legal pages, robots and Open Graph tags, the ? shortcut sheet, and the members sheet on a
// phone.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.KORA_URL ?? 'http://localhost:5174';
const DB =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const sql = (statement) => execFileSync('sqlite3', [DB, statement], { encoding: 'utf8' }).trim();
const stamp = Date.now().toString(36);
const ownerEmail = `launch-owner-${stamp}@kora.app`;
const memberEmail = `launch-member-${stamp}@kora.app`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}
async function step(name, run) {
  try {
    await run();
  } catch (error) {
    check(name, false, String(error).split('\n')[0]);
  }
}
const until = async (read, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await read()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const browser = await chromium.launch();
const errors = [];

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.split('\n')[0]}`));
  return page;
}

async function signUp(page, name, email) {
  await page.goto(`${base}/signup`);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app', { timeout: 20000 });
}

function row(page, text) {
  return page.locator('.message-row', { hasText: text }).first();
}

async function send(page, text) {
  const box = page.getByRole('textbox', { name: /^Message / });
  await box.fill(text);
  await box.press('Enter');
  await row(page, text).waitFor({ timeout: 10000 });
}

// Notifications are recorded instead of shown, so the test can see them.
const recordNotifications = () => {
  window.__notes = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, options) {
      window.__notes.push({ title, body: options?.body ?? '' });
    }
    close() {}
  }
  window.Notification = FakeNotification;
};

const owner = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
await owner.context().addInitScript(recordNotifications);
const member = await newPage();
let slug = '';
let general = '';
let random = '';

try {
  await signUp(owner, 'Launch Owner', ownerEmail);
  await owner.getByPlaceholder('Acme Studio').fill(`Launch ${stamp}`);
  await owner.getByRole('button', { name: 'Create', exact: true }).click();
  await owner.waitForURL(/\/app\/launch-[^/]+\/.+/, { timeout: 20000 });
  slug = new URL(owner.url()).pathname.split('/')[2];
  const workspaceId = sql(`select id from workspaces where slug='${slug}'`);
  general = sql(`select id from channels where workspace_id='${workspaceId}' and name='general'`);
  random = sql(`select id from channels where workspace_id='${workspaceId}' and name='random'`);
  const code = sql(`select invite_code from workspaces where id='${workspaceId}'`);

  await signUp(member, 'Launch Member', memberEmail);
  await member.goto(`${base}/join/${code}`);
  await member.getByRole('button', { name: 'Join workspace' }).click();
  await member.waitForURL(new RegExp(`/app/${slug}/`), { timeout: 20000 });
  await member.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
  await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });

  await step('edit a message', async () => {
    await send(owner, `Launch edit ${stamp}`);
    const target = row(owner, `Launch edit ${stamp}`);
    await target.hover();
    await target.getByRole('button', { name: 'Edit message' }).click();
    const editor = owner.getByRole('textbox', { name: 'Edit message' });
    await editor.fill(`Launch edited ${stamp}`);
    await editor.press('Enter');
    await row(owner, `Launch edited ${stamp}`).getByText('(edited)').waitFor({ timeout: 8000 });
    check('edit a message shows (edited)', true);
    const seen = await until(() => member.getByText(`Launch edited ${stamp}`).count().then((n) => n > 0));
    check('a teammate sees the edit live', seen);
    check('edit is stored', sql(`select count(*) from messages where body='Launch edited ${stamp}' and edited_at is not null`) === '1');
  });

  await step('reaction picker', async () => {
    const target = row(owner, `Launch edited ${stamp}`);
    await target.hover();
    await target.getByRole('button', { name: 'Add reaction' }).click();
    const picker = owner.getByRole('dialog', { name: 'Pick a reaction' });
    await picker.getByRole('textbox', { name: 'Search emoji' }).fill('rocket');
    await picker.getByRole('textbox', { name: 'Search emoji' }).press('Enter');
    const added = await until(() => target.locator('button[title="1 reaction"]', { hasText: '🚀' }).count().then((n) => n > 0));
    check('reaction picker search and Enter adds a reaction', added);
  });

  await step('copy link', async () => {
    const target = row(owner, `Launch edited ${stamp}`);
    await target.hover();
    await target.getByRole('button', { name: 'More actions' }).click();
    await owner.getByRole('menuitem', { name: 'Copy link' }).click();
    const link = await owner.evaluate(() => navigator.clipboard.readText());
    const messageId = sql(`select id from messages where body='Launch edited ${stamp}'`);
    check('copied link points at the message', link.endsWith(`/app/${slug}/${general}?m=${messageId}`), link);
    await member.goto(link, { waitUntil: 'networkidle' });
    const highlighted = await until(() =>
      member.locator(`#message-${messageId}`).evaluate((el) => el.className.includes('bg-coral-soft')).catch(() => false),
    );
    check('opening a message link highlights it', highlighted);
  });

  await step('admin deletes a teammate message', async () => {
    await send(member, `Launch doomed ${stamp}`);
    await row(owner, `Launch doomed ${stamp}`).waitFor({ timeout: 8000 });
    const target = row(owner, `Launch doomed ${stamp}`);
    await target.hover();
    await target.getByRole('button', { name: 'More actions' }).click();
    await owner.getByRole('menuitem', { name: 'Delete message' }).click();
    await owner.getByRole('dialog', { name: 'Delete message?' }).getByRole('button', { name: 'Delete' }).click();
    const gone = await until(() => owner.getByText(`Launch doomed ${stamp}`).count().then((n) => n === 0));
    check('an admin deletes a teammate message', gone);
    const goneForMember = await until(() => member.getByText(`Launch doomed ${stamp}`).count().then((n) => n === 0));
    check('the deleted message disappears for its author live', goneForMember);
    check('delete clears the text in the database', sql(`select count(*) from messages where body like 'Launch doomed ${stamp}%'`) === '0');
  });

  await step('member cannot delete the owner message', async () => {
    const target = row(member, `Launch edited ${stamp}`);
    await target.hover();
    await target.getByRole('button', { name: 'More actions' }).click();
    const canDelete = await member.getByRole('menuitem', { name: 'Delete message' }).count();
    await member.keyboard.press('Escape');
    check('members see no Delete on other people’s messages', canDelete === 0);
  });

  await step('drafts', async () => {
    await owner.getByRole('textbox', { name: /^Message / }).fill(`Launch draft ${stamp}`);
    await owner.goto(`${base}/app/${slug}/${random}`, { waitUntil: 'networkidle' });
    await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    const kept = await owner.getByRole('textbox', { name: /^Message / }).inputValue();
    check('unsent text survives leaving the channel', kept === `Launch draft ${stamp}`, kept);
    await owner.getByRole('textbox', { name: /^Message / }).fill('');
  });

  await step('paste and drop uploads', async () => {
    const box = owner.getByRole('textbox', { name: /^Message / });
    await box.focus();
    await owner.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'pasted.png', { type: 'image/png' }));
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    const pasted = await until(() => owner.getByText('pasted.png').count().then((n) => n > 0).catch(() => false), 3000)
      .then(async (shown) => shown || (await owner.locator('img[alt="pasted.png"], [title="pasted.png"]').count()) > 0);
    const draftCards = async () => owner.locator('.group\\/draft').count();
    check('pasting an image attaches it', pasted || (await draftCards()) === 1, `drafts ${await draftCards()}`);
    await owner.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(['dropped notes'], 'dropped.txt', { type: 'text/plain' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, bubbles: true }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    });
    const dropped = await until(() => draftCards().then((n) => n === 2));
    check('dropping a file on the page attaches it', dropped, `drafts ${await draftCards()}`);
    await owner.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(26 * 1024 * 1024)], 'huge.bin', { type: 'application/octet-stream' }));
      document.querySelector('textarea[aria-label^="Message "]').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    const refused = await until(() => owner.getByText('huge.bin is over the 25 MB limit.').count().then((n) => n > 0));
    check('a file over 25 MB is refused before uploading', refused && (await draftCards()) === 2);
    const ready = await until(() => owner.getByRole('button', { name: /^Send/ }).isEnabled().catch(() => true), 10000);
    await owner.getByRole('textbox', { name: /^Message / }).fill(`Launch files ${stamp}`);
    await owner.getByRole('textbox', { name: /^Message / }).press('Enter');
    const sent = await until(() => sql(`select count(*) from attachments a join messages m on m.id=a.message_id where m.body='Launch files ${stamp}'`) === '2', 10000);
    check('pasted and dropped files send with the message', ready && sent);
  });

  await step('new divider, tab title and notifications', async () => {
    // Notifications are on for the owner; they look at #random while the member writes elsewhere.
    await owner.evaluate(() => localStorage.setItem('kora.notifications', 'on'));
    await owner.goto(`${base}/app/${slug}/${random}`, { waitUntil: 'networkidle' });
    await member.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    await send(member, `Launch unseen ${stamp}`);
    // A DM to the owner.
    await member.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    const ownerId = sql(`select id from users where email='${ownerEmail}'`);
    const dmId = await member.evaluate(
      async ({ workspaceId, userId }) => {
        const chat = await import('/app/lib/chat.ts');
        const { channelId } = await chat.openDmFn({ data: { workspaceId, userId } });
        await chat.sendMessageFn({ data: { channelId, body: 'Launch dm hello', attachmentIds: [] } });
        return channelId;
      },
      { workspaceId, userId: ownerId },
    );
    const titled = await until(() => owner.title().then((title) => title.startsWith('(1) ')), 10000);
    check('tab title counts the unread DM', titled, await owner.title());
    const notified = await until(() =>
      owner.evaluate(() => window.__notes.some((note) => note.title === 'Launch Member')),
    );
    check('a desktop notification announces the DM', notified, JSON.stringify(await owner.evaluate(() => window.__notes)));
    await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    const divider = owner.getByRole('separator', { name: 'New messages' });
    await divider.waitFor({ timeout: 8000 });
    const beforeUnseen = await owner.evaluate((text) => {
      const line = document.querySelector('[aria-label="New messages"]');
      const message = [...document.querySelectorAll('.message-row')].find((el) => el.textContent.includes(text));
      return Boolean(line && message && line.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, `Launch unseen ${stamp}`);
    check('a New line sits above the first unread message', beforeUnseen);
    await owner.goto(`${base}/app/${slug}/${dmId}`, { waitUntil: 'networkidle' });
  });

  await step('mute a channel', async () => {
    await owner.goto(`${base}/app/${slug}/${random}`, { waitUntil: 'networkidle' });
    await owner.getByRole('button', { name: 'Channel details' }).click();
    await owner.getByRole('button', { name: /^Mute/ }).click();
    await owner.getByText('Muted. Only mentions will reach you.').waitFor({ timeout: 8000 });
    await owner.keyboard.press('Escape');
    check('mute is stored', sql(`select count(*) from channel_members where channel_id='${random}' and muted_at is not null`) === '1');
    await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    await member.goto(`${base}/app/${slug}/${random}`, { waitUntil: 'networkidle' });
    await send(member, `Launch muted ${stamp}`);
    await owner.waitForTimeout(1500);
    const sidebarRandom = owner.locator('nav a', { hasText: 'random' }).first();
    const badge = await sidebarRandom.locator('.bg-coral').count();
    check('a muted channel shows no unread badge', badge === 0 && (await sidebarRandom.getByLabel('Muted').count()) === 1);
  });

  await step('rename and leave a channel', async () => {
    await owner.goto(`${base}/app/${slug}/${random}`, { waitUntil: 'networkidle' });
    await owner.getByRole('button', { name: 'Channel details' }).click();
    await owner.getByLabel('Name').fill(`Random Talk ${stamp}`);
    await owner.getByRole('button', { name: 'Save', exact: true }).click();
    await owner.getByText('Channel updated.').waitFor({ timeout: 8000 });
    const newName = `random-talk-${stamp}`;
    check('rename stores a slug', sql(`select name from channels where id='${random}'`) === newName);
    const memberSees = await until(() => member.locator('nav').getByText(newName).count().then((n) => n > 0));
    check('a teammate sees the new channel name live', memberSees);
    await member.getByRole('button', { name: 'Channel details' }).click();
    const memberCanRename = await member.getByLabel('Name').isEnabled();
    check('a member cannot rename a channel they did not create', !memberCanRename);
    member.once('dialog', (dialog) => void dialog.accept());
    await member.getByRole('button', { name: 'Leave channel' }).click();
    await member.waitForURL(new RegExp(`/app/${slug}/(?!${random})`), { timeout: 10000 });
    const left = await until(() => member.locator('nav').getByText(newName).count().then((n) => n === 0));
    check('leaving a channel removes it from the sidebar', left);
  });

  await step('workspace settings and invite reset', async () => {
    await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
    await owner.getByRole('button', { name: new RegExp(`Launch ${stamp}`) }).first().click();
    await owner.getByRole('button', { name: 'Workspace settings' }).click();
    await owner.getByLabel('Workspace name').fill(`Launch Renamed ${stamp}`);
    await owner.getByRole('button', { name: 'Save', exact: true }).click();
    await owner.getByText('Workspace renamed.').waitFor({ timeout: 8000 });
    const seen = await until(() => member.getByText(`Launch Renamed ${stamp}`).count().then((n) => n > 0));
    check('a workspace rename reaches teammates live', seen);
    const before = sql(`select invite_code from workspaces where slug='${slug}'`);
    await owner.getByRole('button', { name: new RegExp(`Launch Renamed ${stamp}`) }).first().click();
    await owner.getByRole('button', { name: 'Invite people' }).click();
    owner.once('dialog', (dialog) => void dialog.accept());
    await owner.getByRole('button', { name: 'Reset link' }).click();
    await owner.getByText('New invite link ready. The old one no longer works.').waitFor({ timeout: 8000 });
    const after = sql(`select invite_code from workspaces where slug='${slug}'`);
    check('reset link makes a new invite code', after !== before && after.length > 0);
    await owner.keyboard.press('Escape');
  });

  await step('remove a member', async () => {
    await owner.getByRole('button', { name: new RegExp(`Launch Renamed ${stamp}`) }).first().click();
    await owner.getByRole('button', { name: 'Members & roles' }).click();
    owner.once('dialog', (dialog) => void dialog.accept());
    await owner.getByRole('button', { name: 'Remove Launch Member' }).click();
    await owner.getByText('Launch Member was removed.').waitFor({ timeout: 8000 });
    await owner.keyboard.press('Escape');
    const kicked = await until(() => member.url().endsWith('/app'), 10000);
    check('a removed member is sent out of the workspace', kicked, member.url());
    check('removal deletes their channel memberships', sql(`select count(*) from channel_members cm join channels c on c.id=cm.channel_id join users u on u.id=cm.user_id where u.email='${memberEmail}' and c.workspace_id='${workspaceId}'`) === '0');
  });

  await step('write rate limit', async () => {
    const result = await owner.evaluate(async (channelId) => {
      const chat = await import('/app/lib/chat.ts');
      let refused = '';
      for (let index = 0; index < 125 && !refused; index += 1) {
        try {
          await chat.sendMessageFn({ data: { channelId, body: `Launch flood ${index}`, attachmentIds: [] } });
        } catch (error) {
          refused = `${index}: ${error.message}`;
        }
      }
      return refused;
    }, general);
    check('sending more than 120 messages a minute is refused', /too fast/.test(result), result);
    sql(`delete from login_attempts where key like 'write:message:%'`);
  });
} finally {
  await member.context().close();
}

await step('forgot and reset password', async () => {
  const page = await newPage();
  await page.goto(`${base}/login`);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
  await page.getByLabel('Email').fill(memberEmail);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 10000 });
  const token = readFileSync('.void/dev-trigger-token', 'utf8').trim();
  const list = await (await fetch(`${base}/__void/inbox`, { headers: { 'x-void-dev-trigger': token } })).text();
  const id = [...list.matchAll(/\/([^/"]+)\/raw/g)].map((match) => match[1])[0];
  const raw = await (await fetch(`${base}/__void/inbox/${id}/raw`, { headers: { 'x-void-dev-trigger': token } })).text();
  const unfolded = raw.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const link = unfolded.match(/https?:\/\/[^\s"<]+\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
  check('the reset email arrives with a link', Boolean(link) && raw.includes(memberEmail), link ?? 'no link');
  await page.goto(link, { waitUntil: 'networkidle' });
  await page.getByLabel('New password', { exact: true }).fill('fresh-pass-123');
  await page.getByLabel('Confirm new password').fill('fresh-pass-123');
  await page.getByRole('button', { name: 'Save and sign in' }).click();
  await page.waitForURL('**/app', { timeout: 15000 });
  check('resetting signs the person in', true);
  await page.goto(link);
  check('a reset link works only once', (await page.getByRole('heading', { name: 'This link has expired' }).count()) === 1);
  const other = await newPage();
  await other.goto(`${base}/login`);
  await other.getByLabel('Email').fill(memberEmail);
  await other.getByLabel('Password').fill('fresh-pass-123');
  await other.getByRole('button', { name: 'Sign in', exact: true }).click();
  await other.waitForURL('**/app', { timeout: 15000 });
  check('the new password signs in', true);
  await other.context().close();
  await page.context().close();
});

await step('change password', async () => {
  await owner.goto(`${base}/app/${slug}/${general}`, { waitUntil: 'networkidle' });
  await owner.getByRole('button', { name: 'Open profile' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Your profile' });
  await dialog.getByRole('button', { name: 'Change', exact: true }).click();
  await dialog.getByLabel('Current password').fill('wrong-pass');
  await dialog.getByLabel('New password').fill('owner-pass-123');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  const refused = await until(() => dialog.getByText('Your current password is incorrect.').count().then((n) => n > 0));
  await dialog.getByLabel('Current password').fill('demo1234');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  const changed = await until(() => owner.getByText('Password changed. Other devices were signed out.').count().then((n) => n > 0));
  check('change password needs the current one, then works', refused && changed);
  await owner.keyboard.press('Escape');
});

await step('shortcut sheet and phone members', async () => {
  await owner.locator('body').click({ position: { x: 700, y: 300 } });
  await owner.keyboard.press('Shift+Slash');
  const open = await owner.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible().catch(() => false);
  check('? opens the shortcut sheet', open);
  await owner.keyboard.press('Escape');
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.getByRole('button', { name: 'Members', exact: true }).click();
  const sheet = await until(() => owner.getByText(/in this channel/).isVisible().catch(() => false));
  check('the members list opens on a phone', sheet);
  await owner.setViewportSize({ width: 1440, height: 900 });
});

await step('public pages', async () => {
  const page = await newPage();
  const missing = await page.goto(`${base}/no-such-page-${stamp}`);
  check('unknown URLs show the 404 page', missing.status() === 404 && (await page.getByRole('heading', { name: 'This page does not exist' }).count()) === 1);
  await page.goto(`${base}/terms`);
  check('terms page', (await page.getByRole('heading', { name: 'Terms of use' }).count()) === 1);
  await page.goto(`${base}/privacy`);
  check('privacy page', (await page.getByRole('heading', { name: 'Privacy policy' }).count()) === 1);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  check('robots.txt keeps the app out of search', robots.includes('Disallow: /app'));
  const home = await (await fetch(`${base}/`)).text();
  check('home has Open Graph and Twitter tags', /og:image" content="https:\/\/kora\.zecreator\.com\/og\.png/.test(home) && home.includes('summary_large_image'));
  const og = await fetch(`${base}/og.png`);
  check('the social image is served', og.ok && og.headers.get('content-type') === 'image/png');
  await page.context().close();
});

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = checks.filter((item) => !item.ok).length;
console.log(failed === 0 ? `launch ok (${checks.length} checks)` : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
