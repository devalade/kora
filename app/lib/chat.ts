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
  sql,
} from 'void/db';
import {
  attachments,
  callParticipants,
  calls,
  channelMembers,
  channels,
  messages,
  reactions,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { readSessionUser } from './session';
import { newId, newInviteCode, slugify } from './ids';
import { toUserSummary } from './people';
import { memberUsers, requireChannel, requireUser, requireWorkspace, touchPresence } from './server';
import type {
  CallView,
  ChannelSummary,
  DmSummary,
  MessageView,
  SearchHit,
  UserSummary,
  WorkspaceOverview,
  WorkspaceSnapshot,
  WorkspaceSummary,
} from './types';

const LIVE_WINDOW_MS = 75_000;
const TYPING_WINDOW_MS = 5_000;
const CALL_STALE_MS = 45_000;

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

async function hydrateMessages(rows: MessageBase[], viewerId: string): Promise<MessageView[]> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [reactionRows, attachmentRows, replyRows] = await Promise.all([
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
    };
  });
}

async function channelSummaries(
  workspaceId: string,
  viewerId: string,
  memberRows: { channelId: string; userId: string; lastReadAt: string }[],
): Promise<ChannelSummary[]> {
  const channelRows = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId))
    .orderBy(asc(channels.createdAt));
  if (channelRows.length === 0) return [];

  const ids = channelRows.map((channel) => channel.id);
  const allMembers = await db
    .select({ channelId: channelMembers.channelId, userId: channelMembers.userId })
    .from(channelMembers)
    .where(inArray(channelMembers.channelId, ids));

  const [lastRows, unreadRows] = await Promise.all([
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
  ]);

  const memberCount = new Map<string, number>();
  for (const row of allMembers) {
    memberCount.set(row.channelId, (memberCount.get(row.channelId) ?? 0) + 1);
  }
  const lastMap = new Map(lastRows.map((row) => [row.channelId, row.last]));
  const unreadMap = new Map(unreadRows.map((row) => [row.channelId, Number(row.count)]));
  const mine = new Map(memberRows.map((row) => [row.channelId, row]));

  return channelRows.map((channel) => ({
    id: channel.id,
    name: channel.name,
    topic: channel.topic,
    kind: channel.kind as ChannelSummary['kind'],
    unread: unreadMap.get(channel.id) ?? 0,
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
    if (channel.kind === 'private') throw new Error('Ask a member to add you to this private channel.');
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
      channelSummaries(workspace.id, me.id, memberRows),
    ]);
    const usersById = new Map(members.map((member) => [member.id, member]));
    const myChannelIds = new Set(memberRows.map((row) => row.channelId));

    const allChannelMemberRows = summaries.length
      ? await db
          .select({ channelId: channelMembers.channelId, userId: channelMembers.userId })
          .from(channelMembers)
          .where(inArray(channelMembers.channelId, summaries.map((channel) => channel.id)))
      : [];

    const visibleChannels = summaries.filter(
      (channel) => channel.kind === 'public' || myChannelIds.has(channel.id),
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
          .where(
            and(
              eq(channelMembers.channelId, selected.id),
              ne(channelMembers.userId, me.id),
              gt(channelMembers.typingAt, new Date(now - TYPING_WINDOW_MS).toISOString()),
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
    if (channel) {
      await db
        .update(channelMembers)
        .set({ lastReadAt: new Date().toISOString() })
        .where(and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, me.id)));
      channel.unread = 0;
    }

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
    const replies = await db
      .select(messageSelection)
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(and(eq(messages.parentId, data.messageId), isNull(messages.deletedAt)))
      .orderBy(asc(messages.createdAt));
    const [parentView, replyViews] = await Promise.all([
      hydrateMessages([parent], me.id),
      hydrateMessages(replies, me.id),
    ]);
    return { parent: parentView[0], replies: replyViews };
  });

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
    await requireChannel(data.channelId, me.id);
    const body = data.body.trim();
    if (!body && data.attachmentIds.length === 0) throw new Error('Write something first.');
    if (data.parentId) {
      const [parent] = await db
        .select({ channelId: messages.channelId })
        .from(messages)
        .where(and(eq(messages.id, data.parentId), isNull(messages.deletedAt)));
      if (!parent || parent.channelId !== data.channelId) throw new Error('Thread not found.');
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
      .set({ lastReadAt: new Date().toISOString(), typingAt: null })
      .where(and(eq(channelMembers.channelId, data.channelId), eq(channelMembers.userId, me.id)));
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
    const existing = await db
      .select({ userId: reactions.userId })
      .from(reactions)
      .where(
        and(
          eq(reactions.messageId, data.messageId),
          eq(reactions.userId, me.id),
          eq(reactions.emoji, data.emoji),
        ),
      );
    if (existing.length > 0) {
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.messageId, data.messageId),
            eq(reactions.userId, me.id),
            eq(reactions.emoji, data.emoji),
          ),
        );
    } else {
      await db.insert(reactions).values({
        messageId: data.messageId,
        userId: me.id,
        emoji: data.emoji,
      });
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
  .validator(z.object({ channelId: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
    await db
      .update(channelMembers)
      .set({ typingAt: data.active ? new Date().toISOString() : null })
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
