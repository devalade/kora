import { Box, CalendarDays, Check, Loader2, Plus, Tag, UserRound, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createLabelFn } from '../lib/tasks';
import type { TaskLabel, TaskPriority, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import { Avatar } from './avatar';
import { CalendarPanel } from './date-picker';
import { FloatingMenu } from './floating';
import {
  propertyTrigger,
  type PropertyOption,
  type PropertyVariant,
} from './property-select';
import { PRIORITY_META, TaskPriorityIcon, TaskStatusIcon } from './task-icons';

export function statusOptions(snapshot: TasksSnapshot): PropertyOption[] {
  return snapshot.statuses.map((status) => ({
    value: status.id,
    label: status.name,
    icon: <TaskStatusIcon status={status} size={14} />,
  }));
}

export function priorityOptions(): PropertyOption[] {
  return [0, 1, 2, 3, 4].map((value) => ({
    value: String(value),
    label: PRIORITY_META[value as TaskPriority].label,
    icon: <TaskPriorityIcon priority={value as TaskPriority} size={14} />,
  }));
}

export function assigneeOptions(snapshot: TasksSnapshot): PropertyOption[] {
  return [
    { value: '', label: 'No assignee', icon: <UserRound size={14} className="text-faint" /> },
    ...snapshot.members.map((member) => ({
      value: member.id,
      label: member.name,
      icon: <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="2xs" />,
    })),
  ];
}

export function teamOptions(snapshot: TasksSnapshot): PropertyOption[] {
  return snapshot.teams.map((team) => ({
    value: team.id,
    label: team.name,
    description: team.key,
    icon: <span className="size-2 rounded-full" style={{ background: team.color }} />,
  }));
}

export function projectOptions(snapshot: TasksSnapshot): PropertyOption[] {
  return [
    { value: '', label: 'No project', icon: <Box size={14} className="text-faint" /> },
    ...snapshot.projects.map((project) => ({
      value: project.id,
      label: project.name,
      icon: <ProjectIcon color={project.color} />,
    })),
  ];
}

/** A project's mark: a small rounded square in its colour, distinct from a team's round dot. */
export function ProjectIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-[3px] border-2"
      style={{ borderColor: color, width: size, height: size }}
    />
  );
}

/** Multi-select for labels with type-to-filter and inline "Create label". */
export function LabelSelect({
  labels,
  selectedIds,
  onChange,
  onCreated,
  slug,
  variant,
}: {
  labels: TaskLabel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreated?: (label: TaskLabel) => void | Promise<void>;
  slug: string;
  variant: Exclude<PropertyVariant, 'field'>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  // Labels created here appear before the next poll brings them in the snapshot.
  const [created, setCreated] = useState<TaskLabel[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  const all = useMemo(
    () => [...labels, ...created.filter((label) => !labels.some((item) => item.id === label.id))],
    [labels, created],
  );
  const selected = all.filter((label) => selectedIds.includes(label.id));
  const needle = query.trim();
  const visible = all.filter((label) => label.name.toLowerCase().includes(needle.toLowerCase()));
  const canCreate =
    needle.length > 0 && !all.some((label) => label.name.toLowerCase() === needle.toLowerCase());
  const rows = visible.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, rows - 1)));
  }, [rows]);

  function toggle(labelId: string) {
    onChange(
      selectedIds.includes(labelId)
        ? selectedIds.filter((id) => id !== labelId)
        : [...selectedIds, labelId],
    );
  }

  async function create() {
    if (!needle || creating) return;
    setCreating(true);
    try {
      // Without an issue id this only creates the label; the caller adds it to its selection.
      const result = await createLabelFn({ data: { slug, name: needle } });
      setCreated((current) => [...current, result.label]);
      onChange([...selectedIds.filter((id) => id !== result.label.id), result.label.id]);
      setQuery('');
      await onCreated?.(result.label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the label.');
    } finally {
      setCreating(false);
    }
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) =>
        event.key === 'ArrowDown' ? Math.min(rows - 1, current + 1) : Math.max(0, current - 1),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active < visible.length) toggle(visible[active].id);
      else void create();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      {variant === 'row' ? (
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1">
          {selected.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-label="Add labels"
            aria-haspopup="listbox"
            aria-expanded={open}
            title="Add labels"
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-[12px] font-medium text-muted transition-colors duration-100 hover:bg-ink/[0.045] hover:text-ink',
              selected.length === 0 && 'pr-2',
            )}
          >
            <Plus size={13} />
            {selected.length === 0 && 'Add label'}
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Labels"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(propertyTrigger.chip, open && 'border-ink/25 bg-canvas')}
        >
          {selected.length === 0 ? (
            <>
              <Tag size={13} className="text-muted" />
              <span className="text-muted">Labels</span>
            </>
          ) : (
            <>
              <span className="flex -space-x-0.5">
                {selected.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="size-2 rounded-full ring-2 ring-paper"
                    style={{ background: label.color }}
                  />
                ))}
              </span>
              <span className="truncate">
                {selected.length === 1 ? selected[0].name : `${selected.length} labels`}
              </span>
            </>
          )}
        </button>
      )}

      {open && (
        <FloatingMenu anchor={triggerRef} menuRef={menuRef} className="popover-in">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKey}
            placeholder="Add labels…"
            aria-label="Filter labels"
            aria-controls={listId}
            maxLength={30}
            className="h-9 w-full border-b border-line-soft bg-transparent px-3 text-[16px] outline-none placeholder:text-faint sm:text-[13px]"
          />
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Labels"
            className="max-h-[280px] min-h-0 overflow-y-auto p-1"
          >
            {visible.map((label, index) => {
              const isSelected = selectedIds.includes(label.id);
              return (
                <div
                  key={label.id}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    toggle(label.id);
                  }}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]',
                    index === active ? 'bg-ink/[0.05] text-ink' : 'text-ink-soft',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                      isSelected ? 'border-ink bg-ink text-paper' : 'border-line',
                    )}
                  >
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: label.color }} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                </div>
              );
            })}
            {canCreate && (
              <div
                role="option"
                aria-selected={false}
                onPointerDown={(event) => {
                  event.preventDefault();
                  void create();
                }}
                onPointerEnter={() => setActive(visible.length)}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]',
                  active === visible.length ? 'bg-ink/[0.05] text-ink' : 'text-ink-soft',
                )}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span className="min-w-0 flex-1 truncate">
                  Create label <span className="font-medium text-ink">“{needle}”</span>
                </span>
              </div>
            )}
            {rows === 0 && <p className="px-2 py-2 text-[13px] text-muted">No labels yet</p>}
          </div>
        </FloatingMenu>
      )}
    </div>
  );
}

export function LabelChip({ label }: { label: TaskLabel }) {
  return (
    <span className="inline-flex h-6 max-w-[180px] items-center gap-1.5 rounded-full border border-line bg-paper px-2 text-[12px] font-medium text-ink-soft">
      <span className="size-2 shrink-0 rounded-full" style={{ background: label.color }} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Formats a YYYY-MM-DD date without a time-zone shift. */
export function formatIssueDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === new Date().getUTCFullYear()
    ? shortDate.format(date)
    : longDate.format(date);
}

/** A ghost button that opens a calendar popover; the value is a YYYY-MM-DD string. */
export function DateSelect({
  value,
  onChange,
  label,
  placeholder,
  variant,
  overdue,
  prefix,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  placeholder: string;
  /** Word before a set date ("Due Nov 9"), so start and due read apart without a label column. */
  prefix?: string;
  variant: Exclude<PropertyVariant, 'field'>;
  overdue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function pick(next: string | null) {
    onChange(next);
    close();
  }

  return (
    <div ref={rootRef} className="group relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}: ${formatIssueDate(value)}` : placeholder}
        className={cn(propertyTrigger[variant], overdue && value && 'text-danger')}
      >
        <span className={cn('grid shrink-0 place-items-center', variant === 'row' && 'size-5')}>
          <CalendarDays size={14} className={overdue && value ? 'text-danger' : 'text-muted'} />
        </span>
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted')}>
          {value ? `${prefix ? `${prefix} ` : ''}${formatIssueDate(value)}` : placeholder}
        </span>
      </button>
      {value && variant === 'row' && !open && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute top-1 right-1 grid size-6 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-ink/[0.06] hover:text-ink focus-visible:opacity-100"
        >
          <X size={13} />
        </button>
      )}
      {open && (
        <FloatingMenu anchor={triggerRef} menuRef={menuRef} className="min-w-0">
          <CalendarPanel
            value={value}
            label={label}
            onSelect={(next) => pick(next)}
            onClear={() => pick(null)}
            onClose={close}
          />
        </FloatingMenu>
      )}
    </div>
  );
}
