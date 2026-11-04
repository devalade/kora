export type UserSummary = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  title: string;
  statusEmoji: string;
  statusText: string;
  online: boolean;
  lastSeenAt: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  inviteCode: string;
  role: string;
};

export type ChannelSummary = {
  id: string;
  name: string;
  topic: string;
  kind: 'public' | 'private' | 'dm' | 'studio';
  unread: number;
  memberCount: number;
  lastMessageAt: string | null;
  isMember: boolean;
};

export type DmSummary = ChannelSummary & {
  peer: UserSummary | null;
};

export type AttachmentView = {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
};

export type ReactionView = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type MessageView = {
  id: string;
  channelId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: UserSummary;
  reactions: ReactionView[];
  attachments: AttachmentView[];
  replyCount: number;
  lastReplyAt: string | null;
};

export type CallParticipantView = {
  userId: string;
  name: string;
  avatarColor: string;
  muted: boolean;
  cameraOn: boolean;
  sharing: boolean;
  joinedAt: string;
};

export type CallView = {
  id: string;
  channelId: string;
  startedBy: string;
  startedAt: string;
  participants: CallParticipantView[];
};

export type WorkspaceSnapshot = {
  workspace: WorkspaceSummary;
  me: UserSummary;
  channels: ChannelSummary[];
  dms: DmSummary[];
  members: UserSummary[];
  channelMembers: UserSummary[];
  channel: ChannelSummary | null;
  messages: MessageView[];
  typing: UserSummary[];
  call: CallView | null;
  hasMore: boolean;
};

export type ThreadView = {
  parent: MessageView;
  replies: MessageView[];
};

export type SearchHit = {
  message: MessageView;
  channelName: string;
  channelId: string;
};

export type WorkspaceOverview = {
  me: UserSummary;
  workspaces: WorkspaceSummary[];
};

export type OfficeStatus = 'available' | 'focus' | 'away' | 'huddle';

export type OfficePerson = {
  user: UserSummary;
  zone: string;
  x: number;
  y: number;
  activity: string;
  status: OfficeStatus;
  updatedAt: string;
  online: boolean;
};

export type OfficeActivity = {
  id: string;
  kind: string;
  detail: string;
  createdAt: string;
  user: UserSummary;
};

export type OfficeSnapshot = {
  workspace: WorkspaceSummary;
  me: UserSummary;
  people: OfficePerson[];
  activities: OfficeActivity[];
  studioChannelId: string | null;
  call: CallView | null;
};

export type TaskStatusCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
export type TaskStatus = {
  id: string;
  name: string;
  category: TaskStatusCategory;
  color: string;
  position: number;
};
export type TaskPriority = 0 | 1 | 2 | 3 | 4;

export type TaskProject = {
  id: string;
  name: string;
  key: string;
  color: string;
  description: string;
  issueCount: number;
};

export type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

export type TaskIssue = {
  id: string;
  key: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  project: { id: string; name: string; key: string; color: string };
  assignee: UserSummary | null;
  labels: TaskLabel[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  author: UserSummary;
};

export type TasksSnapshot = {
  workspace: WorkspaceSummary;
  me: UserSummary;
  projects: TaskProject[];
  labels: TaskLabel[];
  statuses: TaskStatus[];
  members: UserSummary[];
  issues: TaskIssue[];
  counts: {
    all: number;
    mine: number;
    byStatus: Record<string, number>;
  };
};

export type TaskIssueDetail = {
  issue: TaskIssue;
  comments: TaskComment[];
};
