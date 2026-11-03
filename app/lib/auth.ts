import { createServerFn } from '@tanstack/react-start';
import { deleteCookie, getCookie } from '@tanstack/react-start/server';
import { db, eq } from 'void/db';
import { sessions, users } from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { hashPassword, verifyPassword } from './password';
import { pickAvatarColor } from './people';
import { SESSION_COOKIE, readSessionUser, startSession, toSessionUser } from './session';

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
    const [user] = await db.select().from(users).where(eq(users.email, email));
    const valid = user ? await verifyPassword(data.password, user.passwordHash) : false;
    if (!user || !valid) throw new Error('Wrong email or password.');
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
        title: users.title,
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        lastSeenAt: users.lastSeenAt,
      });
    return toSessionUser(updated);
  });
