import { createServerFn } from '@tanstack/react-start';
import { deleteCookie, getCookie } from '@tanstack/react-start/server';
import { db, eq } from 'void/db';
import { sessions, users } from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { hashPassword, verifyPassword } from './password';
import { pickAvatarColor } from './people';
import {
  LOGIN_EMAIL_CEILING_POLICY,
  LOGIN_IP_POLICY,
  LOGIN_PAIR_POLICY,
  SIGNUP_IP_POLICY,
  clearKey,
  clientIp,
  lockMessage,
  lockedSeconds,
  loginEmailKey,
  loginIpKey,
  loginPairKey,
  recordFailure,
  signupIpKey,
} from './rate-limit';
import { publishProfileChange } from './realtime';
import { SESSION_COOKIE, readSessionUser, startSession, toSessionUser } from './session';

// Hash of a random password nobody knows (same scheme and iteration count as real hashes). Checked
// when the email is unknown so a miss costs as much as a wrong password.
const DUMMY_PASSWORD_HASH =
  'pbkdf2$100000$1wcg7zoSwsxjPnT/6xtt7A==$/dq8M6A9dEeHSdDtYVbTpvkGlOdLSmNvWbuVe8lqhOw=';
const BAD_CREDENTIALS = 'Email or password is incorrect.';

export const getSessionUserFn = createServerFn({ method: 'GET' }).handler(() => readSessionUser());

export const requireSessionUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await readSessionUser();
  if (!user) throw new Error('Sign in required.');
  return user;
});

export const signUpFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1, 'Enter your name').max(80),
      email: z.string().trim().email('Enter a valid email'),
      password: z.string().min(8, 'Use at least 8 characters'),
    }),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    // Every attempt counts, including ones that hit an existing email.
    const ipKey = signupIpKey(clientIp());
    const wait = await lockedSeconds(ipKey, SIGNUP_IP_POLICY);
    if (wait > 0) throw new Error(lockMessage(wait));
    await recordFailure(ipKey, SIGNUP_IP_POLICY);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing.length > 0) throw new Error('An account with this email already exists.');
    const [created] = await db
      .insert(users)
      .values({
        id: newId(),
        email,
        name: data.name.trim(),
        passwordHash: await hashPassword(data.password),
        avatarColor: pickAvatarColor(email),
        title: 'Product engineer',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarColor: users.avatarColor,
        avatarKey: users.avatarKey,
        title: users.title,
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        lastSeenAt: users.lastSeenAt,
      });
    await startSession(created.id);
    return toSessionUser(created);
  });

export const signInFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().min(1, 'Enter your email'),
      password: z.string().min(1, 'Enter your password'),
    }),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const ip = clientIp();
    // The strict lock is per email AND client IP so a stranger cannot lock the owner out; the
    // per-email ceiling (all IPs together) only stops distributed guessing.
    const pairKey = loginPairKey(email, ip);
    const emailKey = loginEmailKey(email);
    const ipKey = loginIpKey(ip);
    // Refuse before hashing while any key is locked.
    const waits = await Promise.all([
      lockedSeconds(pairKey, LOGIN_PAIR_POLICY),
      lockedSeconds(emailKey, LOGIN_EMAIL_CEILING_POLICY),
      lockedSeconds(ipKey, LOGIN_IP_POLICY),
    ]);
    const wait = Math.max(...waits);
    if (wait > 0) throw new Error(lockMessage(wait));

    const [user] = await db.select().from(users).where(eq(users.email, email));
    const valid = await verifyPassword(data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      await Promise.all([
        recordFailure(pairKey, LOGIN_PAIR_POLICY),
        recordFailure(emailKey, LOGIN_EMAIL_CEILING_POLICY),
        recordFailure(ipKey, LOGIN_IP_POLICY),
      ]);
      throw new Error(BAD_CREDENTIALS);
    }
    await clearKey(pairKey);
    await startSession(user.id);
    return toSessionUser(user);
  });

export const signOutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
    deleteCookie(SESSION_COOKIE, { path: '/' });
  }
  return { ok: true as const };
});

export const signOutEverywhereFn = createServerFn({ method: 'POST' }).handler(async () => {
  const me = await readSessionUser();
  if (me) await db.delete(sessions).where(eq(sessions.userId, me.id));
  deleteCookie(SESSION_COOKIE, { path: '/' });
  return { ok: true as const };
});

export const updateProfileFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1, 'Enter your name').max(80),
      title: z.string().trim().max(80).optional(),
      statusEmoji: z.string().trim().max(8).optional(),
      statusText: z.string().trim().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [updated] = await db
      .update(users)
      .set({
        name: data.name,
        title: data.title ?? undefined,
        statusEmoji: data.statusEmoji ?? undefined,
        statusText: data.statusText ?? undefined,
      })
      .where(eq(users.id, me.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarColor: users.avatarColor,
        avatarKey: users.avatarKey,
        title: users.title,
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        lastSeenAt: users.lastSeenAt,
      });
    await publishProfileChange(me.id);
    return toSessionUser(updated);
  });
