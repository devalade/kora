import { createServerFn } from '@tanstack/react-start';
import { and, asc, db, eq } from 'void/db';
import { users, workspaceMembers } from '@schema';
import { z } from 'zod';
import { toUserSummary } from './people';
import { requireUser, requireWorkspace } from './server';
import { publish, toWorkspace } from './realtime';
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
