import {
  ArrowDown,
  ArrowUp,
  Columns3,
  CornerDownLeft,
  Layers,
  Loader2,
  Map,
  MessageSquare,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createIssueFn } from '../lib/tasks';
import type { TaskPriority, TaskStatus, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import { Modal } from './modal';
import { STATUS_META, STATUS_ORDER, TaskLabelPill, TaskPriorityIcon, TaskStatusIcon } from './task-icons';

export function NewIssueDialog({
  open,
  onClose,
  snapshot,
  initialStatus = 'todo',
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
  initialStatus?: TaskStatus;
  onCreated: (issueId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(snapshot.projects[0]?.id ?? '');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [assigneeId, setAssigneeId] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setProjectId(snapshot.projects[0]?.id ?? '');
    setStatus(initialStatus);
    setPriority(0);
    setAssigneeId('');
    setLabelIds([]);
    setSaving(false);
    requestAnimationFrame(() => titleRef.current?.focus());
    // The parent replaces snapshot on every poll; only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStatus]);

  async function submit() {
    if (!title.trim() || !projectId || saving) return;
    setSaving(true);
    try {
      const { issueId } = await createIssueFn({
        data: {
          slug: snapshot.workspace.slug,
          projectId,
          title,
          description,
          status,
          priority,
          assigneeId: assigneeId || null,
          labelIds,
        },
      });
      toast.success('Issue created.');
      onClose();
      onCreated(issueId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the issue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="New issue"
      description="Capture the work now, refine it later."
    >
      <div
        className="space-y-4"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Issue title"
          maxLength={200}
          className="h-12 w-full rounded-xl border border-line bg-canvas px-3.5 text-[15px] font-medium outline-none transition focus:border-ink/30"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a description, context, or a link..."
          rows={4}
          maxLength={8000}
          className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13px] leading-5 outline-none transition focus:border-ink/30"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
              Project
            </span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[12px] outline-none"
            >
              {snapshot.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              className="h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[12px] outline-none"
            >
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
              Priority
            </span>
            <select
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value) as TaskPriority)}
              className="h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[12px] outline-none"
            >
              {[0, 1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {['No priority', 'Urgent', 'High', 'Medium', 'Low'][value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
              Assignee
            </span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[12px] outline-none"
            >
              <option value="">Unassigned</option>
              {snapshot.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="mb-2 block text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
            Labels
          </span>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.labels.map((label) => {
              const active = labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() =>
                    setLabelIds((current) =>
                      active ? current.filter((id) => id !== label.id) : [...current, label.id],
                    )
                  }
                  className={cn(
                    'rounded-full border transition-colors duration-100',
                    active ? 'border-ink/30 bg-canvas' : 'border-line hover:border-ink/20',
                  )}
                >
                  <TaskLabelPill label={label} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-[10px] text-faint">
            <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[9px]">⌘↵</kbd>{' '}
            to create
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg px-3 text-[12px] font-medium text-muted hover:bg-line-soft"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!title.trim() || !projectId || saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-coral px-3.5 text-[12px] font-semibold text-white transition hover:bg-coral-deep disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create issue
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

type CommandAction = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Plus;
  run: () => void;
};

export function TaskCommandMenu({
  open,
  onClose,
  snapshot,
  onNewIssue,
  onView,
  onProject,
  onChat,
  onStudio,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
  onNewIssue: () => void;
  onView: (view: 'all' | 'mine' | 'board') => void;
  onProject: (projectId: string) => void;
  onChat: () => void;
  onStudio: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const actions: CommandAction[] = [
    { id: 'new', label: 'New issue', hint: 'C', icon: Plus, run: onNewIssue },
    { id: 'all', label: 'Go to All issues', icon: Layers, run: () => onView('all') },
    { id: 'mine', label: 'Go to My issues', icon: UserRound, run: () => onView('mine') },
    { id: 'board', label: 'Go to Board', icon: Columns3, run: () => onView('board') },
    ...snapshot.projects.map((project) => ({
      id: `project-${project.id}`,
      label: `Go to ${project.name}`,
      hint: project.key,
      icon: Layers,
      run: () => onProject(project.id),
    })),
    { id: 'chat', label: 'Go to Chat', icon: MessageSquare, run: onChat },
    { id: 'studio', label: 'Go to Studio', icon: Map, run: onStudio },
  ];
  const filtered = actions.filter((action) =>
    action.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 px-4 pt-[14vh] backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
    >
      <div className="animate-pop w-full max-w-xl overflow-hidden rounded-[20px] border border-line/70 bg-paper shadow-[var(--kora-shadow-popover)]">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter' && filtered[active]) {
                event.preventDefault();
                filtered[active].run();
                onClose();
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Type a command or search..."
            className="h-13 flex-1 bg-transparent py-4 text-[14px] outline-none"
          />
          <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[9px] text-faint">
            esc
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-muted">No commands match.</p>
          )}
          {filtered.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] transition-colors duration-100',
                  index === active ? 'bg-canvas text-ink' : 'text-ink-soft hover:bg-canvas/70',
                )}
              >
                <Icon size={15} className="text-muted" />
                <span className="flex-1">{action.label}</span>
                {action.hint && <span className="font-mono text-[9px] text-faint">{action.hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1">
            <ArrowUp size={11} />
            <ArrowDown size={11} /> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={11} /> open
          </span>
          <span className="ml-auto">Kora Tasks</span>
        </div>
      </div>
    </div>
  );
}

export function PriorityMenuIcon({ priority }: { priority: TaskPriority }) {
  return <TaskPriorityIcon priority={priority} />;
}

export function StatusMenuIcon({ status }: { status: TaskStatus }) {
  return <TaskStatusIcon status={status} />;
}
