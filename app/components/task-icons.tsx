import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Eye,
  MoreHorizontal,
  XCircle,
} from 'lucide-react';
import type { TaskLabel, TaskPriority, TaskStatus } from '../lib/types';
import { cn } from '../utils/cn';

export const STATUS_ORDER: TaskStatus[] = [
  'in_progress',
  'in_review',
  'todo',
  'backlog',
  'done',
  'canceled',
];

export const STATUS_META: Record<
  TaskStatus,
  { label: string; short: string; color: string; icon: typeof Circle }
> = {
  backlog: { label: 'Backlog', short: 'Backlog', color: '#a19b8f', icon: CircleDashed },
  todo: { label: 'Todo', short: 'Todo', color: '#736f66', icon: Circle },
  in_progress: { label: 'In Progress', short: 'In Progress', color: '#e0a23b', icon: CircleDot },
  in_review: { label: 'In Review', short: 'In Review', color: '#5b8def', icon: Eye },
  done: { label: 'Done', short: 'Done', color: '#17795f', icon: CheckCircle2 },
  canceled: { label: 'Canceled', short: 'Canceled', color: '#a19b8f', icon: XCircle },
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; bars: number }
> = {
  0: { label: 'No priority', color: '#a19b8f', bars: 0 },
  1: { label: 'Urgent', color: '#d84a2b', bars: 3 },
  2: { label: 'High', color: '#ef5f3e', bars: 3 },
  3: { label: 'Medium', color: '#e0a23b', bars: 2 },
  4: { label: 'Low', color: '#a19b8f', bars: 1 },
};

export function TaskStatusIcon({
  status,
  size = 14,
  className,
}: {
  status: TaskStatus;
  size?: number;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      className={cn('shrink-0', className)}
      style={{ color: meta.color }}
      aria-hidden="true"
    />
  );
}

export function TaskPriorityIcon({
  priority,
  size = 14,
  className,
}: {
  priority: TaskPriority;
  size?: number;
  className?: string;
}) {
  if (priority === 0) {
    return <MoreHorizontal size={size} className={cn('text-faint', className)} aria-hidden="true" />;
  }
  const meta = PRIORITY_META[priority];
  const heights = [4, 7, 10];
  return (
    <span
      className={cn('inline-flex items-end gap-[2px]', className)}
      style={{ height: size }}
      title={meta.label}
      aria-label={meta.label}
    >
      {heights.map((height, index) => (
        <span
          key={height}
          className="w-[3px] rounded-full"
          style={{
            height: Math.max(3, Math.round((height / 10) * size)),
            background: index < meta.bars ? meta.color : '#e7e1d5',
          }}
        />
      ))}
    </span>
  );
}

export function TaskLabelPill({ label, compact }: { label: TaskLabel; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-line/70 bg-paper px-1.5 py-0.5 font-medium text-muted',
        compact ? 'text-[9px]' : 'text-[10px]',
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: label.color }} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
