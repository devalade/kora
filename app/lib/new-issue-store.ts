import { useSyncExternalStore } from 'react';

// Any task screen can open the "New issue" modal (C, the sidebar button, a board column's +).
// The modal itself is mounted once per page by <NewIssueModal>.

export type NewIssueDefaults = {
  teamId?: string;
  statusId?: string;
  projectId?: string;
};

type State = { open: boolean; defaults: NewIssueDefaults; opens: number };

let state: State = { open: false, defaults: {}, opens: 0 };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function openNewIssue(defaults: NewIssueDefaults = {}) {
  emit({ open: true, defaults, opens: state.opens + 1 });
}

export function closeNewIssue() {
  if (state.open) emit({ ...state, open: false });
}

const closed: State = { open: false, defaults: {}, opens: 0 };

export function useNewIssueState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => closed,
  );
}
