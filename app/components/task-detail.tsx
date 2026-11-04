import { Loader2, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  TaskComment,
  TaskIssueDetail,
  TaskLabel,
  TaskPriority,
  TaskStatus,
  UserSummary,
} from '../lib/types';
import { relativeTime } from '../lib/format';
import { Avatar } from './avatar';
import {
  STATUS_META,
  STATUS_ORDER,
  TaskLabelPill,
  TaskPriorityIcon,
  TaskStatusIcon,
} from './task-icons';
import { cn } from '../utils/cn';

export function TaskDetailPanel({
  detail,
  loading,
  me,
  members,
  labels,
  onClose,
  onUpdate,
  onDelete,
  onComment,
}: {
  detail: TaskIssueDetail | null;
  loading: boolean;
  me: UserSummary;
  members: UserSummary[];
  labels: TaskLabel[];
  onClose: () => void;
  onUpdate: (patch: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    labelIds?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onComment: (body: string) => Promise<void>;
}) {
  const issue = detail?.issue ?? null;
  const [title, setTitle] = useState(issue?.title ?? '');
  const [description, setDescription] = useState(issue?.description ?? '');
  const [titleFocused, setTitleFocused] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!issue) return;
    if (!titleFocused) setTitle(issue.title);
    if (!descriptionFocused) setDescription(issue.description);
  }, [issue, titleFocused, descriptionFocused]);

  async function saveTitle() {
    if (!issue) return;
    const next = title.trim();
    if (!next || next === issue.title) {
      setTitle(issue.title);
      return;
    }
    await onUpdate({ title: next });
  }

  async function saveDescription() {
    if (!issue) return;
    if (description !== issue.description) await onUpdate({ description });
  }

  async function submitComment() {
    if (!comment.trim() || sending) return;
    setSending(true);
    try {
      await onComment(comment.trim());
      setComment('');
    } finally {
      setSending(false);
    }
  }

  if (!issue) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-line bg-paper xl:w-[400px]">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <span className="text-[12px] font-semibold text-muted">Issue</span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-line-soft hover:text-ink xl:hidden"
            aria-label="Close issue"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
          {loading ? (
            <Loader2 size={20} className="animate-spin text-faint" />
          ) : (
            <>
              <img
                src="/tasks-cover.png"
                alt=""
                className="w-full max-w-[300px] rounded-2xl outline outline-1 -outline-offset-1 outline-black/10"
              />
              <p className="mt-5 text-sm font-semibold">Pick an issue to open it</p>
              <p className="mt-1 max-w-[240px] text-xs leading-5 text-muted">
                Or press <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[9px]">C</kbd>{' '}
                to capture something new.
              </p>
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-paper xl:w-[400px]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="size-2 rounded-full" style={{ background: issue.project.color }} />
        <span className="font-mono text-[10px] text-faint">{issue.key}</span>
        <span className="truncate text-[11px] text-muted">{issue.project.name}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this issue?')) void onDelete();
            }}
            className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-danger/10 hover:text-danger active:scale-[0.96]"
            aria-label="Delete issue"
            title="Delete issue"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-line-soft hover:text-ink"
            aria-label="Close issue"
          >
            <X size={16} />
          </button>
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-5">
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => {
              setTitleFocused(false);
              void saveTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="w-full border-0 bg-transparent p-0 text-[20px] leading-7 font-semibold tracking-[-0.02em] outline-none"
            aria-label="Issue title"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onFocus={() => setDescriptionFocused(true)}
            onBlur={() => {
              setDescriptionFocused(false);
              void saveDescription();
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            placeholder="Add a description..."
            rows={4}
            className="mt-3 min-h-[88px] w-full resize-none rounded-xl border border-line/80 bg-canvas px-3 py-2.5 text-[12.5px] leading-5 outline-none transition focus:border-ink/30"
            aria-label="Issue description"
          />

          <div className="mt-4 space-y-1.5">
            <PropertyRow
              icon={<TaskStatusIcon status={issue.status} />}
              label="Status"
              value={
                <select
                  value={issue.status}
                  onChange={(event) => void onUpdate({ status: event.target.value as TaskStatus })}
                  className="h-8 flex-1 bg-transparent text-[12px] font-medium outline-none"
                  aria-label="Status"
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              }
            />
            <PropertyRow
              icon={<TaskPriorityIcon priority={issue.priority} />}
              label="Priority"
              value={
                <select
                  value={issue.priority}
                  onChange={(event) =>
                    void onUpdate({ priority: Number(event.target.value) as TaskPriority })
                  }
                  className="h-8 flex-1 bg-transparent text-[12px] font-medium outline-none"
                  aria-label="Priority"
                >
                  {[0, 1, 2, 3, 4].map((priority) => (
                    <option key={priority} value={priority}>
                      {['No priority', 'Urgent', 'High', 'Medium', 'Low'][priority]}
                    </option>
                  ))}
                </select>
              }
            />
            <PropertyRow
              icon={
                issue.assignee ? (
                  <Avatar
                    name={issue.assignee.name}
                    color={issue.assignee.avatarColor}
                    size="xs"
                  />
                ) : (
                  <span className="size-4 rounded-full border border-dashed border-faint" />
                )
              }
              label="Assignee"
              value={
                <select
                  value={issue.assignee?.id ?? ''}
                  onChange={(event) => void onUpdate({ assigneeId: event.target.value || null })}
                  className="h-8 flex-1 bg-transparent text-[12px] font-medium outline-none"
                  aria-label="Assignee"
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              }
            />
            <PropertyRow
              icon={<MessageSquare size={13} className="text-muted" />}
              label="Comments"
              value={<span className="text-[12px] font-medium">{detail?.comments.length ?? 0}</span>}
            />
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-faint uppercase">Labels</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {labels.map((label) => {
                const active = issue.labels.some((item) => item.id === label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() =>
                      void onUpdate({
                        labelIds: active
                          ? issue.labels.filter((item) => item.id !== label.id).map((item) => item.id)
                          : [...issue.labels.map((item) => item.id), label.id],
                      })
                    }
                    className={cn(
                      'rounded-full border transition-colors duration-100',
                      active ? 'border-ink/25 bg-canvas' : 'border-line hover:border-ink/20',
                    )}
                  >
                    <TaskLabelPill label={label} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-line-soft px-5 pt-5 pb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-semibold">Comments</h3>
            <span className="text-[10px] text-faint">{detail?.comments.length ?? 0}</span>
          </div>
          <div className="mt-4 space-y-4">
            {detail?.comments.length === 0 && (
              <p className="text-[12px] text-muted">No comments yet. Start the thread.</p>
            )}
            {detail?.comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="rounded-xl border border-line bg-canvas px-2.5 py-2 focus-within:border-ink/25">
          <div className="flex gap-2">
            <Avatar name={me.name} color={me.avatarColor} size="xs" online />
            <textarea
              ref={commentRef}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submitComment();
                }
              }}
              rows={1}
              placeholder="Leave a comment..."
              className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-[12px] leading-5 outline-none placeholder:text-faint"
              aria-label="Leave a comment"
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[9px] text-faint">
              <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[8px]">
                Enter
              </kbd>{' '}
              to send
            </span>
            <button
              type="button"
              onClick={() => void submitComment()}
              disabled={!comment.trim() || sending}
              className="grid size-7 place-items-center rounded-lg bg-ink text-paper disabled:opacity-30"
              aria-label="Send comment"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PropertyRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-canvas">
      <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
      <span className="w-[72px] shrink-0 text-[11px] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center">{value}</span>
    </div>
  );
}

function CommentRow({ comment }: { comment: TaskComment }) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author.name} color={comment.author.avatarColor} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold">{comment.author.name}</span>
          <span className="text-[9px] text-faint">{relativeTime(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-5 text-ink-soft">{comment.body}</p>
      </div>
    </div>
  );
}
