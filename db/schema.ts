import { sql } from 'void/db';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarColor: text('avatar_color').notNull().default('#D97757'),
  title: text('title').notNull().default(''),
  statusEmoji: text('status_emoji').notNull().default(''),
  statusText: text('status_text').notNull().default(''),
  lastSeenAt: text('last_seen_at').notNull().default(nowIso),
  createdAt: text('created_at').notNull().default(nowIso),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull().default(nowIso),
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: text('joined_at').notNull().default(nowIso),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_members_user_idx').on(table.userId),
  ],
);

export const channels = sqliteTable(
  'channels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    topic: text('topic').notNull().default(''),
    kind: text('kind').notNull().default('public'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [
    index('channels_workspace_idx').on(table.workspaceId),
    uniqueIndex('channels_workspace_name_idx')
      .on(table.workspaceId, table.name)
      .where(sql`${table.kind} <> 'dm'`),
  ],
);

export const channelMembers = sqliteTable(
  'channel_members',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: text('last_read_at').notNull().default(nowIso),
    typingAt: text('typing_at'),
    joinedAt: text('joined_at').notNull().default(nowIso),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
    index('channel_members_user_idx').on(table.userId),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    parentId: text('parent_id'),
    createdAt: text('created_at').notNull().default(nowIso),
    editedAt: text('edited_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('messages_channel_idx').on(table.channelId, table.createdAt),
    index('messages_parent_idx').on(table.parentId),
  ],
);

export const reactions = sqliteTable(
  'reactions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.emoji] })],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('attachments_message_idx').on(table.messageId)],
);

export const calls = sqliteTable(
  'calls',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    startedBy: text('started_by')
      .notNull()
      .references(() => users.id),
    startedAt: text('started_at').notNull().default(nowIso),
    endedAt: text('ended_at'),
  },
  (table) => [
    index('calls_channel_idx').on(table.channelId, table.endedAt),
    uniqueIndex('calls_channel_active_idx')
      .on(table.channelId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const callParticipants = sqliteTable(
  'call_participants',
  {
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: text('joined_at').notNull().default(nowIso),
    lastSeenAt: text('last_seen_at').notNull().default(nowIso),
    leftAt: text('left_at'),
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    cameraOn: integer('camera_on', { mode: 'boolean' }).notNull().default(true),
    sharing: integer('sharing', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.callId, table.userId] })],
);

export const callSignals = sqliteTable(
  'call_signals',
  {
    id: text('id').primaryKey(),
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('call_signals_inbox_idx').on(table.callId, table.toUserId, table.createdAt)],
);
