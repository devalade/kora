import { Link } from '@tanstack/react-router';
import {
  Box,
  CalendarRange,
  ChevronRight,
  Columns3,
  Command,
  Layers,
  Plus,
  Settings2,
  Tag,
  Trash2,
  GitBranch,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TasksSnapshot } from '../lib/types';
import type { TasksSearch, TasksView } from '../lib/tasks-search';
import { cn } from '../utils/cn';
import { openNewIssue } from '../lib/new-issue-store';
import { AppRail } from './app-rail';
import { LabelManagerDialog } from './label-manager-dialog';
import { GithubDialog } from './github-dialog';
import { GITHUB_ENABLED } from '../lib/features';
import { TeamDialog } from './team-dialog';
import { StatusManagerDialog } from './status-manager-dialog';
import { ProjectIcon } from './issue-fields';
import { NewProjectDialog } from './projects';

export function TasksSidebar({
  snapshot,
  mobileOpen,
  onCloseMobile,
  activeView,
  activeTeam,
  activeProject,
  activeSection,
  activeLabel,
  activeStatus,
  onCommand,
  onSignOut,
}: {
  snapshot: TasksSnapshot;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeView?: TasksView | null;
  activeTeam?: string;
  activeProject?: string;
  /** Pages that are not a filtered issue list, like the Projects page. */
  activeSection?: 'projects' | 'trash';
  activeLabel?: string;
  activeStatus?: string;
  onCommand?: () => void;
  onSignOut: () => void;
}) {
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(Boolean(activeLabel));
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const hiddenForA11y = !mobileOpen && !desktop;
  // Workflow and teams change things for everyone, so only admins see those controls.
  const isAdmin = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin';

  // GitHub's install flow returns to /tasks?github=<result>: say how it went, then tidy the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('github');
    if (!result || !GITHUB_ENABLED) return;
    url.searchParams.delete('github');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    const messages: Record<string, string> = {
      'not-admin': 'Only workspace admins can connect GitHub.',
      'not-yours': 'GitHub did not confirm that you can see that installation, so it was not connected.',
      'in-use': 'That GitHub installation is already connected to another workspace.',
      expired: 'The GitHub connection took too long. Try again.',
      cancelled: 'GitHub was not connected.',
    };
    if (result === 'connected') {
      toast.success('GitHub connected', { description: 'Pull requests that mention an issue key now link here.' });
      setGithubOpen(true);
    } else {
      toast.error(messages[result] ?? 'GitHub was not connected.');
    }
  }, []);

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
        <AppRail
          workspaceSlug={snapshot.workspace.slug}
          active="tasks"
          me={snapshot.me}
          onSignOut={onSignOut}
        />

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
              <div className="flex items-center gap-1">
                {onCommand && (
                  <button
                    type="button"
                    onClick={onCommand}
                    className="grid size-8 place-items-center rounded-lg text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                    aria-label="Command menu"
                    title="Command menu (⌘K)"
                  >
                    <Command size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="grid size-8 place-items-center rounded-lg text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white md:hidden"
                  aria-label="Close navigation"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                openNewIssue({ teamId: activeTeam, statusId: activeStatus });
              }}
              title="New issue (C)"
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-coral text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-coral-deep active:scale-[0.97] sm:h-9"
            >
              <Plus size={15} /> New issue
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <nav data-audit-skip="C1" className="scroll-dark h-full overflow-y-auto px-3 py-3">
              <div className="space-y-0.5">
                <SidebarLink
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={() => ({ view: 'all' })}
                  active={
                    activeView === 'all' && !activeTeam && !activeProject && !activeLabel && !activeStatus
                  }
                  icon={<Layers size={15} />}
                  onClick={onCloseMobile}
                >
                  All issues
                  <span className="ml-auto text-[11px] text-sidebar-text/70">{snapshot.counts.all}</span>
                </SidebarLink>
                <SidebarLink
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={() => ({ view: 'mine' })}
                  active={activeView === 'mine'}
                  icon={<UserRound size={15} />}
                  onClick={onCloseMobile}
                >
                  My issues
                  <span className="ml-auto text-[11px] text-sidebar-text/70">{snapshot.counts.mine}</span>
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
                <SidebarLink
                  to="/app/$workspaceSlug/tasks"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  search={(prev) => ({ ...prev, view: 'timeline' })}
                  active={activeView === 'timeline'}
                  icon={<CalendarRange size={15} />}
                  onClick={onCloseMobile}
                >
                  Timeline
                </SidebarLink>
              </div>

              <SectionHeader
                title="Teams"
                hint="Teams own the issue key, like KOR-12"
                actionLabel="New team"
                onAction={isAdmin ? () => setTeamDialogOpen(true) : undefined}
              />
              <div className="space-y-0.5">
                {snapshot.teams.map((team) => (
                  <SidebarLink
                    key={team.id}
                    to="/app/$workspaceSlug/tasks"
                    params={{ workspaceSlug: snapshot.workspace.slug }}
                    search={() => ({ view: 'all', team: team.id })}
                    active={activeTeam === team.id}
                    icon={<span className="size-2 rounded-full" style={{ background: team.color }} />}
                    onClick={onCloseMobile}
                  >
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    <span className="text-[11px] text-sidebar-text/70">{team.key}</span>
                  </SidebarLink>
                ))}
              </div>

              <SectionHeader
                title="Projects"
                hint="Projects group issues from any team"
                actionLabel="New project"
                onAction={() => setProjectDialogOpen(true)}
              />
              <div className="space-y-0.5">
                <Link
                  to="/app/$workspaceSlug/tasks/projects"
                  params={{ workspaceSlug: snapshot.workspace.slug }}
                  onClick={onCloseMobile}
                  className={cn(
                    'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-150 ease-out',
                    activeSection === 'projects'
                      ? 'bg-white/[0.07] text-white'
                      : 'text-sidebar-text hover:bg-white/[0.05] hover:text-white',
                  )}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    <Box size={15} />
                  </span>
                  All projects
                  <span className="ml-auto text-[11px] text-sidebar-text/70">{snapshot.projects.length}</span>
                </Link>
                {snapshot.projects
                  .filter((project) => project.status === 'started' || project.status === 'planned')
                  .slice(0, 6)
                  .map((project) => (
                    <SidebarLink
                      key={project.id}
                      to="/app/$workspaceSlug/tasks"
                      params={{ workspaceSlug: snapshot.workspace.slug }}
                      search={() => ({ view: 'all', project: project.id })}
                      active={activeProject === project.id}
                      icon={<ProjectIcon color={project.color} size={11} />}
                      onClick={onCloseMobile}
                    >
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <span className="text-[11px] tabular-nums text-sidebar-text/70">
                        {project.issueCount === 0
                          ? '0%'
                          : `${Math.round((project.doneCount / project.issueCount) * 100)}%`}
                      </span>
                    </SidebarLink>
                  ))}
              </div>

              <button
                type="button"
                onClick={() => setLabelsOpen((current) => !current)}
                aria-expanded={labelsOpen}
                className="mt-6 mb-1 flex h-7 w-full items-center gap-1 rounded-md px-2 text-[12px] font-medium text-sidebar-text/80 transition-colors duration-150 hover:text-white"
              >
                Labels
                <ChevronRight
                  size={12}
                  className={cn('transition-transform duration-150', labelsOpen && 'rotate-90')}
                />
              </button>
              {labelsOpen && (
                <div className="space-y-0.5">
                  {snapshot.labels.map((label) => (
                    <SidebarLink
                      key={label.id}
                      to="/app/$workspaceSlug/tasks"
                      params={{ workspaceSlug: snapshot.workspace.slug }}
                      search={() => ({ view: 'all', label: label.id })}
                      active={activeLabel === label.id}
                      icon={<span className="size-2 rounded-full" style={{ background: label.color }} />}
                      onClick={onCloseMobile}
                    >
                      {label.name}
                    </SidebarLink>
                  ))}
                </div>
              )}
            </nav>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar-raised via-sidebar-raised/80 to-transparent" />
          </div>

          <div className="flex items-center gap-1 border-t border-sidebar-line p-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setStatusManagerOpen(true)}
                aria-label="Manage statuses"
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              >
                <Settings2 size={13} /> Workflow
              </button>
            )}
            <button
              type="button"
              onClick={() => setLabelManagerOpen(true)}
              aria-label="Manage labels"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            >
              <Tag size={13} /> Labels
            </button>
            {GITHUB_ENABLED && (
              <button
                type="button"
                onClick={() => setGithubOpen(true)}
                aria-label="GitHub settings"
                title="GitHub"
                className="grid size-8 shrink-0 place-items-center rounded-md text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              >
                <GitBranch size={14} />
              </button>
            )}
            <Link
              to="/app/$workspaceSlug/tasks/trash"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              onClick={onCloseMobile}
              className={cn(
                'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors duration-150',
                activeSection === 'trash'
                  ? 'bg-white/[0.07] text-white'
                  : 'text-sidebar-text hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <Trash2 size={13} /> Trash
            </Link>
          </div>
        </div>
      </aside>

      <StatusManagerDialog
        open={statusManagerOpen}
        onClose={() => setStatusManagerOpen(false)}
        snapshot={snapshot}
      />
      {GITHUB_ENABLED && <GithubDialog open={githubOpen} onClose={() => setGithubOpen(false)} snapshot={snapshot} />}
      <LabelManagerDialog
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
        snapshot={snapshot}
      />
      <TeamDialog
        open={teamDialogOpen}
        onClose={() => setTeamDialogOpen(false)}
        workspaceSlug={snapshot.workspace.slug}
      />
      <NewProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        snapshot={snapshot}
      />
    </>
  );
}

function SectionHeader({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-6 mb-1 flex h-6 items-center justify-between px-2" title={hint}>
      <p className="text-[12px] font-medium text-sidebar-text/80">{title}</p>
      {onAction && (
      <button
        type="button"
        onClick={onAction}
        aria-label={actionLabel}
        title={actionLabel}
        className="grid size-6 place-items-center rounded-md text-sidebar-text transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
      >
        <Plus size={13} />
      </button>
      )}
    </div>
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
  search: (prev: TasksSearch) => TasksSearch;
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
