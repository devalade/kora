import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from './realtime-protocol';
import { getRealtimeTicketFn } from './realtime-ticket';

/**
 * One WebSocket per workspace, shared by every screen that shows it. Screens subscribe with
 * `useRealtime` or `useLiveRefresh`; the server publishes after each write (app/lib/realtime.ts).
 *
 * Besides real events, listeners receive `{ t: 'sync' }` whenever they may have missed something:
 * when the socket (re)connects and when the tab comes back. They refetch then, so a dropped event
 * never leaves a screen stale. Nothing here runs on a timer except a 25 s keepalive ping, which the
 * worker answers without waking its Durable Object.
 */
export type LiveEvent = RealtimeEvent | { t: 'sync' };
type Listener = (event: LiveEvent) => void;

const KEEPALIVE_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_IDLE_AFTER_MS = 10_000;

class WorkspaceSocket {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connecting = false;
  private wasHidden = false;
  /** Realtime is not configured on this server: screens refresh when the tab comes back instead. */
  private disabled = false;

  constructor(private readonly slug: string) {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    void this.open();
  }

  add(listener: Listener) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      // Screens unmount and remount while navigating; keep the socket briefly so it is reused.
      if (this.listeners.size === 0) {
        this.idleTimer = setTimeout(() => this.close(), CLOSE_IDLE_AFTER_MS);
      }
    };
  }

  private emit(event: LiveEvent) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private async open() {
    if (this.closed || this.connecting) return;
    this.connecting = true;
    try {
      const ticket = await getRealtimeTicketFn({ data: { slug: this.slug } });
      if (this.closed) return;
      if (!ticket) {
        this.disabled = true;
        return;
      }
      const socket = new WebSocket(`${ticket.socketUrl}?ticket=${encodeURIComponent(ticket.ticket)}`);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.retry = 0;
        this.startKeepalive();
        // Whatever happened while we were disconnected: refetch now.
        this.emit({ t: 'sync' });
      });
      socket.addEventListener('message', (message) => {
        if (message.data === 'pong' || typeof message.data !== 'string') return;
        let events: RealtimeEvent[];
        try {
          events = JSON.parse(message.data);
        } catch {
          return;
        }
        for (const event of events) {
          if (event.t === 'grants') void this.refreshGrants();
          this.emit(event);
        }
      });
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null;
        this.stopKeepalive();
        this.scheduleReconnect();
      });
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  /** Channel access changed: hand the open socket a new ticket instead of reconnecting. */
  private async refreshGrants() {
    try {
      const ticket = await getRealtimeTicketFn({ data: { slug: this.slug } });
      if (ticket && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ticket', ticket: ticket.ticket }));
      }
    } catch {
      // The next reconnect fetches a fresh ticket anyway.
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.retryTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retry) * (0.75 + Math.random() * 0.5);
    this.retry += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, delay);
  }

  private startKeepalive() {
    this.stopKeepalive();
    this.keepalive = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send('ping');
    }, KEEPALIVE_MS);
  }

  private stopKeepalive() {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.wasHidden = true;
      return;
    }
    if (!this.wasHidden) return;
    this.wasHidden = false;
    if (this.disabled) {
      this.emit({ t: 'sync' });
      return;
    }
    // Browsers may freeze background tabs; reconnect at once if the socket died meanwhile.
    if (!this.socket || this.socket.readyState > WebSocket.OPEN) this.reconnectNow();
    else this.emit({ t: 'sync' });
  };

  private onOnline = () => this.reconnectNow();

  // Closing the tab: say goodbye so others see this person go offline at once, not after a timeout.
  private onPageHide = () => {
    this.stopKeepalive();
    this.socket?.close(1001, 'page hidden');
  };

  // Back from the browser's back/forward cache.
  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.reconnectNow();
  };

  private reconnectNow() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retry = 0;
    if (!this.socket || this.socket.readyState > WebSocket.OPEN) void this.open();
  }

  private close() {
    this.closed = true;
    sockets.delete(this.slug);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopKeepalive();
    this.socket?.close(1000, 'idle');
    this.socket = null;
  }
}

const sockets = new Map<string, WorkspaceSocket>();

function socketFor(slug: string) {
  let socket = sockets.get(slug);
  if (!socket) {
    socket = new WorkspaceSocket(slug);
    sockets.set(slug, socket);
  }
  return socket;
}

/** Calls `onEvent` for every realtime event in the workspace, plus `sync` after any gap. */
export function useRealtime(slug: string, onEvent: (event: LiveEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => socketFor(slug).add((event) => handler.current(event)), [slug]);
}

/**
 * Runs `refresh` when a matching event arrives (and after any gap). Bursts collapse: while a refresh
 * is running, further events queue exactly one more run. A hidden tab defers the work until it shows.
 */
export function useLiveRefresh(
  slug: string,
  refresh: () => Promise<unknown>,
  matches: (event: RealtimeEvent) => boolean,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const state = useRef({ running: false, again: false, stale: false });

  useEffect(() => {
    const run = async () => {
      const current = state.current;
      if (document.visibilityState === 'hidden') {
        current.stale = true;
        return;
      }
      if (current.running) {
        current.again = true;
        return;
      }
      current.running = true;
      try {
        do {
          current.again = false;
          await refreshRef.current().catch(() => undefined);
        } while (current.again);
      } finally {
        current.running = false;
      }
    };
    const onShow = () => {
      if (document.visibilityState === 'visible' && state.current.stale) {
        state.current.stale = false;
        void run();
      }
    };
    const unsubscribe = socketFor(slug).add((event) => {
      if (event.t === 'sync' || matchesRef.current(event)) void run();
    });
    document.addEventListener('visibilitychange', onShow);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [slug]);
}
