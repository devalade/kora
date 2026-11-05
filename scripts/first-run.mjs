// First-run paths the seed hides: a brand-new account and workspace must get default statuses,
// a default team, working issue keys, and a "New team" flow. Also checks that Cmd+C does not
// trigger the "c" shortcut and that the channel page hydrates cleanly far from UTC.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];
const stamp = Date.now().toString(36);

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.split('\n')[0]}`));

await page.goto(`${base}/signup`);
await page.getByLabel('Your name').fill('First Run');
await page.getByLabel('Work email').fill(`first-run-${stamp}@kora.app`);
await page.getByLabel('Password').fill('demo1234');
await page.getByRole('button', { name: 'Create account' }).click();
await page.waitForURL('**/app', { timeout: 20000 });

await page.getByPlaceholder('Acme Studio').fill(`Nova ${stamp}`);
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.waitForURL(/\/app\/nova-[^/]+\/.+/, { timeout: 20000 });
const slug = new URL(page.url()).pathname.split('/')[2];

await page.goto(`${base}/app/${slug}/tasks`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: /All issues/ }).waitFor({ timeout: 20000 });
// The sidebar is aria-hidden until hydration decides it is on a desktop.
await page.getByRole('button', { name: 'New team' }).waitFor({ timeout: 20000 });
const sidebar = page.locator('aside').first();
// Statuses live in the Workflow dialog now, not in the sidebar.
await page.getByRole('button', { name: 'Manage statuses' }).click();
const workflow = page.getByRole('dialog', { name: 'Workflow statuses' });
await workflow.waitFor();
const statuses = await workflow.getByRole('button', { name: /^Delete / }).count();
await page.keyboard.press('Escape');
await workflow.waitFor({ state: 'detached' });
const defaultTeam = await sidebar.getByRole('link', { name: new RegExp(`Nova ${stamp}`) }).count();

// The "c" shortcut must ignore Cmd+C.
await page.keyboard.press('Meta+c');
await page.waitForTimeout(400);
const cmdCStayed = !page.url().includes('/tasks/new');

async function createIssue(title) {
  await page.goto(`${base}/app/${slug}/tasks/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByLabel('Issue title', { exact: true }).fill(title);
  await page.getByRole('button', { name: /Create issue/ }).click();
  await page.waitForURL(/\/tasks\/[A-Z0-9]+-\d+$/, { timeout: 20000 });
  return new URL(page.url()).pathname.split('/').pop();
}
const firstKey = await createIssue('First issue in a new workspace');
const secondKey = await createIssue('Second issue');

await page.goto(`${base}/app/${slug}/tasks`);
await page.getByRole('button', { name: 'New team' }).click();
const dialog = page.getByRole('dialog', { name: 'New team' });
await dialog.getByLabel('Name').fill('Mobile app');
const suggestedKey = await dialog.getByLabel('Key').inputValue();
await dialog.getByRole('button', { name: 'Create team' }).click();
await dialog.waitFor({ state: 'detached', timeout: 10000 });
await page.waitForTimeout(800);
const teamCreated = await sidebar.getByRole('link', { name: /Mobile app/ }).count();
await context.close();

// The Worker renders in UTC; a viewer at UTC+14 must still hydrate without a mismatch.
const farContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: 'Pacific/Kiritimati',
});
const far = await farContext.newPage();
const hydrationErrors = [];
far.on('pageerror', (error) => {
  if (/hydrat/i.test(error.message)) hydrationErrors.push(error.message.split('\n')[0]);
});
await far.goto(`${base}/login`);
await far.getByLabel('Email').fill('alade@kora.app');
await far.getByLabel('Password').fill('demo1234');
await far.getByRole('button', { name: 'Sign in', exact: true }).click();
await far.waitForURL('**/app', { timeout: 20000 });
await far.goto(`${base}/app/kora-studio/ch-general`);
await far.waitForTimeout(2500);
await farContext.close();

const result = {
  statuses,
  defaultTeam,
  cmdCStayed,
  firstKey,
  secondKey,
  suggestedKey,
  teamCreated,
  hydrationErrors,
  errors,
};
console.log(JSON.stringify(result, null, 2));
const ok =
  statuses === 6 &&
  defaultTeam === 1 &&
  cmdCStayed &&
  /-1$/.test(firstKey) &&
  /-2$/.test(secondKey) &&
  suggestedKey === 'MOB' &&
  teamCreated === 1 &&
  hydrationErrors.length === 0 &&
  errors.length === 0;
await browser.close();
process.exit(ok ? 0 : 1);
