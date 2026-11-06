import { useNavigate, useRouter } from '@tanstack/react-router';
import { AlertCircle, ChevronRight, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  closeNewIssue,
  openNewIssue,
  useNewIssueState,
  type NewIssueDefaults,
} from '../lib/new-issue-store';
import { createIssueFn } from '../lib/tasks';
import type { TaskPriority, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import {
  assigneeOptions,
  DateSelect,
  LabelSelect,
  priorityOptions,
  projectOptions,
  teamOptions,
  statusOptions,
} from './issue-fields';
import { MarkdownEditor } from './markdown-editor';
import { PropertySelect } from './property-select';

/**
 * The Linear-style issue composer: team › New issue, title, description, a row of property
 * chips, then "Create more" and "Create issue". Rendered as a modal over any task screen, and as
 * the body of /tasks/new for direct links.
 */
export function IssueComposer({
  snapshot,
  defaults,
  mode,
  onClose,
  onCreated,
}: {
  snapshot: TasksSnapshot;
  defaults: NewIssueDefaults;
  mode: 'modal' | 'page';
  onClose: () => void;
  onCreated: (key: string, createMore: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // The editor keeps its own document; a new key resets it after "Create more".
  const [editorKey, setEditorKey] = useState(0);
  const [teamId, setTeamId] = useState(
    snapshot.teams.find((team) => team.id === defaults.teamId)?.id ??
      snapshot.teams[0]?.id ??
      '',
  );
  const [statusId, setStatusId] = useState(
    snapshot.statuses.find((status) => status.id === defaults.statusId)?.id ??
      snapshot.statuses.find((status) => status.category === 'unstarted')?.id ??
      snapshot.statuses[0]?.id ??
      '',
  );
  const [projectId, setProjectId] = useState(
    snapshot.projects.find((project) => project.id === defaults.projectId)?.id ?? '',
  );
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [assigneeId, setAssigneeId] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function submit() {
    if (saving) return;
    if (!title.trim()) {
      setError('Give the issue a title.');
      titleRef.current?.focus();
      return;
    }
    if (!teamId) {
      setError('Pick a team for this issue.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { key } = await createIssueFn({
        data: {
          slug: snapshot.workspace.slug,
          teamId,
          projectId: projectId || null,
          title: title.trim(),
          description,
          statusId: statusId || undefined,
          priority,
          assigneeId: assigneeId || null,
          labelIds,
          dueDate,
        },
      });
      if (createMore) {
        setTitle('');
        setDescription('');
        setEditorKey((current) => current + 1);
        titleRef.current?.focus();
      }
      onCreated(key, createMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the issue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      role={mode === 'modal' ? 'dialog' : undefined}
      aria-modal={mode === 'modal' ? true : undefined}
      aria-label="New issue"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void submit();
        } else if (event.key === 'Escape' && mode === 'modal') {
          event.preventDefault();
          onClose();
        }
      }}
      className="flex w-full flex-col rounded-t-xl border border-line/80 bg-paper shadow-[var(--kora-shadow-popover)] sm:rounded-xl"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-3">
        <PropertySelect
          variant="chip"
          value={teamId}
          options={teamOptions(snapshot)}
          onChange={setTeamId}
          ariaLabel="Team"
          searchPlaceholder="Move to team…"
          className="[&>button]:max-w-[160px]"
        />
        <ChevronRight size={14} className="shrink-0 text-faint" />
        <span className="truncate text-[13px] text-muted">New issue</span>
        {mode === 'modal' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </header>

      <div className="px-4">
        <textarea
          ref={titleRef}
          value={title}
          rows={1}
          onChange={(event) => {
            setTitle(event.target.value.replace(/\n/g, ' '));
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            // Enter moves to the description, like Linear; Cmd+Enter is handled by the form.
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              (event.currentTarget.form?.querySelector('.tiptap') as HTMLElement | null)?.focus();
            }
          }}
          placeholder="Issue title"
          maxLength={200}
          aria-label="Issue title"
          aria-invalid={Boolean(error)}
          className="field-sizing-content block max-h-40 w-full resize-none border-0 bg-transparent p-0 py-1 text-[20px] leading-7 font-semibold tracking-[-0.015em] text-ink outline-none placeholder:text-faint"
        />
        <div className="mt-2">
          <MarkdownEditor
            key={editorKey}
            variant="bare"
            minHeight={mode === 'modal' ? 96 : 200}
            value={description}
            onChange={setDescription}
            placeholder="Add description…"
            ariaLabel="Issue description"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-4">
        <PropertySelect
          variant="chip"
          value={statusId}
          options={statusOptions(snapshot)}
          onChange={setStatusId}
          ariaLabel="Status"
          searchPlaceholder="Change status…"
          numbered
        />
        <PropertySelect
          variant="chip"
          value={String(priority)}
          options={priorityOptions()}
          onChange={(value) => setPriority(Number(value) as TaskPriority)}
          ariaLabel="Priority"
          placeholder="Priority"
          unsetValue="0"
          searchPlaceholder="Set priority…"
          numbered
        />
        <PropertySelect
          variant="chip"
          value={assigneeId}
          options={assigneeOptions(snapshot)}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Assignee"
          unsetValue=""
          searchPlaceholder="Assign to…"
        />
        <PropertySelect
          variant="chip"
          value={projectId}
          options={projectOptions(snapshot)}
          onChange={setProjectId}
          ariaLabel="Project"
          placeholder="Project"
          unsetValue=""
          searchPlaceholder="Add to project…"
        />
        <LabelSelect
          variant="chip"
          labels={snapshot.labels}
          selectedIds={labelIds}
          onChange={setLabelIds}
          onCreated={() => router.invalidate()}
          slug={snapshot.workspace.slug}
        />
        <DateSelect
          variant="chip"
          value={dueDate}
          onChange={setDueDate}
          label="Due date"
          placeholder="Due date"
          prefix="Due"
        />
      </div>

      <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t border-line-soft px-4 py-3">
        {error && (
          <p role="alert" className="flex min-w-0 items-center gap-1.5 text-[13px] text-danger">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">{error}</span>
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {mode === 'modal' && (
            <button
              type="button"
              role="switch"
              aria-checked={createMore}
              onClick={() => setCreateMore((current) => !current)}
              className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted transition-colors duration-100 select-none hover:bg-ink/[0.045] hover:text-ink"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-150',
                  createMore ? 'bg-ink' : 'bg-line',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-3 rounded-full bg-paper shadow-sm transition-transform duration-150',
                    createMore && 'translate-x-3',
                  )}
                />
              </span>
              Create more
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            title="Create issue (⌘↵)"
            className="inline-flex h-8 min-w-[112px] items-center justify-center gap-1.5 rounded-md bg-coral px-3 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-coral-deep active:scale-[0.97] disabled:opacity-70"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create issue
          </button>
        </div>
      </footer>
    </form>
  );
}

/** Linear's C: opens the composer from anywhere on the page, unless you are typing. */
export function useNewIssueShortcut(defaults: () => NewIssueDefaults) {
  const latest = useRef(defaults);
  latest.current = defaults;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'c' && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        openNewIssue(latest.current());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Mount once per task page. Opens from openNewIssue() anywhere on that page. */
export function NewIssueModal({ snapshot }: { snapshot: TasksSnapshot }) {
  const state = useNewIssueState();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state.open]);

  if (!state.open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 sm:items-start sm:px-6 sm:pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeNewIssue();
      }}
    >
      <div className="animate-pop w-full max-w-[680px]">
        <IssueComposer
          key={state.opens}
          snapshot={snapshot}
          defaults={state.defaults}
          mode="modal"
          onClose={closeNewIssue}
          onCreated={(key, createMore) => {
            if (!createMore) closeNewIssue();
            void router.invalidate();
            toast.success(`${key} created`, {
              action: {
                label: 'View issue',
                onClick: () =>
                  void navigate({
                    to: '/app/$workspaceSlug/tasks/$issueKey',
                    params: { workspaceSlug: snapshot.workspace.slug, issueKey: key },
                  }),
              },
            });
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
