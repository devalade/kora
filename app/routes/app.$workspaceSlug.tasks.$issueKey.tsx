import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleDashed,
  CircleDot,
  Hash,
  Link2,
  ListTree,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import {
  addTaskCommentFn,
  setIssueTypingFn,
  createIssueFn,
  deleteIssueFn,
  getIssueFn,
  getTasksFn,
  touchIssueEditorFn,
  updateIssueFn,
} from '../lib/tasks';
import type {
  TaskEvent,
  TaskIssue,
  TaskIssueDetail,
  TaskLabel,
  TaskPriority,
  TasksSnapshot,
} from '../lib/types';
import { relativeTime } from '../lib/format';
import { openNewIssue } from '../lib/new-issue-store';
import { Avatar, AvatarStack } from '../components/avatar';
import {
  assigneeOptions,
  DateSelect,
  formatIssueDate,
  LabelSelect,
  priorityOptions,
  projectOptions,
  statusOptions,
} from '../components/issue-fields';
import { MarkdownEditor } from '../components/markdown-editor';
import { Modal } from '../components/modal';
import { NewIssueModal } from '../components/new-issue';
import { menuSurface, PropertySelect, type PropertyOption } from '../components/property-select';
import { TaskPriorityIcon, TaskStatusIcon } from '../components/task-icons';
import { TasksSidebar } from '../components/tasks-sidebar';
import { TypingRow } from '../components/message-list';
import { IssueChip } from '../components/issue-embed';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/tasks/$issueKey')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => {
    const [snapshot, detail] = await Promise.all([
      getTasksFn({ data: { slug: params.workspaceSlug } }),
      getIssueFn({ data: { slug: params.workspaceSlug, issueKey: params.issueKey } }),
    ]);
    return { snapshot, detail };
  },
  head: () => ({ meta: [{ title: 'Issue · Kora' }] }),
  errorComponent: IssueError,
  component: IssuePage,
});

type IssuePatch = {
  title?: string;
  description?: string;
  statusId?: string;
  priority?: TaskPriority;
  assigneeId?: string | null;
  labelIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  parentIssueId?: string | null;
  projectId?: string | null;
};

function IssuePage() {
  const { snapshot, detail: initialDetail } = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [detail, setDetail] = useState<TaskIssueDetail>(initialDetail);
  const [title, setTitle] = useState(initialDetail.issue.title);
  const [description, setDescription] = useState(initialDetail.issue.description);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const typingSentAt = useRef(0);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [subIssueTitle, setSubIssueTitle] = useState('');
  const [addingSubIssue, setAddingSubIssue] = useState(false);
  const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIssueRef = useRef(initialDetail.issue);

  const issue = detail.issue;
  latestIssueRef.current = issue;

  useEffect(() => {
    return () => {
      if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    };
  }, []);

  useEffect(() => {
    setDetail(initialDetail);
    setTitle(initialDetail.issue.title);
    setDescription(initialDetail.issue.description);
  }, [initialDetail]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') {
        void touchIssueEditorFn({ data: { issueId: issue.id } }).catch(() => undefined);
      }
    };
    ping();
    const timer = setInterval(ping, 4000);
    return () => clearInterval(timer);
  }, [issue.id]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await getIssueFn({
          data: { slug: snapshot.workspace.slug, issueKey: issue.key },
        });
        if (cancelled) return;
        const active = document.activeElement;
        const editingDescription = Boolean(active?.closest('.tiptap'));
        const editingTitle =
          active instanceof HTMLInputElement && active.getAttribute('aria-label') === 'Issue title';
        setDetail((current) => ({
          ...next,
          issue: {
            ...next.issue,
            description: editingDescription ? current.issue.description : next.issue.description,
          },
        }));
        if (!editingDescription && !descriptionTimer.current) {
          setDescription(next.issue.description);
        }
        if (!editingTitle) setTitle(next.issue.title);
      } catch {
        // The next poll recovers a dropped read.
      }
    };
    const timer = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [issue.id, issue.key, snapshot.workspace.slug]);

  function applyPatch(current: TaskIssue, patch: IssuePatch): TaskIssue {
    return {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.statusId !== undefined
        ? {
            status:
              (snapshot as TasksSnapshot).statuses.find((status) => status.id === patch.statusId) ??
              current.status,
          }
        : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.assigneeId !== undefined
        ? {
            assignee: patch.assigneeId
              ? (snapshot as TasksSnapshot).members.find((member) => member.id === patch.assigneeId) ??
                null
              : null,
          }
        : {}),
      ...(patch.labelIds !== undefined
        ? {
            labels: (snapshot as TasksSnapshot).labels.filter((label) =>
              patch.labelIds?.includes(label.id),
            ),
          }
        : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.parentIssueId !== undefined ? { parentId: patch.parentIssueId } : {}),
      ...(patch.projectId !== undefined
        ? {
            project:
              (snapshot as TasksSnapshot).projects.find((project) => project.id === patch.projectId) ??
              null,
          }
        : {}),
    };
  }

  async function patchIssue(patch: IssuePatch) {
    const before = detail;
    setDetail((current) => ({ ...current, issue: applyPatch(current.issue, patch) }));
    setSaving(true);
    try {
      await updateIssueFn({ data: { issueId: issue.id, ...patch } });
      // Status counts and the parent breadcrumb live in the loader data.
      if (patch.statusId || patch.parentIssueId !== undefined) await router.invalidate();
      return true;
    } catch (error) {
      setDetail(before);
      toast.error(error instanceof Error ? error.message : 'Could not update the issue.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle() {
    const next = title.trim();
    if (!next || next === issue.title) {
      setTitle(issue.title);
      return;
    }
    const saved = await patchIssue({ title: next });
    if (!saved) setTitle(issue.title);
    else setTitle(next);
  }

  async function persistDescription(next: string) {
    const before = latestIssueRef.current.description;
    if (next === before) return;
    const saved = await patchIssue({ description: next });
    if (!saved) setDescription(before);
  }

  function handleDescriptionChange(next: string) {
    setDescription(next);
    if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    descriptionTimer.current = setTimeout(() => {
      descriptionTimer.current = null;
      void persistDescription(next);
    }, 700);
  }

  function saveDescription() {
    if (descriptionTimer.current) {
      clearTimeout(descriptionTimer.current);
      descriptionTimer.current = null;
    }
    void persistDescription(description);
  }

  function addLabelToIssue(label: TaskLabel) {
    setDetail((current) =>
      current.issue.labels.some((item) => item.id === label.id)
        ? current
        : { ...current, issue: { ...current.issue, labels: [...current.issue.labels, label] } },
    );
    void router.invalidate();
  }

  async function createSubIssue() {
    const next = subIssueTitle.trim();
    if (!next || addingSubIssue) return;
    setAddingSubIssue(true);
    try {
      const result = await createIssueFn({
        data: {
          slug: snapshot.workspace.slug,
          teamId: issue.team.id,
          title: next,
          description: '',
          priority: 0,
          assigneeId: null,
          labelIds: [],
          parentIssueId: issue.id,
        },
      });
      setSubIssueTitle('');
      await router.invalidate();
      toast.success(`${result.key} added as a sub-issue.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the sub-issue.');
    } finally {
      setAddingSubIssue(false);
    }
  }

  function sendCommentTyping(active: boolean) {
    void setIssueTypingFn({ data: { issueId: issue.id, active } }).catch(() => undefined);
  }

  // Mirrors the chat composer: at most one "typing" write every 2 s, cleared after 2.6 s idle.
  function markCommentTyping() {
    if (typingIdle.current) clearTimeout(typingIdle.current);
    typingIdle.current = setTimeout(() => {
      typingIdle.current = null;
      typingSentAt.current = 0;
      sendCommentTyping(false);
    }, 2600);
    if (Date.now() - typingSentAt.current < 2000) return;
    typingSentAt.current = Date.now();
    sendCommentTyping(true);
  }

  useEffect(
    () => () => {
      if (typingIdle.current) clearTimeout(typingIdle.current);
    },
    [],
  );

  async function submitComment() {
    if (!comment.trim() || sending) return;
    setSending(true);
    if (typingIdle.current) clearTimeout(typingIdle.current);
    typingIdle.current = null;
    typingSentAt.current = 0;
    try {
      const result = await addTaskCommentFn({
        data: { issueId: issue.id, body: comment.trim() },
      });
      setDetail((current) => ({
        ...current,
        comments: [...current.comments, result.comment],
        issue: { ...current.issue, commentCount: current.issue.commentCount + 1 },
      }));
      setComment('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post the comment.');
    } finally {
      setSending(false);
    }
  }

  async function removeIssue() {
    setDeleting(true);
    try {
      await deleteIssueFn({ data: { issueId: issue.id } });
      toast.success('Issue deleted.');
      navigate({
        to: '/app/$workspaceSlug/tasks',
        params: { workspaceSlug: params.workspaceSlug },
        search: { view: 'all' },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the issue.');
      setDeleting(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied.');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed. Press ⌘C in the address bar.');
    }
  }

  useEffect(() => {
    // Linear: C opens a new issue from anywhere, including an issue page.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'c') {
        event.preventDefault();
        openNewIssue({ teamId: issue.team.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [issue.team.id]);

  const otherEditors = detail.editors.filter((editor) => editor.id !== snapshot.me.id);
  const otherTyping = detail.commentTyping.filter((person) => person.id !== snapshot.me.id);
  const overdue =
    Boolean(issue.dueDate) &&
    issue.status.category !== 'completed' &&
    issue.status.category !== 'canceled' &&
    (issue.dueDate ?? '') < new Date().toISOString().slice(0, 10);

  // Linear's activity: history lines and comments in one timeline, oldest first.
  const timeline = [
    ...detail.events.map((event) => ({ type: 'event' as const, at: event.createdAt, event })),
    ...detail.comments.map((comment) => ({ type: 'comment' as const, at: comment.createdAt, comment })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  function setLabels(labelIds: string[]) {
    void patchIssue({ labelIds });
  }

  // Sub-issues are ordinary issues: any issue can be attached, as long as it does not create a loop.
  const byId = new Map(snapshot.issues.map((item) => [item.id, item]));
  const ancestors = new Set<string>();
  for (let cursor = issue.parentId; cursor && !ancestors.has(cursor); ) {
    ancestors.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  const descendants = new Set<string>();
  const queue = [issue.id];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const item of snapshot.issues) {
      if (item.parentId === current && !descendants.has(item.id)) {
        descendants.add(item.id);
        queue.push(item.id);
      }
    }
  }
  const issueOption = (item: TaskIssue) => ({
    value: item.id,
    label: `${item.key} ${item.title}`,
    icon: <TaskStatusIcon status={item.status} size={14} />,
  });
  const parentChoices = [
    { value: '', label: 'No parent issue', icon: <ListTree size={14} className="text-faint" /> },
    ...snapshot.issues
      .filter((item) => item.id !== issue.id && !descendants.has(item.id))
      .map(issueOption),
  ];
  const childChoices = snapshot.issues
    .filter((item) => item.id !== issue.id && !ancestors.has(item.id) && item.parentId !== issue.id)
    .map(issueOption);

  async function setChildParent(childId: string, parentIssueId: string | null) {
    try {
      await updateIssueFn({ data: { issueId: childId, parentIssueId } });
      await router.invalidate();
      const child = byId.get(childId) ?? detail.subIssues.find((item) => item.id === childId);
      toast.success(
        parentIssueId
          ? `${child?.key ?? 'Issue'} is now a sub-issue of ${issue.key}.`
          : `${child?.key ?? 'Issue'} removed from ${issue.key}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the sub-issue.');
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeTeam={issue.team.id}
        activeStatus={issue.status.id}
        onSignOut={async () => {
          await signOutFn();
          await navigate({ to: '/' });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-paper">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3 sm:px-4">
          <button
            type="button"
            data-audit-skip="A3"
            onClick={() => setSidebarOpen(true)}
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink md:hidden"
            aria-label="Open tasks navigation"
          >
            <Menu size={18} />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-[13px]">
            <Link
              to="/app/$workspaceSlug/tasks"
              params={{ workspaceSlug: params.workspaceSlug }}
              search={{ view: 'all', team: issue.team.id }}
              data-audit-skip="A3"
              className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: issue.team.color }} />
              <span className="max-w-[160px] truncate">{issue.team.name}</span>
            </Link>
            <ChevronRight size={14} className="shrink-0 text-faint" />
            {detail.parent && (
              <>
                <Link
                  to="/app/$workspaceSlug/tasks/$issueKey"
                  params={{ workspaceSlug: params.workspaceSlug, issueKey: detail.parent.key }}
                  className="inline-flex h-7 items-center rounded-md px-1.5 text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
                >
                  {detail.parent.key}
                </Link>
                <ChevronRight size={14} className="shrink-0 text-faint" />
              </>
            )}
            <span className="px-1.5 font-medium text-ink-soft">{issue.key}</span>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {otherEditors.length > 0 && (
              <div
                className="mr-1 hidden items-center gap-2 sm:flex"
                title={`${otherEditors.map((editor) => editor.name).join(', ')} viewing`}
              >
                <AvatarStack people={otherEditors} max={3} size="xs" />
              </div>
            )}
            {saving && (
              <span className="mr-1 hidden items-center gap-1.5 text-[12px] text-faint sm:flex">
                <Loader2 size={12} className="animate-spin" /> Saving
              </span>
            )}
            <button
              type="button"
              onClick={() => void copyLink()}
              className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
              aria-label="Copy issue link"
              title="Copy link"
            >
              {copied ? <Check size={15} className="text-mint-deep" /> : <Link2 size={15} />}
            </button>
            <IssueMenu
              onCopyId={() => {
                void navigator.clipboard
                  .writeText(issue.key)
                  .then(() => toast.success(`Copied ${issue.key}.`))
                  .catch(() => toast.error('Copy failed.'));
              }}
              onCopyLink={() => void copyLink()}
              onDelete={() => setDeleteOpen(true)}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
            <article className="mx-auto w-full max-w-[760px] px-5 pt-8 pb-20 sm:px-10 sm:pt-12">
              <textarea
                value={title}
                rows={1}
                onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
                onBlur={() => void saveTitle()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Issue title"
                maxLength={200}
                className="field-sizing-content block w-full resize-none border-0 bg-transparent p-0 text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink outline-none"
              />

              <div className="mt-4 flex flex-wrap items-center gap-1.5 lg:hidden">
                <IssuePropertyControls
                  issue={issue}
                  snapshot={snapshot}
                  patchIssue={patchIssue}
                  setLabels={setLabels}
                  onLabelCreated={addLabelToIssue}
                  overdue={overdue}
                  parentChoices={parentChoices}
                  variant="chip"
                />
              </div>

              <div className="mt-3">
                <MarkdownEditor
                  variant="bare"
                  minHeight={72}
                  value={description}
                  onChange={handleDescriptionChange}
                  onBlur={saveDescription}
                  placeholder="Add description…"
                  ariaLabel="Issue description"
                />
              </div>

              <SubIssues
                subIssues={detail.subIssues}
                workspaceSlug={params.workspaceSlug}
                value={subIssueTitle}
                onValueChange={setSubIssueTitle}
                adding={addingSubIssue}
                onCreate={() => void createSubIssue()}
                attachChoices={childChoices}
                onAttach={(childId) => void setChildParent(childId, issue.id)}
                onDetach={(childId) => void setChildParent(childId, null)}
              />

              <section className="mt-10 border-t border-line pt-8" aria-labelledby="activity-heading">
                <h2 id="activity-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
                  Activity
                </h2>
                <ol className="mt-5 space-y-3">
                  {!detail.events.some((event) => event.kind === 'created') && (
                    <HistoryLine
                      event={{
                        id: 'created',
                        kind: 'created',
                        actor: detail.createdBy,
                        from: null,
                        to: null,
                        createdAt: issue.createdAt,
                      }}
                    />
                  )}
                  {timeline.map((entry) =>
                    entry.type === 'event' ? (
                      <HistoryLine key={entry.event.id} event={entry.event} />
                    ) : (
                      <li
                        key={entry.comment.id}
                        className="rounded-lg border border-line bg-paper px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={entry.comment.author.name}
                            color={entry.comment.author.avatarColor}
                            size="2xs"
                          />
                          <span className="text-[13px] font-medium">{entry.comment.author.name}</span>
                          <time
                            dateTime={entry.comment.createdAt}
                            className="text-[12px] text-muted"
                            suppressHydrationWarning
                          >
                            {relativeTime(entry.comment.createdAt)}
                          </time>
                        </div>
                        <p className="mt-2 text-[14px] leading-6 whitespace-pre-wrap text-ink-soft">
                          <CommentBody body={entry.comment.body} issues={snapshot.issues} />
                        </p>
                      </li>
                    ),
                  )}
                </ol>

                {otherTyping.length > 0 && <TypingRow people={otherTyping} className="mt-4 pl-1" />}

                <div className="mt-5 rounded-lg border border-line bg-paper transition-[border-color,box-shadow] duration-150 focus-within:border-ink/25 focus-within:shadow-[0_0_0_3px_rgba(23,26,26,0.04)]">
                  <textarea
                    value={comment}
                    onChange={(event) => {
                      setComment(event.target.value);
                      markCommentTyping();
                    }}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault();
                        void submitComment();
                      }
                    }}
                    placeholder="Leave a comment…"
                    aria-label="Leave a comment"
                    className="field-sizing-content block min-h-[64px] w-full resize-none bg-transparent px-4 pt-3 text-[16px] leading-6 outline-none placeholder:text-faint sm:text-[14px]"
                  />
                  <div className="flex items-center justify-end gap-2 px-2 pb-2">
                    <span className="hidden text-[12px] text-faint sm:inline">⌘↵</span>
                    <button
                      type="button"
                      onClick={() => void submitComment()}
                      disabled={!comment.trim() || sending}
                      aria-label="Comment"
                      title="Comment (⌘↵)"
                      className="grid size-8 place-items-center rounded-full bg-ink text-paper transition-[background-color,transform] duration-150 hover:bg-ink-soft active:scale-[0.95] disabled:bg-line disabled:text-faint"
                    >
                      {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                    </button>
                  </div>
                </div>
              </section>
            </article>
          </div>

          <aside
            aria-label="Issue properties"
            className="scroll-thin hidden w-[272px] shrink-0 overflow-y-auto border-l border-line bg-canvas/60 px-3 py-4 lg:block"
          >
            <PanelSection title="Properties">
              <IssuePropertyControls
                issue={issue}
                snapshot={snapshot}
                patchIssue={patchIssue}
                setLabels={setLabels}
                onLabelCreated={addLabelToIssue}
                overdue={overdue}
                parentChoices={parentChoices}
                variant="row"
              />
            </PanelSection>
            <PanelSection title="Labels">
              <LabelSelect
                variant="row"
                labels={snapshot.labels}
                selectedIds={issue.labels.map((label) => label.id)}
                onChange={setLabels}
                onCreated={addLabelToIssue}
                slug={snapshot.workspace.slug}
              />
            </PanelSection>
            <PanelSection title="Team">
              <div className="flex h-8 items-center gap-2 px-2 text-[13px] font-medium text-ink-soft">
                <span className="grid size-5 place-items-center">
                  <span className="size-2 rounded-full" style={{ background: issue.team.color }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{issue.team.name}</span>
                <span className="text-[12px] font-normal text-faint">{issue.team.key}</span>
              </div>
            </PanelSection>
            <PanelSection title="Project">
              <PropertySelect
                variant="row"
                value={issue.project?.id ?? ''}
                options={projectOptions(snapshot)}
                onChange={(value) => void patchIssue({ projectId: value || null })}
                ariaLabel="Project"
                placeholder="Add to project"
                unsetValue=""
                searchPlaceholder="Add to project…"
              />
            </PanelSection>
            <div className="mt-4 space-y-1 border-t border-line px-2 pt-4 text-[12px] text-muted">
              <p suppressHydrationWarning>
                Created {relativeTime(issue.createdAt)}
                {detail.createdBy ? ` by ${detail.createdBy.name.split(' ')[0]}` : ''}
              </p>
              <p suppressHydrationWarning>Updated {relativeTime(issue.updatedAt)}</p>
            </div>
          </aside>
        </div>
      </main>

      <NewIssueModal snapshot={snapshot} />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        width="max-w-md"
        title="Delete this issue?"
        description={`${issue.key} and its comments will be removed. This cannot be undone.`}
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="h-9 rounded-md px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void removeIssue()}
            disabled={deleting}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-danger px-3 text-[13px] font-medium text-white transition-[background-color,opacity] duration-150 hover:bg-danger/90 disabled:opacity-50"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            Delete issue
          </button>
        </div>
      </Modal>
    </div>
  );
}

function historySentence(event: TaskEvent): React.ReactNode {
  const strong = (text: string | null) => <span className="font-medium text-ink-soft">{text}</span>;
  const date = (value: string | null) => (value ? formatIssueDate(value) : null);
  switch (event.kind) {
    case 'created':
      return 'created the issue';
    case 'title':
      return <>changed the title to {strong(`“${event.to ?? ''}”`)}</>;
    case 'status':
      return event.from ? (
        <>
          changed status from {strong(event.from)} to {strong(event.to)}
        </>
      ) : (
        <>set status to {strong(event.to)}</>
      );
    case 'priority':
      return event.to && event.to !== 'No priority' ? (
        <>set priority to {strong(event.to)}</>
      ) : (
        'removed the priority'
      );
    case 'assignee':
      if (!event.to) return <>unassigned {strong(event.from)}</>;
      return event.actor?.name === event.to ? 'self-assigned the issue' : <>assigned to {strong(event.to)}</>;
    case 'labels':
      return (
        <>
          {event.to && <>added {strong(event.to)}</>}
          {event.to && event.from && ' and '}
          {event.from && <>removed {strong(event.from)}</>}
        </>
      );
    case 'project':
      return event.to ? <>added to project {strong(event.to)}</> : <>removed from project {strong(event.from)}</>;
    case 'parent':
      return event.to ? <>set the parent issue to {strong(event.to)}</> : <>removed the parent issue {strong(event.from)}</>;
    case 'start_date':
      return event.to ? <>set the start date to {strong(date(event.to))}</> : 'removed the start date';
    case 'due_date':
      return event.to ? <>set the due date to {strong(date(event.to))}</> : 'removed the due date';
    case 'mentioned':
      return event.to ? <>mentioned this issue in {strong(event.to)}</> : 'mentioned this issue';
    default:
      return 'updated the issue';
  }
}

const ISSUE_KEY_IN_TEXT = /\b[A-Z][A-Z0-9]{1,4}-\d{1,6}\b/g;

/** Comment text with issue keys (KOR-12) shown as live chips, like in chat. */
function CommentBody({ body, issues }: { body: string; issues: TaskIssue[] }) {
  const byKey = new Map(issues.map((item) => [item.key, item]));
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(ISSUE_KEY_IN_TEXT)) {
    const ref = byKey.get(match[0]);
    if (!ref || match.index === undefined) continue;
    parts.push(body.slice(last, match.index));
    parts.push(
      <IssueChip
        key={`${match.index}-${ref.id}`}
        issue={{
          id: ref.id,
          key: ref.key,
          title: ref.title,
          status: ref.status,
          priority: ref.priority,
          assignee: ref.assignee,
        }}
        className="align-middle"
      />,
    );
    last = match.index + match[0].length;
  }
  parts.push(body.slice(last));
  return <>{parts}</>;
}

function HistoryLine({ event }: { event: TaskEvent }) {
  return (
    <li className="flex items-start gap-2 pl-1 text-[13px] leading-5 text-muted">
      <span className="grid size-5 shrink-0 place-items-center">
        {event.actor ? (
          <Avatar name={event.actor.name} color={event.actor.avatarColor} size="2xs" />
        ) : (
          <CircleDot size={12} className="text-faint" />
        )}
      </span>
      <span className="min-w-0">
        {event.actor && <span className="font-medium text-ink-soft">{event.actor.name} </span>}
        {historySentence(event)}
        <span aria-hidden="true"> · </span>
        <time dateTime={event.createdAt} suppressHydrationWarning>
          {relativeTime(event.createdAt)}
        </time>
      </span>
    </li>
  );
}

/** Status, priority, assignee and dates: rows in the side panel, chips under the title on phones. */
function IssuePropertyControls({
  issue,
  snapshot,
  patchIssue,
  setLabels,
  onLabelCreated,
  overdue,
  parentChoices,
  variant,
}: {
  issue: TaskIssue;
  snapshot: TasksSnapshot;
  patchIssue: (patch: IssuePatch) => Promise<boolean>;
  setLabels: (labelIds: string[]) => void;
  onLabelCreated: (label: TaskLabel) => void;
  overdue: boolean;
  parentChoices: PropertyOption[];
  variant: 'row' | 'chip';
}) {
  return (
    <>
      <PropertySelect
        variant={variant}
        value={issue.status.id}
        options={statusOptions(snapshot)}
        onChange={(value) => void patchIssue({ statusId: value })}
        ariaLabel="Status"
        searchPlaceholder="Change status…"
        numbered
      />
      <PropertySelect
        variant={variant}
        value={String(issue.priority)}
        options={priorityOptions()}
        onChange={(value) => void patchIssue({ priority: Number(value) as TaskPriority })}
        ariaLabel="Priority"
        placeholder={variant === 'row' ? 'Set priority' : 'Priority'}
        unsetValue="0"
        searchPlaceholder="Set priority…"
        numbered
      />
      <PropertySelect
        variant={variant}
        value={issue.assignee?.id ?? ''}
        options={assigneeOptions(snapshot)}
        onChange={(value) => void patchIssue({ assigneeId: value || null })}
        ariaLabel="Assignee"
        placeholder={variant === 'row' ? 'Assign' : 'Assignee'}
        unsetValue=""
        searchPlaceholder="Assign to…"
      />
      {variant === 'chip' && (
        <PropertySelect
          variant="chip"
          value={issue.project?.id ?? ''}
          options={projectOptions(snapshot)}
          onChange={(value) => void patchIssue({ projectId: value || null })}
          ariaLabel="Project"
          placeholder="Project"
          unsetValue=""
          searchPlaceholder="Add to project…"
        />
      )}
      {variant === 'chip' && (
        <LabelSelect
          variant="chip"
          labels={snapshot.labels}
          selectedIds={issue.labels.map((label) => label.id)}
          onChange={setLabels}
          onCreated={onLabelCreated}
          slug={snapshot.workspace.slug}
        />
      )}
      <DateSelect
        variant={variant}
        value={issue.startDate}
        onChange={(value) => void patchIssue({ startDate: value })}
        label="Start date"
        placeholder="Start date"
        prefix="Starts"
      />
      <DateSelect
        variant={variant}
        value={issue.dueDate}
        onChange={(value) => void patchIssue({ dueDate: value })}
        label="Due date"
        placeholder="Due date"
        prefix="Due"
        overdue={overdue}
      />
      <PropertySelect
        variant={variant}
        value={issue.parentId ?? ''}
        options={parentChoices}
        onChange={(value) => void patchIssue({ parentIssueId: value || null })}
        ariaLabel="Parent issue"
        placeholder="Set parent issue"
        unsetValue=""
        searchPlaceholder="Set parent issue…"
        menuClassName="max-w-[340px]"
      />
    </>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1 flex h-7 items-center px-2 text-[12px] font-medium text-muted">{title}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function SubIssues({
  subIssues,
  workspaceSlug,
  value,
  onValueChange,
  adding,
  onCreate,
  attachChoices,
  onAttach,
  onDetach,
}: {
  subIssues: TaskIssue[];
  workspaceSlug: string;
  value: string;
  onValueChange: (value: string) => void;
  adding: boolean;
  onCreate: () => void;
  attachChoices: PropertyOption[];
  onAttach: (issueId: string) => void;
  onDetach: (issueId: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const done = subIssues.filter((child) => child.status.category === 'completed').length;

  const attach = (
    <PropertySelect
      variant="row"
      value=""
      options={attachChoices}
      onChange={onAttach}
      ariaLabel="Add existing issue"
      placeholder="Add existing"
      unsetValue=""
      emptyIcon={<Link2 size={14} />}
      searchPlaceholder="Add existing issue…"
      menuClassName="max-w-[340px]"
      className="[&>button]:w-auto [&>button]:text-muted [&>button:hover]:text-ink"
    />
  );

  if (subIssues.length === 0 && !composing) {
    return (
      <div className="-ml-2 mt-6 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted transition-colors duration-100 hover:bg-ink/[0.045] hover:text-ink"
        >
          <Plus size={14} /> Add sub-issues
        </button>
        {attachChoices.length > 0 && attach}
      </div>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="sub-issues-heading">
      <div className="flex h-8 items-center gap-2">
        <h2 id="sub-issues-heading" className="text-[13px] font-medium">
          Sub-issues
        </h2>
        {subIssues.length > 0 && (
          <span className="text-[12px] tabular-nums text-muted">
            {done}/{subIssues.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {attachChoices.length > 0 && attach}
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label="Create sub-issue"
            title="Create sub-issue"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <ul className="mt-1">
        {subIssues.map((child) => (
          <li key={child.id} className="group relative">
            <Link
              to="/app/$workspaceSlug/tasks/$issueKey"
              params={{ workspaceSlug, issueKey: child.key }}
              className="-mx-2 flex h-9 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-ink/[0.04]"
            >
              <TaskStatusIcon status={child.status} size={14} />
              <span className="w-14 shrink-0 text-[12px] tabular-nums text-muted">{child.key}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  child.status.category === 'completed' || child.status.category === 'canceled'
                    ? 'text-muted'
                    : 'text-ink-soft',
                )}
              >
                {child.title}
              </span>
              <TaskPriorityIcon priority={child.priority} size={14} />
              {child.assignee ? (
                <Avatar name={child.assignee.name} color={child.assignee.avatarColor} size="2xs" />
              ) : (
                <span className="size-5" />
              )}
              {/* Room for the detach button, which sits over the row's right edge. */}
              <span className="w-7 shrink-0" />
            </Link>
            <button
              type="button"
              onClick={() => onDetach(child.id)}
              aria-label={`Remove ${child.key} from sub-issues`}
              title="Remove from sub-issues"
              className="absolute top-1 -right-1 grid size-7 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-ink/[0.06] hover:text-ink focus-visible:opacity-100"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      {composing && (
        <div className="-mx-2 mt-1 flex h-9 items-center gap-2 rounded-md border border-line bg-paper px-2 focus-within:border-ink/25">
          {adding ? (
            <Loader2 size={14} className="animate-spin text-faint" />
          ) : (
            <CircleDashed size={14} className="text-faint" />
          )}
          <input
            autoFocus
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onCreate();
              } else if (event.key === 'Escape') {
                onValueChange('');
                setComposing(false);
              }
            }}
            onBlur={() => {
              if (!value.trim()) setComposing(false);
            }}
            placeholder="Sub-issue title, then Enter"
            maxLength={200}
            aria-label="Sub-issue title"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint sm:text-[13px]"
          />
        </div>
      )}
    </section>
  );
}

function IssueMenu({
  onCopyLink,
  onCopyId,
  onDelete,
}: {
  onCopyLink: () => void;
  onCopyId: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink-soft hover:bg-ink/[0.05] hover:text-ink';

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink',
          open && 'bg-ink/[0.05] text-ink',
        )}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className={cn(menuSurface, 'top-full right-0 mt-1 p-1', 'popover-in')}>
          <button type="button" role="menuitem" className={item} onClick={() => run(onCopyLink)}>
            <Link2 size={14} className="text-muted" /> Copy link
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => run(onCopyId)}>
            <Hash size={14} className="text-muted" /> Copy issue ID
          </button>
          <div className="my-1 h-px bg-line-soft" />
          <button
            type="button"
            role="menuitem"
            className={cn(item, 'text-danger hover:bg-danger/[0.07] hover:text-danger')}
            onClick={() => run(onDelete)}
          >
            <Trash2 size={14} /> Delete issue…
          </button>
        </div>
      )}
    </div>
  );
}

function IssueError({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : 'That issue may have been deleted or moved.';
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 text-center shadow-[var(--kora-shadow-composer)]">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-coral-soft text-coral">
          <MessageSquare size={20} />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-[-0.02em]">Issue not found</h1>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          {message}
        </p>
        <Link
          to="/app"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[13px] font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft"
        >
          Back to workspaces
        </Link>
      </div>
    </div>
  );
}
