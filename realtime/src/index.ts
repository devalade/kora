import { DurableObject } from 'cloudflare:workers';
import { hears, verifyTicket, type Grant, type Published } from '../../app/lib/realtime-protocol';

interface Env {
  HUB: DurableObjectNamespace<WorkspaceHub>;
  /** Shared with the app (`REALTIME_SECRET`): signs tickets and authenticates publishes. */
  REALTIME_SECRET: string;
  /** The app's origin: the only page allowed to open sockets, and where presence is reported. */
  APP_ORIGIN: string;
}

type Attachment = Pick<Grant, 'u' | 'c'>;

/** While anyone is connected, the hub tells the app who is online this often. */
const PRESENCE_EVERY_MS = 30_000;
const MAX_PUBLISH_EVENTS = 200;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response(env.REALTIME_SECRET ? 'ok' : 'missing secret');
    // Fail closed: without the shared secret no ticket or publish can be checked.
    if (!env.REALTIME_SECRET || env.REALTIME_SECRET.length < 32) {
      return new Response('Realtime is not configured.', { status: 503 });
    }
    if (url.pathname === '/ws') return connect(request, url, env);
    if (url.pathname === '/publish' && request.method === 'POST') return publish(request, env);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function connect(request: Request, url: URL, env: Env) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade.', { status: 426 });
  }
  // A ticket is a bearer token; checking the page's origin as well stops another site replaying one.
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return new Response('Forbidden origin.', { status: 403 });
  const grant = await verifyTicket(url.searchParams.get('ticket') ?? '', env.REALTIME_SECRET);
  if (!grant) return new Response('Invalid or expired ticket.', { status: 401 });
  const hub = env.HUB.get(env.HUB.idFromName(grant.w));
  return hub.fetch('https://hub/connect', {
    headers: {
      Upgrade: 'websocket',
      'x-kora-grant': JSON.stringify({ w: grant.w, u: grant.u, c: grant.c } satisfies Omit<Grant, 'exp'>),
    },
  });
}

async function publish(request: Request, env: Env) {
  if (!(await sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${env.REALTIME_SECRET}`))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { w?: unknown; events?: unknown } | null;
  if (!body || typeof body.w !== 'string' || !Array.isArray(body.events)) {
    return new Response('Expected { w, events }.', { status: 400 });
  }
  const events = (body.events as Published[])
    .filter((item) => typeof item?.topic === 'string' && typeof item?.event?.t === 'string')
    .slice(0, MAX_PUBLISH_EVENTS);
  await env.HUB.get(env.HUB.idFromName(body.w)).publish(events);
  return new Response(null, { status: 204 });
}

async function sameSecret(given: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export class WorkspaceHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request) {
    const grant = JSON.parse(request.headers.get('x-kora-grant') ?? 'null') as Omit<Grant, 'exp'> | null;
    if (!grant) return new Response('Missing grant.', { status: 400 });
    const firstSocket = this.socketsOf(grant.u).length === 0;
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [grant.u]);
    pair[1].serializeAttachment({ u: grant.u, c: grant.c } satisfies Attachment);
    await this.workspaceId(grant.w);
    if (firstSocket) await this.presenceChanged({ online: [grant.u] });
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + PRESENCE_EVERY_MS);
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Called by the worker for every publish from the app. */
  async publish(events: Published[]) {
    for (const socket of this.ctx.getWebSockets()) {
      const grant = socket.deserializeAttachment() as Attachment | null;
      if (!grant) continue;
      const mine = events.filter((item) => hears(grant, item.topic)).map((item) => item.event);
      if (mine.length > 0) this.send(socket, mine);
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    let parsed: { type?: string; ticket?: string } | null = null;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    // A fresh ticket after this person's channel access changed (see the 'grants' event).
    if (parsed?.type === 'ticket' && typeof parsed.ticket === 'string') {
      const current = socket.deserializeAttachment() as Attachment | null;
      const grant = await verifyTicket(parsed.ticket, this.env.REALTIME_SECRET);
      if (!grant || !current || grant.u !== current.u || grant.w !== (await this.workspaceId())) return;
      socket.serializeAttachment({ u: grant.u, c: grant.c } satisfies Attachment);
    }
  }

  async webSocketClose(socket: WebSocket) {
    await this.left(socket);
  }

  async webSocketError(socket: WebSocket) {
    await this.left(socket);
  }

  async alarm() {
    const online = this.onlineUsers();
    if (online.length === 0) return;
    await this.report({ online, offline: [] });
    await this.ctx.storage.setAlarm(Date.now() + PRESENCE_EVERY_MS);
  }

  private async left(socket: WebSocket) {
    const grant = socket.deserializeAttachment() as Attachment | null;
    if (!grant) return;
    const stillHere = this.socketsOf(grant.u).some((other) => other !== socket);
    if (!stillHere) await this.presenceChanged({ offline: [grant.u] });
  }

  private socketsOf(userId: string) {
    return this.ctx
      .getWebSockets(userId)
      .filter((socket) => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }

  private onlineUsers() {
    const users = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const grant = socket.deserializeAttachment() as Attachment | null;
      if (grant) users.add(grant.u);
    }
    return [...users];
  }

  /** Records the workspace id the first time, and returns it. */
  private async workspaceId(id?: string) {
    const stored = await this.ctx.storage.get<string>('workspaceId');
    if (!stored && id) await this.ctx.storage.put('workspaceId', id);
    return stored ?? id ?? '';
  }

  private async presenceChanged(change: { online?: string[]; offline?: string[] }) {
    await this.report({ online: change.online ?? [], offline: change.offline ?? [] });
    await this.publish([{ topic: 'w', event: { t: 'presence' } }]);
  }

  /** Tells the app who is online, so every read (snapshots, the studio) shows live presence. */
  private async report(change: { online: string[]; offline: string[] }) {
    const w = await this.workspaceId();
    if (!w) return;
    try {
      await fetch(`${this.env.APP_ORIGIN}/api/realtime/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.REALTIME_SECRET}` },
        body: JSON.stringify({ w, ...change }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Presence catches up on the next alarm.
    }
  }

  private send(socket: WebSocket, events: unknown[]) {
    try {
      socket.send(JSON.stringify(events));
    } catch {
      // A socket closing mid-send is cleaned up by webSocketClose.
    }
  }
}
