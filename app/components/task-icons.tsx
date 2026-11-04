import type { CSSProperties } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  MoreHorizontal,
  XCircle,
} from 'lucide-react';
import type { TaskLabel, TaskPriority, TaskStatus, TaskStatusCategory } from '../lib/types';
import { cn } from '../utils/cn';

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

export const TASK_STATUS_CATEGORY_ICONS: Record<TaskStatusCategory, typeof Circle> = {
  backlog: CircleDashed,
  unstarted: Circle,
  started: CircleDot,
  completed: CheckCircle2,
  canceled: XCircle,
};

export function TaskStatusCategoryIcon({
  category,
  color,
  size = 16,
  className,
}: {
  category: TaskStatusCategory;
  color: string;
  size?: number;
  className?: string;
}) {
  const Icon = TASK_STATUS_CATEGORY_ICONS[category];
  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      className={cn('shrink-0', className)}
      style={{ color }}
      aria-hidden="true"
    />
  );
}

export function TaskStatusIcon({
  status,
  size = 16,
  className,
}: {
  status: TaskStatus;
  size?: number;
  className?: string;
}) {
  return (
    <TaskStatusCategoryIcon
      category={status.category}
      color={status.color}
      size={size}
      className={className}
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

export function TaskLabelPill({
  label,
  compact,
  className,
}: {
  label: TaskLabel;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('task-label', compact && 'task-label-compact', className)}
      style={{ '--label-color': label.color } as CSSProperties}
      title={label.name}
    >
      <span className="task-label-dot" aria-hidden="true" />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
