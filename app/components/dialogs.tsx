import {
  Check,
  Copy,
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createChannelFn,
  joinChannelFn,
  openDmFn,
  searchMessagesFn,
  updateChannelFn,
} from '../lib/chat';
import { updateProfileFn } from '../lib/auth';
import type {
  ChannelSummary,
  SearchHit,
  UserSummary,
  WorkspaceSnapshot,
} from '../lib/types';
import { Avatar } from './avatar';
import { Modal } from './modal';
import { clockTime } from '../lib/format';
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
                  <Avatar name={member.name} color={member.avatarColor} size="sm" online={member.online} />
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
  const link = `${typeof window === 'undefined' ? '' : window.location.origin}/join/${snapshot.workspace.inviteCode}`;

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
          <p className="mt-1 font-mono text-lg tracking-[0.16em]">{snapshot.workspace.inviteCode}</p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-soft">
            Already here · {snapshot.members.length}
          </p>
          <div className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
            {snapshot.members.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar name={member.name} color={member.avatarColor} size="sm" online={member.online} />
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
              <Avatar name={member.name} color={member.avatarColor} size="md" online={member.online} />
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
  onOpenChannel: (channelId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setLoading(false);
    }
  }, [open]);

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
      <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3">
        <Search size={16} className="text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages, people, decisions..."
          className="h-12 flex-1 bg-transparent text-sm outline-none"
        />
        {loading && <Loader2 size={15} className="animate-spin text-faint" />}
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
        {hits.map((hit) => (
          <button
            key={hit.message.id}
            type="button"
            onClick={() => {
              onOpenChannel(hit.channelId);
              onClose();
            }}
            className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas"
          >
            <Avatar
              name={hit.message.author.name}
              color={hit.message.author.avatarColor}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">{hit.message.author.name}</span>
                <span className="text-[11px] text-faint">#{hit.channelName}</span>
                <span className="ml-auto text-[11px] text-faint">{clockTime(hit.message.createdAt)}</span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-muted">{hit.message.body}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ProfileDialog({
  open,
  onClose,
  me,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  me: UserSummary;
  onSaved: () => void;
}) {
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji);
  const [statusText, setStatusText] = useState(me.statusText);
  const [saving, setSaving] = useState(false);

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

  return (
    <Modal open={open} onClose={onClose} title="Your profile" description="How you show up in Kora.">
      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-2xl bg-canvas p-4">
          <Avatar name={name || me.name} color={me.avatarColor} size="xl" />
          <div>
            <p className="text-base font-semibold">{name || me.name}</p>
            <p className="text-xs text-muted">{me.email}</p>
          </div>
        </div>
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
      </div>
    </Modal>
  );
}

export function ChannelDetailsDialog({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: WorkspaceSnapshot;
}) {
  const [topic, setTopic] = useState(snapshot.channel?.topic ?? '');
  const [saving, setSaving] = useState(false);
  const channel = snapshot.channel;

  useEffect(() => {
    setTopic(channel?.topic ?? '');
  }, [channel?.topic]);

  async function save() {
    if (!channel) return;
    setSaving(true);
    try {
      await updateChannelFn({ data: { channelId: channel.id, topic } });
      toast.success('Channel topic updated.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the channel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Channel details">
      {channel && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-canvas p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-sage">
              <Hash size={18} />
            </span>
            <div>
              <p className="text-base font-semibold">#{channel.name}</p>
              <p className="text-xs text-muted">
                {channel.kind === 'private' ? 'Private channel' : 'Public channel'} ·{' '}
                {channel.memberCount} members
              </p>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Topic</span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
            />
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
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save topic
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
