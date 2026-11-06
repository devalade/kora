import {
  Bell,
  BellOff,
  Camera,
  Check,
  Copy,
  Hash,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  createChannelFn,
  joinChannelFn,
  leaveChannelFn,
  openDmFn,
  searchMessagesFn,
  setChannelMutedFn,
  updateChannelFn,
} from '../lib/chat';
import { changePasswordFn, signOutEverywhereFn, updateProfileFn } from '../lib/auth';
import { resetInviteCodeFn } from '../lib/members';
import { notificationsEnabled, setNotificationsEnabled } from '../lib/notifications';
import type {
  ChannelSummary,
  SearchHit,
  UserSummary,
  WorkspaceSnapshot,
} from '../lib/types';
import { Avatar } from './avatar';
import { Modal } from './modal';
import { clockTime, dayLabel } from '../lib/format';
import { cn } from '../utils/cn';

export function CreateChannelDialog({
  open,
  onClose,
  snapshot,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
  onCreated: (channelId: string) => void;
}) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<'public' | 'private'>('public');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setTopic('');
      setKind('public');
      setSelected([]);
    }
  }, [open]);

  async function submit() {
    setSaving(true);
    try {
      const created = await createChannelFn({
        data: {
          workspaceId: snapshot.workspace.id,
          name,
          topic,
          kind,
          memberIds: selected,
        },
      });
      toast.success(`#${created.name} created.`);
      onClose();
      onCreated(created.channelId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Channel was not created.');
    } finally {
      setSaving(false);
    }
  }

  const others = snapshot.members.filter((member) => member.id !== snapshot.me.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a channel"
      description="Channels keep a project, a team, or a topic in one place."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Name</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-ink/30">
            <Hash size={15} className="text-faint" />
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="launch-plan"
              className="h-11 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Topic</span>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What is this channel for?"
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('public')}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              kind === 'public' ? 'border-ink bg-canvas' : 'border-line hover:border-ink/20',
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Hash size={14} /> Public
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">
              Anyone in {snapshot.workspace.name} can join.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKind('private')}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              kind === 'private' ? 'border-ink bg-canvas' : 'border-line hover:border-ink/20',
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Lock size={14} /> Private
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">
              Only invited people can see it.
            </span>
          </button>
        </div>

        {kind === 'private' && (
          <div>
            <span className="mb-2 block text-xs font-semibold text-ink-soft">Add people</span>
            <div className="scroll-thin max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
              {others.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      current.includes(member.id)
                        ? current.filter((id) => id !== member.id)
                        : [...current, member.id],
                    )
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-line-soft"
                >
                  <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="sm" online={member.online} />
                  <span className="flex-1 text-sm">{member.name}</span>
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-md border',
                      selected.includes(member.id)
                        ? 'border-coral bg-coral text-white'
                        : 'border-line text-transparent',
                    )}
                  >
                    <Check size={12} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-line-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim() || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Create channel
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function BrowseChannelsDialog({
  open,
  onClose,
  snapshot,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
  onJoined: (channelId: string) => void;
}) {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannels(
      snapshot.channels
        .filter((channel) => !channel.isMember && channel.kind === 'public')
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, [open, snapshot.channels]);

  async function join(channelId: string) {
    setBusy(channelId);
    try {
      await joinChannelFn({ data: { channelId } });
      onClose();
      onJoined(channelId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Browse channels"
      description={`Public channels in ${snapshot.workspace.name}.`}
    >
      <div className="space-y-1">
        {channels.length === 0 && (
          <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">
            You are already in every public channel. Create a new one instead.
          </p>
        )}
        {channels.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 hover:border-line hover:bg-canvas"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-sage text-ink-soft">
              <Hash size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{channel.name}</p>
              <p className="truncate text-[11px] text-muted">
                {channel.topic || `${channel.memberCount} members`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void join(channel.id)}
              disabled={busy === channel.id}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-paper disabled:opacity-50"
            >
              {busy === channel.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Join
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function InviteDialog({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
}) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(snapshot.workspace.inviteCode);
  const [resetting, setResetting] = useState(false);
  const isAdmin = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin';
  useEffect(() => setCode(snapshot.workspace.inviteCode), [snapshot.workspace.inviteCode]);
  const link = `${typeof window === 'undefined' ? '' : window.location.origin}/join/${code}`;

  async function resetLink() {
    if (!window.confirm('Make a new invite link? The current link and code stop working at once.')) return;
    setResetting(true);
    try {
      const result = await resetInviteCodeFn({ data: { workspaceId: snapshot.workspace.id } });
      setCode(result.inviteCode);
      toast.success('New invite link ready. The old one no longer works.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset the link.');
    } finally {
      setResetting(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied.');
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite people to ${snapshot.workspace.name}`}
      description="Anyone with this link can join the workspace and its public channels."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">{link}</span>
          <button
            type="button"
            onClick={() => void copy(link)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-paper"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <div className="rounded-xl border border-dashed border-line px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-faint uppercase">Invite code</p>
          <p className="mt-1 font-mono text-lg tracking-[0.16em]">{code}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted">Shared the link somewhere it should not be? Make a new one.</p>
            <button
              type="button"
              onClick={() => void resetLink()}
              disabled={resetting}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink-soft hover:bg-line-soft disabled:opacity-50"
            >
              {resetting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Reset link
            </button>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-soft">
            Already here · {snapshot.members.length}
          </p>
          <div className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
            {snapshot.members.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="sm" online={member.online} />
                <span className="flex-1 text-sm">{member.name}</span>
                <span className="text-[11px] text-faint">{member.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function NewDmDialog({
  open,
  onClose,
  snapshot,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
  onOpened: (channelId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function openDm(userId: string) {
    setBusy(userId);
    try {
      const { channelId } = await openDmFn({
        data: { workspaceId: snapshot.workspace.id, userId },
      });
      onClose();
      onOpened(channelId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the conversation.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New message"
      description="Pick a teammate to start a direct conversation."
    >
      <div className="space-y-1">
        {snapshot.members
          .filter((member) => member.id !== snapshot.me.id)
          .map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => void openDm(member.id)}
              disabled={busy === member.id}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas"
            >
              <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="md" online={member.online} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{member.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {member.title || member.email}
                </span>
              </span>
              {busy === member.id ? (
                <Loader2 size={14} className="animate-spin text-faint" />
              ) : (
                <MessageSquare size={14} className="text-faint" />
              )}
            </button>
          ))}
      </div>
    </Modal>
  );
}

export function SearchDialog({
  open,
  onClose,
  snapshot,
  onOpenChannel,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
  onOpenChannel: (channelId: string, messageId?: string, threadId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const hitRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setLoading(false);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, hits.length]);

  useEffect(() => {
    hitRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function openHit(hit: SearchHit) {
    // A reply opens its thread; a channel message is scrolled to and highlighted.
    if (hit.message.parentId) onOpenChannel(hit.channelId, undefined, hit.message.parentId);
    else onOpenChannel(hit.channelId, hit.message.id);
    onClose();
  }

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchMessagesFn({
          data: { workspaceId: snapshot.workspace.id, query: query.trim() },
        });
        if (!cancelled) setHits(results);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, snapshot.workspace.id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Search"
      description={`Find a message anywhere in ${snapshot.workspace.name}.`}
    >
      <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-canvas px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-ink/25 focus-within:shadow-[0_0_0_3px_oklch(0.62_0.16_32_/_0.08)]">
        <Search size={16} className="text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(0, hits.length - 1)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && hits[activeIndex]) {
              event.preventDefault();
              openHit(hits[activeIndex]);
            } else if (event.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Search messages, people, decisions..."
          className="h-12 flex-1 bg-transparent text-sm outline-none"
        />
        {loading ? (
          <Loader2 size={15} className="animate-spin text-faint" />
        ) : (
          <kbd className="rounded-md border border-line/80 bg-paper px-1.5 py-0.5 font-mono text-[9px] text-faint">
            esc
          </kbd>
        )}
      </div>
      <div className="scroll-thin mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {query.trim().length < 2 && (
          <p className="px-3 py-8 text-center text-sm text-muted">
            Type at least two characters. Results update as you type.
          </p>
        )}
        {query.trim().length >= 2 && !loading && hits.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">No messages matched that.</p>
        )}
        {hits.map((hit, index) => (
          <button
            key={hit.message.id}
            ref={(element) => {
              hitRefs.current[index] = element;
            }}
            type="button"
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => openHit(hit)}
            className={cn(
              'flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100',
              index === activeIndex ? 'bg-canvas' : 'hover:bg-canvas/70',
            )}
          >
            <Avatar
              name={hit.message.author.name} src={hit.message.author.avatarUrl}
              color={hit.message.author.avatarColor}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">{hit.message.author.name}</span>
                <span className="text-[11px] text-faint">#{hit.channelName}</span>
                <span className="ml-auto text-[11px] text-faint tabular-nums" suppressHydrationWarning>
                  {dayLabel(hit.message.createdAt)} · {clockTime(hit.message.createdAt)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-muted">{hit.message.body}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-line-soft pt-3 text-[10px] text-faint">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>
          navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[9px]">↵</kbd>
          open
        </span>
        <span className="ml-auto">Search covers every channel you can see.</span>
      </div>
    </Modal>
  );
}

export function ProfileDialog({
  open,
  onClose,
  me,
  onSaved,
  onOpenAgents,
}: {
  open: boolean;
  onClose: () => void;
  me: UserSummary;
  onSaved: () => void;
  /** Opens the AI agents (MCP tokens) dialog in place of this one. */
  onOpenAgents?: () => void;
}) {
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji);
  const [statusText, setStatusText] = useState(me.statusText);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(me.name);
    setTitle(me.title);
    setStatusEmoji(me.statusEmoji);
    setStatusText(me.statusText);
    // The parent replaces `me` on every poll. Only reset the form when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      await updateProfileFn({ data: { name, title, statusEmoji, statusText } });
      toast.success('Profile updated.');
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out of Kora on every device, including this one?')) return;
    setSigningOut(true);
    try {
      await signOutEverywhereFn();
      window.location.assign('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your profile" description="How you show up in Kora.">
      <div className="space-y-4">
        <ProfilePhoto me={me} name={name || me.name} onChanged={onSaved} />
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Display name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Role</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Product engineer"
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
          />
        </label>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Emoji</span>
            <input
              value={statusEmoji}
              onChange={(event) => setStatusEmoji(event.target.value)}
              placeholder="🛠️"
              className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-center text-sm outline-none focus:border-ink/30"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Status</span>
            <input
              value={statusText}
              onChange={(event) => setStatusText(event.target.value)}
              placeholder="Building something"
              className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-line-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save profile
          </button>
        </div>
        {onOpenAgents && (
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">AI agents</span>
              <span className="block text-xs text-muted">Connect Claude Code to your issues with MCP.</span>
            </span>
            <button
              type="button"
              onClick={onOpenAgents}
              className="h-9 shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-soft hover:bg-line-soft"
            >
              Manage tokens
            </button>
          </div>
        )}
        <NotificationSetting />
        <PasswordSection email={me.email} />
        <div className="border-t border-line pt-4">
          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            disabled={signingOut}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-40"
          >
            {signingOut && <Loader2 size={14} className="animate-spin" />}
            Sign out of all devices
          </button>
          <p className="mt-1 px-3 text-xs text-muted">Ends every session for your account, on every browser.</p>
        </div>
      </div>
    </Modal>
  );
}

export function ChannelDetailsDialog({
  open,
  onClose,
  snapshot,
  onChanged,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
  onChanged?: () => void;
  /** After leaving, the page moves to another channel. */
  onLeft?: () => void;
}) {
  const channel = snapshot.channel;
  const [name, setName] = useState(channel?.name ?? '');
  const [topic, setTopic] = useState(channel?.topic ?? '');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'mute' | 'leave' | null>(null);
  const isDm = channel?.kind === 'dm';
  const isAdmin = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin';
  const canRename = Boolean(channel && !isDm && (isAdmin || channel.createdBy === snapshot.me.id));

  useEffect(() => {
    if (!open) return;
    setName(channel?.name ?? '');
    setTopic(channel?.topic ?? '');
    // Reset only when the dialog opens; the snapshot refreshes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel?.id]);

  async function save() {
    if (!channel) return;
    setSaving(true);
    try {
      await updateChannelFn({
        data: { channelId: channel.id, topic, ...(canRename && name.trim() !== channel.name ? { name } : {}) },
      });
      toast.success('Channel updated.');
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the channel.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleMute() {
    if (!channel) return;
    setBusy('mute');
    try {
      await setChannelMutedFn({ data: { channelId: channel.id, muted: !channel.muted } });
      toast.success(channel.muted ? 'Unmuted. You will see new messages again.' : 'Muted. Only mentions will reach you.');
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the setting.');
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!channel) return;
    const warning =
      channel.kind === 'private'
        ? `Leave #${channel.name}? It is private, so someone will need to add you back.`
        : `Leave #${channel.name}? You can join again from Browse channels.`;
    if (!window.confirm(warning)) return;
    setBusy('leave');
    try {
      await leaveChannelFn({ data: { channelId: channel.id } });
      toast.success(`You left #${channel.name}.`);
      onClose();
      onLeft?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not leave the channel.');
    } finally {
      setBusy(null);
    }
  }

  const field = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30 disabled:text-muted';

  return (
    <Modal open={open} onClose={onClose} title={isDm ? 'Conversation details' : 'Channel details'}>
      {channel && (
        <div className="space-y-4">
          {!isDm && (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-canvas p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-sage">
                  {channel.kind === 'private' ? <Lock size={17} /> : <Hash size={18} />}
                </span>
                <div>
                  <p className="text-base font-semibold">#{channel.name}</p>
                  <p className="text-xs text-muted">
                    {channel.kind === 'private' ? 'Private channel' : 'Public channel'} · {channel.memberCount} members
                  </p>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canRename}
                  aria-describedby="channel-name-hint"
                  className={field}
                />
                <span id="channel-name-hint" className="mt-1 block text-[11px] text-faint">
                  {canRename
                    ? 'Lowercase letters, numbers and dashes. Links to this channel keep working.'
                    : 'Only the person who created the channel or a workspace admin can rename it.'}
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Topic</span>
                <input value={topic} onChange={(event) => setTopic(event.target.value)} className={field} />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-line-soft"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || (canRename && !name.trim())}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Save
                </button>
              </div>
            </>
          )}
          <div className={cn('space-y-1', !isDm && 'border-t border-line pt-4')}>
            <button
              type="button"
              onClick={() => void toggleMute()}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-line-soft disabled:opacity-50"
            >
              {channel.muted ? <Bell size={16} className="text-muted" /> : <BellOff size={16} className="text-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{channel.muted ? 'Unmute' : 'Mute'}</span>
                <span className="block text-xs text-muted">
                  {channel.muted
                    ? 'Muted: no unread badge or notifications, except when someone mentions you.'
                    : 'Hide the unread badge and notifications. Mentions still reach you.'}
                </span>
              </span>
              {busy === 'mute' && <Loader2 size={14} className="animate-spin" />}
            </button>
            {!isDm && (
              <button
                type="button"
                onClick={() => void leave()}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-danger hover:bg-danger/5 disabled:opacity-50"
              >
                <LogOut size={16} />
                <span className="flex-1 text-sm font-medium">Leave channel</span>
                {busy === 'leave' && <Loader2 size={14} className="animate-spin" />}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Crops to a centred square and scales to 256px, so uploads stay small and every avatar is round-safe. */
async function squarePhoto(file: File): Promise<Blob> {
  // Animated GIFs would lose their frames on a canvas; send them as they are.
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(256, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  return blob ?? file;
}

function ProfilePhoto({
  me,
  name,
  onChanged,
}: {
  me: UserSummary;
  name: string;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The parent refreshes `me` on its next poll; show the new photo right away meanwhile.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const current = photo === undefined ? me.avatarUrl : photo;

  async function upload(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.error('Use a PNG, JPEG, WebP or GIF image.');
      return;
    }
    setBusy('upload');
    try {
      const body = new FormData();
      const blob = await squarePhoto(file);
      body.append('file', blob, blob === file ? file.name : 'avatar.webp');
      const response = await fetch('/api/avatar', { method: 'POST', body });
      const result = (await response.json().catch(() => ({}))) as { avatarUrl?: string; error?: string };
      if (!response.ok || !result.avatarUrl) throw new Error(result.error ?? 'Could not upload the photo.');
      setPhoto(result.avatarUrl);
      toast.success('Photo updated.');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the photo.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      const response = await fetch('/api/avatar', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not remove the photo.');
      setPhoto(null);
      toast.success('Photo removed.');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the photo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-canvas p-4">
      <Avatar name={name} color={me.avatarColor} src={current} size="xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{name}</p>
        <p className="truncate text-xs text-muted">{me.email}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            aria-label="Choose a profile photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft disabled:opacity-50"
          >
            {busy === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {current ? 'Change photo' : 'Upload photo'}
          </button>
          {current && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink disabled:opacity-50"
            >
              {busy === 'remove' && <Loader2 size={13} className="animate-spin" />}
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Browser notifications for DMs and mentions while Kora is open in a tab. */
function NotificationSetting() {
  const [state, setState] = useState<'unsupported' | 'denied' | 'on' | 'off'>('off');
  useEffect(() => {
    if (typeof Notification === 'undefined') setState('unsupported');
    else if (Notification.permission === 'denied') setState('denied');
    else setState(notificationsEnabled() ? 'on' : 'off');
  }, []);

  async function toggle() {
    if (state === 'on') {
      setNotificationsEnabled(false);
      setState('off');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      setState('on');
      new Notification('Notifications are on', { body: 'Kora will tell you about direct messages and mentions.', icon: '/favicon-32.png' });
    } else {
      setState(permission === 'denied' ? 'denied' : 'off');
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">Desktop notifications</span>
        <span className="block text-xs text-muted">
          {state === 'unsupported'
            ? 'This browser does not support notifications.'
            : state === 'denied'
              ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
              : 'Direct messages and mentions, while Kora is open in a tab.'}
        </span>
      </span>
      {(state === 'on' || state === 'off') && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-pressed={state === 'on'}
          className={cn(
            'h-9 shrink-0 rounded-xl border px-3 text-sm font-medium',
            state === 'on' ? 'border-mint-deep/30 bg-mint/40 text-mint-deep' : 'border-line text-ink-soft hover:bg-line-soft',
          )}
        >
          {state === 'on' ? 'On' : 'Turn on'}
        </button>
      )}
    </div>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await changePasswordFn({ data: { currentPassword: current, newPassword: next } });
      toast.success('Password changed. Other devices were signed out.');
      setOpen(false);
      setCurrent('');
      setNext('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">Password</span>
          <span className="block text-xs text-muted">Change the password you sign in with as {email}.</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-9 shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-soft hover:bg-line-soft"
        >
          Change
        </button>
      </div>
    );
  }
  const field = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30';
  return (
    <form onSubmit={(event) => void save(event)} className="space-y-3 border-t border-line pt-4">
      <p className="text-sm font-medium text-ink">Change password</p>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className={field}
          required
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink-soft">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          minLength={8}
          className={field}
          required
        />
        <span className="mt-1 block text-[11px] text-faint">At least 8 characters. Other devices are signed out.</span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-line-soft"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !current || next.length < 8}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Change password
        </button>
      </div>
    </form>
  );
}
