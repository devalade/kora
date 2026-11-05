import { createServerFn } from '@tanstack/react-start';
import {
  and,
  asc,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'void/db';
import {
  attachments,
  callParticipants,
  callSignals,
  calls,
  channelMembers,
  channels,
  messages,
  issues,
  reactions,
  taskStatuses,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { readSessionUser } from './session';
import { issueIdsForKeys, issueKeysIn, issueSubscribers, notify, recordIssueEvent } from './activity';
import { newId, newInviteCode, slugify } from './ids';
import { mentionHandle, mentionLookup } from './mentions';
import { toUserSummary } from './people';
import { memberUsers, requireChannel, requireUser, requireWorkspace, touchPresence } from './server';
import type {
  CallView,
  ChannelSummary,
  DmSummary,
  IssueRef,
  MessageView,
  SearchHit,
  TaskPriority,
  TaskStatusCategory,
  ThreadView,
  UserSummary,
  WorkspaceOverview,
  WorkspaceSnapshot,
} from './types';

const LIVE_WINDOW_MS = 75_000;
const TYPING_WINDOW_MS = 5_000;

const userSelection = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarColor: users.avatarColor,
  title: users.title,
  statusEmoji: users.statusEmoji,
  statusText: users.statusText,
  lastSeenAt: users.lastSeenAt,
};
const CALL_STALE_MS = 120_000;

type MessageBase = {
  id: string;
  channelId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorAvatarColor: string;
  authorTitle: string;
  authorStatusEmoji: string;
  authorStatusText: string;
  authorLastSeenAt: string;
};

const messageSelection = {
  id: messages.id,
  channelId: messages.channelId,
  parentId: messages.parentId,
  body: messages.body,
  createdAt: messages.createdAt,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
  authorId: users.id,
  authorName: users.name,
  authorEmail: users.email,
  authorAvatarColor: users.avatarColor,
  authorTitle: users.title,
  authorStatusEmoji: users.statusEmoji,
  authorStatusText: users.statusText,
  authorLastSeenAt: users.lastSeenAt,
};

function authorOf(row: MessageBase): UserSummary {
  return {
    id: row.authorId,
    name: row.authorName,
    email: row.authorEmail,
    avatarColor: row.authorAvatarColor,
    title: row.authorTitle,
    statusEmoji: row.authorStatusEmoji,
    statusText: row.authorStatusText,
    online: Date.now() - new Date(row.authorLastSeenAt).getTime() < LIVE_WINDOW_MS,
    lastSeenAt: row.authorLastSeenAt,
  };
}

const HYDRATE_CHUNK = 90;
const REF_PAIR_CHUNK = 30;
const STATUS_CATEGORIES: TaskStatusCategory[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];
const TASK_PRIORITIES: TaskPriority[] = [0, 1, 2, 3, 4];

/** Message text with code removed, so `KOR-1` in a code span is not a reference. */
function proseOf(body: string) {
  return body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

function issueKeysInBody(body: string) {
  return issueKeysIn(proseOf(body));
}

/**
 * Resolves the issue keys in a page of messages with one query per workspace (almost always one).
 * Each statement binds two parameters per key plus the workspace, so keys go in chunks of 30.
 */
async function issueRefsForMessages(rows: MessageBase[]) {
  const refsByMessage = new Map<string, IssueRef[]>();
  const keysByMessage = new Map<string, string[]>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const keys = issueKeysInBody(row.body);
    if (keys.length > 0) keysByMessage.set(row.id, keys);
  }
  if (keysByMessage.size === 0) return refsByMessage;

  const channelIds = [...new Set(rows.filter((row) => keysByMessage.has(row.id)).map((row) => row.channelId))];
  const channelRows = await db
    .select({ id: channels.id, workspaceId: channels.workspaceId })
    .from(channels)
    .where(inArray(channels.id, channelIds));
  const workspaceOfChannel = new Map(channelRows.map((row) => [row.id, row.workspaceId]));

  const keysByWorkspace = new Map<string, Set<string>>();
  for (const row of rows) {
    const keys = keysByMessage.get(row.id);
    const workspaceId = workspaceOfChannel.get(row.channelId);
    if (!keys || !workspaceId) continue;
    const set = keysByWorkspace.get(workspaceId) ?? new Set<string>();
    for (const key of keys) set.add(key);
    keysByWorkspace.set(workspaceId, set);
  }

  const refByWorkspaceKey = new Map<string, IssueRef>();
  const now = Date.now();
  const lookups: Promise<void>[] = [];
  for (const [workspaceId, keySet] of keysByWorkspace) {
    const keys = [...keySet];
    for (let start = 0; start < keys.length; start += REF_PAIR_CHUNK) {
      const pairs = keys.slice(start, start + REF_PAIR_CHUNK).map((key) => {
        const [teamKey, number] = key.split('-');
        return and(eq(teams.key, teamKey), eq(issues.number, Number(number)));
      });
      lookups.push(
        db
          .select({
            id: issues.id,
            number: issues.number,
            title: issues.title,
            priority: issues.priority,
            teamKey: teams.key,
            statusId: taskStatuses.id,
            statusName: taskStatuses.name,
            statusCategory: taskStatuses.category,
            statusColor: taskStatuses.color,
            statusPosition: taskStatuses.position,
            assigneeId: users.id,
            assigneeName: users.name,
            assigneeEmail: users.email,
            assigneeAvatarColor: users.avatarColor,
            assigneeTitle: users.title,
            assigneeStatusEmoji: users.statusEmoji,
            assigneeStatusText: users.statusText,
            assigneeLastSeenAt: users.lastSeenAt,
          })
          .from(issues)
          .innerJoin(teams, eq(teams.id, issues.teamId))
          .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
          .leftJoin(users, eq(users.id, issues.assigneeId))
          .where(and(eq(issues.workspaceId, workspaceId), or(...pairs)))
          .then((found) => {
            for (const row of found) {
              const key = `${row.teamKey}-${row.number}`;
              refByWorkspaceKey.set(`${workspaceId}:${key}`, {
                id: row.id,
                key,
                title: row.title,
                status: {
                  id: row.statusId,
                  name: row.statusName,
                  category: STATUS_CATEGORIES.find((item) => item === row.statusCategory) ?? 'unstarted',
                  color: row.statusColor,
                  position: row.statusPosition,
                },
                priority: TASK_PRIORITIES.find((item) => item === row.priority) ?? 0,
                assignee: row.assigneeId
                  ? toUserSummary(
                      {
                        id: row.assigneeId,
                        name: row.assigneeName ?? '',
                        email: row.assigneeEmail ?? '',
                        avatarColor: row.assigneeAvatarColor ?? '',
                        title: row.assigneeTitle ?? '',
                        statusEmoji: row.assigneeStatusEmoji ?? '',
                        statusText: row.assigneeStatusText ?? '',
                        lastSeenAt: row.assigneeLastSeenAt ?? new Date(0).toISOString(),
                      },
                      now,
                    )
                  : null,
              });
            }
          }),
      );
    }
  }
  await Promise.all(lookups);

  for (const row of rows) {
    const keys = keysByMessage.get(row.id);
    const workspaceId = workspaceOfChannel.get(row.channelId);
    if (!keys || !workspaceId) continue;
    const refs = keys
      .map((key) => refByWorkspaceKey.get(`${workspaceId}:${key}`))
      .filter((ref): ref is IssueRef => Boolean(ref));
    if (refs.length > 0) refsByMessage.set(row.id, refs);
  }
  return refsByMessage;
}

async function hydrateMessages(rows: MessageBase[], viewerId: string): Promise<MessageView[]> {
  // Each query below binds every id, and D1 allows at most 100 bound parameters per statement.
  if (rows.length > HYDRATE_CHUNK) {
    const views: MessageView[] = [];
    for (let start = 0; start < rows.length; start += HYDRATE_CHUNK) {
      views.push(...(await hydrateMessages(rows.slice(start, start + HYDRATE_CHUNK), viewerId)));
    }
    return views;
  }
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [reactionRows, attachmentRows, replyRows, issueRefMap] = await Promise.all([
    db
      .select({
        messageId: reactions.messageId,
        userId: reactions.userId,
        emoji: reactions.emoji,
      })
      .from(reactions)
      .where(inArray(reactions.messageId, ids)),
    db
      .select({
        id: attachments.id,
        messageId: attachments.messageId,
        name: attachments.name,
        mime: attachments.mime,
        size: attachments.size,
      })
      .from(attachments)
      .where(inArray(attachments.messageId, ids)),
    db
      .select({
        parentId: messages.parentId,
        count: sql<number>`count(*)`,
        last: sql<string | null>`max(${messages.createdAt})`,
      })
      .from(messages)
      .where(and(inArray(messages.parentId, ids), isNull(messages.deletedAt)))
      .groupBy(messages.parentId),
    issueRefsForMessages(rows),
  ]);

  const reactionMap = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of reactionRows) {
    let byEmoji = reactionMap.get(row.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      reactionMap.set(row.messageId, byEmoji);
    }
    const current = byEmoji.get(row.emoji) ?? { count: 0, mine: false };
    current.count += 1;
    if (row.userId === viewerId) current.mine = true;
    byEmoji.set(row.emoji, current);
  }

  const attachmentMap = new Map<string, MessageView['attachments']>();
  for (const row of attachmentRows) {
    if (!row.messageId) continue;
    const list = attachmentMap.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      url: `/api/files/${row.id}`,
    });
    attachmentMap.set(row.messageId, list);
  }

  const replyMap = new Map<string, { count: number; last: string | null }>();
  for (const row of replyRows) {
    if (row.parentId) replyMap.set(row.parentId, { count: Number(row.count), last: row.last });
  }

  return rows.map((row) => {
    const reactionsByEmoji = reactionMap.get(row.id);
    return {
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      body: row.body,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      author: authorOf(row),
      reactions: reactionsByEmoji
        ? [...reactionsByEmoji.entries()].map(([emoji, value]) => ({ emoji, ...value }))
        : [],
      attachments: attachmentMap.get(row.id) ?? [],
      replyCount: replyMap.get(row.id)?.count ?? 0,
      lastReplyAt: replyMap.get(row.id)?.last ?? null,
      issues: issueRefMap.get(row.id) ?? [],
    };
  });
}

async function channelSummaries(
  workspaceId: string,
  viewerId: string,
  memberRows: { channelId: string; userId: string; lastReadAt: string }[],
  viewerHandle: string,
): Promise<ChannelSummary[]> {
  const channelRows = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId))
    .orderBy(asc(channels.createdAt));
  if (channelRows.length === 0) return [];

  // A subquery binds one parameter; listing every channel id would exceed D1's 100-parameter limit.
  const ids = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId));
  const allMembers = await db
    .select({ channelId: channelMembers.channelId, userId: channelMembers.userId })
    .from(channelMembers)
    .where(inArray(channelMembers.channelId, ids));
  const mentionPattern = `%@${viewerHandle.replace(/[!%_]/g, '!$&')}%`;

  const [lastRows, unreadRows, mentionRows] = await Promise.all([
    db
      .select({
        channelId: messages.channelId,
        last: sql<string | null>`max(${messages.createdAt})`,
      })
      .from(messages)
      .where(and(inArray(messages.channelId, ids), isNull(messages.deletedAt)))
      .groupBy(messages.channelId),
    db
      .select({
        channelId: messages.channelId,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .innerJoin(
        channelMembers,
        and(
          eq(channelMembers.channelId, messages.channelId),
          eq(channelMembers.userId, viewerId),
        ),
      )
      .where(
        and(
          inArray(messages.channelId, ids),
          gt(messages.createdAt, channelMembers.lastReadAt),
          ne(messages.userId, viewerId),
          isNull(messages.deletedAt),
          isNull(messages.parentId),
        ),
      )
      .groupBy(messages.channelId),
    db
      .select({
        channelId: messages.channelId,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .innerJoin(
        channelMembers,
        and(
          eq(channelMembers.channelId, messages.channelId),
          eq(channelMembers.userId, viewerId),
        ),
      )
      .where(
        and(
          inArray(messages.channelId, ids),
          gt(messages.createdAt, channelMembers.lastReadAt),
          ne(messages.userId, viewerId),
          isNull(messages.deletedAt),
          sql`lower(${messages.body}) like ${mentionPattern} escape '!'`,
        ),
      )
      .groupBy(messages.channelId),
  ]);

  const memberCount = new Map<string, number>();
  for (const row of allMembers) {
    memberCount.set(row.channelId, (memberCount.get(row.channelId) ?? 0) + 1);
  }
  const lastMap = new Map(lastRows.map((row) => [row.channelId, row.last]));
  const unreadMap = new Map(unreadRows.map((row) => [row.channelId, Number(row.count)]));
  const mentionMap = new Map(mentionRows.map((row) => [row.channelId, Number(row.count)]));
  const mine = new Map(memberRows.map((row) => [row.channelId, row]));

  return channelRows.map((channel) => ({
    id: channel.id,
    name: channel.name,
    topic: channel.topic,
    kind: channel.kind as ChannelSummary['kind'],
    unread: unreadMap.get(channel.id) ?? 0,
    mentions: mentionMap.get(channel.id) ?? 0,
    memberCount: memberCount.get(channel.id) ?? 0,
    lastMessageAt: lastMap.get(channel.id) ?? null,
    isMember: mine.has(channel.id),
  }));
}

function dmFor(channel: ChannelSummary, viewerId: string, allMembers: { channelId: string; userId: string }[], usersById: Map<string, UserSummary>): DmSummary {
  const peerId = allMembers.find((row) => row.channelId === channel.id && row.userId !== viewerId)?.userId;
  return { ...channel, peer: peerId ? usersById.get(peerId) ?? null : null };
}

export const getWorkspaceOverviewFn = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await readSessionUser();
  if (!me) throw new Error('Sign in required.');
  await touchPresence(me.id);
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      inviteCode: workspaces.inviteCode,
      role: workspaceMembers.role,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, me.id)),
    )
    .orderBy(asc(workspaces.createdAt));
  return { me, workspaces: rows } satisfies WorkspaceOverview;
});

export const createWorkspaceFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(2, 'Name your workspace').max(60) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const base = slugify(data.name);
    let slug = base;
    for (let attempt = 1; attempt < 12; attempt++) {
      const existing = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
      if (existing.length === 0) break;
      slug = `${base}-${attempt + 1}`;
    }
    const workspaceId = newId();
    await db.insert(workspaces).values({
      id: workspaceId,
      name: data.name.trim(),
      slug,
      inviteCode: newInviteCode(),
      createdBy: me.id,
    });
    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: me.id,
      role: 'owner',
    });
    const seeds = [
      { name: 'general', topic: 'Team-wide announcements and the daily pulse.' },
      { name: 'random', topic: 'Links, jokes, and everything off-topic.' },
    ];
    for (const seed of seeds) {
      const channelId = newId();
      await db.insert(channels).values({
        id: channelId,
        workspaceId,
        name: seed.name,
        topic: seed.topic,
        kind: 'public',
        createdBy: me.id,
      });
      await db.insert(channelMembers).values({ channelId, userId: me.id });
    }
    return { slug };
  });

export const joinWorkspaceFn = createServerFn({ method: 'POST' })
  .validator(z.object({ code: z.string().trim().min(4) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.inviteCode, data.code.trim().toUpperCase()));
    if (!workspace) throw new Error('That invite code is not valid.');
    const existing = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, me.id)));
    if (existing.length === 0) {
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: me.id,
        role: 'member',
      });
      const publicChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.workspaceId, workspace.id), eq(channels.kind, 'public')));
      for (const channel of publicChannels) {
        await db
          .insert(channelMembers)
          .values({ channelId: channel.id, userId: me.id })
          .onConflictDoNothing();
      }
    }
    return { slug: workspace.slug };
  });

export const createChannelFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      workspaceId: z.string(),
      name: z.string().trim().min(1, 'Name the channel').max(50),
      topic: z.string().trim().max(160).optional(),
      kind: z.enum(['public', 'private']).default('public'),
      memberIds: z.array(z.string()).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireWorkspace(data.workspaceId, me.id);
    const name = data.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!name) throw new Error('Use letters or numbers in the channel name.');
    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.workspaceId, data.workspaceId), eq(channels.name, name)));
    if (existing.length > 0) throw new Error(`#${name} already exists.`);
    const channelId = newId();
    await db.insert(channels).values({
      id: channelId,
      workspaceId: data.workspaceId,
      name,
      topic: data.topic?.trim() ?? '',
      kind: data.kind,
      createdBy: me.id,
    });
    const memberIds = new Set([me.id, ...data.memberIds]);
    for (const userId of memberIds) {
      const member = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, userId)));
      if (member.length > 0) {
        await db.insert(channelMembers).values({ channelId, userId }).onConflictDoNothing();
      }
    }
    return { channelId, name };
  });

export const joinChannelFn = createServerFn({ method: 'POST' })
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [channel] = await db.select().from(channels).where(eq(channels.id, data.channelId));
    if (!channel) throw new Error('Channel not found.');
    await requireWorkspace(channel.workspaceId, me.id);
    if (channel.kind !== 'public') throw new Error('This channel is invite only.');
    await db.insert(channelMembers).values({ channelId: channel.id, userId: me.id }).onConflictDoNothing();
    return { ok: true as const };
  });

export const openDmFn = createServerFn({ method: 'POST' })
  .validator(z.object({ workspaceId: z.string(), userId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireWorkspace(data.workspaceId, me.id);
    await requireWorkspace(data.workspaceId, data.userId);
    if (data.userId === me.id) throw new Error('Pick a teammate to message.');
    const dmRows = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.workspaceId, data.workspaceId), eq(channels.kind, 'dm')));
    for (const row of dmRows) {
      const members = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, row.id));
      const ids = members.map((member) => member.userId).sort();
      const pair = [me.id, data.userId].sort();
      if (ids.length === 2 && ids[0] === pair[0] && ids[1] === pair[1]) {
        return { channelId: row.id };
      }
    }
    const channelId = newId();
    await db.insert(channels).values({
      id: channelId,
      workspaceId: data.workspaceId,
      name: '',
      topic: '',
      kind: 'dm',
      createdBy: me.id,
    });
    await db.insert(channelMembers).values([
      { channelId, userId: me.id },
      { channelId, userId: data.userId },
    ]);
    return { channelId };
  });

async function activeCall(channelId: string, now: number): Promise<CallView | null> {
  const rows = await db
    .select()
    .from(calls)
    .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
    .orderBy(desc(calls.startedAt))
    .limit(1);
  const call = rows[0];
  if (!call) return null;
  const live = await db
    .select({
      userId: callParticipants.userId,
      name: users.name,
      avatarColor: users.avatarColor,
      muted: callParticipants.muted,
      cameraOn: callParticipants.cameraOn,
      sharing: callParticipants.sharing,
      joinedAt: callParticipants.joinedAt,
      lastSeenAt: callParticipants.lastSeenAt,
    })
    .from(callParticipants)
    .innerJoin(users, eq(users.id, callParticipants.userId))
    .where(
      and(
        eq(callParticipants.callId, call.id),
        isNull(callParticipants.leftAt),
        gt(callParticipants.lastSeenAt, new Date(now - CALL_STALE_MS).toISOString()),
      ),
    )
    .orderBy(asc(callParticipants.joinedAt));
  if (live.length === 0) {
    await db.update(calls).set({ endedAt: new Date().toISOString() }).where(eq(calls.id, call.id));
    await db.delete(callSignals).where(eq(callSignals.callId, call.id));
    return null;
  }
  return {
    id: call.id,
    channelId: call.channelId,
    startedBy: call.startedBy,
    startedAt: call.startedAt,
    participants: live.map((row) => ({
      userId: row.userId,
      name: row.name,
      avatarColor: row.avatarColor,
      muted: row.muted,
      cameraOn: row.cameraOn,
      sharing: row.sharing,
      joinedAt: row.joinedAt,
    })),
  };
}

export const workspaceSnapshotFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string(), channelId: z.string().optional() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    const membership = await requireWorkspace(workspace.id, me.id);
    await touchPresence(me.id);

    const memberRows = await db
      .select({
        channelId: channelMembers.channelId,
        userId: channelMembers.userId,
        lastReadAt: channelMembers.lastReadAt,
      })
      .from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId))
      .where(and(eq(channels.workspaceId, workspace.id), eq(channelMembers.userId, me.id)));

    const [members, summaries] = await Promise.all([
      memberUsers(workspace.id),
      channelSummaries(workspace.id, me.id, memberRows, mentionHandle(me)),
    ]);
    const usersById = new Map(members.map((member) => [member.id, member]));
    const myChannelIds = new Set(memberRows.map((row) => row.channelId));

    const allChannelMemberRows = summaries.length
      ? await db
          .select({ channelId: channelMembers.channelId, userId: channelMembers.userId })
          .from(channelMembers)
          .where(
            inArray(
              channelMembers.channelId,
              db.select({ id: channels.id }).from(channels).where(eq(channels.workspaceId, workspace.id)),
            ),
          )
      : [];

    const visibleChannels = summaries.filter(
      (channel) =>
        channel.kind !== 'studio' &&
        (channel.kind === 'public' || myChannelIds.has(channel.id)),
    );
    const joinedChannels = visibleChannels.filter(
      (channel) => channel.kind !== 'dm' && myChannelIds.has(channel.id),
    );
    const dms = summaries
      .filter((channel) => channel.kind === 'dm' && myChannelIds.has(channel.id))
      .map((channel) => dmFor(channel, me.id, allChannelMemberRows, usersById));

    const fallback = joinedChannels[0] ?? null;
    const selected = data.channelId
      ? summaries.find((channel) => channel.id === data.channelId && myChannelIds.has(channel.id)) ?? fallback
      : fallback;

    let messageRows: MessageBase[] = [];
    let typing: UserSummary[] = [];
    let call: CallView | null = null;
    let channelMembersView: UserSummary[] = [];
    if (selected) {
      const now = Date.now();
      const [roots, typingRows, callView, memberRowsForChannel] = await Promise.all([
        db
          .select(messageSelection)
          .from(messages)
          .innerJoin(users, eq(users.id, messages.userId))
          .where(
            and(
              eq(messages.channelId, selected.id),
              isNull(messages.parentId),
              isNull(messages.deletedAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(60),
        db
          .select(userSelection)
          .from(channelMembers)
          .innerJoin(users, eq(users.id, channelMembers.userId))
          .where(
            and(
              eq(channelMembers.channelId, selected.id),
              ne(channelMembers.userId, me.id),
              gt(channelMembers.typingAt, new Date(now - TYPING_WINDOW_MS).toISOString()),
              isNull(channelMembers.typingThreadId),
            ),
          ),
        activeCall(selected.id, now),
        db
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
          .from(channelMembers)
          .innerJoin(users, eq(users.id, channelMembers.userId))
          .where(eq(channelMembers.channelId, selected.id)),
      ]);
      messageRows = roots.reverse();
      typing = typingRows.map((row) => toUserSummary(row));
      call = callView;
      channelMembersView = memberRowsForChannel.map((row) => toUserSummary(row));
    }

    const messagesView = await hydrateMessages(messageRows, me.id);
    const channel = selected;

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        inviteCode: workspace.inviteCode,
        role: membership.role,
      },
      me,
      channels: visibleChannels.filter((channel) => channel.kind !== 'dm'),
      dms,
      members,
      channelMembers: channelMembersView,
      channel,
      messages: messagesView,
      typing,
      call,
      hasMore: messageRows.length === 60,
    } satisfies WorkspaceSnapshot;
  });

export const getChannelPageFn = createServerFn({ method: 'GET' })
  .validator(z.object({ channelId: z.string(), before: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
    const rows = await db
      .select(messageSelection)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(
        and(
          eq(messages.channelId, data.channelId),
          isNull(messages.parentId),
          isNull(messages.deletedAt),
          lt(messages.createdAt, data.before),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);
    const ordered = rows.reverse();
    return {
      messages: await hydrateMessages(ordered, me.id),
      hasMore: rows.length === 50,
    };
  });

export const getThreadFn = createServerFn({ method: 'GET' })
  .validator(z.object({ messageId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [parent] = await db
      .select(messageSelection)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(and(eq(messages.id, data.messageId), isNull(messages.deletedAt)));
    if (!parent) throw new Error('Message not found.');
    await requireChannel(parent.channelId, me.id);
    const [replies, typingRows] = await Promise.all([
      db
        .select(messageSelection)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.userId))
        .where(and(eq(messages.parentId, data.messageId), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt)),
      db
        .select(userSelection)
        .from(channelMembers)
        .innerJoin(users, eq(users.id, channelMembers.userId))
        .where(
          and(
            eq(channelMembers.channelId, parent.channelId),
            eq(channelMembers.typingThreadId, data.messageId),
            ne(channelMembers.userId, me.id),
            gt(channelMembers.typingAt, new Date(Date.now() - TYPING_WINDOW_MS).toISOString()),
          ),
        ),
    ]);
    const [parentView, replyViews] = await Promise.all([
      hydrateMessages([parent], me.id),
      hydrateMessages(replies, me.id),
    ]);
    return {
      parent: parentView[0],
      replies: replyViews,
      typing: typingRows.map((row) => toUserSummary(row)),
    } satisfies ThreadView;
  });

/** People who can read a channel: everyone for public ones, its members for private rooms and DMs. */
async function channelAudience(channel: { channelId: string; kind: string }, userIds: string[]) {
  if (channel.kind === 'public' || userIds.length === 0) return userIds;
  const members = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(eq(channelMembers.channelId, channel.channelId));
  const inside = new Set(members.map((row) => row.userId));
  return userIds.filter((id) => inside.has(id));
}

/**
 * After a message is stored: writes "mentioned" lines on issues named by key, and inbox items for
 * those issues' followers, @mentioned teammates and the author of a replied-to thread.
 */
async function announceMessage({
  messageId,
  body,
  channel,
  actor,
  parentAuthorId,
}: {
  messageId: string;
  body: string;
  channel: { channelId: string; workspaceId: string; kind: string; name: string };
  actor: UserSummary;
  parentAuthorId: string | null;
}) {
  const prose = proseOf(body);
  const workspaceId = channel.workspaceId;
  const base = { workspaceId, actorId: actor.id, channelId: channel.channelId, messageId, body };

  const issueIds = await issueIdsForKeys(workspaceId, issueKeysIn(prose));
  const handles = [...new Set([...prose.matchAll(/(?<![\w.-])@([A-Za-z0-9._-]+)/g)].map((match) => match[1].toLowerCase().replace(/[._-]+$/, '')))];
  const lookup = handles.length > 0 ? mentionLookup(await memberUsers(workspaceId)) : null;
  const mentioned = new Set<string>();
  for (const handle of handles) {
    const person = lookup?.get(handle);
    if (person && person.id !== actor.id) mentioned.add(person.id);
  }
  const mentionedIds = await channelAudience(channel, [...mentioned]);

  const jobs: Promise<unknown>[] = [];
  const history = channel.kind === 'public';
  for (const issueId of new Set(issueIds.values())) {
    if (history) {
      jobs.push(
        recordIssueEvent(
          issueId,
          actor.id,
          'mentioned',
          null,
          JSON.stringify({
            channelId: channel.channelId,
            channelName: channel.name,
            messageId,
          }),
        ),
      );
    }
    jobs.push(
      issueSubscribers(issueId)
        .then((followers) => channelAudience(channel, followers))
        .then((userIds) => notify({ ...base, kind: 'issue_mentioned', userIds, issueId })),
    );
  }
  if (mentionedIds.length > 0) jobs.push(notify({ ...base, kind: 'message_mention', userIds: mentionedIds }));
  if (parentAuthorId && !mentionedIds.includes(parentAuthorId)) {
    jobs.push(notify({ ...base, kind: 'thread_reply', userIds: [parentAuthorId] }));
  }
  await Promise.all(jobs);
}

export const sendMessageFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      channelId: z.string(),
      body: z.string().max(8000).default(''),
      parentId: z.string().optional(),
      attachmentIds: z.array(z.string()).max(6).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    const channel = await requireChannel(data.channelId, me.id);
    const body = data.body.trim();
    if (!body && data.attachmentIds.length === 0) throw new Error('Write something first.');
    let parentAuthorId: string | null = null;
    if (data.parentId) {
      const [parent] = await db
        .select({
          channelId: messages.channelId,
          parentId: messages.parentId,
          userId: messages.userId,
        })
        .from(messages)
        .where(and(eq(messages.id, data.parentId), isNull(messages.deletedAt)));
      if (!parent || parent.channelId !== data.channelId) throw new Error('Thread not found.');
      if (parent.parentId) throw new Error('Reply in the original thread instead.');
      parentAuthorId = parent.userId;
    }
    const id = newId();
    await db.insert(messages).values({
      id,
      channelId: data.channelId,
      userId: me.id,
      body,
      parentId: data.parentId ?? null,
    });
    if (data.attachmentIds.length > 0) {
      await db
        .update(attachments)
        .set({ messageId: id })
        .where(
          and(
            inArray(attachments.id, data.attachmentIds),
            eq(attachments.uploaderId, me.id),
            isNull(attachments.messageId),
          ),
        );
    }
    await db
      .update(channelMembers)
      .set({ lastReadAt: new Date().toISOString(), typingAt: null, typingThreadId: null })
      .where(and(eq(channelMembers.channelId, data.channelId), eq(channelMembers.userId, me.id)));
    // The message is saved; a failed history line or inbox item must not fail the send.
    try {
      await announceMessage({
        messageId: id,
        body,
        channel,
        actor: me,
        parentAuthorId,
      });
    } catch (error) {
      console.error('Could not record message references', error);
    }
    return { id };
  });

export const toggleReactionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ messageId: z.string(), emoji: z.string().min(1).max(8) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [message] = await db
      .select({ channelId: messages.channelId })
      .from(messages)
      .where(and(eq(messages.id, data.messageId), isNull(messages.deletedAt)));
    if (!message) throw new Error('Message not found.');
    await requireChannel(message.channelId, me.id);
    const removed = await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, data.messageId),
          eq(reactions.userId, me.id),
          eq(reactions.emoji, data.emoji),
        ),
      )
      .returning({ userId: reactions.userId });
    if (removed.length === 0) {
      await db
        .insert(reactions)
        .values({
          messageId: data.messageId,
          userId: me.id,
          emoji: data.emoji,
        })
        .onConflictDoNothing();
    }
    return { ok: true as const };
  });

export const markReadFn = createServerFn({ method: 'POST' })
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
    await db
      .update(channelMembers)
      .set({ lastReadAt: new Date().toISOString() })
      .where(and(eq(channelMembers.channelId, data.channelId), eq(channelMembers.userId, me.id)));
    return { ok: true as const };
  });

export const setTypingFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      channelId: z.string(),
      // The thread's parent message id, when typing a reply instead of a channel message.
      threadId: z.string().max(64).optional(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
    await db
      .update(channelMembers)
      .set({
        typingAt: data.active ? new Date().toISOString() : null,
        typingThreadId: data.active ? (data.threadId ?? null) : null,
      })
      .where(and(eq(channelMembers.channelId, data.channelId), eq(channelMembers.userId, me.id)));
    return { ok: true as const };
  });

export const searchMessagesFn = createServerFn({ method: 'GET' })
  .validator(z.object({ workspaceId: z.string(), query: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireWorkspace(data.workspaceId, me.id);
    const rows = await db
      .select({
        ...messageSelection,
        channelName: channels.name,
        channelKind: channels.kind,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .innerJoin(
        channelMembers,
        and(
          eq(channelMembers.channelId, messages.channelId),
          eq(channelMembers.userId, me.id),
        ),
      )
      .where(
        and(
          eq(channels.workspaceId, data.workspaceId),
          ne(channels.kind, 'studio'),
          isNull(messages.deletedAt),
          sql`lower(${messages.body}) like ${`%${data.query.toLowerCase()}%`}`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(30);
    const hydrated = await hydrateMessages(rows, me.id);
    const hits: SearchHit[] = hydrated.map((message, index) => ({
      message,
      channelName: rows[index].channelName || 'direct message',
      channelId: rows[index].channelId,
    }));
    return hits;
  });

export const updateChannelFn = createServerFn({ method: 'POST' })
  .validator(z.object({ channelId: z.string(), topic: z.string().trim().max(160) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
    await db.update(channels).set({ topic: data.topic }).where(eq(channels.id, data.channelId));
    return { ok: true as const };
  });
