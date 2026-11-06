// Pass timeZone 'UTC' while hydrating so the browser's first render matches the Worker's,
// then omit it to show the viewer's local time. See useDisplayTimeZone.
export function clockTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

function dayKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

export function dayLabel(iso: string, timeZone?: string) {
  const date = new Date(iso);
  const now = new Date();
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return 'Today';
  if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return 'Yesterday';
  const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone,
  }).format(date);
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function fullDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CALL_LIMIT_MINUTES = 5;
export const CALL_LIMIT_MS = CALL_LIMIT_MINUTES * 60 * 1000;

export function callTimeLeftMs(startedAt: string, now = Date.now()) {
  return Math.max(0, new Date(startedAt).getTime() + CALL_LIMIT_MS - now);
}

export function callTimeLeft(startedAt: string, now = Date.now()) {
  const seconds = Math.ceil(callTimeLeftMs(startedAt, now) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function callDuration(startedAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
