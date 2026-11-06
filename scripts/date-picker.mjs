// The calendar date picker: it replaces the browser's native picker everywhere, works from the
// keyboard, Escape closes only the calendar (not the dialog under it), and a picked date is saved.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const shots = process.env.SHOTS;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));
const checks = [];
function check(name, ok, detail = '') {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('alade@kora.app');
await page.getByLabel('Password').fill('demo1234');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL('**/app');

// In the New issue dialog.
await page.goto(`${base}/app/kora-studio/tasks`, { waitUntil: 'networkidle' });
await page.keyboard.press('c');
const modal = page.getByRole('dialog', { name: 'New issue' });
await modal.waitFor();
check('no native date inputs', (await page.locator('input[type="date"]').count()) === 0);
await modal.getByRole('button', { name: 'Due date' }).click();
const calendar = page.getByRole('dialog', { name: 'Due date' });
await calendar.waitFor();
await page.waitForTimeout(150);
const focusedToday = await page.evaluate(() => document.activeElement?.getAttribute('aria-current'));
check('opens with today focused', focusedToday === 'date');
if (shots) await page.screenshot({ path: `${shots}/calendar-modal.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes only the calendar', (await calendar.count()) === 0 && (await modal.count()) === 1);
check('focus returns to the trigger', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Due date'));

// Keyboard: open, move a week and a day, pick with Enter.
await page.keyboard.press('Enter');
await calendar.waitFor();
await page.waitForTimeout(150);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
const target = await page.evaluate(() => document.activeElement?.getAttribute('data-day'));
await page.keyboard.press('Enter');
const expected = (() => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 8));
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
})();
const chip = await modal.getByRole('button', { name: /^Due date:/ }).innerText().catch(() => '');
check('arrow keys and Enter pick a day', chip.includes(expected), `${target} -> "${chip.trim()}"`);
await page.keyboard.press('Escape');

// Page Up/Down and the month arrows change months; quick picks and Clear work.
// On an issue of its own, so the seeded issues keep their dates.
const own = await page.evaluate(async () => {
  const module = await import('/app/lib/tasks.ts');
  const snapshot = await module.getTasksFn({ data: { slug: 'kora-studio' } });
  return module.createIssueFn({ data: { slug: 'kora-studio', teamId: snapshot.teams[0].id, title: `Date picker check ${Date.now()}` } });
});
await page.goto(`${base}/app/kora-studio/tasks/${own.key}`, { waitUntil: 'networkidle' });
const due = page.getByRole('button', { name: /^Due date/ }).first();
await due.click();
const issueCalendar = page.getByRole('dialog', { name: 'Due date' });
await issueCalendar.waitFor();
await page.waitForTimeout(150);
const monthBefore = await issueCalendar.locator('[aria-live="polite"]').innerText();
await page.keyboard.press('PageDown');
const monthAfter = await issueCalendar.locator('[aria-live="polite"]').innerText();
check('Page Down shows the next month', monthBefore !== monthAfter, `${monthBefore} -> ${monthAfter}`);
await issueCalendar.getByRole('button', { name: 'Previous month' }).click();
check('the month arrow goes back', (await issueCalendar.locator('[aria-live="polite"]').innerText()) === monthBefore);
await issueCalendar.getByRole('button', { name: 'Tomorrow' }).click();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
const saved = await page.getByRole('button', { name: /^Due date:/ }).first().innerText().catch(() => '');
check('a quick pick is saved on the issue', saved.trim().startsWith('Due '), saved.trim());
if (shots) {
  await page.getByRole('button', { name: /^Due date:/ }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/calendar-issue.png` });
  await page.keyboard.press('Escape');
}
await page.getByRole('button', { name: /^Due date:/ }).first().click();
await page.getByRole('dialog', { name: 'Due date' }).getByRole('button', { name: 'Clear' }).click();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
check('Clear removes the date', (await page.getByRole('button', { name: /^Due date:/ }).count()) === 0);

// Phone width: the calendar stays on screen.
await page.setViewportSize({ width: 375, height: 740 });
await page.reload({ waitUntil: 'networkidle' });
const phoneDue = page.getByRole('button', { name: /^Due date/ }).first();
if (await phoneDue.isVisible()) {
  await phoneDue.click();
  const box = await page.getByRole('dialog', { name: 'Due date' }).boundingBox();
  check('fits a 375px screen', Boolean(box) && box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
  if (shots) await page.screenshot({ path: `${shots}/calendar-phone.png` });
}

await page.evaluate(async (issueId) => {
  const module = await import('/app/lib/tasks.ts');
  await module.deleteIssueFn({ data: { issueId } });
}, own.issueId);
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(checks.every(Boolean) ? 0 : 1);
