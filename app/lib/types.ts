export type UserSummary = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  /** Uploaded profile photo, versioned so it can be cached for good. Null shows initials. */
  avatarUrl: string | null;
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
  mentions: number;
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
  /** Issues named by key (KOR-12) in the body, with live status. Unknown keys are left out. */
  issues: IssueRef[];
};

export type CallParticipantView = {
  userId: string;
  name: string;
  avatarColor: string;
  /** Uploaded profile photo for the call tile; omitted or null shows initials. */
  avatarUrl?: string | null;
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
  typing: UserSummary[];
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

export type TaskTeam = {
  id: string;
  name: string;
  key: string;
  color: string;
  description: string;
  issueCount: number;
};

export type TaskProjectStatus = 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';

/** A Linear-style project: an optional body of work that groups issues across teams. */
export type TaskProject = {
  id: string;
  name: string;
  description: string;
  color: string;
  status: TaskProjectStatus;
  lead: UserSummary | null;
  startDate: string | null;
  targetDate: string | null;
  issueCount: number;
  doneCount: number;
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
  startDate: string | null;
  dueDate: string | null;
  parentId: string | null;
  subIssueCount: number;
  subIssueDone: number;
  team: { id: string; name: string; key: string; color: string };
  project: { id: string; name: string; color: string } | null;
  assignee: UserSummary | null;
  labels: TaskLabel[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  descriptionVersion: number;
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
  teams: TaskTeam[];
  projects: TaskProject[];
  labels: TaskLabel[];
  statuses: TaskStatus[];
  members: UserSummary[];
  issues: TaskIssue[];
  counts: {
    all: number;
    /** Every issue outside the trash; larger than `all` when the list is capped. */
    total: number;
    mine: number;
    byStatus: Record<string, number>;
  };
};

export type IssueEventKind =
  | 'created'
  | 'title'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'project'
  | 'parent'
  | 'start_date'
  | 'due_date'
  | 'mentioned'
  | 'deleted'
  | 'restored';

/** One line of an issue's history. Values are already display text ("In Progress", "Amina Diallo"). */
export type TaskEvent = {
  id: string;
  kind: IssueEventKind;
  actor: UserSummary | null;
  from: string | null;
  to: string | null;
  createdAt: string;
};

export type TaskIssueDetail = {
  issue: TaskIssue;
  comments: TaskComment[];
  events: TaskEvent[];
  parent: TaskIssue | null;
  subIssues: TaskIssue[];
  editors: UserSummary[];
  createdBy: UserSummary | null;
  /** Teammates writing a comment right now. Includes the viewer; filter on the client. */
  commentTyping: UserSummary[];
};

/** A compact view of an issue for #KOR-12 references and embeds in chat. */
export type IssueRef = {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: UserSummary | null;
};

export type NotificationKind =
  | 'issue_assigned'
  | 'issue_status'
  | 'issue_comment'
  | 'issue_mentioned'
  | 'message_mention'
  | 'thread_reply';

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  actor: UserSummary | null;
  body: string;
  readAt: string | null;
  createdAt: string;
  issue: IssueRef | null;
  channel: { id: string; name: string; kind: string } | null;
  messageId: string | null;
};
