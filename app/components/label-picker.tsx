import { Loader2, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createLabelFn } from '../lib/tasks';
import type { TaskLabel } from '../lib/types';
import { cn } from '../utils/cn';
import { TaskLabelPill } from './task-icons';

export function LabelPicker({
  labels,
  selectedIds,
  onToggle,
  onCreated,
  slug,
  issueId,
}: {
  labels: TaskLabel[];
  selectedIds: string[];
  onToggle: (labelId: string) => void;
  onCreated: (label: TaskLabel) => void | Promise<void>;
  slug: string;
  issueId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdLabels, setCreatedLabels] = useState<TaskLabel[]>([]);
  const [createdSelected, setCreatedSelected] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const allLabels = [
    ...labels,
    ...createdLabels.filter((label) => !labels.some((item) => item.id === label.id)),
  ];

  async function submit() {
    const next = name.trim();
    if (!next || saving) return;
    setSaving(true);
    try {
      const result = await createLabelFn({
        data: { slug, name: next, issueId },
      });
      setCreatedLabels((current) =>
        current.some((label) => label.id === result.label.id)
          ? current
          : [...current, result.label],
      );
      setCreatedSelected((current) =>
        current.includes(result.label.id) ? current : [...current, result.label.id],
      );
      await onCreated(result.label);
      setName('');
      setAdding(false);
      toast.success(result.created ? 'Label added.' : 'Label added to the issue.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the label.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {allLabels.map((label) => {
          const active =
            selectedIds.includes(label.id) || createdSelected.includes(label.id);
          return (
            <button
              key={label.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(label.id)}
              className={cn(
                'inline-flex rounded-md transition-[box-shadow,transform] duration-150',
                active
                  ? 'ring-2 ring-ink/25 ring-offset-2 ring-offset-paper'
                  : 'opacity-75 hover:opacity-100',
              )}
            >
              <TaskLabelPill label={label} />
            </button>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              } else if (event.key === 'Escape') {
                setAdding(false);
                setName('');
              }
            }}
            placeholder="Label name, then Enter"
            maxLength={30}
            aria-label="New label name"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-8 sm:text-[12px]"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim() || saving}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-8"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
        >
          <Plus size={13} /> New label
        </button>
      )}
    </div>
  );
}
