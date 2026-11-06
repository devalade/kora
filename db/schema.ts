import { sql } from 'void/db';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarColor: text('avatar_color').notNull().default('#D97757'),
  // R2 key of an uploaded profile photo; null shows initials.
  avatarKey: text('avatar_key'),
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
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);

// Failed sign-ins per key (an email or an IP address) inside a sliding window, for rate limiting.
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull().default(0),
    windowStart: text('window_start').notNull(),
    lockedUntil: text('locked_until'),
  },
  (table) => [index('login_attempts_window_idx').on(table.windowStart)],
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
    // Set while the member types a thread reply; null means they are typing in the channel.
    typingThreadId: text('typing_thread_id'),
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
  (table) => [
    index('attachments_message_idx').on(table.messageId),
    // Per-user storage quota and cleanup of uploads that never got attached to a message.
    index('attachments_uploader_idx').on(table.uploaderId, table.messageId),
  ],
);

export const linkPreviews = sqliteTable('link_previews', {
  url: text('url').primaryKey(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  siteName: text('site_name').notNull().default(''),
  domain: text('domain').notNull().default(''),
  fetchedAt: text('fetched_at').notNull().default(nowIso),
});

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

export const officePresence = sqliteTable(
  'office_presence',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    zone: text('zone').notNull().default('floor'),
    x: integer('x').notNull().default(50),
    y: integer('y').notNull().default(55),
    activity: text('activity').notNull().default(''),
    status: text('status').notNull().default('available'),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const officeActivities = sqliteTable(
  'office_activities',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    detail: text('detail').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('office_activities_workspace_idx').on(table.workspaceId, table.createdAt)],
);

export const taskStatuses = sqliteTable(
  'task_statuses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull().default('unstarted'),
    color: text('color').notNull().default('#736f66'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [
    uniqueIndex('task_statuses_workspace_name_idx').on(table.workspaceId, table.name),
    index('task_statuses_workspace_position_idx').on(table.workspaceId, table.position),
  ],
);

// A team owns an issue key (KOR-12) and every issue belongs to exactly one team, as in Linear.
export const teams = sqliteTable(
  'teams',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#EF5F3E'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [
    uniqueIndex('teams_workspace_key_idx').on(table.workspaceId, table.key),
    index('teams_workspace_idx').on(table.workspaceId),
  ],
);

// A project is an optional, time-bound body of work that groups issues across teams.
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#5B8DEF'),
    status: text('status').notNull().default('planned'),
    leadId: text('lead_id').references(() => users.id, { onDelete: 'set null' }),
    startDate: text('start_date'),
    targetDate: text('target_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
  },
  (table) => [index('projects_workspace_idx').on(table.workspaceId, table.createdAt)],
);

export const issues = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('todo'),
    priority: integer('priority').notNull().default(0),
    startDate: text('start_date'),
    dueDate: text('due_date'),
    parentIssueId: text('parent_issue_id'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull().default(nowIso),
    updatedAt: text('updated_at').notNull().default(nowIso),
    // Deleting moves an issue to the trash for 30 days so it can be restored.
    deletedAt: text('deleted_at'),
    // Bumped on every description save; a save based on an older version is a conflict.
    descriptionVersion: integer('description_version').notNull().default(0),
  },
  (table) => [
    uniqueIndex('issues_team_number_idx').on(table.teamId, table.number),
    index('issues_deleted_idx').on(table.workspaceId, table.deletedAt),
    index('issues_project_idx').on(table.projectId),
    index('issues_workspace_status_idx').on(table.workspaceId, table.status),
    index('issues_assignee_idx').on(table.assigneeId),
    index('issues_parent_idx').on(table.parentIssueId),
    index('issues_dates_idx').on(table.workspaceId, table.startDate, table.dueDate),
  ],
);

export const issueEditors = sqliteTable(
  'issue_editors',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    updatedAt: text('updated_at').notNull().default(nowIso),
    typingAt: text('typing_at'),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.userId] }),
    index('issue_editors_issue_idx').on(table.issueId, table.updatedAt),
  ],
);

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#736F66'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [uniqueIndex('labels_workspace_name_idx').on(table.workspaceId, table.name)],
);

export const issueLabels = sqliteTable(
  'issue_labels',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })],
);

export const issueComments = sqliteTable(
  'issue_comments',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('issue_comments_issue_idx').on(table.issueId, table.createdAt)],
);

// The issue's history line: one row per change, rendered between comments like Linear's activity.
export const issueEvents = sqliteTable(
  'issue_events',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [index('issue_events_issue_idx').on(table.issueId, table.createdAt)],
);

// The inbox: things that happened to you, per workspace.
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    issueId: text('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
    channelId: text('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull().default(nowIso),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.workspaceId, table.createdAt),
    index('notifications_unread_idx').on(table.userId, table.readAt),
  ],
);
