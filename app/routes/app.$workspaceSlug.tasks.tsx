import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  Columns3,
  Command,
  Inbox,
  Layers,
  List,
  ListTodo,
  Loader2,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { getIssueFn, getTasksFn, updateIssueFn, deleteIssueFn, addTaskCommentFn } from '../lib/tasks';
import type {
  TaskIssue,
  TaskIssueDetail,
  TaskPriority,
  TaskStatus,
  TasksSnapshot,
} from '../lib/types';
import { relativeTime } from '../lib/format';
import { Avatar } from '../components/avatar';
import { NewIssueDialog, TaskCommandMenu } from '../components/task-dialogs';
import { TaskDetailPanel } from '../components/task-detail';
import {
  STATUS_META,
  STATUS_ORDER,
  TaskLabelPill,
  TaskPriorityIcon,
  TaskStatusIcon,
} from '../components/task-icons';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/tasks')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => getTasksFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'Tasks · Kora' }] }),
  component: TasksPage,
});

type TaskView = 'all' | 'mine' | 'board';
type ListItem =
  | { type: 'group'; status: TaskStatus; count: number }
  | { type: 'issue'; issue: TaskIssue };

function TasksPage() {
  const initial = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<TasksSnapshot>(initial);
  const [view, setView] = useState<TaskView>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all');
  const [labelFilter, setLabelFilter] = useState<string | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');
  const [commandOpen, setCommandOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const me = snapshot.me;
  const selectedProject =
    projectFilter === 'all' ? null : snapshot.projects.find((project) => project.id === projectFilter) ?? null;
  const selectedLabel =
    labelFilter === 'all' ? null : snapshot.labels.find((label) => label.id === labelFilter) ?? null;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.issues.filter((issue) => {
      if (view === 'mine' && issue.assignee?.id !== me.id) return false;
      if (projectFilter !== 'all' && issue.project.id !== projectFilter) return false;
      if (labelFilter !== 'all' && !issue.labels.some((label) => label.id === labelFilter)) return false;
      if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
      if (needle) {
        const haystack = `${issue.key} ${issue.title} ${issue.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [snapshot.issues, view, me.id, projectFilter, labelFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const groups = STATUS_ORDER.map((status) => ({
      status,
      issues: filtered.filter((issue) => issue.status === status),
    })).filter((group) => group.issues.length > 0);
    return groups.flatMap((group): ListItem[] => [
      { type: 'group', status: group.status, count: group.issues.length },
      ...group.issues.map((issue): ListItem => ({ type: 'issue', issue })),
    ]);
  }, [filtered]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (grouped[index]?.type === 'group' ? 38 : 46),
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

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const request = ++detailRequestRef.current;
    try {
      const next = await getIssueFn({ data: { issueId: selectedId } });
      if (request === detailRequestRef.current) {
        setDetail(next);
        setDetailLoading(false);
      }
    } catch {
      if (request === detailRequestRef.current) setDetailLoading(false);
    }
  }, [selectedId]);

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
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    void loadDetail();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadDetail();
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (selectedId && !snapshot.issues.some((issue) => issue.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
      setMobileDetail(false);
    }
  }, [snapshot.issues, selectedId]);

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
        openNew('todo');
        return;
      }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const currentIndex = filtered.findIndex((issue) => issue.id === selectedId);
        const nextIndex =
          event.key === 'j'
            ? Math.min(filtered.length - 1, currentIndex < 0 ? 0 : currentIndex + 1)
            : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
        const next = filtered[nextIndex];
        if (next) {
          setSelectedId(next.id);
          const itemIndex = grouped.findIndex(
            (item) => item.type === 'issue' && item.issue.id === next.id,
          );
          if (itemIndex >= 0) virtualizer.scrollToIndex(itemIndex, { align: 'auto' });
        }
        return;
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setNewOpen(false);
        setSidebarOpen(false);
        if (mobileDetail) {
          setMobileDetail(false);
        } else if (selectedId) {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, grouped, mobileDetail, selectedId, virtualizer]);

  function openNew(status: TaskStatus = 'todo') {
    setNewStatus(status);
    setNewOpen(true);
  }

  function openIssue(issueId: string) {
    setSelectedId(issueId);
    setDetailLoading(true);
    if (window.innerWidth < 1280) setMobileDetail(true);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setMobileDetail(false);
  }

  function applyPatch(issue: TaskIssue, patch: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    labelIds?: string[];
  }): TaskIssue {
    return {
      ...issue,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.assigneeId !== undefined
        ? { assignee: patch.assigneeId ? snapshot.members.find((member) => member.id === patch.assigneeId) ?? null : null }
        : {}),
      ...(patch.labelIds !== undefined
        ? { labels: snapshot.labels.filter((label) => patch.labelIds?.includes(label.id)) }
        : {}),
    };
  }

  function patchLocal(issueId: string, patch: Parameters<typeof applyPatch>[1]) {
    setSnapshot((current) => ({
      ...current,
      issues: current.issues.map((issue) => (issue.id === issueId ? applyPatch(issue, patch) : issue)),
    }));
    setDetail((current) =>
      current && current.issue.id === issueId
        ? { ...current, issue: applyPatch(current.issue, patch) }
        : current,
    );
  }

  async function updateIssue(issueId: string, patch: Parameters<typeof applyPatch>[1]) {
    const previous = snapshot.issues.find((issue) => issue.id === issueId);
    patchLocal(issueId, patch);
    setUpdating(true);
    try {
      await updateIssueFn({ data: { issueId, ...patch } });
      void loadDetail();
      void loadSnapshot();
    } catch (error) {
      if (previous) patchLocal(issueId, previous);
      toast.error(error instanceof Error ? error.message : 'Could not update the issue.');
      void loadSnapshot();
    } finally {
      setUpdating(false);
    }
  }

  async function deleteIssue(issueId: string) {
    try {
      await deleteIssueFn({ data: { issueId } });
      closeDetail();
      await loadSnapshot();
      toast.success('Issue deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the issue.');
    }
  }

  async function addComment(body: string) {
    if (!selectedId) return;
    try {
      const { comment } = await addTaskCommentFn({ data: { issueId: selectedId, body } });
      setDetail((current) => (current ? { ...current, comments: [...current.comments, comment] } : current));
      setSnapshot((current) => ({
        ...current,
        issues: current.issues.map((issue) =>
          issue.id === selectedId ? { ...issue, commentCount: issue.commentCount + 1 } : issue,
        ),
      }));
      void loadSnapshot();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post the comment.');
    }
  }

  const title = selectedProject
    ? selectedProject.name
    : view === 'board'
      ? 'Board'
      : view === 'mine'
        ? 'My issues'
        : 'All issues';

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksShell
        snapshot={snapshot}
        view={view}
        projectFilter={projectFilter}
        labelFilter={labelFilter}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onView={(next) => {
          setView(next);
          setSidebarOpen(false);
        }}
        onProject={(id) => {
          setProjectFilter(id);
          setView('all');
          setSidebarOpen(false);
        }}
        onLabel={(id) => {
          setLabelFilter(id);
          setSidebarOpen(false);
        }}
        onNewIssue={() => openNew('todo')}
        onCommand={() => setCommandOpen(true)}
        onSignOut={async () => {
          await signOutFn();
          await navigate({ to: '/' });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] shrink-0 items-center gap-2 border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="grid size-9 place-items-center rounded-[11px] text-muted transition hover:bg-line-soft active:scale-[0.96] md:hidden"
            aria-label="Open tasks navigation"
          >
            <Menu size={19} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {selectedProject && (
                <span className="size-2 rounded-full" style={{ background: selectedProject.color }} />
              )}
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
              <span className="text-[11px] text-faint">{filtered.length}</span>
              {updating && <Loader2 size={12} className="animate-spin text-faint" />}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted">
              {view === 'mine' ? 'Assigned to you' : selectedProject?.description || 'The work behind Kora'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="hidden h-9 items-center gap-2 rounded-[10px] border border-line bg-canvas px-2.5 sm:flex">
              <Search size={14} className="text-faint" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter issues"
                className="w-32 bg-transparent text-[11px] outline-none placeholder:text-faint lg:w-40"
                aria-label="Filter issues"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-faint hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="hidden items-center gap-0.5 rounded-[10px] border border-line bg-canvas p-0.5 sm:flex">
              <ViewButton
                active={view !== 'board'}
                onClick={() => setView(view === 'mine' ? 'mine' : 'all')}
                label="List"
              >
                <List size={14} />
              </ViewButton>
              <ViewButton active={view === 'board'} onClick={() => setView('board')} label="Board">
                <Columns3 size={14} />
              </ViewButton>
            </div>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="grid size-9 place-items-center rounded-[10px] text-muted transition hover:bg-line-soft hover:text-ink active:scale-[0.96]"
              aria-label="Open command menu"
              title="Command menu · ⌘K"
            >
              <Command size={16} />
            </button>
            <button
              type="button"
              aria-label="New issue"
              onClick={() => openNew('todo')}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-coral px-3 text-[11px] font-semibold text-white transition hover:bg-coral-deep active:scale-[0.96]"
            >
              <Plus size={14} /> <span className="hidden sm:inline">New issue</span>
            </button>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line/70 bg-paper/50 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-colors duration-100',
              statusFilter === 'all'
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-muted hover:border-ink/20 hover:text-ink',
            )}
          >
            All <span className={statusFilter === 'all' ? 'text-paper/60' : 'text-faint'}>{snapshot.counts.all}</span>
          </button>
          {STATUS_ORDER.filter((status) => snapshot.counts.byStatus[status] > 0).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-colors duration-100',
                statusFilter === status
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-muted hover:border-ink/20 hover:text-ink',
              )}
            >
              <TaskStatusIcon status={status} size={11} />
              {STATUS_META[status].label}
              <span className={statusFilter === status ? 'text-paper/60' : 'text-faint'}>
                {snapshot.counts.byStatus[status]}
              </span>
            </button>
          ))}
          {selectedLabel && (
            <button
              type="button"
              onClick={() => setLabelFilter('all')}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-[10px] font-medium text-muted hover:text-ink"
            >
              <span className="size-1.5 rounded-full" style={{ background: selectedLabel.color }} />
              {selectedLabel.name} <X size={11} />
            </button>
          )}
          <span className="ml-auto hidden text-[10px] text-faint lg:block">
            <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px]">C</kbd> new ·{' '}
            <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px]">J</kbd>/
            <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px]">K</kbd> move ·{' '}
            <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[9px]">⌘K</kbd> commands
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            {view === 'board' ? (
              <BoardView
                issues={filtered}
                members={snapshot.members}
                selectedId={selectedId}
                onSelect={openIssue}
                onMove={(issueId, status) => void updateIssue(issueId, { status })}
              />
            ) : (
              <IssueList
                items={grouped}
                virtualizer={virtualizer}
                parentRef={parentRef}
                selectedId={selectedId}
                onSelect={openIssue}
                onNewInStatus={openNew}
                empty={filtered.length === 0}
                onNewIssue={() => openNew('todo')}
              />
            )}
          </section>

          <div className="hidden xl:flex">
            <TaskDetailPanel
              detail={detail}
              loading={detailLoading}
              me={me}
              members={snapshot.members}
              labels={snapshot.labels}
              onClose={closeDetail}
              onUpdate={(patch) => (selectedId ? updateIssue(selectedId, patch) : Promise.resolve())}
              onDelete={() => (selectedId ? deleteIssue(selectedId) : Promise.resolve())}
              onComment={addComment}
            />
          </div>
        </div>
      </main>

      {mobileDetail && selectedId && (
        <div className="fixed inset-0 z-50 bg-canvas xl:hidden">
          <TaskDetailPanel
            detail={detail}
            loading={detailLoading}
            me={me}
            members={snapshot.members}
            labels={snapshot.labels}
            onClose={closeDetail}
            onUpdate={(patch) => (selectedId ? updateIssue(selectedId, patch) : Promise.resolve())}
            onDelete={() => (selectedId ? deleteIssue(selectedId) : Promise.resolve())}
            onComment={addComment}
          />
        </div>
      )}

      <NewIssueDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        snapshot={snapshot}
        initialStatus={newStatus}
        onCreated={async (issueId) => {
          await loadSnapshot();
          openIssue(issueId);
        }}
      />

      <TaskCommandMenu
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        snapshot={snapshot}
        onNewIssue={() => openNew('todo')}
        onView={(next) => setView(next)}
        onProject={(id) => {
          setProjectFilter(id);
          setView('all');
        }}
        onChat={() => void navigate({ to: '/app/$workspaceSlug', params: { workspaceSlug: params.workspaceSlug } })}
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
        'grid size-7 place-items-center rounded-[7px] transition-colors duration-100',
        active ? 'bg-paper text-ink shadow-[0_1px_2px_rgba(23,26,26,.08)]' : 'text-muted hover:text-ink',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function TasksShell({
  snapshot,
  view,
  projectFilter,
  labelFilter,
  mobileOpen,
  onCloseMobile,
  onView,
  onProject,
  onLabel,
  onNewIssue,
  onCommand,
  onSignOut,
}: {
  snapshot: TasksSnapshot;
  view: TaskView;
  projectFilter: string | 'all';
  labelFilter: string | 'all';
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onView: (view: TaskView) => void;
  onProject: (id: string | 'all') => void;
  onLabel: (id: string | 'all') => void;
  onNewIssue: () => void;
  onCommand: () => void;
  onSignOut: () => void;
}) {
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
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex w-[64px] flex-col items-center bg-sidebar py-4">
          <Link to="/app" className="grid size-10 place-items-center" aria-label="Kora home">
            <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="13" fill="#EF5F3E" />
              <path d="M12 11.5v17M12 20.2l8.2-8.7M12 20.2l8.6 8.3" stroke="#FFF9F3" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M26.5 14.2c2.4 0 4 1.6 4 4.2v7.2c0 2.5-1.6 4.1-4 4.1" stroke="#FFF9F3" strokeWidth="3.4" strokeLinecap="round" />
              <circle cx="27" cy="20.2" r="1.7" fill="#151B19" />
            </svg>
          </Link>
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/12 text-white">
              <ListTodo size={18} />
            </span>
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Chat"
              title="Chat"
            >
              <MessageSquare size={18} />
            </Link>
            <Link
              to="/app/$workspaceSlug/office"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Studio"
              title="Studio"
            >
              <MapIcon size={18} />
            </Link>
            <button
              type="button"
              onClick={onCommand}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Command menu"
              title="Command menu"
            >
              <Command size={18} />
            </button>
          </div>
          <div className="mt-auto flex flex-col items-center gap-2">
            <Avatar name={snapshot.me.name} color={snapshot.me.avatarColor} size="sm" online className="[--avatar-ring:#151b19]" />
            <button type="button" onClick={onSignOut} className="text-[9px] text-sidebar-text hover:text-white">
              Sign out
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar-raised">
          <div className="border-b border-sidebar-line px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-sidebar-bright">{snapshot.workspace.name}</p>
                <p className="mt-0.5 text-[10px] text-sidebar-text">Tasks · {snapshot.counts.all} issues</p>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="grid size-7 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={onNewIssue}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-coral text-[12px] font-semibold text-white transition hover:bg-coral-deep active:scale-[0.98]"
            >
              <Plus size={14} /> New issue
            </button>
          </div>

          <nav className="scroll-dark flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-0.5">
              <NavButton active={view === 'all'} onClick={() => onView('all')} icon={<Layers size={14} />}>
                All issues <span className="ml-auto text-[10px] text-sidebar-text/70">{snapshot.counts.all}</span>
              </NavButton>
              <NavButton active={view === 'mine'} onClick={() => onView('mine')} icon={<UserRound size={14} />}>
                My issues <span className="ml-auto text-[10px] text-sidebar-text/70">{snapshot.counts.mine}</span>
              </NavButton>
              <NavButton active={view === 'board'} onClick={() => onView('board')} icon={<Columns3 size={14} />}>
                Board
              </NavButton>
            </div>

            <p className="mt-6 px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-text/75 uppercase">
              Projects
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onProject('all')}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
                  projectFilter === 'all' ? 'bg-white/12 text-white' : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                )}
              >
                <Inbox size={13} /> All projects
              </button>
              {snapshot.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onProject(project.id)}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
                    projectFilter === project.id ? 'bg-white/12 text-white' : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: project.color }} />
                  <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                  <span className="text-[10px] text-sidebar-text/70">{project.issueCount}</span>
                </button>
              ))}
            </div>

            <p className="mt-6 px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-text/75 uppercase">
              Labels
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onLabel('all')}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
                  labelFilter === 'all' ? 'bg-white/12 text-white' : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                )}
              >
                <Tag size={13} /> All labels
              </button>
              {snapshot.labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => onLabel(label.id)}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
                    labelFilter === label.id ? 'bg-white/12 text-white' : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: label.color }} />
                  {label.name}
                </button>
              ))}
            </div>
          </nav>

          <div className="border-t border-sidebar-line p-3">
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: snapshot.workspace.slug }}
              className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium text-sidebar-text transition hover:bg-white/8 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to chat
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
        active ? 'bg-white/12 text-white' : 'text-sidebar-text hover:bg-white/8 hover:text-white',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function IssueList({
  items,
  virtualizer,
  parentRef,
  selectedId,
  onSelect,
  onNewInStatus,
  empty,
  onNewIssue,
}: {
  items: ListItem[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  parentRef: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewInStatus: (status: TaskStatus) => void;
  empty: boolean;
  onNewIssue: () => void;
}) {
  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <img
          src="/tasks-cover.png"
          alt=""
          className="w-full max-w-[380px] rounded-[24px] outline outline-1 -outline-offset-1 outline-black/10"
        />
        <h2 className="mt-6 text-lg font-semibold tracking-[-0.02em]">Nothing in this view yet</h2>
        <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted">
          Clear a filter or create the first issue. The work should feel one keystroke away.
        </p>
        <button
          type="button"
          onClick={onNewIssue}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[12px] font-semibold text-paper transition hover:bg-ink-soft"
        >
          <Plus size={14} /> New issue
        </button>
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
                key={`group-${item.status}`}
                className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-line-soft bg-canvas px-4"
                style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
              >
                <TaskStatusIcon status={item.status} size={14} />
                <span className="text-[11px] font-semibold">{STATUS_META[item.status].label}</span>
                <span className="text-[10px] text-faint">{item.count}</span>
                <button
                  type="button"
                  onClick={() => onNewInStatus(item.status)}
                  className="ml-auto grid size-6 place-items-center rounded-md text-faint transition hover:bg-line-soft hover:text-ink"
                  aria-label={`New ${STATUS_META[item.status].label} issue`}
                >
                  <Plus size={13} />
                </button>
              </div>
            );
          }
          const issue = item.issue;
          return (
            <button
              key={issue.id}
              type="button"
              data-issue-id={issue.id}
              onClick={() => onSelect(issue.id)}
              className={cn(
                'absolute top-0 left-0 flex w-full items-center gap-2 border-b border-line-soft px-4 text-left transition-colors duration-100',
                selectedId === issue.id ? 'bg-coral-soft/35' : 'bg-paper hover:bg-canvas',
              )}
              style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
            >
              <TaskStatusIcon status={issue.status} size={14} />
              <TaskPriorityIcon priority={issue.priority} size={12} />
              <span className="w-[48px] shrink-0 font-mono text-[9px] text-faint">{issue.key}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{issue.title}</span>
              <span className="hidden items-center gap-1 lg:flex">
                {issue.labels.slice(0, 2).map((label) => (
                  <TaskLabelPill key={label.id} label={label} compact />
                ))}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {issue.commentCount > 0 && (
                  <span className="hidden items-center gap-1 text-[9px] text-faint sm:flex">
                    <MessageSquare size={10} /> {issue.commentCount}
                  </span>
                )}
                <span className="hidden w-10 text-right text-[9px] text-faint sm:block">
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoardView({
  issues,
  members,
  selectedId,
  onSelect,
  onMove,
}: {
  issues: TaskIssue[];
  members: TasksSnapshot['members'];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
}) {
  const columns = STATUS_ORDER.filter((status) => status !== 'canceled');
  return (
    <div className="scroll-thin flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
      {columns.map((status) => {
        const columnIssues = issues.filter((issue) => issue.status === status);
        return (
          <section
            key={status}
            data-status={status}
            className="flex w-[270px] shrink-0 flex-col rounded-[16px] border border-line/70 bg-paper/60"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain');
              if (id) onMove(id, status);
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <TaskStatusIcon status={status} size={13} />
              <span className="text-[11px] font-semibold">{STATUS_META[status].label}</span>
              <span className="text-[10px] text-faint">{columnIssues.length}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {columnIssues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  data-issue-id={issue.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', issue.id)}
                  onClick={() => onSelect(issue.id)}
                  className={cn(
                    'rounded-xl border border-line/80 bg-paper p-2.5 text-left shadow-[0_2px_6px_-5px_rgba(23,26,26,.25)] transition-[border-color,transform] duration-100 hover:border-ink/20 active:scale-[0.99]',
                    selectedId === issue.id && 'border-coral/40 ring-1 ring-coral/20',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-faint">{issue.key}</span>
                    <span className="ml-auto">
                      <TaskPriorityIcon priority={issue.priority} size={11} />
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-4 font-medium">{issue.title}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {issue.labels.slice(0, 2).map((label) => (
                      <TaskLabelPill key={label.id} label={label} compact />
                    ))}
                    <span className="ml-auto">
                      {issue.assignee ? (
                        <Avatar name={issue.assignee.name} color={issue.assignee.avatarColor} size="xs" />
                      ) : (
                        <span className="block size-5 rounded-full border border-dashed border-line" />
                      )}
                    </span>
                  </div>
                </button>
              ))}
              {columnIssues.length === 0 && (
                <p className="rounded-lg border border-dashed border-line/70 px-2 py-4 text-center text-[10px] text-faint">
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
