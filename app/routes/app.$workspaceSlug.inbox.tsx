import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useParams,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { ArrowLeft, Bell, CheckCheck, CircleAlert, MailOpen, Mail } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppRail, publishInboxUnread } from '../components/app-rail';
import { Avatar } from '../components/avatar';
import { PRIORITY_META, TaskPriorityIcon, TaskStatusIcon } from '../components/task-icons';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { fullDate, relativeTime } from '../lib/format';
import { useLiveRefresh } from '../lib/realtime-client';
import { getInboxFn, markInboxReadFn } from '../lib/inbox';
import type { InboxItem } from '../lib/types';
import { cn } from '../utils/cn';

type Filter = 'unread' | 'all';
type Kind = 'everything' | 'tasks' | 'messages' | 'threads';

const KIND_TABS: { value: Kind; label: string }[] = [
  { value: 'everything', label: 'Everything' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'messages', label: 'Messages' },
  { value: 'threads', label: 'Threads' },
];

/** Which tab an inbox item belongs to. Issue mentions in chat are about a task, so they sit in Tasks. */
function kindOf(item: InboxItem): Exclude<Kind, 'everything'> {
  if (item.kind === 'thread_reply') return 'threads';
  if (item.kind === 'message_mention') return 'messages';
  return 'tasks';
}

export const Route = createFileRoute('/app/$workspaceSlug/inbox')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => getInboxFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'Inbox · Kora' }] }),
  pendingMs: 200,
  pendingComponent: InboxPending,
  errorComponent: InboxError,
  component: InboxPage,
});

function firstName(item: InboxItem) {
  return item.actor?.name.split(/\s+/)[0] ?? 'Someone';
}

function whereLabel(item: InboxItem) {
  if (!item.channel) return 'a channel';
  return item.channel.kind === 'dm' ? 'a direct message' : `#${item.channel.name}`;
}

/** The one-line sentence for a row: who did what, to which issue or conversation. */
function sentence(item: InboxItem) {
  const who = firstName(item);
  const key = item.issue?.key ?? 'an issue';
  switch (item.kind) {
    case 'issue_assigned':
      return `${who} assigned you ${key}`;
    case 'issue_status':
      return `${who} moved ${key} to ${item.issue?.status.name ?? 'a new status'}`;
    case 'issue_comment':
      return `${who} commented on ${key}`;
    case 'issue_mentioned':
      return item.channel
        ? `${who} mentioned ${key} in ${whereLabel(item)}`
        : `${who} mentioned you in ${key}`;
    case 'message_mention':
      return `${who} mentioned you in ${whereLabel(item)}`;
    case 'thread_reply':
      return `${who} replied to your thread in ${whereLabel(item)}`;
  }
}

/** The second line: the comment or message text, or the issue title when there is none. */
function snippet(item: InboxItem) {
  return item.body.trim() || item.issue?.title || '';
}

function InboxPage() {
  const initial = Route.useLoaderData();
  const { workspaceSlug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();

  const [items, setItems] = useState<InboxItem[]>(initial.items);
  const [filter, setFilter] = useState<Filter>('unread');
  const [kind, setKind] = useState<Kind>('everything');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [detailOnPhone, setDetailOnPhone] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const mutations = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const refresh = useCallback(async (): Promise<string | null> => {
    const startedAt = mutations.current;
    try {
      const result = await getInboxFn({ data: { slug: workspaceSlug, poll: true } });
      // A change made while this request was in flight is newer than the response.
      if (startedAt !== mutations.current) return null;
      setItems(result.items);
      setSyncError(false);
      publishInboxUnread(result.unread);
      return `${result.unread}|${result.items.map((item) => `${item.id}${item.readAt ? 'r' : ''}`).join(',')}`;
    } catch {
      setSyncError(true);
      return null;
    }
  }, [workspaceSlug]);

  // New inbox items are pushed by the realtime socket; the list refetches when one arrives.
  useLiveRefresh(workspaceSlug, refresh, (event) => event.t === 'inbox');

  const setRead = useCallback(
    async (target: { ids?: string[]; all?: boolean }, read: boolean) => {
      mutations.current += 1;
      const now = new Date().toISOString();
      const next = (readAt: string | null, id: string) =>
        target.all || target.ids?.includes(id) ? (read ? (readAt ?? now) : null) : readAt;
      setItems((current) => {
        const updated = current.map((item) => ({ ...item, readAt: next(item.readAt, item.id) }));
        publishInboxUnread(updated.filter((item) => !item.readAt).length);
        return updated;
      });
      try {
        const result = await markInboxReadFn({
          data: { slug: workspaceSlug, ids: target.ids, all: target.all, unread: !read },
        });
        publishInboxUnread(result.unread);
        setSyncError(false);
      } catch {
        mutations.current += 1;
        setSyncError(true);
        void refresh();
      }
    },
    [refresh, workspaceSlug],
  );

  const unreadByKind = useMemo(() => {
    const counts: Record<Kind, number> = { everything: 0, tasks: 0, messages: 0, threads: 0 };
    for (const item of items) {
      if (item.readAt) continue;
      counts.everything += 1;
      counts[kindOf(item)] += 1;
    }
    return counts;
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (kind === 'everything' || kindOf(item) === kind) &&
          (filter === 'all' || !item.readAt || item.id === openId || item.id === cursorId),
      ),
    [cursorId, filter, items, kind, openId],
  );
  const opened = items.find((item) => item.id === openId) ?? null;

  function openItem(item: InboxItem) {
    setOpenId(item.id);
    setCursorId(item.id);
    setDetailOnPhone(true);
    if (!item.readAt) void setRead({ ids: [item.id] }, true);
  }

  function toggleRead(item: InboxItem) {
    void setRead({ ids: [item.id] }, !item.readAt);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const index = visible.findIndex((item) => item.id === cursorId);
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        if (visible.length === 0) return;
        const nextIndex =
          index < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)));
        setCursorId(visible[nextIndex].id);
      } else if (event.key === 'Enter' && index >= 0 && target?.tagName !== 'A') {
        if (target?.closest('button')) return;
        event.preventDefault();
        openItem(visible[index]);
      } else if (event.key === 'u') {
        const item = visible[index] ?? opened;
        if (item) {
          event.preventDefault();
          toggleRead(item);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!cursorId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-item-id="${cursorId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  async function signOut() {
    await signOutFn();
    await router.invalidate();
    await navigate({ to: '/' });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas pb-16 md:pb-0">
      <AppRail
        workspaceSlug={workspaceSlug}
        active="inbox"
        me={user}
        layout="auto"
        onSignOut={() => void signOut()}
      />

      <section
        aria-label="Notifications"
        className={cn(
          'min-w-0 flex-1 flex-col border-r border-line bg-paper md:flex md:w-[360px] md:flex-none',
          detailOnPhone ? 'hidden' : 'flex',
        )}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Inbox</h1>
          <span className="text-[12px] text-muted tabular-nums">
            {unread === 0 ? 'All caught up' : `${unread} unread`}
          </span>
        </header>
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div role="group" aria-label="Filter" className="flex h-8 items-center rounded-lg bg-line-soft p-0.5">
            {(['unread', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'h-7 rounded-md px-3 text-[12px] font-medium',
                  filter === value ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {value === 'unread' ? 'Unread' : 'All'}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={() => void setRead({ all: true }, true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted hover:bg-line-soft hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        </div>

        <div
          role="group"
          aria-label="Type"
          className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3"
        >
          {KIND_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={kind === tab.value}
              onClick={() => setKind(tab.value)}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors duration-100',
                kind === tab.value ? 'bg-ink/[0.06] text-ink' : 'text-muted hover:bg-ink/[0.04] hover:text-ink',
              )}
            >
              {tab.label}
              {unreadByKind[tab.value] > 0 && (
                <span className="text-[11px] tabular-nums text-faint">{unreadByKind[tab.value]}</span>
              )}
            </button>
          ))}
        </div>

        {syncError && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2 border-b border-line bg-coral-soft px-4 py-2 text-[12px] text-ink-soft"
          >
            <CircleAlert size={14} className="shrink-0 text-coral-deep" />
            <span className="flex-1">Could not sync. Retrying.</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="h-6 rounded-md px-2 text-[12px] font-medium text-ink hover:bg-white/60"
            >
              Retry
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <ListEmpty
            filter={filter}
            kind={kind}
            hasItems={items.some((item) => kind === 'everything' || kindOf(item) === kind)}
            onShowAll={() => setFilter('all')}
          />
        ) : (
          // data-audit-skip: list rows are two-line rows (sentence and snippet), not single-line controls.
          <ul
            ref={listRef}
            data-audit-skip="C2 C7 C8"
            className="scroll-thin min-h-0 flex-1 overflow-y-auto"
          >
            {visible.map((item) => (
              <li key={item.id} data-item-id={item.id}>
                <Row
                  item={item}
                  opened={item.id === openId}
                  cursor={item.id === cursorId}
                  onOpen={() => openItem(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <main className={cn('min-w-0 flex-1 flex-col md:flex', detailOnPhone ? 'flex' : 'hidden')}>
        {opened ? (
          <Detail
            key={opened.id}
            item={opened}
            workspaceSlug={workspaceSlug}
            onBack={() => setDetailOnPhone(false)}
            onToggleRead={() => toggleRead(opened)}
          />
        ) : (
          <DetailEmpty onBack={() => setDetailOnPhone(false)} />
        )}
      </main>
    </div>
  );
}

function Row({
  item,
  opened,
  cursor,
  onOpen,
}: {
  item: InboxItem;
  opened: boolean;
  cursor: boolean;
  onOpen: () => void;
}) {
  const text = snippet(item);
  const isUnread = !item.readAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={opened ? 'true' : undefined}
      className={cn(
        'flex h-16 w-full items-center gap-3 border-b border-line-soft px-4 text-left outline-offset-[-2px]',
        opened ? 'bg-line-soft' : cursor ? 'bg-canvas' : 'hover:bg-canvas',
      )}
    >
      <span
        className={cn('size-2 shrink-0 rounded-full', isUnread ? 'bg-coral' : 'bg-transparent')}
        role={isUnread ? 'img' : undefined}
        aria-label={isUnread ? 'Unread' : undefined}
      />
      <Avatar
        name={item.actor?.name ?? 'Someone'} src={item.actor?.avatarUrl}
        color={item.actor?.avatarColor ?? '#736f66'}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13px] leading-5',
            isUnread ? 'font-semibold text-ink' : 'font-medium text-ink-soft',
          )}
        >
          {sentence(item)}
        </span>
        <span className="block truncate text-[12px] leading-5 text-muted">{text || ' '}</span>
      </span>
      <span
        suppressHydrationWarning
        className="shrink-0 text-[12px] leading-5 text-muted tabular-nums"
      >
        {relativeTime(item.createdAt)}
      </span>
    </button>
  );
}

const EMPTY_COPY: Record<Kind, string> = {
  everything:
    'When someone assigns you an issue, comments, moves your work or mentions you in a channel, it shows up here, so you never have to hunt for what changed.',
  tasks: 'Assignments, comments and status changes on issues you follow, and issues mentioned in chat, land here.',
  messages: 'When a teammate @mentions you in a channel or a direct message, it lands here.',
  threads: 'When someone replies to a thread you started, it lands here.',
};

function ListEmpty({
  filter,
  kind,
  hasItems,
  onShowAll,
}: {
  filter: Filter;
  kind: Kind;
  hasItems: boolean;
  onShowAll: () => void;
}) {
  const caughtUp = filter === 'unread' && hasItems;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-line-soft text-muted">
        <Bell size={20} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold text-ink">
        {caughtUp ? 'You are all caught up' : 'Nothing here yet'}
      </h2>
      <p className="mt-2 max-w-[260px] text-[13px] leading-5 text-muted">
        {caughtUp
          ? 'Every notification here has been read. New ones land the moment something happens.'
          : EMPTY_COPY[kind]}
      </p>
      {caughtUp && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-4 inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] font-medium text-ink hover:bg-line-soft"
        >
          Show all
        </button>
      )}
    </div>
  );
}

function DetailEmpty({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="m-4 inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted hover:bg-line-soft md:hidden"
      >
        <ArrowLeft size={14} /> Inbox
      </button>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center max-md:hidden">
        <div className="grid size-12 place-items-center rounded-xl bg-paper text-muted shadow-[var(--kora-shadow-composer)]">
          <MailOpen size={20} />
        </div>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">Select a notification</h2>
        <p className="mt-2 text-[13px] leading-5 text-muted">Its details open here.</p>
        <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]">j</kbd>
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]">k</kbd>
          move
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd>
          open
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]">u</kbd>
          read or unread
        </p>
      </div>
    </div>
  );
}

function Detail({
  item,
  workspaceSlug,
  onBack,
  onToggleRead,
}: {
  item: InboxItem;
  workspaceSlug: string;
  onBack: () => void;
  onToggleRead: () => void;
}) {
  const text = item.body.trim();
  const issue = item.issue;
  const channel = item.channel;
  const isDm = channel?.kind === 'dm';
  const primary =
    'inline-flex h-11 items-center justify-center rounded-lg bg-coral px-4 md:h-9 text-[13px] font-medium text-white hover:bg-coral-deep';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to inbox"
            className="-ml-3 grid size-10 place-items-center rounded-lg text-muted hover:bg-line-soft md:hidden"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="truncate text-[13px] font-medium text-muted">
            {issue ? issue.key : channel ? whereLabel(item) : 'Notification'}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleRead}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper pr-3 pl-2.5 text-[12px] font-medium text-ink hover:bg-line-soft"
        >
          {item.readAt ? <Mail size={14} /> : <MailOpen size={14} />}
          {item.readAt ? 'Mark unread' : 'Mark read'}
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-8">
        <div className="mx-auto w-full max-w-[640px]">
          <div className="flex items-center gap-3">
            <Avatar
              name={item.actor?.name ?? 'Someone'} src={item.actor?.avatarUrl}
              color={item.actor?.avatarColor ?? '#736f66'}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                {item.actor?.name ?? 'Someone'}
              </p>
              <p suppressHydrationWarning className="text-[12px] text-muted">
                {fullDate(item.createdAt)}
              </p>
            </div>
          </div>

          <h2 className="mt-6 text-[20px] leading-7 font-semibold tracking-[-0.01em] text-ink">
            {sentence(item)}
          </h2>

          {text && (
            <blockquote className="mt-4 rounded-lg border border-line bg-paper px-4 py-3 text-[14px] leading-6 break-words whitespace-pre-wrap text-ink-soft">
              {text}
            </blockquote>
          )}

          {issue && (
            <div className="mt-6 rounded-xl border border-line bg-paper p-4">
              <p className="font-mono text-[12px] text-muted">{issue.key}</p>
              <h3 className="mt-1 text-[16px] leading-6 font-semibold text-ink">{issue.title}</h3>
              <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-[13px]">
                <dt className="text-muted">Status</dt>
                <dd className="flex items-center gap-2 text-ink">
                  <span className="grid size-5 place-items-center">
                    <TaskStatusIcon status={issue.status} size={16} />
                  </span>
                  {issue.status.name}
                </dd>
                <dt className="text-muted">Priority</dt>
                <dd className="flex items-center gap-2 text-ink">
                  <span className="grid size-5 place-items-center">
                    <TaskPriorityIcon priority={issue.priority} size={14} />
                  </span>
                  {PRIORITY_META[issue.priority].label}
                </dd>
                <dt className="text-muted">Assignee</dt>
                <dd className="flex items-center gap-2 text-ink">
                  {issue.assignee ? (
                    <>
                      <Avatar name={issue.assignee.name} src={issue.assignee.avatarUrl} color={issue.assignee.avatarColor} size="2xs" />
                      {issue.assignee.name}
                    </>
                  ) : (
                    <>
                      <span className="size-5" />
                      <span className="text-muted">Unassigned</span>
                    </>
                  )}
                </dd>
              </dl>
              <Link
                to="/app/$workspaceSlug/tasks/$issueKey"
                params={{ workspaceSlug, issueKey: issue.key }}
                className={cn(primary, 'mt-5')}
              >
                Open issue
              </Link>
            </div>
          )}

          {!issue && channel && (
            <div className="mt-6">
              <Link
                to="/app/$workspaceSlug/$channelId"
                params={{ workspaceSlug, channelId: channel.id }}
                className={primary}
              >
                {isDm ? 'Open conversation' : `Open in #${channel.name}`}
              </Link>
            </div>
          )}

          {issue && channel && (
            <div className="mt-3">
              <Link
                to="/app/$workspaceSlug/$channelId"
                params={{ workspaceSlug, channelId: channel.id }}
                className="inline-flex h-11 items-center rounded-lg border border-line bg-paper px-4 text-[13px] font-medium text-ink hover:bg-line-soft md:h-9"
              >
                {isDm ? 'Open conversation' : `Open in #${channel.name}`}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InboxPending() {
  const { workspaceSlug } = useParams({ strict: false }) as { workspaceSlug: string };
  const { user } = Route.useRouteContext();
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas pb-16 md:pb-0">
      <AppRail workspaceSlug={workspaceSlug} active="inbox" me={user} layout="auto" onSignOut={() => undefined} />
      <section
        aria-label="Loading notifications"
        aria-busy="true"
        className="min-w-0 flex-1 border-r border-line bg-paper md:w-[360px] md:flex-none"
      >
        <div className="flex h-16 items-center px-4">
          <h1 className="text-[15px] font-semibold text-ink">Inbox</h1>
        </div>
        <div className="h-12 border-b border-line" />
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
            <span className="mt-4 size-2 shrink-0" />
            <span className="size-8 shrink-0 animate-pulse rounded-full bg-line-soft" />
            <span className="flex-1 space-y-2 pt-0.5">
              <span className="block h-3 w-3/4 animate-pulse rounded bg-line-soft" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-line-soft" />
            </span>
          </div>
        ))}
      </section>
      <main className="hidden flex-1 md:block" />
    </div>
  );
}

function InboxError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-6 text-center shadow-[var(--kora-shadow-composer)]">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-coral-soft text-coral">
          <CircleAlert size={20} />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">Inbox did not load</h1>
        <p className="mt-2 text-[13px] leading-5 text-muted">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => void router.invalidate()}
            className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[13px] font-medium text-paper hover:bg-ink-soft"
          >
            Try again
          </button>
          <Link
            to="/app"
            className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-[13px] font-medium text-ink hover:bg-line-soft"
          >
            Workspaces
          </Link>
        </div>
      </div>
    </div>
  );
}
