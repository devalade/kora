import { Link } from '@tanstack/react-router';
import {
  BellOff,
  ChevronDown,
  ShieldCheck,
  Hash,
  MessageSquarePlus,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceSnapshot } from '../lib/types';
import { Avatar } from './avatar';
import { AppRail } from './app-rail';
import { cn } from '../utils/cn';
import { MembersDialog } from './members-dialog';
import { WorkspaceSettingsDialog } from './workspace-settings-dialog';
import { useChannelTyping } from '../lib/realtime-client';

export function WorkspaceSidebar({
  snapshot,
  activeChannelId,
  mobileOpen,
  onCloseMobile,
  onSearch,
  onCreateChannel,
  onBrowseChannels,
  onInvite,
  onNewDm,
  onProfile,
  onSignOut,
}: {
  snapshot: WorkspaceSnapshot;
  activeChannelId: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSearch: () => void;
  onCreateChannel: () => void;
  onBrowseChannels: () => void;
  onInvite: () => void;
  onNewDm: () => void;
  onProfile: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const typing = useChannelTyping(snapshot.workspace.slug, snapshot.me.id);
  const typingNames = (channelId: string) => {
    const ids = typing.get(channelId) ?? [];
    return ids.map((id) => snapshot.members.find((member) => member.id === id)?.name.split(' ')[0] ?? 'Someone');
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[330px] shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <AppRail
          workspaceSlug={snapshot.workspace.slug}
          active="chat"
          me={snapshot.me}
          onProfile={onProfile}
          onSignOut={onSignOut}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar-raised">
          <div className="relative border-b border-sidebar-line px-4 py-3.5">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="min-w-0 flex-1 rounded-lg text-left"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-sidebar-bright">
                    {snapshot.workspace.name}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-sidebar-text" />
                </span>
                <span className="mt-0.5 block text-[11px] text-sidebar-text">
                  {snapshot.members.length} members ·{' '}
                  {snapshot.channels.filter((channel) => channel.isMember).length + snapshot.dms.length}{' '}
                  conversations
                </span>
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Close sidebar"
              >
                <X size={16} />
              </button>
            </div>

            {menuOpen && (
              <div className="animate-pop absolute top-[58px] left-3 z-20 w-60 rounded-xl border border-sidebar-line bg-sidebar p-1.5 shadow-2xl">
                <MenuItem
                  icon={<Plus size={15} />}
                  label="Create a channel"
                  onClick={() => {
                    setMenuOpen(false);
                    onCreateChannel();
                  }}
                />
                <MenuItem
                  icon={<Hash size={15} />}
                  label="Browse channels"
                  onClick={() => {
                    setMenuOpen(false);
                    onBrowseChannels();
                  }}
                />
                <MenuItem
                  icon={<Users size={15} />}
                  label="Invite people"
                  onClick={() => {
                    setMenuOpen(false);
                    onInvite();
                  }}
                />
                <MenuItem
                  icon={<ShieldCheck size={15} />}
                  label="Members & roles"
                  onClick={() => {
                    setMenuOpen(false);
                    setMembersOpen(true);
                  }}
                />
                <MenuItem
                  icon={<SlidersHorizontal size={15} />}
                  label="Workspace settings"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                />
                <div className="my-1 h-px bg-sidebar-line" />
                <Link
                  to="/app"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-text transition hover:bg-white/8 hover:text-white"
                >
                  <Settings2 size={15} /> Switch workspace
                </Link>
              </div>
            )}
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={onSearch}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-line bg-sidebar/60 px-2.5 text-left text-[12px] text-sidebar-text transition hover:border-white/20 hover:text-white"
            >
              <Search size={14} />
              <span className="flex-1">Search Kora</span>
              <kbd className="rounded border border-sidebar-line px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PanelAction icon={<MessageSquarePlus size={14} />} label="New message" onClick={onNewDm} />
              <PanelAction icon={<Users size={14} />} label="Channels" onClick={onBrowseChannels} title="Browse channels" />
            </div>
          </div>

          <nav className="scroll-dark mt-4 flex-1 overflow-y-auto px-2 pb-3">
            <Section
              label="Channels"
              action={
                <button
                  type="button"
                  onClick={onCreateChannel}
                  className="grid size-6 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white"
                  aria-label="Create channel"
                  title="Create channel"
                >
                  <Plus size={15} />
                </button>
              }
            >
              {snapshot.channels.filter((channel) => channel.isMember).map((channel) => (
                <Link
                  key={channel.id}
                  to="/app/$workspaceSlug/$channelId"
                  params={{ workspaceSlug: snapshot.workspace.slug, channelId: channel.id }}
                  onClick={onCloseMobile}
                  className={cn(
                    'group relative flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-100',
                    channel.id === activeChannelId
                      ? 'bg-white/12 text-white'
                      : channel.mentions > 0 || (channel.unread > 0 && !channel.muted)
                        ? 'font-semibold text-white hover:bg-white/8'
                        : channel.muted
                          ? 'text-sidebar-text/60 hover:bg-white/8 hover:text-white'
                          : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                  )}
                >
                  {channel.id === activeChannelId && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-coral" />
                  )}
                  <Hash size={14} className="shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {channel.id !== activeChannelId && typingNames(channel.id).length > 0 && (
                    <SidebarTyping names={typingNames(channel.id)} />
                  )}
                  {channel.mentions > 0 && channel.id !== activeChannelId && (
                    <span
                      className="grid h-[16px] min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[9px] font-bold text-ink"
                      title={`${channel.mentions} unread ${channel.mentions === 1 ? 'mention' : 'mentions'}`}
                    >
                      @
                    </span>
                  )}
                  {channel.unread > 0 && !channel.muted && channel.id !== activeChannelId && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white tabular-nums">
                      {channel.unread > 99 ? '99+' : channel.unread}
                    </span>
                  )}
                  {channel.muted && <BellOff size={12} className="shrink-0 opacity-60" aria-label="Muted" />}
                  {channel.kind === 'private' && (
                    <span className="text-[9px] text-sidebar-text opacity-70">private</span>
                  )}
                </Link>
              ))}
            </Section>

            <Section
              label="Direct messages"
              action={
                <button
                  type="button"
                  onClick={onNewDm}
                  className="grid size-6 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white"
                  aria-label="New direct message"
                  title="New direct message"
                >
                  <Plus size={15} />
                </button>
              }
            >
              {snapshot.dms.map((dm) => (
                <Link
                  key={dm.id}
                  to="/app/$workspaceSlug/$channelId"
                  params={{ workspaceSlug: snapshot.workspace.slug, channelId: dm.id }}
                  onClick={onCloseMobile}
                  className={cn(
                    'group relative flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-100',
                    dm.id === activeChannelId
                      ? 'bg-white/12 text-white'
                      : dm.mentions > 0 || (dm.unread > 0 && !dm.muted)
                        ? 'font-semibold text-white hover:bg-white/8'
                        : dm.muted
                          ? 'text-sidebar-text/60 hover:bg-white/8 hover:text-white'
                          : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                  )}
                >
                  {dm.id === activeChannelId && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-coral" />
                  )}
                  <Avatar
                    name={dm.peer?.name ?? 'Direct message'} src={dm.peer?.avatarUrl}
                    color={dm.peer?.avatarColor ?? '#736f66'}
                    size="xs"
                    online={dm.peer?.online}
                    className="[--avatar-ring:#1d2523]"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {dm.peer?.name ?? 'Direct message'}
                    {dm.id !== activeChannelId && typingNames(dm.id).length > 0 && (
                      <span className="ml-1.5 font-normal text-sidebar-text">typing…</span>
                    )}
                  </span>
                  {dm.id !== activeChannelId && typingNames(dm.id).length > 0 && (
                    <SidebarTyping names={typingNames(dm.id)} />
                  )}
                  {dm.mentions > 0 && dm.id !== activeChannelId && (
                    <span
                      className="grid h-[16px] min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[9px] font-bold text-ink"
                      title={`${dm.mentions} unread ${dm.mentions === 1 ? 'mention' : 'mentions'}`}
                    >
                      @
                    </span>
                  )}
                  {dm.unread > 0 && !dm.muted && dm.id !== activeChannelId && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white tabular-nums">
                      {dm.unread}
                    </span>
                  )}
                  {dm.muted && <BellOff size={12} className="shrink-0 opacity-60" aria-label="Muted" />}
                </Link>
              ))}
              {snapshot.dms.length === 0 && (
                <p className="px-2 py-1 text-[11px] leading-4 text-sidebar-text/70">
                  No conversations yet. Start one with the plus.
                </p>
              )}
            </Section>
          </nav>

          <div className="border-t border-sidebar-line p-3">
            <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
              {/* A1: the audit reads the avatar's centred initials as this button's text edge. */}
              <button type="button" onClick={onProfile} aria-label="Open profile" data-audit-skip="A1">
                <Avatar
                  name={snapshot.me.name} src={snapshot.me.avatarUrl}
                  color={snapshot.me.avatarColor}
                  size="sm"
                  online
                  className="[--avatar-ring:#1d2523]"
                />
              </button>
              <button type="button" onClick={onProfile} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-sidebar-bright">
                  {snapshot.me.name}
                </span>
                <span className="flex items-center gap-1 truncate text-[11px] text-sidebar-text">
                  {snapshot.me.statusEmoji && <span>{snapshot.me.statusEmoji}</span>}
                  {snapshot.me.statusText || snapshot.me.title || 'Available'}
                </span>
              </button>
              <button
                type="button"
                onClick={onProfile}
                className="grid size-7 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white"
                aria-label="Profile settings"
              >
                <Settings2 size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>
      <MembersDialog
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        workspaceId={snapshot.workspace.id}
        meId={snapshot.me.id}
      />
      <WorkspaceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        workspace={snapshot.workspace}
      />
    </>
  );
}

/** Three dots on a sidebar row while someone types there; the names are for screen readers. */
function SidebarTyping({ names }: { names: string[] }) {
  const label =
    names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : 'Several people are typing';
  return (
    <span className="flex shrink-0 items-end gap-0.5 pr-0.5" role="status" aria-label={label} title={label}>
      <span className="typing-dot size-1 rounded-full bg-white/80" />
      <span className="typing-dot size-1 rounded-full bg-white/80" />
      <span className="typing-dot size-1 rounded-full bg-white/80" />
    </span>
  );
}

function PanelAction({
  icon,
  label,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-sidebar-line bg-sidebar/50 px-2 text-[12px] font-medium text-sidebar-text transition hover:border-white/20 hover:text-white"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-sidebar-text/75 uppercase">
          {label}
        </span>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-sidebar-text transition hover:bg-white/8 hover:text-white"
    >
      {icon}
      {label}
    </button>
  );
}
