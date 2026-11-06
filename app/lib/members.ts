import { createServerFn } from '@tanstack/react-start';
import { and, asc, db, eq, inArray } from 'void/db';
import { channelMembers, channels, notifications, users, workspaceMembers, workspaces } from '@schema';
import { z } from 'zod';
import { toUserSummary } from './people';
import { newInviteCode } from './ids';
import { requireAdmin, requireUser, requireWorkspace } from './server';
import { publish, toUser, toWorkspace } from './realtime';
import type { UserSummary } from './types';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type MemberWithRole = UserSummary & { role: WorkspaceRole };

function toRole(value: string): WorkspaceRole {
  return value === 'owner' || value === 'admin' ? value : 'member';
}

export const getMembersFn = createServerFn({ method: 'GET' })
  .validator(z.object({ workspaceId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const membership = await requireWorkspace(data.workspaceId, me.id);
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
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, data.workspaceId))
      .orderBy(asc(users.name));
    return {
      myRole: toRole(membership.role),
      members: rows.map((row): MemberWithRole => ({ ...toUserSummary(row), role: toRole(row.role) })),
    };
  });

/** Only the owner hands out or takes back admin rights; the owner's own role never changes here. */
export const setMemberRoleFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      workspaceId: z.string(),
      userId: z.string().max(64),
      role: z.enum(['admin', 'member']),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    const membership = await requireWorkspace(data.workspaceId, me.id);
    if (membership.role !== 'owner') throw new Error('Only the workspace owner can change roles.');
    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, data.userId)),
      );
    if (!target) throw new Error('That person is not in this workspace.');
    if (target.role === 'owner') throw new Error('The owner’s role cannot be changed.');
    await db
      .update(workspaceMembers)
      .set({ role: data.role })
      .where(
        and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, data.userId)),
      );
    // The promoted or demoted person's open tabs show or hide the admin controls at once.
    await publish(data.workspaceId, [toWorkspace({ t: 'workspace' }), toWorkspace({ t: 'issue' })]);
    return { ok: true as const };
  });

/** Takes a person out of a workspace: every channel and DM membership there, their inbox for it, and the membership. */
async function removeFromWorkspace(workspaceId: string, userId: string) {
  const workspaceChannels = db.select({ id: channels.id }).from(channels).where(eq(channels.workspaceId, workspaceId));
  await db
    .delete(channelMembers)
    .where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, workspaceChannels)));
  await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)));
  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  // Their open tabs lose the workspace at once; everyone else's member lists update.
  await publish(workspaceId, [toUser(userId, { t: 'grants' }), toUser(userId, { t: 'workspace' }), toWorkspace({ t: 'workspace' })]);
}

/**
 * The owner can remove anyone but themselves; admins can remove members. Their messages and issues
 * stay, credited to them.
 */
export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator(z.object({ workspaceId: z.string(), userId: z.string().max(64) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const membership = await requireAdmin(data.workspaceId, me.id, 'remove people');
    if (data.userId === me.id) throw new Error('Use Leave workspace to remove yourself.');
    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, data.userId)));
    if (!target) throw new Error('That person is not in this workspace.');
    if (target.role === 'owner') throw new Error('The owner cannot be removed.');
    if (target.role === 'admin' && membership.role !== 'owner') throw new Error('Only the owner can remove an admin.');
    await removeFromWorkspace(data.workspaceId, data.userId);
    return { ok: true as const };
  });

export const leaveWorkspaceFn = createServerFn({ method: 'POST' })
  .validator(z.object({ workspaceId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const membership = await requireWorkspace(data.workspaceId, me.id);
    if (membership.role === 'owner') throw new Error('The owner cannot leave the workspace.');
    await removeFromWorkspace(data.workspaceId, me.id);
    return { ok: true as const };
  });

export const renameWorkspaceFn = createServerFn({ method: 'POST' })
  .validator(z.object({ workspaceId: z.string(), name: z.string().trim().min(2, 'Name your workspace').max(60) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireAdmin(data.workspaceId, me.id, 'rename the workspace');
    // The slug stays, so every link people have shared keeps working.
    await db.update(workspaces).set({ name: data.name }).where(eq(workspaces.id, data.workspaceId));
    await publish(data.workspaceId, [toWorkspace({ t: 'workspace' })]);
    return { ok: true as const };
  });

/** A new invite link. The old one stops working at once. */
export const resetInviteCodeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ workspaceId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireAdmin(data.workspaceId, me.id, 'reset the invite link');
    const inviteCode = newInviteCode();
    await db.update(workspaces).set({ inviteCode }).where(eq(workspaces.id, data.workspaceId));
    await publish(data.workspaceId, [toWorkspace({ t: 'workspace' })]);
    return { inviteCode };
  });
