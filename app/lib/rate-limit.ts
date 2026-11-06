import { getRequestHeader } from '@tanstack/react-start/server';
import { and, db, eq, inArray, isNull, lte, or, sql } from 'void/db';
import { loginAttempts } from '@schema';

// Server-only helpers (never import from client code).
//
// Counters live in `login_attempts`. Sign-in uses three keys per attempt:
//   `login:pair:<email>|<ip>`  strict lock (5 failures / 15 min). Keyed on the email AND the client
//                              IP, so a stranger guessing from elsewhere cannot lock the owner out.
//   `login:email:<email>`      high ceiling (50 failures / hour across every IP) against distributed
//                              guessing.
//   `login:ip:<ip>`            per-IP limit across all emails.
// Sign-up counts `signup:ip:<ip>`. These rows hold an email or an IP address, so they are kept only
// as long as they are useful: a row is dead once its counting window has ended and any lock has
// expired. Dead rows are deleted whenever their key is checked (`lockedSeconds`), a bounded batch of
// dead rows of any key is purged on every failure (`purgeDeadRows`), a failure restarts an ended
// window instead of extending it, and a successful sign-in deletes the pair's row at once.

export type Policy = { prefix: string; max: number; windowMs: number; lockMs: number };

const MINUTE = 60_000;
const PURGE_BATCH = 100;

export const LOGIN_PAIR_POLICY: Policy = {
  prefix: 'login:pair:',
  max: 5,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};
export const LOGIN_EMAIL_CEILING_POLICY: Policy = {
  prefix: 'login:email:',
  max: 50,
  windowMs: 60 * MINUTE,
  lockMs: 60 * MINUTE,
};
export const LOGIN_IP_POLICY: Policy = {
  prefix: 'login:ip:',
  max: 30,
  windowMs: 15 * MINUTE,
  lockMs: 15 * MINUTE,
};
export const SIGNUP_IP_POLICY: Policy = {
  prefix: 'signup:ip:',
  max: 10,
  windowMs: 60 * MINUTE,
  lockMs: 60 * MINUTE,
};
const ALL_POLICIES = [LOGIN_PAIR_POLICY, LOGIN_EMAIL_CEILING_POLICY, LOGIN_IP_POLICY, SIGNUP_IP_POLICY];
const SHORTEST_WINDOW_MS = Math.min(...ALL_POLICIES.map((policy) => policy.windowMs));

export function clientIp(): string {
  const cf = getRequestHeader('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

const normalEmail = (email: string) => email.trim().toLowerCase().slice(0, 254);
export const loginEmailKey = (email: string) => `${LOGIN_EMAIL_CEILING_POLICY.prefix}${normalEmail(email)}`;
export const loginPairKey = (email: string, ip: string) =>
  `${LOGIN_PAIR_POLICY.prefix}${normalEmail(email)}|${ip}`;
export const loginIpKey = (ip: string) => `login:ip:${ip}`;
export const signupIpKey = (ip: string) => `signup:ip:${ip}`;

// In local development every request comes from loopback, so the test scripts' sign-ups would
// share one IP budget. Production always has a real client IP from Cloudflare. Only pure IP keys are
// exempt: the email+IP pair and the email ceiling are still enforced in development.
function exempt(key: string) {
  return import.meta.env.DEV && /^(login|signup):ip:(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1|unknown)$/.test(key);
}

/** Seconds until the key is unlocked, or 0 when it is not locked. Also deletes a dead row. */
export async function lockedSeconds(key: string, policy: Policy): Promise<number> {
  if (exempt(key)) return 0;
  const now = Date.now();
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (!row) return 0;
  const lockedUntil = row.lockedUntil ? Date.parse(row.lockedUntil) : 0;
  if (lockedUntil > now) return Math.ceil((lockedUntil - now) / 1000);
  if (Date.parse(row.windowStart) + policy.windowMs <= now) {
    await db
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.key, key),
          lte(loginAttempts.windowStart, new Date(now - policy.windowMs).toISOString()),
          or(isNull(loginAttempts.lockedUntil), lte(loginAttempts.lockedUntil, new Date(now).toISOString())),
        ),
      );
  }
  return 0;
}

/**
 * Count one failure (or one attempt) for the key in a single atomic upsert, so parallel guesses
 * cannot slip past the limit. Reaching `max` inside the window locks the key.
 */
export async function recordFailure(key: string, policy: Policy): Promise<void> {
  if (exempt(key)) return;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cutoff = new Date(now - policy.windowMs).toISOString();
  const lockIso = new Date(now + policy.lockMs).toISOString();
  const expired = sql`${loginAttempts.windowStart} <= ${cutoff}`;
  const nextFailures = sql`(CASE WHEN ${expired} THEN 1 ELSE ${loginAttempts.failures} + 1 END)`;
  await db
    .insert(loginAttempts)
    .values({ key, failures: 1, windowStart: nowIso, lockedUntil: policy.max <= 1 ? lockIso : null })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        failures: nextFailures,
        windowStart: sql`(CASE WHEN ${expired} THEN ${nowIso} ELSE ${loginAttempts.windowStart} END)`,
        lockedUntil: sql`(CASE WHEN ${nextFailures} >= ${policy.max} THEN ${lockIso} WHEN ${expired} THEN NULL ELSE ${loginAttempts.lockedUntil} END)`,
      },
    });
  await purgeDeadRows(now).catch(() => undefined);
}

/**
 * Delete up to PURGE_BATCH dead rows of any key: the counting window of the row's own policy has
 * ended and no lock is active. Rows for emails or IPs that never come back would otherwise linger.
 * The `window_start` index bounds the scan to rows older than the shortest window.
 */
async function purgeDeadRows(now: number) {
  const nowIso = new Date(now).toISOString();
  const ended = ALL_POLICIES.map((policy) =>
    and(
      sql`${loginAttempts.key} LIKE ${`${policy.prefix}%`}`,
      lte(loginAttempts.windowStart, new Date(now - policy.windowMs).toISOString()),
    ),
  );
  await db
    .delete(loginAttempts)
    .where(
      inArray(
        loginAttempts.key,
        db
          .select({ key: loginAttempts.key })
          .from(loginAttempts)
          .where(
            and(
              lte(loginAttempts.windowStart, new Date(now - SHORTEST_WINDOW_MS).toISOString()),
              or(isNull(loginAttempts.lockedUntil), lte(loginAttempts.lockedUntil, nowIso)),
              or(...ended),
            ),
          )
          .limit(PURGE_BATCH),
      ),
    );
}

export async function clearKey(key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

export function lockMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
