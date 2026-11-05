export type TasksView = 'all' | 'mine' | 'board' | 'timeline';

export type TasksSearch = {
  view?: TasksView;
  team?: string;
  project?: string;
  label?: string;
  status?: string;
};

export const TASKS_VIEWS: TasksView[] = ['all', 'mine', 'board', 'timeline'];

export function validateTasksSearch(search: Record<string, unknown>): TasksSearch {
  const view =
    search.view === 'mine' ||
    search.view === 'board' ||
    search.view === 'timeline' ||
    search.view === 'all'
      ? search.view
      : 'all';
  return {
    view,
    team: typeof search.team === 'string' ? search.team : undefined,
    project: typeof search.project === 'string' ? search.project : undefined,
    label: typeof search.label === 'string' ? search.label : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  };
}

export function withTaskSearch(prev: TasksSearch, patch: Partial<TasksSearch>): TasksSearch {
  const next: TasksSearch = { ...prev, ...patch };
  if (next.team === undefined) delete next.team;
  if (next.project === undefined) delete next.project;
  if (next.label === undefined) delete next.label;
  if (next.status === undefined) delete next.status;
  if (next.view === undefined) next.view = 'all';
  return next;
}
