import { getCookie, setCookie, getRequestProtocol } from '@tanstack/react-start/server';
import { and, db, eq, gt } from 'void/db';
import { sessions, users } from '@schema';
import { newId } from './ids';
import type { UserSummary } from './types';

export const SESSION_COOKIE = 'kora_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function toSessionUser(row: {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  title: string;
  statusEmoji: string;
  statusText: string;
  lastSeenAt: string;
}): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarColor: row.avatarColor,
    title: row.title,
    statusEmoji: row.statusEmoji,
    statusText: row.statusText,
    online: true,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function readSessionUser(): Promise<UserSummary | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
      title: users.title,
      statusEmoji: users.statusEmoji,
      statusText: users.statusText,
      lastSeenAt: users.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date().toISOString())));
  return rows[0] ? toSessionUser(rows[0]) : null;
}

export async function startSession(userId: string) {
  const id = newId(40);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db.insert(sessions).values({ id, userId, expiresAt });
  setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
    secure: getRequestProtocol() === 'https',
  });
}
