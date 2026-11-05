import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

// The Worker renders in UTC. During hydration this returns 'UTC' so dates match the server HTML;
// right after, React re-renders with undefined, which formats in the viewer's own time zone.
export function useDisplayTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => 'UTC',
  );
}
