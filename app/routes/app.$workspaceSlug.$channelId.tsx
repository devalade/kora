import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import {
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
import { MessageList } from '../components/message-list';
import { ThreadPanel } from '../components/thread-panel';
import { WorkspaceSidebar } from '../components/workspace-sidebar';
import { relativeTime } from '../lib/format';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/$channelId')({
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const requestRef = useRef(0);
  const paramsRef = useRef({ slug: params.workspaceSlug, channelId: params.channelId });
  const typingAt = useRef(0);
  const lastMessageId = useRef<string | null>(null);

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

  const load = useCallback(async () => {
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
        setSnapshot(next);
        setHasMore(next.hasMore);
        if (
          (next.channel?.unread || next.channel?.mentions) &&
          document.visibilityState === 'visible'
        ) {
          void markReadFn({ data: { channelId: next.channel.id } });
        }
      }
    } catch {
      // A dropped poll is recovered by the next tick.
    }
  }, [params.workspaceSlug, params.channelId]);

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
    setSnapshot(initial);
    setOlder([]);
    setHasMore(initial.hasMore);
    setThreadId(null);
    setSidebarOpen(false);
    stickRef.current = true;
    lastMessageId.current = null;
  }, [initial]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    tick();
    const timer = setInterval(tick, 2000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

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
    if (last !== lastMessageId.current && stickRef.current) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' });
      });
    }
    lastMessageId.current = last;
  }, [messages]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [params.channelId]);

  useEffect(() => {
    if (snapshot.call && callOpen) return;
    if (!snapshot.call && callOpen) setCallOpen(false);
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
    const element = scrollRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;
    try {
      const page = await getChannelPageFn({
        data: { channelId: targetChannelId, before: first.createdAt },
      });
      if (paramsRef.current.channelId !== targetChannelId) return;
      setOlder((current) => [...page.messages, ...current]);
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        if (!element) return;
        element.scrollTop = element.scrollHeight - previousHeight + previousTop;
      });
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
                name={peer?.name ?? 'Direct message'}
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
            <div className="hidden md:block">
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
                stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
              }}
              className="scroll-thin min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto max-w-[980px]">
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
                />
                <div ref={bottomRef} className="h-4" />
              </div>
            </div>

            {snapshot.call && !joinedCall && (
              <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-mint-deep/20 bg-mint/30 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-deep opacity-40" />
                    <span className="relative inline-flex size-2 rounded-full bg-mint-deep" />
                  </span>
                  <span className="font-medium">A huddle is live</span>
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
            />
          </section>

          {threadId ? (
            <ThreadPanel
              key={threadId}
              messageId={threadId}
              channelName={channelLabel}
              members={snapshot.members}
              meId={snapshot.me.id}
              onMentionClick={openDmWith}
              onClose={() => setThreadId(null)}
              onChanged={() => void load()}
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
        onOpenChannel={(channelId) => void openChannel(channelId)}
      />
      <ProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        me={snapshot.me}
        onSaved={() => void load()}
      />
      <ChannelDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        snapshot={snapshot}
      />

      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      {callOpen && snapshot.call && (
        <CallRoom
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
          <Avatar name={peer.name} color={peer.avatarColor} size="2xl" online={peer.online} />
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
    <aside className="hidden w-[260px] shrink-0 flex-col border-l border-line bg-paper lg:flex">
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
          <Avatar name={member.name} color={member.avatarColor} size="sm" online={member.online} />
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
