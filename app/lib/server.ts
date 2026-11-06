import { and, db, eq } from 'void/db';
import { channelMembers, channels, users, workspaceMembers, workspaces } from '@schema';
import type { UserSummary } from './types';
import { toUserSummary } from './people';
import { readSessionUser } from './session';

// D1 rejects statements with more than 100 bound parameters, so large id lists are queried in chunks.
const D1_CHUNK = 90;

export async function inChunks<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>) {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += D1_CHUNK) {
    rows.push(...(await query(ids.slice(start, start + D1_CHUNK))));
  }
  return rows;
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) throw new Error('Sign in required.');
  return user;
}

export async function requireWorkspace(workspaceId: string, userId: string) {
  const rows = await db
    .select({ id: workspaces.id, role: workspaceMembers.role })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)),
    )
    .where(eq(workspaces.id, workspaceId));
  const row = rows[0];
  if (!row) throw new Error('You are not a member of this workspace.');
  return row;
}

export function isAdminRole(role: string) {
  return role === 'owner' || role === 'admin';
}

/** Workflow, labels, teams and project deletion change things for everyone: admins only. */
export async function requireAdmin(workspaceId: string, userId: string, action: string) {
  const membership = await requireWorkspace(workspaceId, userId);
  if (!isAdminRole(membership.role)) throw new Error(`Only workspace admins can ${action}.`);
  return membership;
}

export async function requireChannel(channelId: string, userId: string) {
  const rows = await db
    .select({
      channelId: channels.id,
      workspaceId: channels.workspaceId,
      kind: channels.kind,
      name: channels.name,
    })
    .from(channels)
    .innerJoin(
      channelMembers,
      and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, userId)),
    )
    .where(eq(channels.id, channelId));
  const row = rows[0];
  if (!row) throw new Error('You are not a member of this channel.');
  return row;
}

export async function touchPresence(userId: string) {
  const [row] = await db.select({ lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.id, userId));
  if (!row) return;
  if (Date.now() - new Date(row.lastSeenAt).getTime() < 20_000) return;
  await db.update(users).set({ lastSeenAt: new Date().toISOString() }).where(eq(users.id, userId));
}

export function toSummary(row: {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  title: string;
  statusEmoji: string;
  statusText: string;
  lastSeenAt: string;
}): UserSummary {
  return toUserSummary(row);
}

export async function memberUsers(workspaceId: string) {
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
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows.map((row) => toUserSummary(row));
}
