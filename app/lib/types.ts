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
  kind: 'public' | 'private' | 'dm';
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
