import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  Copy,
  ListTree,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import {
  addTaskCommentFn,
  createIssueFn,
  deleteIssueFn,
  getIssueFn,
  getTasksFn,
  touchIssueEditorFn,
  updateIssueFn,
} from '../lib/tasks';
import type {
  TaskIssue,
  TaskIssueDetail,
  TaskLabel,
  TaskPriority,
  TasksSnapshot,
} from '../lib/types';
import { relativeTime } from '../lib/format';
import { taskProgress } from '../lib/markdown';
import { Avatar, AvatarStack } from '../components/avatar';
import { LabelPicker } from '../components/label-picker';
import { MarkdownEditor } from '../components/markdown-editor';
import { Modal } from '../components/modal';
import { PropertySelect } from '../components/property-select';
import { PRIORITY_META, TaskPriorityIcon, TaskStatusIcon } from '../components/task-icons';
import { TasksSidebar } from '../components/tasks-sidebar';
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
    const timer = setInterval(ping, 5000);
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
    const timer = setInterval(refresh, 3000);
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
    };
  }

  async function patchIssue(patch: IssuePatch) {
    const before = detail;
    setDetail((current) => ({ ...current, issue: applyPatch(current.issue, patch) }));
    setSaving(true);
    try {
      await updateIssueFn({ data: { issueId: issue.id, ...patch } });
      if (patch.statusId) await router.invalidate();
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
          projectId: issue.project.id,
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

  async function submitComment() {
    if (!comment.trim() || sending) return;
    setSending(true);
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

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeProject={issue.project.id}
        activeStatus={issue.status.id}
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
          <Link
            to="/app/$workspaceSlug/tasks"
            params={{ workspaceSlug: params.workspaceSlug }}
            search={{ view: 'all', project: issue.project.id }}
            data-audit-skip="A3"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
          >
            <ArrowLeft size={15} /> Tasks
          </Link>
          <span className="text-line">/</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted sm:hidden">
            <span className="font-mono text-[11px] text-faint">{issue.key}</span>
          </span>
          <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted sm:flex">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: issue.project.color }}
            />
            <span className="max-w-[180px] truncate">{issue.project.name}</span>
            <span className="text-faint">/</span>
            <span className="font-mono text-[11px] text-faint">{issue.key}</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {detail.editors.some((editor) => editor.id !== snapshot.me.id) && (
              <div className="hidden items-center gap-2 sm:flex">
                <AvatarStack
                  people={detail.editors.filter((editor) => editor.id !== snapshot.me.id)}
                  max={3}
                  size="xs"
                />
                <span className="text-[11px] text-muted">
                  {detail.editors.filter((editor) => editor.id !== snapshot.me.id).length === 1
                    ? `${detail.editors.find((editor) => editor.id !== snapshot.me.id)?.name.split(' ')[0]} editing`
                    : `${detail.editors.filter((editor) => editor.id !== snapshot.me.id).length} editing`}
                </span>
              </div>
            )}
            {saving && (
              <span className="hidden items-center gap-1.5 text-[11px] text-faint sm:flex">
                <Loader2 size={12} className="animate-spin" /> Saving
              </span>
            )}
            <button
              type="button"
              onClick={() => void copyLink()}
              className="grid size-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink sm:size-9"
              aria-label="Copy issue link"
              title="Copy link"
            >
              {copied ? <Check size={16} className="text-mint-deep" /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="grid size-10 place-items-center rounded-lg text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger sm:size-9"
              aria-label="Delete issue"
              title="Delete issue"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
              <article className="min-w-0">
                {detail.parent && (
                  <Link
                    to="/app/$workspaceSlug/tasks/$issueKey"
                    params={{ workspaceSlug: params.workspaceSlug, issueKey: detail.parent.key }}
                    className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-md text-[12px] text-muted transition-colors duration-150 hover:text-ink"
                  >
                    <ListTree size={13} />
                    <span>Sub-issue of</span>
                    <span className="font-mono text-[11px] text-faint">{detail.parent.key}</span>
                    <span className="truncate">{detail.parent.title}</span>
                  </Link>
                )}

                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: issue.project.color }}
                  />
                  <span>{issue.project.name}</span>
                  <span className="text-faint">/</span>
                  <span className="font-mono text-[11px] text-faint">{issue.key}</span>
                </div>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => void saveTitle()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Issue title"
                  className="mt-4 min-h-11 w-full border-0 bg-transparent p-0 text-[32px] leading-[1.15] font-semibold tracking-[-0.035em] outline-none sm:text-[38px]"
                  maxLength={200}
                />

                <div className="mt-6">
                  <MarkdownEditor
                    value={description}
                    onChange={handleDescriptionChange}
                    onBlur={saveDescription}
                    placeholder="Write the issue in Markdown..."
                    ariaLabel="Issue description"
                  />
                </div>

                <div className="mt-6 lg:hidden">
                  <IssueProperties
                  issue={issue}
                  snapshot={snapshot}
                  patchIssue={patchIssue}
                  onLabelCreated={addLabelToIssue}
                />
                </div>

                <div className="mt-8 border-t border-line pt-6">
                  <div className="flex items-center gap-2">
                    <ListTree size={14} className="text-muted" />
                    <h2 className="text-[13px] font-semibold">Sub-issues</h2>
                    <span className="text-[11px] text-faint">{detail.subIssues.length}</span>
                    {detail.subIssues.length > 0 && (
                      <span className="ml-auto text-[11px] tabular-nums text-muted">
                        {detail.subIssues.filter((child) => child.status.category === 'completed').length}{' '}
                        of {detail.subIssues.length} done
                      </span>
                    )}
                  </div>

                  <div className="mt-3 ml-2 overflow-hidden rounded-xl border border-line bg-paper">
                    {detail.subIssues.length === 0 && (
                      <p className="px-3 py-3 text-[12px] text-muted">
                        Break this issue into smaller pieces when it helps.
                      </p>
                    )}
                    {detail.subIssues.map((child) => (
                      <Link
                        key={child.id}
                        to="/app/$workspaceSlug/tasks/$issueKey"
                        params={{ workspaceSlug: params.workspaceSlug, issueKey: child.key }}
                        className="flex items-center gap-2 border-b border-line-soft py-2.5 pr-3 pl-5 transition-colors duration-150 last:border-b-0 hover:bg-canvas"
                      >
                        <TaskStatusIcon status={child.status} size={15} />
                        <span className="w-[52px] shrink-0 font-mono text-[10px] text-faint">
                          {child.key}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                          {child.title}
                        </span>
                        {child.assignee ? (
                          <Avatar
                            name={child.assignee.name}
                            color={child.assignee.avatarColor}
                            size="xs"
                          />
                        ) : (
                          <span className="size-6 rounded-full border border-dashed border-line" />
                        )}
                      </Link>
                    ))}
                  </div>

                  <div className="mt-2 ml-2 flex items-center gap-2">
                    <input
                      value={subIssueTitle}
                      onChange={(event) => setSubIssueTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void createSubIssue();
                        }
                      }}
                      placeholder="Add a sub-issue and press Enter"
                      maxLength={200}
                      aria-label="Sub-issue title"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() => void createSubIssue()}
                      disabled={!subIssueTitle.trim() || addingSubIssue}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-9"
                    >
                      {addingSubIssue ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-10 border-t border-line pt-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[13px] font-semibold">Activity</h2>
                    <span className="text-[11px] text-faint">{detail.comments.length}</span>
                  </div>

                  <div className="mt-5 space-y-5">
                    {detail.comments.length === 0 && (
                      <p className="text-[13px] text-muted">
                        No comments yet. Start the thread below.
                      </p>
                    )}
                    {detail.comments.map((entry) => (
                      <div key={entry.id} className="flex gap-3 pl-2">
                        <Avatar
                          name={entry.author.name}
                          color={entry.author.avatarColor}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-semibold">{entry.author.name}</span>
                            <span className="text-[11px] text-faint">
                              {relativeTime(entry.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                            {entry.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-xl border border-line bg-paper p-3">
                    <div className="flex gap-2">
                      <Avatar
                        name={snapshot.me.name}
                        color={snapshot.me.avatarColor}
                        size="sm"
                        online
                      />
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                            event.preventDefault();
                            void submitComment();
                          }
                        }}
                        rows={3}
                        placeholder="Leave a comment"
                        aria-label="Leave a comment"
                        className="min-h-[72px] flex-1 resize-y bg-transparent text-[16px] leading-5 outline-none placeholder:text-faint sm:text-[13px]"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
                      <span className="text-[11px] text-faint">
                        <kbd className="task-kbd">⌘↵</kbd> to send
                      </span>
                      <button
                        type="button"
                        onClick={() => void submitComment()}
                        disabled={!comment.trim() || sending}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-8"
                      >
                        {sending ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              <aside className="hidden h-fit lg:sticky lg:top-8 lg:block">
                <IssueProperties
                    issue={issue}
                    snapshot={snapshot}
                    patchIssue={patchIssue}
                    onLabelCreated={addLabelToIssue}
                  />

                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-paper text-[12px] font-medium text-muted transition-colors duration-150 hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
                >
                  <Trash2 size={14} /> Delete issue
                </button>
              </aside>
            </div>
          </div>
        </div>
      </main>

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
            className="h-10 rounded-lg px-4 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void removeIssue()}
            disabled={deleting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger px-4 text-[13px] font-semibold text-white transition-[background-color,opacity] duration-150 hover:bg-danger/90 disabled:opacity-50"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            Delete issue
          </button>
        </div>
      </Modal>
    </div>
  );
}

function IssueProperties({
  issue,
  snapshot,
  patchIssue,
  onLabelCreated,
}: {
  issue: TaskIssue;
  snapshot: TasksSnapshot;
  patchIssue: (patch: IssuePatch) => Promise<boolean>;
  onLabelCreated: (label: TaskLabel) => void;
}) {
  const checklist = taskProgress(issue.description);
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Properties</h2>
        <span className="font-mono text-[10px] text-faint">{issue.key}</span>
      </div>

      <div className="mt-4 space-y-4">
        <PropertyField label="Status">
          <PropertySelect
            value={issue.status.id}
            options={snapshot.statuses.map((status) => ({
              value: status.id,
              label: status.name,
              icon: <TaskStatusIcon status={status} size={15} />,
            }))}
            onChange={(value) => void patchIssue({ statusId: value })}
            ariaLabel="Status"
          />
        </PropertyField>

        <PropertyField label="Priority">
          <PropertySelect
            value={String(issue.priority)}
            options={[0, 1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: PRIORITY_META[value as TaskPriority].label,
              icon: <TaskPriorityIcon priority={value as TaskPriority} size={15} />,
            }))}
            onChange={(value) => void patchIssue({ priority: Number(value) as TaskPriority })}
            ariaLabel="Priority"
          />
        </PropertyField>

        <PropertyField label="Assignee">
          <PropertySelect
            value={issue.assignee?.id ?? ''}
            options={[
              { value: '', label: 'Unassigned', icon: <span className="size-5 rounded-full border border-dashed border-line" /> },
              ...snapshot.members.map((member) => ({
                value: member.id,
                label: member.name,
                icon: <Avatar name={member.name} color={member.avatarColor} size="2xs" />,
              })),
            ]}
            onChange={(value) => void patchIssue({ assigneeId: value || null })}
            ariaLabel="Assignee"
          />
        </PropertyField>

        <div>
          <p className="text-[12px] font-medium text-muted">Project</p>
          <div className="mt-2 flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-[13px] font-medium text-ink-soft">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: issue.project.color }}
            />
            <span className="truncate">{issue.project.name}</span>
            <span className="ml-auto font-mono text-[10px] text-faint">
              {issue.project.key}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-muted">Dates</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-faint">Start</span>
              <input
                type="date"
                value={issue.startDate ?? ''}
                onChange={(event) =>
                  void patchIssue({ startDate: event.target.value || null })
                }
                aria-label="Start date"
                className="h-10 min-w-0 w-full rounded-lg border border-line bg-paper px-2 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[12px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-faint">Due</span>
              <input
                type="date"
                value={issue.dueDate ?? ''}
                onChange={(event) => void patchIssue({ dueDate: event.target.value || null })}
                aria-label="Due date"
                className="h-10 min-w-0 w-full rounded-lg border border-line bg-paper px-2 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[12px]"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-muted">Labels</p>
          <div className="mt-2">
            <LabelPicker
              labels={snapshot.labels}
              selectedIds={issue.labels.map((label) => label.id)}
              slug={snapshot.workspace.slug}
              issueId={issue.id}
              onToggle={(labelId) => {
                const active = issue.labels.some((item) => item.id === labelId);
                const next = active
                  ? issue.labels.filter((item) => item.id !== labelId).map((item) => item.id)
                  : [...issue.labels.map((item) => item.id), labelId];
                void patchIssue({ labelIds: next });
              }}
              onCreated={(label) => onLabelCreated(label)}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2 border-t border-line-soft pt-4 text-[12px]">
        <MetaRow label="Created" value={relativeTime(issue.createdAt)} />
        <MetaRow label="Updated" value={relativeTime(issue.updatedAt)} />
        <MetaRow label="Comments" value={String(issue.commentCount)} />
        {checklist.total > 0 && (
          <MetaRow label="Checklist" value={`${checklist.done} of ${checklist.total}`} />
        )}
        {issue.subIssueCount > 0 && (
          <MetaRow label="Sub-issues" value={`${issue.subIssueDone} of ${issue.subIssueCount}`} />
        )}
      </div>
    </div>
  );
}

function PropertyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-ink-soft">{value}</span>
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
