// GitHub pull requests, end to end against the dev server, with signed fake webhook deliveries:
// linking by branch, title and "Fixes", forward-only status automation, reviews, merge, unlinking,
// the inbox item, live updates on an open issue page, the branch-name button, the settings dialog,
// and the guards (signature, unknown installation, forged install state).
// Needs GITHUB_* in .env (any values work locally; the webhook secret signs the deliveries here).
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GitHub is switched off in app/lib/features.ts for now; there is nothing to check until it is back.
if (/GITHUB_ENABLED = false/.test(readFileSync(path.join(root, 'app/lib/features.ts'), 'utf8'))) {
  console.log('SKIP GitHub is off (GITHUB_ENABLED in app/lib/features.ts)');
  process.exit(0);
}
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env'), 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const secret = env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
  console.error('Set GITHUB_WEBHOOK_SECRET (and the other GITHUB_* values) in .env first.');
  process.exit(1);
}

const dir = path.join(root, '.void/v3/d1/miniflare-D1DatabaseObject');
const dbFile = readdirSync(dir)
  .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map((name) => path.join(dir, name))
  .find((candidate) => {
    try {
      return execFileSync('sqlite3', [candidate, "select count(*) from sqlite_master where name='issue_links';"]).toString().trim() === '1';
    } catch {
      return false;
    }
  });
const sqlite = (sql) => execFileSync('sqlite3', [dbFile], { input: `PRAGMA foreign_keys=ON;\n${sql}` }).toString().trim();

const INSTALLATION = 990001;
sqlite(`
insert or replace into github_installations (id, workspace_id, account_login, account_type) values ('${INSTALLATION}', 'ws-kora', 'kora-test-org', 'Organization');
insert into github_settings (workspace_id, open_status_id, review_status_id, merge_status_id) values ('ws-kora', 'in_progress', 'in_review', 'done')
  on conflict(workspace_id) do update set open_status_id='in_progress', review_status_id='in_review', merge_status_id='done';
`);

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function deliver(event, payload, { sign = true, installation = INSTALLATION } = {}) {
  const body = JSON.stringify({ installation: { id: installation }, repository: { full_name: 'kora-test-org/kora' }, ...payload });
  const signature = `sha256=${createHmac('sha256', sign ? secret : 'wrong').update(body).digest('hex')}`;
  const response = await fetch(`${base}/api/github/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': event, 'X-Hub-Signature-256': signature },
    body,
  });
  return { status: response.status, text: await response.text() };
}

function pr(number, { branch = 'feature', title = 'Change', body = '', state = 'open', draft = false, merged = false, reviewers = [] } = {}) {
  return {
    number,
    html_url: `https://github.com/kora-test-org/kora/pull/${number}`,
    title,
    body,
    state,
    draft,
    merged,
    merged_at: merged ? new Date().toISOString() : null,
    user: { login: 'amina-dev' },
    head: { ref: branch },
    requested_reviewers: reviewers,
  };
}

const statusOf = (key) =>
  sqlite(`select s.name from issues i join teams t on t.id=i.team_id join task_statuses s on s.id=i.status where t.key||'-'||i.number='${key}';`);

const browser = await chromium.launch();
async function signIn(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app', { timeout: 20000 });
  return page;
}

async function createIssue(page, title, assignee) {
  await page.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
  await page.locator('[data-issue-id]').first().waitFor({ timeout: 20000 });
  await page.keyboard.press('c');
  const modal = page.getByRole('dialog', { name: 'New issue' });
  await modal.waitFor();
  await modal.getByLabel('Issue title', { exact: true }).fill(title);
  if (assignee) {
    await modal.getByRole('button', { name: 'Assignee' }).click();
    await page.getByRole('option', { name: assignee }).first().click();
  }
  await modal.getByRole('button', { name: 'Create issue' }).click();
  await modal.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'View issue', exact: true }).click();
  await page.waitForURL(/\/tasks\/KOR-\d+$/);
  return page.url().split('/').pop();
}

const alade = await signIn('alade@kora.app');
const amina = await signIn('amina@kora.app');
const stamp = Date.now().toString(36);
const key = await createIssue(alade, `GitHub test issue ${stamp}`, /Amina/);
const otherKey = await createIssue(alade, `GitHub test issue part ${stamp}`);
const issuePage = `${base}/app/kora-studio/tasks/${key}`;
await alade.goto(issuePage, { waitUntil: 'networkidle' });
const number = 7000 + Math.floor(Math.random() * 1000);

// Guards.
check('a delivery with a wrong signature is refused', (await deliver('pull_request', { action: 'opened', pull_request: pr(number) }, { sign: false })).status === 401);
const unknown = await deliver('pull_request', { action: 'opened', pull_request: pr(number, { branch: `x/${key.toLowerCase()}` }) }, { installation: 123 });
check('a delivery from an unconnected installation changes nothing', unknown.status === 200 && /not connected/.test(unknown.text) && sqlite(`select count(*) from issue_links where number=${number};`) === '0');

// Branch name button.
await alade.getByRole('button', { name: 'Copy git branch name' }).click();
const branch = await alade.evaluate(() => navigator.clipboard.readText());
check('the branch name button copies alade/<key>-<title>', branch.startsWith(`alade/${key.toLowerCase()}-github-test-issue`), branch);

// Open from that branch: links and moves Todo -> In Progress, live on the open page.
const opened = await deliver('pull_request', {
  action: 'opened',
  pull_request: pr(number, { branch, title: 'Add search', body: `Part of ${otherKey}` }),
});
check('opening a PR from the branch links the issue', /2 linked/.test(opened.text), opened.text);
const panel = alade.getByRole('complementary', { name: 'Issue properties' });
check(
  'the PR appears on the open issue page without a reload',
  await panel.getByText('Add search').waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
);
check('the issue moved Todo -> In Progress', statusOf(key) === 'In Progress', statusOf(key));
check('history says GitHub linked the pull request', (await alade.getByText(/GitHub\s*linked pull request/).count()) === 1);
check('"Part of" in the body links the other issue too', sqlite(`select count(*) from issue_links l join issues i on i.id=l.issue_id join teams t on t.id=i.team_id where t.key||'-'||i.number='${otherKey}';`) === '1');

// Review requested -> In Review; approval shows; a later push does not move it back.
await deliver('pull_request', { action: 'review_requested', pull_request: pr(number, { branch, title: 'Add search', body: `Part of ${otherKey}`, reviewers: [{}] }) });
check('a review request moves it to In Review', statusOf(key) === 'In Review', statusOf(key));
await deliver('pull_request_review', { action: 'submitted', review: { state: 'approved' }, pull_request: pr(number, { branch }) });
check('an approval shows on the PR', await panel.getByText('Approved').waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
await deliver('pull_request', { action: 'synchronize', pull_request: pr(number, { branch, title: 'Add search', body: `Part of ${otherKey}` }) });
check('a new push does not move it back to In Progress', statusOf(key) === 'In Review', statusOf(key));

// Merge -> Done for the closing link only; the assignee gets an inbox item.
const merged = await deliver('pull_request', {
  action: 'closed',
  pull_request: pr(number, { branch, title: 'Add search', body: `Part of ${otherKey}`, state: 'closed', merged: true }),
});
check('merging moves the issue to Done', statusOf(key) === 'Done', `${statusOf(key)}; ${merged.text}`);
check('merging does not finish the "Part of" issue', statusOf(otherKey) === 'In Review', statusOf(otherKey));
check(
  'the merged state shows live',
  await panel.getByText('Merged').waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
);
await amina.goto(`${base}/app/kora-studio/inbox`, { waitUntil: 'networkidle' });
check(
  'only the merge reaches the inbox',
  sqlite(`select count(*) from notifications n join issues i on i.id=n.issue_id join teams t on t.id=i.team_id where n.kind='issue_pr' and t.key||'-'||i.number in ('${key}','${otherKey}');`) === '1',
);
check(
  'the assignee sees "GitHub moved <key> to Done" in the inbox',
  await amina.getByText(`GitHub moved ${key} to Done`).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
);
// A reopen never pulls finished work back.
await deliver('pull_request', { action: 'reopened', pull_request: pr(number, { branch, title: 'Add search' }) });
check('reopening does not move a Done issue', statusOf(key) === 'Done', statusOf(key));

// "Fixes KOR-n" in the body links a PR from any branch; editing the key out unlinks it.
const fixNumber = number + 1;
await deliver('pull_request', { action: 'opened', pull_request: pr(fixNumber, { branch: 'cleanup', title: 'Tidy', body: `Fixes ${otherKey}` }) });
check('"Fixes <key>" links from any branch', sqlite(`select closes from issue_links where number=${fixNumber};`) === '1');
await deliver('pull_request', { action: 'edited', pull_request: pr(fixNumber, { branch: 'cleanup', title: 'Tidy', body: 'No issue' }) });
check('editing the key out unlinks it', sqlite(`select count(*) from issue_links where number=${fixNumber};`) === '0');

// The list shows a PR badge.
await alade.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await alade.getByLabel('Filter issues').fill(stamp);
await alade.waitForTimeout(500);
const row = alade.locator('[data-issue-id]').filter({ hasText: `GitHub test issue ${stamp}` }).first();
check('the list row shows a PR badge', (await row.getByLabel(/^1 pull request, (open|merged)$/).count()) === 1);

// Settings dialog reads and writes the automation.
await alade.getByRole('button', { name: 'GitHub settings' }).click();
const dialog = alade.getByRole('dialog', { name: 'GitHub' });
check('the dialog shows the connected organization', await dialog.getByText('kora-test-org').waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
await dialog.getByRole('button', { name: 'When review is requested' }).click();
await alade.getByRole('option', { name: "Don't change the status" }).click();
await alade.waitForTimeout(600);
check('an admin can turn a rule off', sqlite("select coalesce(review_status_id, 'null') from github_settings where workspace_id='ws-kora';") === 'null');
await amina.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await amina.getByRole('button', { name: 'GitHub settings' }).click();
const memberDialog = amina.getByRole('dialog', { name: 'GitHub' });
await memberDialog.getByText('kora-test-org').waitFor({ timeout: 5000 }).catch(() => undefined);
check('a member sees the rules but cannot change them', await memberDialog.getByRole('button', { name: 'When a pull request merges' }).isDisabled());
check('a member has no Disconnect button', (await memberDialog.getByRole('button', { name: 'Disconnect' }).count()) === 0);

// A forged install callback is refused and connects nothing.
await alade.goto(`${base}/api/github/setup?installation_id=424242&setup_action=install&code=x&state=forged.state`);
check('a forged install callback connects nothing', sqlite("select count(*) from github_installations where id='424242';") === '0');

check('no page errors', errors.length === 0, errors.join('; '));

sqlite(`delete from github_installations where id='${INSTALLATION}'; delete from github_settings where workspace_id='ws-kora';`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
