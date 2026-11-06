import { AsyncLocalStorage } from 'node:async_hooks';
import { getCookie, setCookie, getRequestProtocol } from '@tanstack/react-start/server';
import { and, db, eq, gt, inArray, lt } from 'void/db';
import { apiTokens, sessions, users } from '@schema';
import { newId } from './ids';
import { avatarUrlFor } from './people';
import type { UserSummary } from './types';

export const SESSION_COOKIE = 'kora_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function toSessionUser(row: {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarKey?: string | null;
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
    avatarUrl: avatarUrlFor(row.id, row.avatarKey),
    title: row.title,
    statusEmoji: row.statusEmoji,
    statusText: row.statusText,
    online: true,
    lastSeenAt: row.lastSeenAt,
  };
}

// A session older than this is replaced by a new id with a fresh expiry the next time it is used.
export const SESSION_ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
// The replaced session stays valid this long so parallel requests that still carry the old cookie
// are not signed out.
export const SESSION_GRACE_SECONDS = 60;
const EXPIRED_PURGE_BATCH = 100;

function writeSessionCookie(id: string) {
  setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
    secure: getRequestProtocol() === 'https',
  });
}

// An MCP request acts as the owner of its API token: inside runAsUser, every server function sees
// that person as the signed-in user, so permissions, history, inbox items and pushes all apply.
const actingUser = new AsyncLocalStorage<UserSummary>();

export function runAsUser<T>(user: UserSummary, work: () => Promise<T>) {
  return actingUser.run(user, work);
}

export const API_TOKEN_PREFIX = 'kora_';

export async function hashApiToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The person a `Bearer kora_…` token belongs to, or null. Marks the token as used. */
export async function userForApiToken(token: string): Promise<UserSummary | null> {
  if (!token.startsWith(API_TOKEN_PREFIX) || token.length < 20 || token.length > 100) return null;
  const tokenHash = await hashApiToken(token);
  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      lastUsedAt: apiTokens.lastUsedAt,
      id: users.id,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
      avatarKey: users.avatarKey,
      title: users.title,
      statusEmoji: users.statusEmoji,
      statusText: users.statusText,
      lastSeenAt: users.lastSeenAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, tokenHash));
  if (!row) return null;
  // At most one write a minute per token.
  if (!row.lastUsedAt || Date.now() - Date.parse(row.lastUsedAt) > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiTokens.id, row.tokenId));
  }
  return toSessionUser(row);
}

export async function readSessionUser(): Promise<UserSummary | null> {
  const acting = actingUser.getStore();
  if (acting) return acting;
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
      avatarKey: users.avatarKey,
      title: users.title,
      statusEmoji: users.statusEmoji,
      statusText: users.statusText,
      lastSeenAt: users.lastSeenAt,
      sessionCreatedAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date().toISOString())));
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - Date.parse(row.sessionCreatedAt) > SESSION_ROTATE_AFTER_MS) {
    await rotateSession(token, row.id).catch(() => undefined);
  }
  return toSessionUser(row);
}

// Sliding expiry: swap an old session for a new id with a full lifetime. The old row is not deleted;
// it is cut down to a short grace window.
async function rotateSession(oldId: string, userId: string) {
  const now = Date.now();
  const graceAt = new Date(now + SESSION_GRACE_SECONDS * 1000).toISOString();
  const newSessionId = newId(40);
  await db.insert(sessions).values({
    id: newSessionId,
    userId,
    expiresAt: new Date(now + SESSION_SECONDS * 1000).toISOString(),
  });
  // Only the request that finds the old row not yet retired (expiry beyond the grace window) wins;
  // a parallel request that loses discards its new row and keeps using the old cookie.
  const claimed = await db
    .update(sessions)
    .set({ expiresAt: graceAt })
    .where(and(eq(sessions.id, oldId), gt(sessions.expiresAt, graceAt)))
    .returning({ id: sessions.id });
  if (claimed.length === 0) {
    await db.delete(sessions).where(eq(sessions.id, newSessionId));
    return;
  }
  writeSessionCookie(newSessionId);
}

// Delete a bounded batch of expired sessions (uses the expires_at index).
async function purgeExpiredSessions() {
  await db
    .delete(sessions)
    .where(
      inArray(
        sessions.id,
        db
          .select({ id: sessions.id })
          .from(sessions)
          .where(lt(sessions.expiresAt, new Date().toISOString()))
          .limit(EXPIRED_PURGE_BATCH),
      ),
    );
}

export async function startSession(userId: string) {
  const id = newId(40);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db.insert(sessions).values({ id, userId, expiresAt });
  writeSessionCookie(id);
  await purgeExpiredSessions().catch(() => undefined);
}
