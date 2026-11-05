import { createServerFn } from '@tanstack/react-start';
import { and, db, desc, eq, inArray, isNull, sql } from 'void/db';
import { channels, issues, notifications, taskStatuses, teams, users, workspaces } from '@schema';
import { z } from 'zod';
import { toUserSummary } from './people';
import { inChunks, requireWorkspace } from './server';
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
const KINDS: NotificationKind[] = [
  'issue_assigned',
  'issue_status',
  'issue_comment',
  'issue_mentioned',
  'message_mention',
  'thread_reply',
];
const CATEGORIES: TaskStatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
const PRIORITIES: TaskPriority[] = [0, 1, 2, 3, 4];

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarColor: users.avatarColor,
  title: users.title,
  statusEmoji: users.statusEmoji,
  statusText: users.statusText,
  lastSeenAt: users.lastSeenAt,
};

async function inboxContext(slug: string) {
  const me = await readSessionUser();
  if (!me) throw new Error('Sign in required.');
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug));
  if (!workspace) throw new Error('Workspace not found.');
  await requireWorkspace(workspace.id, me.id);
  return { me, workspaceId: workspace.id };
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
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<{ items: InboxItem[]; unread: number }> => {
    const { me, workspaceId } = await inboxContext(data.slug);

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
    return { unread: await unreadCount(me.id, workspaceId) };
  });
