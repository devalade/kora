// The MCP server at /api/mcp: a token made in Profile → AI agents, the JSON-RPC handshake, every
// tool, live updates for someone watching, history recorded as the token's owner, helpful errors,
// and the guards (no token, bad token, cross-origin, revoked token).
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const endpoint = `${base}/api/mcp`;
const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const browser = await chromium.launch();
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

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');
const stamp = Date.now().toString(36);

// Create a token through the UI.
await alade.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
await alade.getByRole('button', { name: 'Open profile' }).click();
await alade.getByRole('button', { name: 'Manage tokens' }).click();
const dialog = alade.getByRole('dialog', { name: 'AI agents' });
await dialog.getByLabel('Token name').fill(`MCP test ${stamp}`);
await dialog.getByRole('button', { name: 'Create token' }).click();
const tokenCode = dialog.locator('code').filter({ hasText: /^kora_/ }).first();
await tokenCode.waitFor({ timeout: 8000 });
const token = (await tokenCode.innerText()).trim();
check('Profile → AI agents creates a token shown once', /^kora_[A-Za-z0-9]{32}$/.test(token), `${token.slice(0, 9)}…`);
check(
  'the dialog shows the claude mcp add command',
  (await dialog.getByText(`claude mcp add --transport http kora ${base}/api/mcp`).count()) === 1,
);

let nextId = 1;
async function rpc(method, params, { auth = `Bearer ${token}`, origin } = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(auth ? { Authorization: auth } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function tool(name, args = {}) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  const result = body.result;
  const text = result?.content?.[0]?.text ?? body.error?.message ?? '';
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // An error message.
  }
  return { isError: Boolean(result?.isError || body.error), text, data };
}

const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'kora-script', version: '1' },
});
check('initialize answers with the server and tools capability', init.body?.result?.serverInfo?.name === 'kora' && Boolean(init.body.result.capabilities.tools));
const listed = await rpc('tools/list', {});
const names = listed.body?.result?.tools?.map((item) => item.name) ?? [];
check('tools/list has all eight tools', names.length === 8, names.join(', '));

const workspaces = await tool('list_workspaces');
check('list_workspaces includes Kora Studio', workspaces.data?.some((item) => item.slug === 'kora-studio'));
const info = await tool('workspace_info', { workspace: 'kora-studio' });
check('workspace_info lists teams, statuses and members', info.data?.teams?.length > 0 && info.data.statuses.length > 0 && info.data.members.length > 0);

// Amina watches the task list while the agent creates an issue assigned to her.
await amina.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
const title = `MCP test issue ${stamp}`;
const created = await tool('create_issue', {
  workspace: 'kora-studio',
  title,
  description: 'Made by an agent.\n\n- [ ] first step',
  assignee: 'Amina',
  priority: 'high',
  status: 'Todo',
});
const key = created.data?.key;
check('create_issue returns the key and a git branch', /^KOR-\d+$/.test(key ?? '') && created.data.gitBranch.startsWith(`alade/${key.toLowerCase()}-mcp-test-issue`), created.data?.gitBranch ?? created.text);
check(
  'the new issue appears live for someone watching the list',
  await amina.getByText(title).first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false),
);

const moved = await tool('update_issue', { workspace: 'kora-studio', key, status: 'In Progress' });
check('update_issue moves the status', moved.data?.status === 'In Progress', moved.data?.status ?? moved.text);
await alade.goto(`${base}/app/kora-studio/tasks/${key}`, { waitUntil: 'networkidle' });
check(
  "history records the change as the token's owner",
  (await alade.getByText(/Alade Yessoufou\s*changed status from\s*Todo\s*to\s*In Progress/).count()) === 1,
);
const comment = `Agent update ${stamp}: **done** with the first step`;
const commented = await tool('add_comment', { workspace: 'kora-studio', key, body: comment });
check('add_comment posts', commented.data?.ok === true, commented.text.slice(0, 80));
check(
  'the comment shows live and formatted on the open issue',
  await alade.locator('strong', { hasText: 'done' }).first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false),
);
const read = await tool('get_issue', { workspace: 'kora-studio', key: key.toLowerCase() });
check('get_issue reads it back (any case) with the comment', read.data?.comments?.some((item) => item.body.includes(stamp)));
const mine = await tool('list_my_issues', { workspace: 'kora-studio' });
check('list_my_issues returns your open issues', Array.isArray(mine.data) && mine.data.every((item) => item.assignee === 'Alade Yessoufou'));
const search = await tool('search_issues', { workspace: 'kora-studio', query: stamp, assignee: 'Amina' });
check('search_issues finds it by text and assignee', search.data?.length === 1 && search.data[0].key === key);

// Errors read like guidance.
const badStatus = await tool('update_issue', { workspace: 'kora-studio', key, status: 'Shipped' });
check('an unknown status is an error that lists the real ones', badStatus.isError && /Statuses: .*In Progress/.test(badStatus.text));
const badWorkspace = await tool('get_issue', { workspace: 'not-mine', key });
check('a workspace you are not in is refused', badWorkspace.isError && /No workspace/.test(badWorkspace.text));
const noIssue = await tool('get_issue', { workspace: 'kora-studio', key: 'KOR-999999' });
check('a missing issue is a clear error', noIssue.isError && /No issue/.test(noIssue.text));

// Guards.
check('no token is refused with 401', (await rpc('tools/list', {}, { auth: '' })).status === 401);
check('a wrong token is refused with 401', (await rpc('tools/list', {}, { auth: 'Bearer kora_abcdefghijklmnopqrstuvwxyz123456' })).status === 401);
check('a cross-origin browser request is refused with 403', (await rpc('tools/list', {}, { origin: 'https://evil.example' })).status === 403);
check('GET has no stream (405)', (await fetch(endpoint)).status === 405);

// Revoking stops it at once.
await alade.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
await alade.getByRole('button', { name: 'Open profile' }).click();
await alade.getByRole('button', { name: 'Manage tokens' }).click();
alade.once('dialog', (prompt) => void prompt.accept());
const row = alade.getByRole('dialog', { name: 'AI agents' }).locator('li').filter({ hasText: `MCP test ${stamp}` });
await row.getByRole('button', { name: 'Revoke' }).click();
await row.waitFor({ state: 'detached', timeout: 6000 }).catch(() => undefined);
check('a revoked token stops working', (await rpc('tools/list', {})).status === 401);

check('no page errors', errors.length === 0, errors.join('; '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
