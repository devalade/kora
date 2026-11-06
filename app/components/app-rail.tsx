import { Link } from '@tanstack/react-router';
import { Inbox, ListTodo, LogOut, Map as MapIcon, MessageSquare } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { getInboxCountFn } from '../lib/inbox';
import { useLiveRefresh } from '../lib/realtime-client';
import type { UserSummary } from '../lib/types';
import { cn } from '../utils/cn';
import { Avatar } from './avatar';
import { LogoMark } from './logo';

/**
 * The fixed navigation rail of every workspace page: logo, then Inbox, Chat, Tasks, Studio in that
 * order, then the signed-in user. The panel next to it changes per area; the rail never does.
 *
 * Drop it in as the first child of the page's flex row, in place of the page's own icon rail:
 *
 *   <AppRail workspaceSlug={slug} active="tasks" me={me} onSignOut={() => void signOut()} />
 *
 * - `me` needs `name` and `avatarColor` (a UserSummary works).
 * - `onProfile` is optional; when set, the avatar becomes a button.
 * - `layout="column"` (default) is always the 64px vertical rail, also inside a mobile drawer.
 *   `layout="auto"` is the column from 768px up and a bottom tab bar below it, for pages without a
 *   drawer. In that mode the bar is `fixed`, so give the page `pb-16` on phones.
 *
 * The unread badge refetches when the realtime socket reports an inbox change (see
 * realtime-client.ts). A page that changes the count (the inbox) can call `publishInboxUnread(n)` to
 * update the badge at once.
 */
export type RailArea = 'inbox' | 'chat' | 'tasks' | 'studio';

const UNREAD_EVENT = 'kora:inbox-unread';

/** Pushes a fresh unread count to every mounted AppRail at once. */
export function publishInboxUnread(unread: number) {
  window.dispatchEvent(new CustomEvent<number>(UNREAD_EVENT, { detail: unread }));
}

function useInboxUnread(workspaceSlug: string) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await getInboxCountFn({ data: { slug: workspaceSlug } });
      setUnread(result.unread);
    } catch {
      // Keep the last count; the next event or reconnect refetches it.
    }
  }, [workspaceSlug]);

  useEffect(() => {
    function onPublished(event: Event) {
      setUnread((event as CustomEvent<number>).detail);
    }
    void refresh();
    window.addEventListener(UNREAD_EVENT, onPublished);
    return () => window.removeEventListener(UNREAD_EVENT, onPublished);
  }, [refresh]);

  // The badge moves when the realtime socket reports a new or read inbox item.
  useLiveRefresh(workspaceSlug, refresh, (event) => event.t === 'inbox');

  return unread;
}

export function AppRail({
  workspaceSlug,
  active,
  me,
  onSignOut,
  onProfile,
  layout = 'column',
}: {
  workspaceSlug: string;
  active: RailArea;
  me: Pick<UserSummary, 'name' | 'avatarColor'> & { avatarUrl?: string | null };
  onSignOut: () => void;
  onProfile?: () => void;
  layout?: 'column' | 'auto';
}) {
  const unread = useInboxUnread(workspaceSlug);
  const params = { workspaceSlug };
  const auto = layout === 'auto';

  const items = [
    {
      area: 'inbox' as const,
      label: 'Inbox',
      icon: <Inbox size={20} />,
      link: (children: React.ReactNode, className: string) => (
        <Link to="/app/$workspaceSlug/inbox" params={params} className={className}>
          {children}
        </Link>
      ),
    },
    {
      area: 'chat' as const,
      label: 'Chat',
      icon: <MessageSquare size={20} />,
      link: (children: React.ReactNode, className: string) => (
        <Link to="/app/$workspaceSlug" params={params} className={className}>
          {children}
        </Link>
      ),
    },
    {
      area: 'tasks' as const,
      label: 'Tasks',
      icon: <ListTodo size={20} />,
      link: (children: React.ReactNode, className: string) => (
        <Link to="/app/$workspaceSlug/tasks" params={params} className={className}>
          {children}
        </Link>
      ),
    },
    {
      area: 'studio' as const,
      label: 'Studio',
      icon: <MapIcon size={20} />,
      link: (children: React.ReactNode, className: string) => (
        <Link to="/app/$workspaceSlug/office" params={params} className={className}>
          {children}
        </Link>
      ),
    },
  ];

  return (
    <div
      role="navigation"
      // Labels of different widths are centred under their icons, so their left edges differ by design.
      data-audit-skip="A1"
      aria-label="Kora"
      className={cn(
        'z-20 flex shrink-0 bg-sidebar',
        auto
          ? 'fixed inset-x-0 bottom-0 h-16 flex-row items-stretch justify-around border-t border-sidebar-line px-2 pb-[env(safe-area-inset-bottom)] md:static md:inset-auto md:h-auto md:w-16 md:flex-col md:items-center md:justify-start md:border-t-0 md:px-0 md:py-4 md:pb-4'
          : 'w-16 flex-col items-center py-4',
      )}
    >
      <Link
        to="/app"
        aria-label="Kora home"
        className={cn(
          'mb-4 grid size-10 place-items-center rounded-lg transition hover:scale-[1.03]',
          auto && 'max-md:hidden',
        )}
      >
        <LogoMark size={36} />
      </Link>

      <div
        className={cn(
          'flex gap-1',
          auto ? 'w-full flex-row justify-around md:w-auto md:flex-col' : 'flex-col',
        )}
      >
        {items.map((item) => {
          const isActive = item.area === active;
          const showBadge = item.area === 'inbox' && unread > 0;
          return (
            <Fragment key={item.area}>
              {item.link(
                <>
                  {isActive && (
                    <span
                      className={cn(
                        'absolute rounded-full bg-coral',
                        auto
                          ? 'inset-x-3 top-0 h-0.5 md:inset-x-auto md:top-3 md:-left-1 md:h-6 md:w-0.5'
                          : 'top-3 -left-1 h-6 w-0.5',
                      )}
                    />
                  )}
                  <span className="relative">
                    {item.icon}
                    {showBadge && (
                      <span
                        data-testid="inbox-badge"
                        aria-label={`${unread} unread`}
                        className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] leading-none font-bold text-white tabular-nums"
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] leading-4 font-medium">{item.label}</span>
                </>,
                cn(
                  'relative flex flex-col items-center justify-center gap-1 rounded-lg transition-colors duration-100',
                  auto ? 'h-14 flex-1 md:size-14 md:flex-none' : 'size-14',
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                ),
              )}
            </Fragment>
          );
        })}
      </div>

      <div className={cn('mt-auto flex flex-col items-center gap-2', auto && 'max-md:hidden')}>
        {onProfile ? (
          <button
            type="button"
            onClick={onProfile}
            className="grid size-10 place-items-center rounded-full transition hover:ring-2 hover:ring-white/15"
            aria-label="Your profile"
            title={me.name}
          >
            <Avatar name={me.name} src={me.avatarUrl} color={me.avatarColor} size="md" online className="[--avatar-ring:#151b19]" />
          </button>
        ) : (
          <span className="grid size-10 place-items-center" title={me.name}>
            <Avatar name={me.name} src={me.avatarUrl} color={me.avatarColor} size="md" online className="[--avatar-ring:#151b19]" />
          </span>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="grid size-8 place-items-center rounded-lg text-sidebar-text transition hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
