import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  createTaskStatusFn,
  deleteTaskStatusFn,
  reorderTaskStatusesFn,
  updateTaskStatusFn,
} from '../lib/tasks';
import {
  TASK_STATUS_CATEGORIES,
  TASK_STATUS_CATEGORY_LABELS,
  TASK_STATUS_COLORS,
} from '../lib/task-config';
import type { TaskStatus, TaskStatusCategory, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import { Modal } from './modal';
import { TaskStatusIcon } from './task-icons';

export function StatusManagerDialog({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
}) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<TaskStatusCategory>('unstarted');
  const [newColor, setNewColor] = useState<string>(TASK_STATUS_COLORS[1]);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskStatus | null>(null);
  const [moveToId, setMoveToId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNames((current) => {
      const next: Record<string, string> = {};
      for (const status of snapshot.statuses) {
        next[status.id] =
          focusedId === status.id ? current[status.id] ?? status.name : status.name;
      }
      return next;
    });
  }, [snapshot.statuses, focusedId]);

  useEffect(() => {
    if (deleteTarget) listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [deleteTarget]);

  useEffect(() => {
    if (!open) {
      setFocusedId(null);
      setDeleteTarget(null);
      setMoveToId('');
      setNewName('');
      setNewCategory('unstarted');
      setNewColor(TASK_STATUS_COLORS[1]);
    }
  }, [open]);

  async function saveName(status: TaskStatus) {
    const next = (names[status.id] ?? status.name).trim();
    if (!next || next === status.name) {
      setNames((current) => ({ ...current, [status.id]: status.name }));
      return;
    }
    setBusyId(status.id);
    try {
      await updateTaskStatusFn({ data: { statusId: status.id, name: next } });
      await router.invalidate();
      toast.success('Status renamed.');
    } catch (error) {
      setNames((current) => ({ ...current, [status.id]: status.name }));
      toast.error(error instanceof Error ? error.message : 'Could not rename the status.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(
    status: TaskStatus,
    patch: { category?: TaskStatusCategory; color?: string },
  ) {
    setBusyId(status.id);
    try {
      await updateTaskStatusFn({ data: { statusId: status.id, ...patch } });
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the status.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(status: TaskStatus, direction: -1 | 1) {
    const index = snapshot.statuses.findIndex((item) => item.id === status.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= snapshot.statuses.length) return;
    const ordered = [...snapshot.statuses];
    const [item] = ordered.splice(index, 1);
    if (!item) return;
    ordered.splice(nextIndex, 0, item);
    setBusyId(status.id);
    try {
      await reorderTaskStatusesFn({
        data: { slug: snapshot.workspace.slug, statusIds: ordered.map((entry) => entry.id) },
      });
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reorder the workflow.');
    } finally {
      setBusyId(null);
    }
  }

  async function addStatus() {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await createTaskStatusFn({
        data: {
          slug: snapshot.workspace.slug,
          name,
          category: newCategory,
          color: newColor,
        },
      });
      setNewName('');
      setNewCategory('unstarted');
      await router.invalidate();
      toast.success('Status added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the status.');
    } finally {
      setAdding(false);
    }
  }

  async function removeStatus() {
    if (!deleteTarget || deleting) return;
    const count = snapshot.counts.byStatus[deleteTarget.id] ?? 0;
    if (count > 0 && !moveToId) {
      toast.error('Choose where the existing issues should go.');
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteTaskStatusFn({
        data: {
          statusId: deleteTarget.id,
          moveToStatusId: count > 0 ? moveToId : undefined,
        },
      });
      setDeleteTarget(null);
      setMoveToId('');
      await router.invalidate();
      toast.success(
        result.moved > 0
          ? `Status removed and ${result.moved} ${result.moved === 1 ? 'issue' : 'issues'} moved.`
          : 'Status removed.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the status.');
    } finally {
      setDeleting(false);
    }
  }

  const deleteCount = deleteTarget ? snapshot.counts.byStatus[deleteTarget.id] ?? 0 : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      className="max-h-[calc(100dvh-16px)] overflow-y-auto"
      title="Workflow statuses"
      description="Name the stages your team moves through. The category sets the icon and how a status behaves."
    >
      <div className="max-h-[44dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[64vh]" ref={listRef}>
        {deleteTarget && (
          <div className="rounded-xl border border-danger/25 bg-danger/5 p-3">
            <p className="text-[13px] font-medium text-ink">
              Remove {deleteTarget.name}?
            </p>
            {deleteCount > 0 ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-[12px] leading-5 text-muted">
                  {deleteCount} {deleteCount === 1 ? 'issue is' : 'issues are'} using it. Move them to
                </p>
                <div className="relative w-full sm:w-[190px]">
                  <select
                    value={moveToId}
                    onChange={(event) => setMoveToId(event.target.value)}
                    aria-label="Move existing issues to"
                    data-audit-skip="S1"
                    className="h-10 w-full appearance-none rounded-lg border border-line bg-paper px-3 pr-7 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                  >
                    <option value="">Choose a status</option>
                    {snapshot.statuses
                      .filter((status) => status.id !== deleteTarget.id)
                      .map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-muted">This status is not used by any issue.</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void removeStatus()}
                disabled={deleting || (deleteCount > 0 && !moveToId)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger px-3 text-[12px] font-semibold text-white transition-[background-color,opacity] duration-150 hover:bg-danger/90 disabled:opacity-40 sm:h-9"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Remove status
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setMoveToId('');
                }}
                className="h-9 rounded-lg px-3 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {snapshot.statuses.map((status, index) => {
          const count = snapshot.counts.byStatus[status.id] ?? 0;
          return (
            <div
              key={status.id}
              className="rounded-xl border border-line bg-canvas/55 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void move(status, -1)}
                    disabled={index === 0 || busyId !== null}
                    className="grid size-9 place-items-center rounded-lg text-faint transition-colors duration-150 hover:bg-paper hover:text-ink disabled:opacity-30"
                    aria-label={`Move ${status.name} up`}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(status, 1)}
                    disabled={index === snapshot.statuses.length - 1 || busyId !== null}
                    className="grid size-9 place-items-center rounded-lg text-faint transition-colors duration-150 hover:bg-paper hover:text-ink disabled:opacity-30"
                    aria-label={`Move ${status.name} down`}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>

                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-paper">
                  <TaskStatusIcon status={status} size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <input
                    value={names[status.id] ?? status.name}
                    onFocus={() => setFocusedId(status.id)}
                    onChange={(event) =>
                      setNames((current) => ({ ...current, [status.id]: event.target.value }))
                    }
                    onBlur={() => {
                      setFocusedId(null);
                      void saveName(status);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    aria-label={`Name for ${status.name}`}
                    maxLength={32}
                    className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                  />
                </div>

                <span className="hidden w-16 text-right text-[11px] text-faint sm:block">
                  {count} {count === 1 ? 'issue' : 'issues'}
                </span>

                <div className="relative hidden w-[142px] sm:block">
                  <select
                    value={status.category}
                    onChange={(event) =>
                      void updateStatus(status, {
                        category: event.target.value as TaskStatusCategory,
                      })
                    }
                    aria-label={`Category for ${status.name}`}
                    data-audit-skip="S1"
                    className="h-10 w-full appearance-none rounded-lg border border-line bg-paper px-3 pr-7 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                  >
                    {TASK_STATUS_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {TASK_STATUS_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(status);
                    setMoveToId('');
                  }}
                  disabled={snapshot.statuses.length <= 1}
                  className="grid size-9 place-items-center rounded-lg text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  aria-label={`Delete ${status.name}`}
                >
                  {busyId === status.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 pl-0 sm:pl-[124px]">
                <div data-audit-skip="B1" className="flex items-center gap-2">
                  {TASK_STATUS_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => void updateStatus(status, { color })}
                      className={cn(
                        'size-6 rounded-md transition-[box-shadow,transform] duration-150',
                        status.color.toLowerCase() === color.toLowerCase()
                          ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-canvas'
                          : 'hover:scale-105',
                      )}
                      style={{ background: color }}
                      aria-label={`Use ${color} for ${status.name}`}
                      aria-pressed={status.color.toLowerCase() === color.toLowerCase()}
                    />
                  ))}
                </div>
                <div className="relative mt-2 w-[150px] sm:hidden">
                  <select
                    value={status.category}
                    onChange={(event) =>
                      void updateStatus(status, {
                        category: event.target.value as TaskStatusCategory,
                      })
                    }
                    aria-label={`Category for ${status.name}`}
                    data-audit-skip="S1"
                    className="h-10 w-full appearance-none rounded-lg border border-line bg-paper px-3 pr-7 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                  >
                    {TASK_STATUS_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {TASK_STATUS_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
                  />
                </div>
              </div>
            </div>
          );
        })}

      </div>

      <div className="mt-4 rounded-xl border border-line bg-canvas/55 p-3">
        <p className="text-[13px] font-semibold">Add a status</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addStatus();
              }
            }}
            placeholder="Status name"
            maxLength={32}
            className="h-10 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
            aria-label="New status name"
          />
          <div className="relative">
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as TaskStatusCategory)}
              aria-label="New status category"
              data-audit-skip="S1"
              className="h-10 w-full appearance-none rounded-lg border border-line bg-paper px-3 pr-7 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
            >
              {TASK_STATUS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {TASK_STATUS_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
            />
          </div>
          <button
            type="button"
            onClick={() => void addStatus()}
            disabled={!newName.trim() || adding}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[12px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-9 sm:w-auto"
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add status
          </button>
        </div>
        <div data-audit-skip="B1" className="mt-3 flex items-center gap-3">
          <span className="text-[12px] text-muted">Color</span>
          <div className="flex items-center gap-2">
            {TASK_STATUS_COLORS.slice(0, 6).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={cn(
                  'size-6 rounded-md transition-[box-shadow,transform] duration-150',
                  newColor === color
                    ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-canvas'
                    : 'hover:scale-105',
                )}
                style={{ background: color }}
                aria-label={`Use ${color}`}
                aria-pressed={newColor === color}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        <p className="text-[11px] text-faint">Changes save as you edit.</p>
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-lg bg-ink px-4 text-[12px] font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft sm:h-9"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
