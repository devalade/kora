// Task list search past the 500-issue cap. Seeds 505 throwaway issues in the demo workspace's
// Launch team (500 recently updated fillers and one old issue the list never loads), then checks
// that the capped notice appears, that searching by title and by key finds the old issue through
// the server, and that clearing the search drops it again. Removes everything it created.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const dbPath =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const sql = (query) => execFileSync('sqlite3', [dbPath, query], { encoding: 'utf8' }).trim();
const stamp = Date.now().toString(36);
const needleTitle = `Cap needle ${stamp}`;
const NEEDLE_NUMBER = 9001;
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

function seed() {
  const values = [];
  for (let i = 0; i < 504; i++) {
    values.push(
      `('cap-${stamp}-${i}','ws-kora','p-launch',${10000 + i},'Cap filler ${stamp} ${i}','','todo',0,'u-alade',strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))`,
    );
  }
  values.push(
    `('cap-${stamp}-needle','ws-kora','p-launch',${NEEDLE_NUMBER},'${needleTitle}','','todo',0,'u-alade','2020-01-01T00:00:00.000Z')`,
  );
  sql(
    `insert into issues (id, workspace_id, team_id, number, title, description, status, priority, created_by, updated_at) values ${values.join(',')}`,
  );
}
function cleanup() {
  sql(`delete from issues where id like 'cap-${stamp}-%'`);
}

const browser = await chromium.launch();
try {
  seed();
  const total = Number(sql(`select count(*) from issues where workspace_id='ws-kora' and deleted_at is null`));
  check('seed pushed the workspace past the 500 cap', total > 500, `${total} issues`);

  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(`${base}/login`);
  const email = page.getByLabel('Email');
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.getByRole('button', { name: /Try the demo workspace/i }).click({ timeout: 1000 }).catch(() => undefined);
    if (await email.inputValue().catch(() => '')) break;
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 30000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general');
  await page.goto(`${base}/app/kora-studio/tasks`);
  await page.locator('[data-issue-id]').first().waitFor({ timeout: 30000 });

  const notice = page.getByRole('status').filter({ hasText: 'most recently updated issues' });
  await notice.waitFor({ timeout: 10000 });
  const copy = (await notice.innerText()).trim();
  check('capped notice says search covers every issue', /Search covers every issue/.test(copy) && !copy.includes('—'), copy);
  check('the old issue is not in the loaded list', (await page.getByText(needleTitle).count()) === 0);

  const search = page.getByLabel('Filter issues');
  await search.fill(`needle ${stamp}`);
  await page.getByText(needleTitle).first().waitFor({ timeout: 10000 });
  check('searching by title finds an issue beyond the cap', true);

  await search.fill('');
  await page.getByText(needleTitle).first().waitFor({ state: 'detached', timeout: 5000 });
  check('clearing the search drops the server match', true);

  await search.fill(`LAU-${NEEDLE_NUMBER}`);
  await page.getByText(needleTitle).first().waitFor({ timeout: 10000 });
  check('searching by key finds it', true);

  // Typing fast must not let a slow earlier response overwrite the latest query.
  await search.fill('');
  await search.pressSequentially(`zzz-no-such-${stamp}`, { delay: 20 });
  await page.waitForTimeout(800); // longer than the 250 ms debounce plus the round trip
  check('a query with no match shows no stale result', (await page.getByText(needleTitle).count()) === 0);

  // Opening the match works like any other issue.
  await search.fill(`LAU-${NEEDLE_NUMBER}`);
  await page.getByText(needleTitle).first().click();
  await page.waitForURL(new RegExp(`/tasks/LAU-${NEEDLE_NUMBER}$`), { timeout: 10000 });
  check('a search result opens its issue page', true);
} catch (error) {
  console.log('ERROR', error instanceof Error ? error.message : error);
  failures.push('exception');
} finally {
  await browser.close();
  cleanup();
  check('seeded issues removed', sql(`select count(*) from issues where id like 'cap-${stamp}-%'`) === '0');
}

console.log(failures.length === 0 ? 'task-search: pass' : `task-search: FAIL ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
