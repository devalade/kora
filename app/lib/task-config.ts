import type { TaskStatusCategory } from './types';

export const TASK_STATUS_CATEGORIES = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
] as const;

export const TASK_STATUS_CATEGORY_LABELS: Record<TaskStatusCategory, string> = {
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  completed: 'Completed',
  canceled: 'Canceled',
};

export const TASK_STATUS_COLORS = [
  '#a19b8f',
  '#736f66',
  '#e0a23b',
  '#5b8def',
  '#17795f',
  '#ef5f3e',
  '#b07aa1',
  '#d45d79',
] as const;

export type DefaultTaskStatus = {
  id: string;
  name: string;
  category: TaskStatusCategory;
  color: string;
  position: number;
};

export const DEFAULT_TASK_STATUSES: DefaultTaskStatus[] = [
  { id: 'backlog', name: 'Backlog', category: 'backlog', color: '#a19b8f', position: 0 },
  { id: 'todo', name: 'Todo', category: 'unstarted', color: '#736f66', position: 1 },
  { id: 'in_progress', name: 'In Progress', category: 'started', color: '#e0a23b', position: 2 },
  { id: 'in_review', name: 'In Review', category: 'started', color: '#5b8def', position: 3 },
  { id: 'done', name: 'Done', category: 'completed', color: '#17795f', position: 4 },
  { id: 'canceled', name: 'Canceled', category: 'canceled', color: '#a19b8f', position: 5 },
];

export const TASK_LABEL_COLORS = [
  '#D84A2B',
  '#B07AA1',
  '#5B8DEF',
  '#18A999',
  '#E0A23B',
  '#D45D79',
] as const;
