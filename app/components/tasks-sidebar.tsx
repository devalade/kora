import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Columns3,
  Command,
  Inbox,
  Layers,
  ListTodo,
  Map as MapIcon,
  MessageSquare,
  Plus,
  Settings2,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TasksSnapshot } from '../lib/types';
import type { TasksView } from '../lib/tasks-search';
import { cn } from '../utils/cn';
import { Avatar } from './avatar';
import { StatusManagerDialog } from './status-manager-dialog';
import { TaskStatusIcon } from './task-icons';

export function TasksSidebar({
  snapshot,
  mobileOpen,
  onCloseMobile,
  activeView,
  activeProject,
  activeLabel,
  activeStatus,
  onCommand,
  onSignOut,
}: {
  snapshot: TasksSnapshot;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeView?: TasksView | null;
  activeProject?: string;
  activeLabel?: string;
  activeStatus?: string;
  onCommand?: () => void;
  onSignOut: () => void;
}) {
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const hiddenForA11y = !mobileOpen && !desktop;

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close tasks navigation"
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        aria-hidden={hiddenForA11y || undefined}
        inert={hiddenForA11y || undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex w-16 flex-col items-center bg-sidebar py-4">
          <Link to="/app" className="grid size-10 place-items-center" aria-label="Kora home">
            <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="13" fill="#EF5F3E" />
              <path
                d="M12 11.5v17M12 20.2l8.2-8.7M12 20.2l8.6 8.3"
                stroke="#FFF9F3"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M26.5 14.2c2.4 0 4 1.6 4 4.2v7.2c0 2.5-1.6 4.1-4 4.1"
                stroke="#FFF9F3"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              <circle cx="27" cy="20.2" r="1.7" fill="#151B19" />
            </svg>
          </Link>

          <div className="mt-6 flex flex-col items-center gap-1.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/[0.08] text-white">
              <ListTodo size={18} />
            </span>
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              aria-label="Chat"
              title="Chat"
            >
              <MessageSquare size={18} />
            </Link>
            <Link
              to="/app/$workspaceSlug/office"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              aria-label="Studio"
              title="Studio"
            >
              <MapIcon size={18} />
            </Link>
            {onCommand && (
              <button
                type="button"
                onClick={onCommand}
                className="grid size-10 place-items-center rounded-xl text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                aria-label="Command menu"
                title="Command menu"
              >
                <Command size={18} />
              </button>
            )}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2">
            <Avatar
              name={snapshot.me.name}
              color={snapshot.me.avatarColor}
              size="sm"
              online
              className="[--avatar-ring:#151b19]"
            />
            <button
              type="button"
              onClick={onSignOut}
              className="text-[10px] text-sidebar-text transition-colors duration-150 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar-raised">
          <div className="border-b border-sidebar-line px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-sidebar-bright">
                  {snapshot.workspace.name}
                </p>
                <p className="mt-1 text-[11px] text-sidebar-text">
                  Tasks · {snapshot.counts.all} issues
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="grid size-8 place-items-center rounded-lg text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white md:hidden"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <Link
              to="/app/$workspaceSlug/tasks/new"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              search={{ project: activeProject, status: activeStatus }}
              onClick={onCloseMobile}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-coral text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-coral-deep active:scale-[0.97] sm:h-9"
            >
              <Plus size={15} /> New issue
            </Link>
          </div>

          <div className="relative min-h-0 flex-1">
            <nav className="scroll-dark h-full overflow-y-auto px-3 py-3">
            <div className="space-y-0.5">
              <SidebarLink
                to="/app/$workspaceSlug/tasks"
                params={{ workspaceSlug: snapshot.workspace.slug }}
                search={(prev) => ({
                  ...prev,
                  view: 'all',
                  project: undefined,
                  label: undefined,
                  status: undefined,
                })}
                active={activeView === 'all' && !activeProject && !activeLabel && !activeStatus}
                icon={<Layers size={15} />}
                onClick={onCloseMobile}
              >
                All issues
                <span className="ml-auto text-[11px] text-sidebar-text/70">
                  {snapshot.counts.all}
                </span>
              </SidebarLink>
              <SidebarLink
                to="/app/$workspaceSlug/tasks"
                params={{ workspaceSlug: snapshot.workspace.slug }}
                search={(prev) => ({
                  ...prev,
                  view: 'mine',
                  project: undefined,
                  label: undefined,
                  status: undefined,
                })}
                active={activeView === 'mine'}
                icon={<UserRound size={15} />}
                onClick={onCloseMobile}
              >
                My issues
                <span className="ml-auto text-[11px] text-sidebar-text/70">
                  {snapshot.counts.mine}
                </span>
              </SidebarLink>
              <SidebarLink
                to="/app/$workspaceSlug/tasks"
                params={{ workspaceSlug: snapshot.workspace.slug }}
                search={(prev) => ({ ...prev, view: 'board' })}
                active={activeView === 'board'}
                icon={<Columns3 size={15} />}
                onClick={onCloseMobile}
              >
                Board
              </SidebarLink>
            </div>

            <SectionLabel>Projects</SectionLabel>
            <div className="space-y-0.5">
              <SidebarLink
                to="/app/$workspaceSlug/tasks"
                params={{ workspaceSlug: snapshot.workspace.slug }}
                search={(prev) => ({
                  ...prev,
                  view: 'all',
                  project: undefined,
                  label: undefined,
                  status: undefined,
                })}
                active={!activeProject}
                icon={<Inbox size={15} />}
                onClick={onCloseMobile}
              >
                All projects
              </SidebarLink>
              {snapshot.projects.map((project) => (
                <SidebarLink
                  key={project.id}
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={(prev) => ({
                    ...prev,
                    view: 'all',
                    project: project.id,
                    label: undefined,
                    status: undefined,
                  })}
                  active={activeProject === project.id}
                  icon={
                    <span
                      className="size-2 rounded-full"
                      style={{ background: project.color }}
                    />
                  }
                  onClick={onCloseMobile}
                >
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-[11px] text-sidebar-text/70">{project.issueCount}</span>
                </SidebarLink>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between px-2">
              <p className="text-[12px] font-medium text-sidebar-text/80">Workflow</p>
              <button
                type="button"
                onClick={() => setStatusManagerOpen(true)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              >
                <Settings2 size={12} /> Manage
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {snapshot.statuses.map((status) => (
                <SidebarLink
                  key={status.id}
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={(prev) => ({
                    ...prev,
                    view: 'all',
                    status: status.id,
                    project: undefined,
                    label: undefined,
                  })}
                  active={activeStatus === status.id}
                  icon={<TaskStatusIcon status={status} size={15} />}
                  onClick={onCloseMobile}
                >
                  <span className="min-w-0 flex-1 truncate">{status.name}</span>
                  <span className="text-[11px] text-sidebar-text/70">
                    {snapshot.counts.byStatus[status.id] ?? 0}
                  </span>
                </SidebarLink>
              ))}
            </div>

            <SectionLabel>Labels</SectionLabel>
            <div className="space-y-0.5">
              <SidebarLink
                to="/app/$workspaceSlug/tasks"
                params={{ workspaceSlug: snapshot.workspace.slug }}
                search={(prev) => ({
                  ...prev,
                  view: 'all',
                  label: undefined,
                  project: undefined,
                  status: undefined,
                })}
                active={!activeLabel}
                icon={<Tag size={15} />}
                onClick={onCloseMobile}
              >
                All labels
              </SidebarLink>
              {snapshot.labels.map((label) => (
                <SidebarLink
                  key={label.id}
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={(prev) => ({
                    ...prev,
                    view: 'all',
                    label: label.id,
                    project: undefined,
                    status: undefined,
                  })}
                  active={activeLabel === label.id}
                  icon={
                    <span className="size-2 rounded-full" style={{ background: label.color }} />
                  }
                  onClick={onCloseMobile}
                >
                  {label.name}
                </SidebarLink>
              ))}
            </div>
            </nav>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar-raised via-sidebar-raised/80 to-transparent" />
          </div>

          <div className="border-t border-sidebar-line p-3">
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft size={15} /> Back to chat
            </Link>
          </div>
        </div>
      </aside>

      <StatusManagerDialog
        open={statusManagerOpen}
        onClose={() => setStatusManagerOpen(false)}
        snapshot={snapshot}
      />
    </>
  );
}

function SidebarLink({
  to,
  params,
  search,
  active,
  icon,
  onClick,
  children,
}: {
  to: '/app/$workspaceSlug/tasks';
  params: { workspaceSlug: string };
  search: (prev: {
    view?: TasksView;
    project?: string;
    label?: string;
    status?: string;
  }) => {
    view?: TasksView;
    project?: string;
    label?: string;
    status?: string;
  };
  active: boolean;
  icon: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-150 ease-out',
        active
          ? 'bg-white/[0.07] text-white'
          : 'text-sidebar-text hover:bg-white/[0.05] hover:text-white',
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 mb-1 px-2 text-[12px] font-medium text-sidebar-text/80">{children}</p>
  );
}
