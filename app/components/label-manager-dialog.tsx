import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { createLabelFn, deleteLabelFn, updateLabelFn } from '../lib/tasks';
import { TASK_LABEL_COLORS } from '../lib/task-config';
import type { TaskLabel, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import { Modal } from './modal';

export function LabelManagerDialog({
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
  const [newColor, setNewColor] = useState<string>(TASK_LABEL_COLORS[0]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setNames((current) => {
      const next: Record<string, string> = {};
      for (const label of snapshot.labels) {
        next[label.id] = focusedId === label.id ? current[label.id] ?? label.name : label.name;
      }
      return next;
    });
  }, [focusedId, snapshot.labels]);

  useEffect(() => {
    if (!open) {
      setFocusedId(null);
      setNewName('');
      setNewColor(TASK_LABEL_COLORS[0]);
    }
  }, [open]);

  function countFor(labelId: string) {
    return snapshot.issues.filter((issue) => issue.labels.some((label) => label.id === labelId))
      .length;
  }

  async function saveName(label: TaskLabel) {
    const next = (names[label.id] ?? label.name).trim();
    if (!next || next === label.name) {
      setNames((current) => ({ ...current, [label.id]: label.name }));
      return;
    }
    setBusyId(label.id);
    try {
      await updateLabelFn({ data: { labelId: label.id, name: next } });
      await router.invalidate();
    } catch (error) {
      setNames((current) => ({ ...current, [label.id]: label.name }));
      toast.error(error instanceof Error ? error.message : 'Could not rename the label.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateColor(label: TaskLabel, color: string) {
    setBusyId(label.id);
    try {
      await updateLabelFn({ data: { labelId: label.id, color } });
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the label.');
    } finally {
      setBusyId(null);
    }
  }

  async function addLabel() {
    const next = newName.trim();
    if (!next || adding) return;
    setAdding(true);
    try {
      const result = await createLabelFn({
        data: { slug: snapshot.workspace.slug, name: next },
      });
      if (result.created) {
        await updateLabelFn({ data: { labelId: result.label.id, color: newColor } });
      }
      setNewName('');
      await router.invalidate();
      toast.success(result.created ? 'Label added.' : 'That label already exists.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the label.');
    } finally {
      setAdding(false);
    }
  }

  async function removeLabel(label: TaskLabel) {
    const count = countFor(label.id);
    if (
      !window.confirm(
        count > 0
          ? `Remove ${label.name}? It will be removed from ${count} ${count === 1 ? 'issue' : 'issues'}.`
          : `Remove ${label.name}?`,
      )
    ) {
      return;
    }
    setBusyId(label.id);
    try {
      await deleteLabelFn({ data: { labelId: label.id } });
      await router.invalidate();
      toast.success('Label removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the label.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Labels"
      description="Group issues across teams with a shared workspace vocabulary."
    >
      <div className="space-y-2">
        {snapshot.labels.map((label) => {
          const count = countFor(label.id);
          return (
            <div key={label.id} className="rounded-xl border border-line bg-canvas/55 p-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: label.color }}
                />
                <input
                  value={names[label.id] ?? label.name}
                  onFocus={() => setFocusedId(label.id)}
                  onChange={(event) =>
                    setNames((current) => ({ ...current, [label.id]: event.target.value }))
                  }
                  onBlur={() => {
                    setFocusedId(null);
                    void saveName(label);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label={`Name for ${label.name}`}
                  maxLength={30}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-[16px] font-medium outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
                />
                <span className="hidden w-16 text-right text-[11px] text-faint sm:block">
                  {count} {count === 1 ? 'issue' : 'issues'}
                </span>
                <button
                  type="button"
                  onClick={() => void removeLabel(label)}
                  disabled={busyId !== null}
                  className="grid size-9 place-items-center rounded-lg text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  aria-label={`Delete ${label.name}`}
                >
                  {busyId === label.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                <div className="flex items-center gap-2">
                  {TASK_LABEL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => void updateColor(label, color)}
                      className={cn(
                        'size-6 rounded-md transition-[box-shadow,transform] duration-150',
                        label.color.toLowerCase() === color.toLowerCase()
                          ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-canvas'
                          : 'hover:scale-105',
                      )}
                      style={{ background: color }}
                      aria-label={`Use ${color} for ${label.name}`}
                      aria-pressed={label.color.toLowerCase() === color.toLowerCase()}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-canvas/55 p-3">
        <p className="text-[13px] font-semibold">Add a label</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addLabel();
              }
            }}
            placeholder="Label name"
            maxLength={30}
            aria-label="New label"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]"
          />
          <div className="flex items-center gap-2">
            {TASK_LABEL_COLORS.map((color) => (
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
          <button
            type="button"
            onClick={() => void addLabel()}
            disabled={!newName.trim() || adding}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[12px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-9"
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add label
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
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
