// Realtime, end to end, with two signed-in people and the realtime worker running (npm run dev).
//   1. Nothing polls: an idle channel page makes no snapshot requests at all.
//   2. A message, typing, a new issue, an inbox item and a brand-new channel reach the other person
//      by push, within about a second.
//   3. The worker refuses forged tickets, other origins and publishes without the secret.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const realtime = 'http://localhost:8787';
const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const errors = [];
const checks = [];
function check(name, ok, detail = '') {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

function serverFnName(url) {
  const encoded = url.split('/_serverFn/')[1]?.split('?')[0];
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).export ?? null;
  } catch {
    return null;
  }
}

async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  page.calls = [];
  page.sockets = [];
  page.on('request', (request) => {
    const name = serverFnName(request.url());
    if (name) page.calls.push({ name, at: Date.now() });
  });
  page.frames = [];
  page.on('websocket', (socket) => {
    page.sockets.push(socket.url());
    socket.on('framereceived', (frame) => {
      if (frame.payload !== 'pong') page.frames.push({ at: Date.now(), payload: String(frame.payload) });
    });
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app', { timeout: 20000 });
  return page;
}

async function callServer(page, file, name, data) {
  return page.evaluate(
    async ([path, fnName, payload]) => {
      const module = await import(path);
      try {
        return { ok: true, value: await module[fnName]({ data: payload }) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    [`/app/lib/${file}.ts`, name, data],
  );
}

/** Milliseconds until `text` shows on `page`, or null after `timeout`. */
async function arrival(page, text, timeout = 5000) {
  const start = Date.now();
  return page
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(() => Date.now() - start)
    .catch(() => null);
}

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');
for (const page of [alade, amina]) {
  await page.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
}
await alade.waitForTimeout(1500);
check('a realtime socket is open', alade.sockets.some((url) => url.startsWith('ws://localhost:8787/ws?ticket=')));

// 1. Idle: no polling.
const idleFrom = Date.now();
await alade.waitForTimeout(12_000);
const idleSnapshots = alade.calls.filter((call) => call.at >= idleFrom && call.name.includes('workspaceSnapshotFn'));
// Other people using the demo workspace can cause real pushes; a refetch is fine only right after one.
const unprompted = idleSnapshots.filter(
  (call) => !alade.frames.some((frame) => frame.at <= call.at && call.at - frame.at < 1000),
);
check(
  'nothing polls: every snapshot request in 12 idle seconds follows a pushed event',
  unprompted.length === 0,
  `${idleSnapshots.length} requests, ${unprompted.length} without an event`,
);

// 2a. A message.
const text = `Realtime check ${stamp}`;
const composer = amina.getByRole('textbox', { name: /Message #general/i });
await composer.fill(text);
await composer.press('Enter');
const messageMs = await arrival(alade, text);
check('a message reaches the other person by push', messageMs !== null && messageMs < 2000, `${messageMs} ms`);

// 2b. Typing, then it clears when the typer stops.
await composer.pressSequentially('still typing', { delay: 40 });
const typingMs = await arrival(alade, 'Amina is typing');
check('typing shows by push', typingMs !== null && typingMs < 2500, `${typingMs} ms`);
await composer.fill('');
const typingCleared = await alade
  .getByText('Amina is typing')
  .waitFor({ state: 'detached', timeout: 9000 })
  .then(() => true)
  .catch(() => false);
check('typing clears after the typer stops', typingCleared);

// 2c. A mention lands in the inbox badge request at once.
const mentionFrom = Date.now();
await composer.fill(`@alade Realtime check mention ${stamp}`);
await composer.press('Enter');
await alade.waitForTimeout(1500);
const inboxRefetch = alade.calls.find((call) => call.at >= mentionFrom && call.name.includes('getInboxCountFn'));
check('a mention makes the inbox badge refetch', Boolean(inboxRefetch), inboxRefetch ? `${inboxRefetch.at - mentionFrom} ms` : 'none');

// 2d. A new private channel with Alade in it: it shows in her sidebar and its messages arrive.
const [workspaceId, aladeId] = await amina.evaluate(async () => {
  const module = await import('/app/lib/chat.ts');
  const snapshot = await module.workspaceSnapshotFn({ data: { slug: 'kora-studio', channelId: 'ch-general' } });
  return [snapshot.workspace.id, snapshot.members.find((member) => member.email === 'alade@kora.app')?.id];
});
const channelName = `rt-${stamp}`;
const created = await callServer(amina, 'chat', 'createChannelFn', {
  workspaceId,
  name: channelName,
  kind: 'private',
  memberIds: [aladeId],
});
const sidebarMs = await arrival(alade, channelName);
check('a new channel appears in the sidebar by push', sidebarMs !== null && sidebarMs < 2500, `${sidebarMs} ms`);
await alade.getByRole('link', { name: channelName }).first().click();
await alade.waitForURL(`**/${created.value?.channelId}`);
await alade.waitForTimeout(800);
const privateText = `Private realtime ${stamp}`;
await callServer(amina, 'chat', 'sendMessageFn', { channelId: created.value?.channelId, body: privateText });
const privateMs = await arrival(alade, privateText);
check('messages in the new channel arrive (the socket was granted it)', privateMs !== null && privateMs < 2500, `${privateMs} ms`);

// 2e. Tasks: an issue created by Amina appears in Alade's list.
await alade.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await alade.waitForTimeout(800);
const issueTitle = `Realtime issue ${stamp}`;
const tasks = await callServer(amina, 'tasks', 'getTasksFn', { slug: 'kora-studio' });
const issue = await callServer(amina, 'tasks', 'createIssueFn', {
  slug: 'kora-studio',
  teamId: tasks.value?.teams?.[0]?.id,
  title: issueTitle,
});
if (!issue.ok) console.log('createIssueFn failed:', issue.message);
const issueMs = await arrival(alade, issueTitle);
check('a new issue appears in the list by push', issueMs !== null && issueMs < 2500, `${issueMs} ms`);
if (issue.ok) await callServer(amina, 'tasks', 'deleteIssueFn', { issueId: issue.value.issueId });

// 3. The worker's guards.
const ticket = new URL(alade.sockets.find((url) => url.includes('ticket=')).replace(/^ws/, 'http')).searchParams.get('ticket');
async function upgrade(query, origin) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://localhost:8787/ws?${query}`, { headers: { Origin: origin } });
    socket.onopen = () => {
      socket.close();
      resolve('open');
    };
    socket.onerror = () => resolve('refused');
  });
}
const [body, signature] = ticket.split('.');
// Same signature, but the payload claims to be someone else.
const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
const forged = `${Buffer.from(JSON.stringify({ ...claims, u: 'someone-else' })).toString('base64url')}.${signature}`;
check('a valid ticket from the app origin connects', (await upgrade(`ticket=${encodeURIComponent(ticket)}`, base)) === 'open');
check('a forged ticket is refused', (await upgrade(`ticket=${encodeURIComponent(forged)}`, base)) === 'refused');
check('another origin is refused', (await upgrade(`ticket=${encodeURIComponent(ticket)}`, 'https://evil.example')) === 'refused');
const unauth = await fetch(`${realtime}/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
  body: JSON.stringify({ w: workspaceId, events: [{ topic: 'w', event: { t: 'workspace' } }] }),
});
check('a publish without the secret is refused', unauth.status === 401, String(unauth.status));
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
const presenceForged = await fetch(`${base}/api/realtime/presence`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
  body: JSON.stringify({ w: workspaceId, online: [], offline: [aladeId] }),
});
check('a presence report without the secret is refused', presenceForged.status === 401, String(presenceForged.status));
check('the dev secret is configured', Boolean(env.REALTIME_SECRET));

// Presence comes from open sockets, not polls: Amina is online, then offline once her tabs close.
async function aminaOnline() {
  return alade.evaluate(async () => {
    const module = await import('/app/lib/chat.ts');
    const snapshot = await module.workspaceSnapshotFn({ data: { slug: 'kora-studio', channelId: 'ch-general' } });
    return snapshot.members.find((member) => member.email === 'amina@kora.app')?.online;
  });
}
check('a connected person shows online', (await aminaOnline()) === true);
await amina.close({ runBeforeUnload: true });
await amina.context().close();
let offlineAfter = null;
for (let waited = 0; waited <= 20000; waited += 250) {
  if ((await aminaOnline()) === false) {
    offlineAfter = waited;
    break;
  }
  await alade.waitForTimeout(250);
}
check('closing every tab shows them offline', offlineAfter !== null, offlineAfter === null ? 'still online' : `after about ${offlineAfter} ms`);

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(checks.every(Boolean) ? 0 : 1);
