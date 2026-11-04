import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import {
  Columns3,
  Command,
  List,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { getTasksFn, updateIssueFn } from '../lib/tasks';
import type { TaskIssue, TaskStatus, TasksSnapshot } from '../lib/types';
import {
  validateTasksSearch,
  withTaskSearch,
  type TasksSearch,
  type TasksView,
} from '../lib/tasks-search';
import { relativeTime } from '../lib/format';
import { Avatar } from '../components/avatar';
import { TaskCommandMenu } from '../components/task-command-menu';
import {
  TaskLabelPill,
  TaskPriorityIcon,
  TaskStatusIcon,
} from '../components/task-icons';
import { TasksSidebar } from '../components/tasks-sidebar';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/tasks/')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  validateSearch: validateTasksSearch,
  loader: async ({ params }) => getTasksFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'Tasks · Kora' }] }),
  component: TasksPage,
});

type ListItem =
  | { type: 'group'; status: TaskStatus; count: number }
  | { type: 'issue'; issue: TaskIssue };

function TasksPage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<TasksSnapshot>(initial);
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const requestRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const view: TasksView = search.view ?? 'all';
  const projectFilter = search.project;
  const labelFilter = search.label;
  const statusFilter = search.status;
  const me = snapshot.me;
  const selectedProject = projectFilter
    ? snapshot.projects.find((project) => project.id === projectFilter) ?? null
    : null;
  const selectedLabel = labelFilter
    ? snapshot.labels.find((label) => label.id === labelFilter) ?? null
    : null;
  const selectedStatus = statusFilter
    ? snapshot.statuses.find((status) => status.id === statusFilter) ?? null
    : null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.issues.filter((issue) => {
      if (view === 'mine' && issue.assignee?.id !== me.id) return false;
      if (projectFilter && issue.project.id !== projectFilter) return false;
      if (labelFilter && !issue.labels.some((label) => label.id === labelFilter)) return false;
      if (statusFilter && issue.status.id !== statusFilter) return false;
      if (needle) {
        const haystack = `${issue.key} ${issue.title} ${issue.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [snapshot.issues, view, me.id, projectFilter, labelFilter, statusFilter, query]);

  const grouped = useMemo(() => {
    const groups = snapshot.statuses
      .map((status) => ({
        status,
        issues: filtered.filter((issue) => issue.status.id === status.id),
      }))
      .filter((group) => group.issues.length > 0);
    return groups.flatMap((group): ListItem[] => [
      { type: 'group', status: group.status, count: group.issues.length },
      ...group.issues.map((issue): ListItem => ({ type: 'issue', issue })),
    ]);
  }, [filtered, snapshot.statuses]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (grouped[index]?.type === 'group' ? 40 : 48),
    overscan: 10,
  });

  const loadSnapshot = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const next = await getTasksFn({ data: { slug: params.workspaceSlug } });
      if (request === requestRef.current) setSnapshot(next);
    } catch {
      // The next poll recovers a dropped read.
    }
  }, [params.workspaceSlug]);

  useEffect(() => {
    setSnapshot(initial);
  }, [initial]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadSnapshot();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadSnapshot();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (statusFilter && !snapshot.statuses.some((status) => status.id === statusFilter)) {
      navigate({
        to: '/app/$workspaceSlug/tasks',
        params: { workspaceSlug: params.workspaceSlug },
        search: (prev) => withTaskSearch(prev as TasksSearch, { status: undefined }),
        replace: true,
      });
    }
  }, [navigate, params.workspaceSlug, snapshot.statuses, statusFilter]);

  function go(patch: Partial<TasksSearch>, replace = true) {
    navigate({
      to: '/app/$workspaceSlug/tasks',
      params: { workspaceSlug: params.workspaceSlug },
      search: (prev) => withTaskSearch(prev as TasksSearch, patch),
      replace,
    });
  }

  function newIssueSearch() {
    return {
      project: projectFilter,
      status: statusFilter,
    };
  }

  const openIssue = useCallback(
    (issueKey: string) => {
      navigate({
        to: '/app/$workspaceSlug/tasks/$issueKey',
        params: { workspaceSlug: params.workspaceSlug, issueKey },
      });
    },
    [navigate, params.workspaceSlug],
  );

  async function moveIssue(issueId: string, statusId: string) {
    const issue = snapshot.issues.find((item) => item.id === issueId);
    const status = snapshot.statuses.find((item) => item.id === statusId);
    if (!issue || !status || issue.status.id === statusId) return;
    const before = issue.status;
    setSnapshot((current) => ({
      ...current,
      issues: current.issues.map((item) =>
        item.id === issueId ? { ...item, status } : item,
      ),
    }));
    setUpdating(true);
    try {
      await updateIssueFn({ data: { issueId, statusId } });
      void loadSnapshot();
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        issues: current.issues.map((item) =>
          item.id === issueId ? { ...item, status: before } : item,
        ),
      }));
      toast.error(error instanceof Error ? error.message : 'Could not move the issue.');
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (typing) return;
      if (event.key === 'c') {
        event.preventDefault();
        navigate({
          to: '/app/$workspaceSlug/tasks/new',
          params: { workspaceSlug: params.workspaceSlug },
          search: newIssueSearch(),
        });
        return;
      }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const currentIndex = filtered.findIndex((issue) => issue.id === focusedId);
        const nextIndex =
          event.key === 'j'
            ? Math.min(filtered.length - 1, currentIndex < 0 ? 0 : currentIndex + 1)
            : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
        const next = filtered[nextIndex];
        if (next) {
          setFocusedId(next.id);
          const itemIndex = grouped.findIndex(
            (item) => item.type === 'issue' && item.issue.id === next.id,
          );
          if (itemIndex >= 0) virtualizer.scrollToIndex(itemIndex, { align: 'auto' });
        }
        return;
      }
      if (event.key === 'Enter') {
        const next = filtered.find((issue) => issue.id === focusedId);
        if (next) {
          event.preventDefault();
          openIssue(next.key);
        }
        return;
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setSidebarOpen(false);
        setFocusedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    filtered,
    focusedId,
    grouped,
    navigate,
    openIssue,
    params.workspaceSlug,
    projectFilter,
    statusFilter,
    virtualizer,
  ]);

  const title = selectedProject
    ? selectedProject.name
    : selectedStatus
      ? selectedStatus.name
      : view === 'board'
        ? 'Board'
        : view === 'mine'
          ? 'My issues'
          : 'All issues';
  const subtitle = selectedProject
    ? selectedProject.description
    : view === 'mine'
      ? 'Assigned to you'
      : view === 'board'
        ? 'Move work through your workflow'
        : 'The work behind Kora';
  const hasFilters = Boolean(projectFilter || labelFilter || statusFilter || query.trim());

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeView={view}
        activeProject={projectFilter}
        activeLabel={labelFilter}
        activeStatus={statusFilter}
        onCommand={() => setCommandOpen(true)}
        onSignOut={async () => {
          await signOutFn();
          await navigate({ to: '/' });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            data-audit-skip="A3"
            onClick={() => setSidebarOpen(true)}
            className="grid size-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink sm:size-9 md:hidden"
            aria-label="Open tasks navigation"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {selectedProject && (
                <span
                  className="size-2 rounded-full"
                  style={{ background: selectedProject.color }}
                />
              )}
              {selectedStatus && (
                <TaskStatusIcon status={selectedStatus} size={14} />
              )}
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
              <span className="text-[12px] tabular-nums text-faint">{filtered.length}</span>
              {updating && <Loader2 size={13} className="animate-spin text-faint" />}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-muted">{subtitle}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-3 lg:flex">
              <Search size={14} className="text-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter issues"
                className="h-full w-36 bg-transparent text-[12px] outline-none placeholder:text-faint xl:w-44"
                aria-label="Filter issues"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="grid size-5 place-items-center rounded text-faint transition-colors duration-150 hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="hidden items-center gap-1 sm:flex">
              <ViewButton
                active={view !== 'board'}
                onClick={() => go({ view: view === 'mine' ? 'mine' : 'all' })}
                label="List"
              >
                <List size={15} />
              </ViewButton>
              <ViewButton active={view === 'board'} onClick={() => go({ view: 'board' })} label="Board">
                <Columns3 size={15} />
              </ViewButton>
            </div>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="grid size-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink sm:size-9"
              aria-label="Open command menu"
              title="Command menu · ⌘K"
            >
              <Command size={16} />
            </button>

            <Link
              to="/app/$workspaceSlug/tasks/new"
              params={{ workspaceSlug: params.workspaceSlug }}
              search={newIssueSearch()}
              aria-label="New issue"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-coral px-3 text-[12px] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-coral-deep active:scale-[0.97] sm:h-9"
            >
              <Plus size={14} /> <span className="hidden sm:inline">New issue</span>
            </Link>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line/70 bg-paper/55 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => go({ status: undefined })}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors duration-150',
              !statusFilter
                ? 'border-ink/30 bg-canvas text-ink font-semibold sm:border-ink sm:bg-ink sm:text-paper'
                : 'border-line bg-paper text-muted hover:border-ink/20 hover:text-ink',
            )}
          >
            All
            <span className={cn('tabular-nums', !statusFilter ? 'text-faint sm:text-paper/60' : 'text-faint')}>
              {snapshot.counts.all}
            </span>
          </button>
          {snapshot.statuses
            .filter((status) => (snapshot.counts.byStatus[status.id] ?? 0) > 0)
            .map((status) => {
              const active = statusFilter === status.id;
              return (
                <button
                  key={status.id}
                  type="button"
                  onClick={() => go({ status: active ? undefined : status.id })}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors duration-150',
                    active ? 'text-ink' : 'border-line bg-paper text-muted hover:border-ink/20 hover:text-ink',
                  )}
                  style={
                    active
                      ? {
                          borderColor: `color-mix(in oklab, ${status.color} 38%, var(--color-line))`,
                          background: `color-mix(in oklab, ${status.color} 11%, var(--color-paper))`,
                        }
                      : undefined
                  }
                >
                  <TaskStatusIcon status={status} size={13} />
                  {status.name}
                  <span className="tabular-nums text-faint">
                    {snapshot.counts.byStatus[status.id] ?? 0}
                  </span>
                </button>
              );
            })}
          {selectedLabel && (
            <button
              type="button"
              onClick={() => go({ label: undefined })}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[12px] font-medium text-muted transition-colors duration-150 hover:border-ink/20 hover:text-ink"
            >
              <span className="size-2 rounded-full" style={{ background: selectedLabel.color }} />
              {selectedLabel.name}
              <X size={12} />
            </button>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                go({ project: undefined, label: undefined, status: undefined, view: 'all' });
              }}
              className="inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-faint xl:flex">
            <kbd className="task-kbd">C</kbd> new
            <kbd className="ml-2 task-kbd">J</kbd>
            <kbd className="task-kbd">K</kbd> move
            <kbd className="ml-2 task-kbd">⌘K</kbd> commands
          </span>
        </div>

        {view === 'board' ? (
          <BoardView
            issues={filtered}
            statuses={snapshot.statuses}
            workspaceSlug={params.workspaceSlug}
            projectFilter={projectFilter}
            activeStatus={statusFilter}
            onMove={(issueId, statusId) => void moveIssue(issueId, statusId)}
          />
        ) : (
          <IssueList
            items={grouped}
            virtualizer={virtualizer}
            parentRef={parentRef}
            focusedId={focusedId}
            workspaceSlug={params.workspaceSlug}
            projectFilter={projectFilter}
            statusFilter={statusFilter}
            empty={filtered.length === 0}
            hasFilters={hasFilters}
            onClearFilters={() => {
              setQuery('');
              go({ project: undefined, label: undefined, status: undefined, view: 'all' });
            }}
            newIssueSearch={newIssueSearch}
          />
        )}
      </main>

      <TaskCommandMenu
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        snapshot={snapshot}
        onNewIssue={() =>
          navigate({
            to: '/app/$workspaceSlug/tasks/new',
            params: { workspaceSlug: params.workspaceSlug },
            search: newIssueSearch(),
          })
        }
        onView={(next) =>
          go(
            next === 'board'
              ? { view: 'board' }
              : {
                  view: next,
                  project: undefined,
                  label: undefined,
                  status: undefined,
                },
          )
        }
        onProject={(id) =>
          go({ view: 'all', project: id, label: undefined, status: undefined })
        }
        onChat={() =>
          void navigate({
            to: '/app/$workspaceSlug',
            params: { workspaceSlug: params.workspaceSlug },
          })
        }
        onStudio={() =>
          void navigate({
            to: '/app/$workspaceSlug/office',
            params: { workspaceSlug: params.workspaceSlug },
          })
        }
      />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid size-9 place-items-center rounded-lg transition-colors duration-150',
        active
          ? 'bg-canvas text-ink shadow-[inset_0_0_0_1px_var(--color-line)]'
          : 'text-muted hover:bg-canvas hover:text-ink',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function IssueList({
  items,
  virtualizer,
  parentRef,
  focusedId,
  workspaceSlug,
  projectFilter,
  statusFilter,
  empty,
  hasFilters,
  onClearFilters,
  newIssueSearch,
}: {
  items: ListItem[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  parentRef: React.RefObject<HTMLDivElement | null>;
  focusedId: string | null;
  workspaceSlug: string;
  projectFilter?: string;
  statusFilter?: string;
  empty: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
  newIssueSearch: () => { project?: string; status?: string };
}) {
  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <img
          src="/tasks-cover.png"
          alt=""
          className="w-full max-w-[400px] rounded-2xl"
        />
        <h2 className="mt-6 text-xl font-semibold tracking-[-0.025em]">
          Nothing in this view yet
        </h2>
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted">
          {hasFilters
            ? 'The current filters hide every issue. Clear them, or start something new.'
            : 'Start the work with an issue. One keystroke is enough.'}
        </p>
        <div className="mt-5 flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex h-10 items-center rounded-lg border border-line bg-paper px-4 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:border-ink/20"
            >
              Clear filters
            </button>
          )}
          <Link
            to="/app/$workspaceSlug/tasks/new"
            params={{ workspaceSlug }}
            search={newIssueSearch()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft"
          >
            <Plus size={15} /> New issue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;
          if (item.type === 'group') {
            return (
              <div
                key={`group-${item.status.id}`}
                className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-line-soft bg-canvas px-4 sm:px-6"
                style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
              >
                <TaskStatusIcon status={item.status} size={15} />
                <span className="text-[13px] font-semibold">{item.status.name}</span>
                <span className="text-[11px] tabular-nums text-faint">{item.count}</span>
                <Link
                  to="/app/$workspaceSlug/tasks/new"
                  params={{ workspaceSlug }}
                  search={{ project: projectFilter, status: item.status.id }}
                  className="ml-auto grid size-7 place-items-center rounded-md text-faint transition-colors duration-150 hover:bg-line-soft hover:text-ink"
                  aria-label={`New ${item.status.name} issue`}
                >
                  <Plus size={14} />
                </Link>
              </div>
            );
          }

          const issue = item.issue;
          return (
            <Link
              key={issue.id}
              to="/app/$workspaceSlug/tasks/$issueKey"
              params={{ workspaceSlug, issueKey: issue.key }}
              data-issue-id={issue.id}
              className={cn(
                'absolute top-0 left-0 flex w-full items-center gap-2 border-b border-line-soft px-4 text-left transition-colors duration-150 sm:px-6',
                focusedId === issue.id ? 'bg-coral-soft/35' : 'bg-paper hover:bg-canvas',
              )}
              style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
            >
              <TaskStatusIcon status={issue.status} size={16} />
              <TaskPriorityIcon priority={issue.priority} size={13} />
              <span className="w-[58px] shrink-0 font-mono text-[11px] text-faint">
                {issue.key}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{issue.title}</span>
              <span className="hidden items-center gap-1.5 lg:flex">
                {issue.labels.slice(0, 2).map((label) => (
                  <TaskLabelPill key={label.id} label={label} />
                ))}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {issue.commentCount > 0 && (
                  <span className="hidden items-center gap-1 text-[11px] tabular-nums text-faint sm:flex">
                    <MessageSquare size={12} /> {issue.commentCount}
                  </span>
                )}
                <span className="hidden w-12 text-right text-[11px] text-faint sm:block">
                  {relativeTime(issue.updatedAt)}
                </span>
                {issue.assignee ? (
                  <Avatar
                    name={issue.assignee.name}
                    color={issue.assignee.avatarColor}
                    size="xs"
                  />
                ) : (
                  <span className="size-6 rounded-full border border-dashed border-line" />
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BoardView({
  issues,
  statuses,
  workspaceSlug,
  projectFilter,
  activeStatus,
  onMove,
}: {
  issues: TaskIssue[];
  statuses: TaskStatus[];
  workspaceSlug: string;
  projectFilter?: string;
  activeStatus?: string;
  onMove: (id: string, statusId: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  return (
    <div className="scroll-thin flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 sm:p-5">
      {statuses.map((status) => {
        const columnIssues = issues.filter((issue) => issue.status.id === status.id);
        return (
          <section
            key={status.id}
            data-status={status.id}
            className={cn(
              'flex w-[282px] shrink-0 flex-col rounded-xl border bg-paper/60 transition-colors duration-150',
              dragOver === status.id
                ? 'border-ink/25 bg-paper'
                : activeStatus === status.id
                  ? 'border-ink/15'
                  : 'border-line/80',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(status.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragOver((current) => (current === status.id ? null : current));
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const id = event.dataTransfer.getData('text/plain');
              if (id) onMove(id, status.id);
            }}
          >
            <div className="flex h-11 items-center gap-2 border-b border-line-soft px-3">
              <TaskStatusIcon status={status} size={15} />
              <span className="text-[13px] font-semibold">{status.name}</span>
              <span className="text-[11px] tabular-nums text-faint">{columnIssues.length}</span>
              <Link
                to="/app/$workspaceSlug/tasks/new"
                params={{ workspaceSlug }}
                search={{ project: projectFilter, status: status.id }}
                className="ml-auto grid size-7 place-items-center rounded-md text-faint transition-colors duration-150 hover:bg-line-soft hover:text-ink"
                aria-label={`New ${status.name} issue`}
              >
                <Plus size={14} />
              </Link>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
              {columnIssues.map((issue) => (
                <Link
                  key={issue.id}
                  to="/app/$workspaceSlug/tasks/$issueKey"
                  params={{ workspaceSlug, issueKey: issue.key }}
                  data-issue-id={issue.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', issue.id)}
                  className="rounded-xl border border-line/80 bg-paper p-3 text-left shadow-[0_2px_6px_-5px_rgba(23,26,26,0.25)] transition-[border-color,box-shadow] duration-150 hover:border-ink/20 hover:shadow-[0_4px_12px_-8px_rgba(23,26,26,0.3)] active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-faint">{issue.key}</span>
                    <span className="ml-auto">
                      <TaskPriorityIcon priority={issue.priority} size={12} />
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.4] font-medium">
                    {issue.title}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {issue.labels.slice(0, 2).map((label) => (
                      <TaskLabelPill key={label.id} label={label} />
                    ))}
                    <span className="ml-auto">
                      {issue.assignee ? (
                        <Avatar
                          name={issue.assignee.name}
                          color={issue.assignee.avatarColor}
                          size="xs"
                        />
                      ) : (
                        <span className="block size-6 rounded-full border border-dashed border-line" />
                      )}
                    </span>
                  </div>
                </Link>
              ))}
              {columnIssues.length === 0 && (
                <p className="rounded-lg border border-dashed border-line/80 px-2 py-5 text-center text-[11px] text-faint">
                  Drop an issue here
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
