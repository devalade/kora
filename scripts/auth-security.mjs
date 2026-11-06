// Sign-in hardening: generic errors, per email+IP lockout (another IP is not locked out, a per-email
// ceiling across IPs still applies), sliding session rotation with a grace
// window, and "Sign out of all devices". Uses a throwaway account, never the demo accounts, and
// removes it (plus the rate-limit rows it created) from the local D1 file at the end.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const dbFile =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const stamp = Date.now().toString(36);
const email = `auth-security-${stamp}@kora.app`;
const password = 'demo1234';
const GENERIC = 'Email or password is incorrect.';
const failures = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

function sql(statement, { foreignKeys = false } = {}) {
  const text = `${foreignKeys ? 'PRAGMA foreign_keys=ON; ' : ''}${statement}`;
  return execFileSync('sqlite3', [dbFile, text], { encoding: 'utf8' }).trim();
}

function cleanup() {
  try {
    const id = sql(`SELECT id FROM users WHERE email='${email}';`);
    sql(
      `DELETE FROM login_attempts WHERE key LIKE 'login:email:auth-security-${stamp}%' OR key LIKE 'login:email:nobody-${stamp}%' OR key LIKE 'login:pair:auth-security-${stamp}%' OR key LIKE 'login:pair:nobody-${stamp}%' OR key LIKE '%purge-${stamp}%' OR key LIKE 'login:ip:%' OR key LIKE 'signup:ip:%';`,
    );
    if (id) {
      sql(`DELETE FROM workspaces WHERE created_by='${id}';`, { foreignKeys: true });
      sql(`DELETE FROM users WHERE id='${id}';`, { foreignKeys: true });
    }
    const left = sql(`SELECT count(*) FROM users WHERE email='${email}';`);
    check('throwaway user removed', left === '0');
  } catch (error) {
    check('cleanup', false, String(error.message).split('\n')[0]);
  }
}

const browser = await chromium.launch();
const viewport = { width: 1440, height: 900 };
try {
  // Device A signs up and creates a workspace (the profile dialog lives inside one).
  const ctxA = await browser.newContext({ viewport });
  const pageA = await ctxA.newPage();
  pageA.on('dialog', (dialog) => void dialog.accept());
  await pageA.goto(`${base}/signup`, { waitUntil: 'networkidle' });
  await pageA.getByLabel('Your name').fill('Auth Security');
  await pageA.getByLabel('Work email').fill(email);
  await pageA.getByLabel('Password').fill(password);
  await pageA.getByRole('button', { name: 'Create account' }).click();
  await pageA.waitForURL('**/app', { timeout: 20000 });
  await pageA.waitForLoadState('networkidle');
  await pageA.getByPlaceholder('Acme Studio').fill(`Sec ${stamp}`);
  await pageA.getByRole('button', { name: 'Create', exact: true }).click();
  await pageA.waitForURL(/\/app\/sec-[^/]+\/.+/, { timeout: 20000 });

  // Device B signs in to the same account.
  const ctxB = await browser.newContext({ viewport });
  const pageB = await ctxB.newPage();
  await pageB.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await pageB.getByLabel('Email').fill(email);
  await pageB.getByLabel('Password').fill(password);
  await pageB.getByRole('button', { name: 'Sign in', exact: true }).click();
  await pageB.waitForURL('**/app**', { timeout: 20000 });

  // An anonymous context tries to sign in.
  const ctxC = await browser.newContext({ viewport });
  const pageC = await ctxC.newPage();
  async function attempt(who, pw) {
    await pageC.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await pageC.getByLabel('Email').fill(who);
    await pageC.getByLabel('Password').fill(pw);
    const started = Date.now();
    await pageC.getByRole('button', { name: 'Sign in', exact: true }).click();
    const box = pageC.locator('p.text-danger');
    await box.waitFor({ timeout: 20000 });
    return { message: (await box.innerText()).trim(), ms: Date.now() - started };
  }

  const wrong = await attempt(email, 'not-the-password');
  check('wrong password gives the generic message', wrong.message === GENERIC, wrong.message);
  const unknown = await attempt(`nobody-${stamp}@kora.app`, 'not-the-password');
  check('unknown email gives the same message', unknown.message === wrong.message, unknown.message);
  console.log(`      timing: wrong password ${wrong.ms} ms, unknown email ${unknown.ms} ms`);

  for (let i = 2; i <= 5; i++) {
    const again = await attempt(email, `wrong-${i}`);
    if (again.message !== GENERIC) check(`wrong attempt ${i} is generic`, false, again.message);
  }
  const locked = await attempt(email, password);
  check(
    '6th attempt with the correct password is locked out',
    /^Too many attempts\. Try again in \d+ minutes?\.$/.test(locked.message),
    locked.message,
  );
  const lockedAgain = await attempt(email, 'wrong-again');
  check('wrong password while locked also shows the lockout', /^Too many attempts/.test(lockedAgain.message));
  await ctxC.close();

  // Rotation: backdate device A's session, then make one request.
  const userId = sql(`SELECT id FROM users WHERE email='${email}';`);
  const oldCookie = (await ctxA.cookies(base)).find((c) => c.name === 'kora_session');
  check('session cookie is HttpOnly and SameSite=Lax', !!oldCookie?.httpOnly && oldCookie.sameSite === 'Lax');
  sql(
    `UPDATE sessions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days') WHERE id='${oldCookie.value}';`,
  );
  await pageA.reload({ waitUntil: 'networkidle' });
  const newCookie = (await ctxA.cookies(base)).find((c) => c.name === 'kora_session');
  check('backdated session is rotated to a new cookie', !!newCookie && newCookie.value !== oldCookie.value);
  const oldRow = sql(
    `SELECT CAST((julianday(expires_at)-julianday('now'))*86400 AS INTEGER) FROM sessions WHERE id='${oldCookie.value}';`,
  );
  check('old session row kept for the grace period only', oldRow !== '' && Number(oldRow) > 0 && Number(oldRow) <= 60, `${oldRow}s left`);
  const newRow = sql(
    `SELECT CAST((julianday(expires_at)-julianday('now'))/1 AS INTEGER) FROM sessions WHERE id='${newCookie?.value}';`,
  );
  check('new session has a fresh ~30 day expiry', Number(newRow) >= 29, `${newRow} days`);
  const sessionsForUser = sql(`SELECT count(*) FROM sessions WHERE user_id='${userId}';`);
  check('exactly one extra session row after rotation', sessionsForUser === '3', `rows=${sessionsForUser}`);

  // A parallel request still carrying the old cookie keeps working during the grace window.
  const ctxOld = await browser.newContext({ viewport });
  await ctxOld.addCookies([{ ...oldCookie, domain: 'localhost', path: '/' }]);
  const pageOld = await ctxOld.newPage();
  await pageOld.goto(`${base}/app`, { waitUntil: 'networkidle' });
  check('old cookie still works inside the grace window', !pageOld.url().includes('/login'), pageOld.url());
  const rowsAfter = sql(`SELECT count(*) FROM sessions WHERE user_id='${userId}';`);
  check('old cookie inside grace does not rotate again', rowsAfter === sessionsForUser, `rows=${rowsAfter}`);
  await ctxOld.close();

  // Device B is still signed in.
  await pageB.goto(`${base}/app`, { waitUntil: 'networkidle' });
  check('device B is signed in before sign-out-everywhere', !pageB.url().includes('/login'), pageB.url());

  // Sign out of all devices from A.
  await pageA.getByRole('button', { name: 'Open profile' }).first().click();
  await pageA.getByRole('button', { name: 'Sign out of all devices' }).click();
  await pageA.waitForURL('**/login', { timeout: 20000 });
  check('device A lands on /login after sign-out-everywhere', true);
  await pageB.goto(`${base}/app`, { waitUntil: 'networkidle' });
  check('device B is signed out too (next navigation lands on /login)', pageB.url().includes('/login'), pageB.url());
  const left = sql(`SELECT count(*) FROM sessions WHERE user_id='${userId}';`);
  check('all session rows for the user are deleted', left === '0', `rows=${left}`);

  // The strict lock belongs to (email + client IP). clientIp() in app/lib/rate-limit.ts prefers
  // cf-connecting-ip, which the local dev runtime passes through from the request (it sets it to
  // 127.0.0.1 only when absent), so a browser context that sends that header behaves like a visitor
  // from another address. (x-forwarded-for does NOT work locally: cf-connecting-ip wins.) In
  // production Cloudflare overwrites the header, so a client cannot spoof it.
  const pairRows = sql(`SELECT count(*) FROM login_attempts WHERE key LIKE 'login:pair:${email}|%' AND locked_until IS NOT NULL;`);
  check('the lock is stored on the email+IP pair row', pairRows === '1', `locked pair rows=${pairRows}`);
  async function signInFrom(ip, pw) {
    const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'cf-connecting-ip': ip } });
    const page = await ctx.newPage();
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pw);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const outcome = await Promise.race([
      page.waitForURL('**/app**', { timeout: 20000 }).then(() => 'signed-in'),
      page.locator('p.text-danger').waitFor({ timeout: 20000 }).then(async () => (await page.locator('p.text-danger').innerText()).trim()),
    ]);
    await ctx.close();
    return outcome;
  }
  const otherIp = await signInFrom('203.0.113.7', password);
  check('the owner can still sign in from a different IP while the attacker IP is locked', otherIp === 'signed-in', otherIp);
  // Failures from the other IP count on their own pair row and do not lock the first one's owner.
  const otherWrong = await signInFrom('203.0.113.9', 'not-the-password');
  check('a wrong password from another IP is the generic message, not a lock', otherWrong === GENERIC, otherWrong);
  // The per-email ceiling across all IPs: simulate 50 failures with a locked ceiling row.
  sql(
    `INSERT OR REPLACE INTO login_attempts (key, failures, window_start, locked_until) VALUES ('login:email:${email}', 50, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'));`,
  );
  const ceiling = await signInFrom('203.0.113.11', password);
  check('the per-email ceiling locks every IP', /^Too many attempts\. Try again in \d+ minutes?\.$/.test(ceiling), ceiling);
  sql(`DELETE FROM login_attempts WHERE key='login:email:${email}';`);
  // Dead rows are purged opportunistically on a failure: a window that has ended with no active
  // lock goes, using the window of the row's own policy; live windows and active locks stay.
  const ago = (minutes) => `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${minutes} minutes')`;
  const ahead = `strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes')`;
  const seed = (key, minutes, lockedUntil = 'NULL') =>
    sql(`INSERT INTO login_attempts (key, failures, window_start, locked_until) VALUES ('${key}', 2, ${ago(minutes)}, ${lockedUntil});`);
  const dead = [`login:pair:purge-${stamp}-a|9.9.9.9`, `login:ip:purge-${stamp}-b`, `login:email:purge-${stamp}-c`];
  const alive = [`login:email:purge-${stamp}-d`, `signup:ip:purge-${stamp}-e`, `login:pair:purge-${stamp}-f|9.9.9.9`, `login:ip:purge-${stamp}-g`];
  seed(dead[0], 20); // 15 minute window ended
  seed(dead[1], 20);
  seed(dead[2], 90); // 60 minute window ended
  seed(alive[0], 30); // 60 minute window still counting
  seed(alive[1], 30);
  seed(alive[2], 120, ahead); // window ended but the lock is still active
  seed(alive[3], 5);
  const purgeTrigger = await signInFrom('203.0.113.13', 'not-the-password');
  check('a failure that triggers the purge is still the generic message', purgeTrigger === GENERIC, purgeTrigger);
  const present = (keys) => keys.filter((key) => sql(`SELECT count(*) FROM login_attempts WHERE key='${key}';`) === '1').length;
  check('dead rate-limit rows are purged on a failure', present(dead) === 0, `${present(dead)} of ${dead.length} left`);
  check('live windows and active locks are kept', present(alive) === alive.length, `${present(alive)} of ${alive.length} kept`);
  const afterCeiling = await signInFrom('203.0.113.11', password);
  check('and lets the owner back in once the ceiling clears', afterCeiling === 'signed-in', afterCeiling);
} finally {
  await browser.close();
  cleanup();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nauth-security: all checks passed');
