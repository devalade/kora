import { createServerFn } from '@tanstack/react-start';
import { and, db, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'void/db';
import {
  channels,
  issues,
  notifications,
  taskStatuses,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { publish, toUser } from './realtime';
import { toUserSummary } from './people';
import { inChunks } from './server';
import { readSessionUser } from './session';
import type {
  InboxItem,
  IssueRef,
  NotificationKind,
  TaskPriority,
  TaskStatusCategory,
  UserSummary,
} from './types';

const INBOX_LIMIT = 100;
/** Read notifications older than this are deleted when their owner loads the inbox. */
export const INBOX_RETENTION_DAYS = 90;
/** At most this many rows go per load, so a first cleanup of a large backlog stays cheap. */
const INBOX_PRUNE_BATCH = 100;
const KINDS: NotificationKind[] = [
  'issue_assigned',
  'issue_status',
  'issue_comment',
  'issue_mentioned',
  'message_mention',
  'thread_reply',
  'issue_pr',
];
const CATEGORIES: TaskStatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
const PRIORITIES: TaskPriority[] = [0, 1, 2, 3, 4];

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarColor: users.avatarColor,
  avatarKey: users.avatarKey,
  title: users.title,
  statusEmoji: users.statusEmoji,
  statusText: users.statusText,
  lastSeenAt: users.lastSeenAt,
};

async function inboxContext(slug: string) {
  const me = await readSessionUser();
  if (!me) throw new Error('Sign in required.');
  // Workspace and membership in one statement; the slow path only chooses the error message.
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, me.id)),
    )
    .where(eq(workspaces.slug, slug));
  if (!workspace) {
    const [exists] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
    throw new Error(exists ? 'You are not a member of this workspace.' : 'Workspace not found.');
  }
  return { me, workspaceId: workspace.id };
}

/**
 * Opportunistic retention: deletes the user's read notifications older than 90 days, a bounded batch
 * per call. Unread items are never touched, and issue history is a separate table that is not pruned.
 */
async function pruneReadNotifications(userId: string) {
  const cutoff = new Date(Date.now() - INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(notifications).where(
    inArray(
      notifications.id,
      db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            isNotNull(notifications.readAt),
            lt(notifications.createdAt, cutoff),
          ),
        )
        .limit(INBOX_PRUNE_BATCH),
    ),
  );
}

async function unreadCount(userId: string, workspaceId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        eq(notifications.workspaceId, workspaceId),
      ),
    );
  return Number(row?.total ?? 0);
}

export const getInboxFn = createServerFn({ method: 'GET' })
  // `poll` marks background refreshes, which skip the cleanup; opening the inbox runs it.
  .validator(z.object({ slug: z.string(), poll: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ items: InboxItem[]; unread: number }> => {
    const { me, workspaceId } = await inboxContext(data.slug);
    if (!data.poll) await pruneReadNotifications(me.id).catch(() => undefined);

    const [rows, unread] = await Promise.all([
      db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          actorId: notifications.actorId,
          body: notifications.body,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          messageId: notifications.messageId,
          issueId: issues.id,
          issueNumber: issues.number,
          issueTitle: issues.title,
          issuePriority: issues.priority,
          issueAssigneeId: issues.assigneeId,
          teamKey: teams.key,
          statusId: taskStatuses.id,
          statusName: taskStatuses.name,
          statusCategory: taskStatuses.category,
          statusColor: taskStatuses.color,
          statusPosition: taskStatuses.position,
          channelId: channels.id,
          channelName: channels.name,
          channelKind: channels.kind,
        })
        .from(notifications)
        .leftJoin(issues, eq(issues.id, notifications.issueId))
        .leftJoin(teams, eq(teams.id, issues.teamId))
        .leftJoin(taskStatuses, eq(taskStatuses.id, issues.status))
        .leftJoin(channels, eq(channels.id, notifications.channelId))
        .where(and(eq(notifications.userId, me.id), eq(notifications.workspaceId, workspaceId)))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(INBOX_LIMIT),
      unreadCount(me.id, workspaceId),
    ]);

    const personIds = [
      ...new Set(
        rows.flatMap((row) => [row.actorId, row.issueAssigneeId]).filter((id): id is string => !!id),
      ),
    ];
    const people = await inChunks(personIds, (chunk) =>
      db.select(userColumns).from(users).where(inArray(users.id, chunk)),
    );
    const now = Date.now();
    const byId = new Map<string, UserSummary>(
      people.map((person) => [person.id, toUserSummary(person, now)]),
    );

    const items: InboxItem[] = rows.map((row) => {
      let issue: IssueRef | null = null;
      if (row.issueId && row.teamKey && row.statusId) {
        issue = {
          id: row.issueId,
          key: `${row.teamKey}-${row.issueNumber}`,
          title: row.issueTitle ?? '',
          status: {
            id: row.statusId,
            name: row.statusName ?? '',
            category: CATEGORIES.find((c) => c === row.statusCategory) ?? 'unstarted',
            color: row.statusColor ?? '#736f66',
            position: row.statusPosition ?? 0,
          },
          priority: PRIORITIES.find((p) => p === row.issuePriority) ?? 0,
          assignee: row.issueAssigneeId ? (byId.get(row.issueAssigneeId) ?? null) : null,
        };
      }
      return {
        id: row.id,
        kind: KINDS.find((k) => k === row.kind) ?? 'issue_comment',
        actor: row.actorId ? (byId.get(row.actorId) ?? null) : null,
        body: row.body,
        readAt: row.readAt,
        createdAt: row.createdAt,
        issue,
        channel: row.channelId
          ? { id: row.channelId, name: row.channelName ?? '', kind: row.channelKind ?? 'public' }
          : null,
        messageId: row.messageId,
      };
    });

    return { items, unread };
  });

export const getInboxCountFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<{ unread: number }> => {
    const { me, workspaceId } = await inboxContext(data.slug);
    return { unread: await unreadCount(me.id, workspaceId) };
  });

/** Marks items read, or unread again with `unread: true`. Pass `ids` for some, `all` for every unread item. */
export const markInboxReadFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      ids: z.array(z.string()).max(100).optional(),
      all: z.boolean().optional(),
      unread: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ unread: number }> => {
    const { me, workspaceId } = await inboxContext(data.slug);
    const readAt = data.unread ? null : new Date().toISOString();
    const mine = and(eq(notifications.userId, me.id), eq(notifications.workspaceId, workspaceId));

    if (data.all && !data.unread) {
      await db
        .update(notifications)
        .set({ readAt })
        .where(and(mine, isNull(notifications.readAt)));
    } else if (data.ids && data.ids.length > 0) {
      await db
        .update(notifications)
        .set({ readAt })
        .where(and(mine, inArray(notifications.id, data.ids)));
    }
    // This person's other tabs update their inbox and badge.
    await publish(workspaceId, [toUser(me.id, { t: 'inbox' })]);
    return { unread: await unreadCount(me.id, workspaceId) };
  });
