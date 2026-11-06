import { AgentAccessDialog } from '../components/agent-access-dialog';
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import {
  ArrowDown,
  Hash,
  Info,
  Menu,
  MessageSquare,
  Phone,
  Search,
  Users,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteMessageFn,
  editMessageFn,
  getChannelPageFn,
  markReadFn,
  openDmFn,
  sendMessageFn,
  setTypingFn,
  toggleReactionFn,
  workspaceSnapshotFn,
} from '../lib/chat';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { joinCallFn } from '../lib/calls';
import type { MessageView, WorkspaceSnapshot } from '../lib/types';
import { Avatar, AvatarStack } from '../components/avatar';
import { CallRoom } from '../components/call-room';
import {
  BrowseChannelsDialog,
  ChannelDetailsDialog,
  CreateChannelDialog,
  InviteDialog,
  NewDmDialog,
  ProfileDialog,
  SearchDialog,
} from '../components/dialogs';
import { ImageLightbox } from '../components/image-lightbox';
import { MessageComposer } from '../components/message-composer';
import { MessageList, type MessageActions } from '../components/message-list';
import { Modal } from '../components/modal';
import { showNotification } from '../lib/notifications';
import { track } from '../lib/analytics';
import { ThreadPanel } from '../components/thread-panel';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { CALL_LIMIT_MINUTES, relativeTime } from '../lib/format';
import { useLiveRefresh } from '../lib/realtime-client';
import { cn } from '../utils/cn';

/** A little longer than the server's typing window (TYPING_WINDOW_MS in chat.ts). */
const TYPING_LAPSE_MS = 5_500;

/** `m` scrolls to and highlights a message; `thread` opens a thread. Both come from copied links. */
type ChannelSearch = { m?: string; thread?: string };

export const Route = createFileRoute('/app/$workspaceSlug/$channelId')({
  validateSearch: (search: Record<string, unknown>): ChannelSearch => ({
    m: typeof search.m === 'string' ? search.m.slice(0, 64) : undefined,
    thread: typeof search.thread === 'string' ? search.thread.slice(0, 64) : undefined,
  }),
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) =>
    workspaceSnapshotFn({
      data: { slug: params.workspaceSlug, channelId: params.channelId },
    }),
  head: () => ({ meta: [{ title: 'Kora · Team chat' }] }),
  component: WorkspacePage,
});

/**
 * A short fingerprint of what a viewer can see change: messages and their reactions, replies and
 * files, who is typing, the huddle, unread badges and the channel lists. Presence is left out on
 * purpose, since it moves constantly and should not keep the poll at full speed.
 */
function snapshotToken(next: WorkspaceSnapshot) {
  const parts: (string | number | boolean | null)[] = [
    next.channel?.id ?? null,
    next.hasMore,
    next.channels.length,
    next.dms.length,
    next.channelMembers.length,
  ];
  for (const message of next.messages) {
    parts.push(
      message.id,
      message.editedAt,
      message.deletedAt,
      message.replyCount,
      message.lastReplyAt,
      message.attachments.length,
      message.reactions.map((reaction) => `${reaction.emoji}${reaction.count}${reaction.mine ? '*' : ''}`).join(','),
      message.issues.map((issue) => `${issue.key}${issue.status.id}`).join(','),
    );
  }
  parts.push(next.typing.map((person) => person.id).join(','));
  if (next.call) {
    parts.push(
      next.call.id,
      next.call.participants
        .map((p) => `${p.userId}${p.muted ? 'm' : ''}${p.cameraOn ? 'c' : ''}${p.sharing ? 's' : ''}`)
        .join(','),
    );
  }
  for (const item of [...next.channels, ...next.dms]) parts.push(item.id, item.unread, item.mentions);
  return parts.join('|');
}

function WorkspacePage() {
  const initial = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(initial);
  const [older, setOlder] = useState<MessageView[]>([]);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const requestRef = useRef(0);
  const paramsRef = useRef({ slug: params.workspaceSlug, channelId: params.channelId });
  const typingAt = useRef(0);
  const lastMessageId = useRef<string | null>(null);
  const search = Route.useSearch();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [unreadAfter, setUnreadAfter] = useState<string | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [deleting, setDeleting] = useState<MessageView | null>(null);
  const previousRef = useRef<WorkspaceSnapshot>(initial);

  const channel = snapshot.channel;
  const channelLabel = channel?.kind === 'dm'
    ? snapshot.dms.find((dm) => dm.id === channel.id)?.peer?.name ?? 'direct message'
    : channel?.name ?? 'channel';
  const peer = channel?.kind === 'dm' ? snapshot.dms.find((dm) => dm.id === channel.id)?.peer : null;
  const joinedCall = Boolean(
    snapshot.call?.participants.some((participant) => participant.userId === snapshot.me.id),
  );
  const channelNames = useMemo(
    () => new Set([...snapshot.channels.map((item) => item.name), 'general', 'random']),
    [snapshot.channels],
  );

  const load = useCallback(async (): Promise<string | null> => {
    const requestId = ++requestRef.current;
    const target = { slug: params.workspaceSlug, channelId: params.channelId };
    try {
      const next = await workspaceSnapshotFn({
        data: { slug: target.slug, channelId: target.channelId },
      });
      if (
        requestId === requestRef.current &&
        paramsRef.current.slug === target.slug &&
        paramsRef.current.channelId === target.channelId
      ) {
        notifyAbout(previousRef.current, next);
        previousRef.current = next;
        setSnapshot(next);
        setHasMore(next.hasMore);
        if (
          (next.channel?.unread || next.channel?.mentions) &&
          document.visibilityState === 'visible'
        ) {
          void markReadFn({ data: { channelId: next.channel.id } });
        }
        return snapshotToken(next);
      }
    } catch (error) {
      // Removed from the workspace (or it is gone): leave instead of showing stale messages.
      const message = error instanceof Error ? error.message : '';
      if (/not a member of this workspace|Workspace not found/.test(message)) {
        toast.error('You no longer have access to this workspace.');
        void navigate({ to: '/app' });
      }
      // Anything else is recovered by the next realtime refresh.
    }
    return null;
  }, [params.workspaceSlug, params.channelId]);

  /** A notification for each conversation that gained a DM or a mention since the last refresh. */
  function notifyAbout(before: WorkspaceSnapshot, after: WorkspaceSnapshot) {
    const watching = document.visibilityState === 'visible' && document.hasFocus();
    const old = new Map([...before.channels, ...before.dms].map((item) => [item.id, item]));
    for (const dm of after.dms) {
      const was = old.get(dm.id);
      if (!was || dm.unread <= was.unread || dm.muted) continue;
      if (watching && dm.id === after.channel?.id) continue;
      showNotification({
        title: dm.peer?.name ?? 'New direct message',
        body: dm.unread === 1 ? 'Sent you a message' : `Sent you ${dm.unread} messages`,
        tag: `dm:${dm.id}:${dm.unread}`,
        onClick: () => void openChannel(dm.id),
      });
    }
    for (const channel of after.channels) {
      const was = old.get(channel.id);
      if (!was || channel.mentions <= was.mentions) continue;
      if (watching && channel.id === after.channel?.id) continue;
      showNotification({
        title: `#${channel.name}`,
        body: 'You were mentioned',
        tag: `mention:${channel.id}:${channel.mentions}`,
        onClick: () => void openChannel(channel.id),
      });
    }
  }

  useEffect(() => {
    paramsRef.current = { slug: params.workspaceSlug, channelId: params.channelId };
    setOlder([]);
    setThreadId(null);
    setSidebarOpen(false);
    setMembersOpen(false);
    setCallOpen(false);
    stickRef.current = true;
    lastMessageId.current = null;
  }, [params.workspaceSlug, params.channelId]);

  useEffect(() => {
    previousRef.current = initial;
    setSnapshot(initial);
    setOlder([]);
    setHasMore(initial.hasMore);
    setThreadId(null);
    setSidebarOpen(false);
    stickRef.current = true;
    lastMessageId.current = null;
  }, [initial]);

  // Pushed, not polled: the realtime socket says when a message, reaction, typing, huddle, channel or
  // presence changed in this workspace, and the page refetches its snapshot (sidebar badges included).
  useLiveRefresh(params.workspaceSlug, load, (event) =>
    ['chat', 'typing', 'call', 'read', 'workspace', 'presence', 'grants'].includes(event.t),
  );

  // Typing indicators expire on the server after a few quiet seconds; refetch once when they lapse.
  const typingKey = snapshot.typing.map((person) => person.id).join(',');
  useEffect(() => {
    if (!typingKey) return;
    const timer = setTimeout(() => void load(), TYPING_LAPSE_MS);
    return () => clearTimeout(timer);
  }, [typingKey, load]);

  useEffect(() => {
    if (!channel) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      void markReadFn({ data: { channelId: channel.id } });
    };
    mark();
    window.addEventListener('focus', mark);
    document.addEventListener('visibilitychange', mark);
    return () => {
      window.removeEventListener('focus', mark);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [channel?.id]);

  const messages = useMemo(() => {
    const byId = new Map<string, MessageView>();
    for (const message of older) byId.set(message.id, message);
    for (const message of snapshot.messages) byId.set(message.id, message);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [older, snapshot.messages]);

  useEffect(() => {
    const last = messages[messages.length - 1]?.id ?? null;
    if (!last) return;
    if (last !== lastMessageId.current) {
      if (stickRef.current) {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ block: 'end' });
        });
      } else if (lastMessageId.current !== null) {
        setNewWhileAway((count) => count + 1);
      }
    }
    lastMessageId.current = last;
  }, [messages]);

  // The "New" line sits where the viewer stopped reading when they opened the channel, and stays
  // there while they read on.
  useEffect(() => {
    setUnreadAfter(channel && channel.unread > 0 ? channel.lastReadAt : null);
    setAwayFromBottom(false);
    setNewWhileAway(0);
    // Only on opening a channel: later refreshes mark it read and must not move the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  // Links: `?thread=` opens a thread, `?m=` scrolls to a message, loading older pages to find it.
  useEffect(() => {
    if (search.thread) setThreadId(search.thread);
  }, [search.thread, params.channelId]);

  useEffect(() => {
    if (!search.m) return;
    const target = search.m;
    if (!messages.some((message) => message.id === target)) {
      if (hasMore && !loadingMore && older.length < 500) void loadMore();
      return;
    }
    stickRef.current = false;
    setHighlightId(target);
    requestAnimationFrame(() => {
      document.getElementById(`message-${target}`)?.scrollIntoView({ block: 'center' });
    });
    const timer = setTimeout(() => setHighlightId(null), 2400);
    void navigate({ to: '.', search: {}, replace: true });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.m, messages, hasMore, loadingMore]);

  // Tab title: the conversation, plus a count of DMs and mentions waiting elsewhere.
  useEffect(() => {
    if (!channel) return;
    const others = [...snapshot.channels.filter((item) => item.isMember), ...snapshot.dms].filter(
      (item) => item.id !== channel.id,
    );
    const urgent = others.reduce(
      (sum, item) => sum + item.mentions + (item.kind === 'dm' && !item.muted ? item.unread : 0),
      0,
    );
    const unreadElsewhere = others.some((item) => item.unread > 0 && !item.muted);
    const prefix = urgent > 0 ? `(${urgent}) ` : unreadElsewhere ? '• ' : '';
    const label = channel.kind === 'dm' ? channelLabel : `#${channelLabel}`;
    document.title = `${prefix}${label} · ${snapshot.workspace.name} · Kora`;
  }, [channel, channelLabel, snapshot.channels, snapshot.dms, snapshot.workspace.name]);

  // The list is bottom-anchored in CSS (column-reverse), where scrollTop 0 is the newest message.
  // Switching channels resets to it; the first paint, server HTML included, already starts there.
  useEffect(() => {
    stickRef.current = true;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [params.channelId]);

  // Close the room when the call ends, but only once this page has seen the call: right after joining,
  // a refetch started before the join can still land and briefly show no call.
  const sawCall = useRef(false);
  useEffect(() => {
    if (!callOpen) {
      sawCall.current = false;
      return;
    }
    if (snapshot.call) sawCall.current = true;
    else if (sawCall.current) setCallOpen(false);
  }, [snapshot.call, callOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function openChannel(channelId: string) {
    await navigate({
      to: '/app/$workspaceSlug/$channelId',
      params: { workspaceSlug: params.workspaceSlug, channelId },
    });
  }

  function openDmWith(userId: string) {
    if (userId === snapshot.me.id) return;
    const existing = snapshot.dms.find((dm) => dm.peer?.id === userId);
    if (existing) {
      void openChannel(existing.id);
      return;
    }
    void (async () => {
      try {
        const { channelId } = await openDmFn({
          data: { workspaceId: snapshot.workspace.id, userId },
        });
        await openChannel(channelId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open the conversation.');
      }
    })();
  }

  async function loadMore() {
    if (!channel || loadingMore || !hasMore) return;
    const first = messages[0];
    if (!first) return;
    const targetChannelId = channel.id;
    setLoadingMore(true);
    try {
      const page = await getChannelPageFn({
        data: { channelId: targetChannelId, before: first.createdAt },
      });
      if (paramsRef.current.channelId !== targetChannelId) return;
      // Older messages are added above; the bottom-anchored list keeps the view where it is.
      setOlder((current) => [...page.messages, ...current]);
      setHasMore(page.hasMore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load earlier messages.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function send(body: string, attachmentIds: string[]) {
    if (!channel) return;
    await sendMessageFn({
      data: { channelId: channel.id, body, attachmentIds },
    });
    track('message_sent', { kind: channel.kind, files: attachmentIds.length });
    stickRef.current = true;
    await load();
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }));
  }

  function onTyping(active: boolean) {
    if (!channel) return;
    if (active) {
      if (Date.now() - typingAt.current < 2000) return;
      typingAt.current = Date.now();
      void setTypingFn({ data: { channelId: channel.id, active: true } });
    } else {
      typingAt.current = 0;
      void setTypingFn({ data: { channelId: channel.id, active: false } });
    }
  }

  async function react(messageId: string, emoji: string) {
    try {
      await toggleReactionFn({ data: { messageId, emoji } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reaction failed.');
    }
  }

  const isAdmin = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin';
  const messageActions: MessageActions = {
    canModerate: isAdmin,
    onEdit: async (message, body) => {
      await editMessageFn({ data: { messageId: message.id, body } });
      await load();
    },
    onDelete: (message) => setDeleting(message),
    onCopyLink: (message) => {
      const query = message.parentId ? `thread=${message.parentId}` : `m=${message.id}`;
      const url = `${window.location.origin}/app/${params.workspaceSlug}/${message.channelId}?${query}`;
      void navigator.clipboard.writeText(url).then(
        () => toast.success('Link copied.'),
        () => toast.error('Could not copy the link.'),
      );
    },
  };

  async function confirmDelete() {
    const message = deleting;
    if (!message) return;
    setDeleting(null);
    try {
      await deleteMessageFn({ data: { messageId: message.id } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the message.');
    }
  }

  function jumpToLatest() {
    stickRef.current = true;
    setAwayFromBottom(false);
    setNewWhileAway(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function joinHuddle() {
    if (!channel) return;
    try {
      await joinCallFn({ data: { channelId: channel.id } });
      await load();
      setCallOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join the huddle.');
    }
  }

  async function leaveHuddle() {
    setCallOpen(false);
    await load();
  }

  async function signOut() {
    await signOutFn();
    await router.invalidate();
    await navigate({ to: '/' });
  }

  if (!channel) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">No channels yet</h1>
          <p className="mt-2 text-sm text-muted">
            Create the first channel in {snapshot.workspace.name} to start talking.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-5 h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-paper"
          >
            Create a channel
          </button>
        </div>
        <CreateChannelDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          snapshot={snapshot}
          onCreated={(channelId) => void openChannel(channelId)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <WorkspaceSidebar
        snapshot={snapshot}
        activeChannelId={channel.id}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onSearch={() => setSearchOpen(true)}
        onCreateChannel={() => setCreateOpen(true)}
        onBrowseChannels={() => setBrowseOpen(true)}
        onInvite={() => setInviteOpen(true)}
        onNewDm={() => setDmOpen(true)}
        onProfile={() => setProfileOpen(true)}
        onSignOut={() => void signOut()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-line-soft md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            {channel.kind === 'dm' ? (
              <Avatar
                name={peer?.name ?? 'Direct message'} src={peer?.avatarUrl}
                color={peer?.avatarColor ?? '#736f66'}
                size="md"
                online={peer?.online}
              />
            ) : (
              <span className="grid size-9 place-items-center rounded-xl bg-sage text-ink-soft">
                <Hash size={18} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-[15px] font-semibold tracking-[-0.01em]">
                {channel.kind === 'dm' ? peer?.name ?? 'Direct message' : channel.name}
                {channel.kind === 'private' && <span className="text-[10px] text-faint">private</span>}
              </h1>
              <p className="max-w-[52vw] truncate text-[11px] text-muted">
                {channel.kind === 'dm'
                  ? peer?.online
                    ? 'Online now'
                    : `Last seen ${peer ? relativeTime(peer.lastSeenAt) : 'recently'}`
                  : channel.topic ||
                    `${channel.memberCount} ${channel.memberCount === 1 ? 'member' : 'members'}`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {channel.kind !== 'dm' &&
              snapshot.channelMembers.some((member) => member.id !== snapshot.me.id) && (
                <div className="mr-1 hidden lg:block">
                  <AvatarStack
                    people={[...snapshot.channelMembers]
                      .filter((member) => member.id !== snapshot.me.id)
                      .sort((a, b) => Number(b.online) - Number(a.online))}
                    max={4}
                  />
                </div>
              )}
            <HeaderButton label="Search" onClick={() => setSearchOpen(true)}>
              <Search size={17} />
            </HeaderButton>
            <button
              type="button"
              onClick={() => (joinedCall ? setCallOpen(true) : void joinHuddle())}
              title={`Huddles last up to ${CALL_LIMIT_MINUTES} minutes`}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-[11px] border px-3 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96]',
                joinedCall
                  ? 'border-mint-deep/25 bg-mint/45 text-mint-deep'
                  : 'border-line text-ink-soft hover:border-ink/20 hover:bg-canvas',
              )}
            >
              {joinedCall ? <Video size={15} /> : <Phone size={15} />}
              <span className="hidden sm:inline">
                {joinedCall ? 'Return to call' : snapshot.call ? 'Join huddle' : 'Huddle'}
              </span>
              {snapshot.call && (
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">
                  {snapshot.call.participants.length}
                </span>
              )}
            </button>
            <HeaderButton label="Channel details" onClick={() => setDetailsOpen(true)}>
              <Info size={17} />
            </HeaderButton>
            <div>
              <HeaderButton
                label="Members"
                onClick={() => {
                  setMembersOpen((open) => !open);
                  setThreadId(null);
                }}
              >
                <Users size={17} />
              </HeaderButton>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={() => {
                const element = scrollRef.current;
                if (!element) return;
                // column-reverse: scrollTop is 0 at the bottom and negative above it.
                const distance = Math.abs(element.scrollTop);
                stickRef.current = distance < 140;
                const away = distance > 600;
                if (away !== awayFromBottom) setAwayFromBottom(away);
                if (!away && newWhileAway > 0) setNewWhileAway(0);
              }}
              className="scroll-thin flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
            >
              {/* shrink-0: as a flex item the column would otherwise squeeze to the viewport and never scroll. */}
              <div className="mx-auto w-full max-w-[980px] shrink-0">
                <ChannelIntro
                  snapshot={snapshot}
                  peer={peer ?? null}
                  onEditTopic={() => setDetailsOpen(true)}
                />
                <MessageList
                  messages={messages}
                  meId={snapshot.me.id}
                  channelLabel={channelLabel}
                  channelNames={channelNames}
                  members={snapshot.members}
                  typing={snapshot.typing}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  isDm={channel.kind === 'dm'}
                  dmName={peer?.name}
                  onLoadMore={() => void loadMore()}
                  onReply={(message) => setThreadId(message.id)}
                  onReact={(messageId, emoji) => void react(messageId, emoji)}
                  onOpenThread={(message) => setThreadId(message.id)}
                  onImageOpen={(url, name) => setLightbox({ url, name })}
                  onMentionClick={openDmWith}
                  actions={messageActions}
                  unreadAfter={unreadAfter}
                  highlightId={highlightId}
                />
                <div ref={bottomRef} className="h-4" />
              </div>
            </div>

            {(awayFromBottom || newWhileAway > 0) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={jumpToLatest}
                  className="absolute -top-12 left-1/2 z-20 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-ink shadow-[var(--kora-shadow-popover)] transition-[background-color,transform] duration-150 hover:bg-canvas active:scale-[0.97]"
                >
                  <ArrowDown size={13} />
                  {newWhileAway > 0 ? `${newWhileAway} new ${newWhileAway === 1 ? 'message' : 'messages'}` : 'Jump to latest'}
                </button>
              </div>
            )}

            {snapshot.call && !joinedCall && (
              <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-mint-deep/20 bg-mint/30 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-deep opacity-40" />
                    <span className="relative inline-flex size-2 rounded-full bg-mint-deep" />
                  </span>
                  <span className="font-medium">A huddle is live</span>
                  <span className="text-xs text-mint-deep/80">{CALL_LIMIT_MINUTES} min max</span>
                  <span className="hidden text-xs text-mint-deep/80 sm:inline">
                    {snapshot.call.participants.map((person) => person.name.split(' ')[0]).join(', ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void joinHuddle()}
                  className="rounded-lg bg-mint-deep px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-mint-deep/90 active:scale-[0.96]"
                >
                  Join
                </button>
              </div>
            )}

            <MessageComposer
              key={channel.id}
              channelLabel={channel.kind === 'dm' ? channelLabel : `#${channelLabel}`}
              placeholder={
                channel.kind === 'dm'
                  ? `Message ${channelLabel}`
                  : `Message #${channelLabel}`
              }
              members={snapshot.members}
              onSend={send}
              onTyping={onTyping}
              draftKey={channel.id}
              acceptPageDrops={!threadId}
            />
          </section>

          {threadId ? (
            <ThreadPanel
              key={threadId}
              workspaceSlug={params.workspaceSlug}
              messageId={threadId}
              channelName={channelLabel}
              members={snapshot.members}
              meId={snapshot.me.id}
              onMentionClick={openDmWith}
              onClose={() => setThreadId(null)}
              onChanged={() => void load()}
              actions={messageActions}
            />
          ) : membersOpen ? (
            <MembersPanel
              snapshot={snapshot}
              onClose={() => setMembersOpen(false)}
              onOpenDm={openDmWith}
            />
          ) : null}
        </div>
      </main>

      <CreateChannelDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        snapshot={snapshot}
        onCreated={(channelId) => void openChannel(channelId)}
      />
      <BrowseChannelsDialog
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        snapshot={snapshot}
        onJoined={(channelId) => void openChannel(channelId)}
      />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} snapshot={snapshot} />
      <NewDmDialog
        open={dmOpen}
        onClose={() => setDmOpen(false)}
        snapshot={snapshot}
        onOpened={(channelId) => void openChannel(channelId)}
      />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        snapshot={snapshot}
        onOpenChannel={(channelId, messageId, thread) =>
          void navigate({
            to: '/app/$workspaceSlug/$channelId',
            params: { workspaceSlug: params.workspaceSlug, channelId },
            search: { m: messageId, thread },
          })
        }
      />
      <ProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        me={snapshot.me}
        onSaved={() => void load()}
        onOpenAgents={() => {
          setProfileOpen(false);
          setAgentsOpen(true);
        }}
      />
      <AgentAccessDialog open={agentsOpen} onClose={() => setAgentsOpen(false)} />
      <ChannelDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        snapshot={snapshot}
        onChanged={() => void load()}
        onLeft={() =>
          // The workspace index opens the first channel they are still in.
          void navigate({ to: '/app/$workspaceSlug', params: { workspaceSlug: params.workspaceSlug } })
        }
      />
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete message?"
        description={
          deleting && deleting.author.id !== snapshot.me.id
            ? `This removes ${deleting.author.name.split(' ')[0]}'s message for everyone. It cannot be undone.`
            : 'This removes the message and its files for everyone. It cannot be undone.'
        }
        width="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-line-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void confirmDelete()}
            className="h-10 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-danger/90"
          >
            Delete
          </button>
        </div>
      </Modal>

      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      {callOpen && snapshot.call && (
        <CallRoom
          workspaceSlug={params.workspaceSlug}
          key={snapshot.call.id}
          call={snapshot.call}
          me={snapshot.me}
          channelName={channelLabel}
          onLeave={() => void leaveHuddle()}
        />
      )}
    </div>
  );
}

function HeaderButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-9 place-items-center rounded-[11px] text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-line-soft hover:text-ink active:scale-[0.96]"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ChannelIntro({
  snapshot,
  peer,
  onEditTopic,
}: {
  snapshot: WorkspaceSnapshot;
  peer: import('../lib/types').UserSummary | null;
  onEditTopic: () => void;
}) {
  const channel = snapshot.channel;
  if (!channel) return null;
  return (
    <div className="px-5 pt-8">
      {peer ? (
        <div className="flex items-center gap-4">
          <Avatar name={peer.name} src={peer.avatarUrl} color={peer.avatarColor} size="2xl" online={peer.online} />
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">{peer.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {peer.title || 'Teammate'} · {peer.online ? 'Online' : 'Offline'}
            </p>
            {peer.statusText && (
              <p className="mt-1 text-xs text-muted">
                {peer.statusEmoji} {peer.statusText}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">#{channel.name}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            {channel.topic || `This is the start of #${channel.name}.`}{' '}
            <button
              type="button"
              className="font-medium text-mint-deep hover:underline"
              onClick={onEditTopic}
            >
              Edit topic
            </button>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} /> {channel.memberCount} members
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare size={12} /> {snapshot.messages.length} recent messages
            </span>
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <Phone size={12} /> {snapshot.call ? 'Huddle live' : 'No huddle'}
            </span>
          </div>
        </>
      )}
      <div className="mt-6 h-px bg-line" />
    </div>
  );
}

function MembersPanel({
  snapshot,
  onClose,
  onOpenDm,
}: {
  snapshot: WorkspaceSnapshot;
  onClose: () => void;
  onOpenDm: (userId: string) => void;
}) {
  const online = snapshot.channelMembers.filter((member) => member.online);
  const offline = snapshot.channelMembers.filter((member) => !member.online);
  return (
    <>
    {/* Phones and tablets: a sheet over the chat, closed by tapping outside. */}
    <button type="button" aria-label="Close people" onClick={onClose} className="fixed inset-0 z-30 bg-ink/30 lg:hidden" />
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(300px,85vw)] shrink-0 flex-col border-l border-line bg-paper shadow-[var(--kora-shadow-popover)] lg:static lg:z-auto lg:w-[260px] lg:shadow-none">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">People</h2>
          <p className="text-[11px] text-muted">
            {snapshot.channelMembers.length} in this channel
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-medium text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
        <MemberGroup label={`Online · ${online.length}`} members={online} onOpenDm={onOpenDm} />
        <MemberGroup label={`Offline · ${offline.length}`} members={offline} onOpenDm={onOpenDm} />
      </div>
    </aside>
    </>
  );
}

function MemberGroup({
  label,
  members,
  onOpenDm,
}: {
  label: string;
  members: import('../lib/types').UserSummary[];
  onOpenDm: (userId: string) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-1 px-2 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
        {label}
      </p>
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => onOpenDm(member.id)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-canvas"
        >
          <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="sm" online={member.online} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{member.name}</span>
            <span className="block truncate text-[10px] text-faint">
              {member.statusText || member.title}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
