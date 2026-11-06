import { createServerFn } from '@tanstack/react-start';
import { and, db, eq, gt, inArray, isNull } from 'void/db';
import { callParticipants, callSignals, calls, channels } from '@schema';
import { env } from 'void/env';
import { z } from 'zod';
import { requireChannel, requireUser } from './server';
import { newId } from './ids';
import { publish, toChannel, toUser, toWorkspace } from './realtime';

const STALE_MS = 120_000;

async function activeCallId(channelId: string) {
  const rows = await db
    .select({ id: calls.id })
    .from(calls)
    .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function liveParticipantCount(callId: string, now = Date.now()) {
  const rows = await db
    .select({ userId: callParticipants.userId })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callId, callId),
        isNull(callParticipants.leftAt),
        gt(callParticipants.lastSeenAt, new Date(now - STALE_MS).toISOString()),
      ),
    );
  return rows.length;
}

async function endCall(callId: string) {
  await db.update(calls).set({ endedAt: new Date().toISOString() }).where(eq(calls.id, callId));
  await db.delete(callSignals).where(eq(callSignals.callId, callId));
}

async function reapStaleCall(channelId: string) {
  const callId = await activeCallId(channelId);
  if (!callId) return;
  if ((await liveParticipantCount(callId)) === 0) await endCall(callId);
}

async function requireParticipant(callId: string, userId: string) {
  const rows = await db
    .select({ userId: callParticipants.userId })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callId, callId),
        eq(callParticipants.userId, userId),
        isNull(callParticipants.leftAt),
      ),
    );
  if (rows.length === 0) throw new Error('You are not in this call.');
}

/** The channel's huddle bar and the studio both show who is in a call. */
async function announceCall(workspaceId: string, channelId: string) {
  await publish(workspaceId, [toChannel(channelId, { t: 'call', c: channelId }), toWorkspace({ t: 'workspace' })]);
}

export const joinCallFn = createServerFn({ method: 'POST' })
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const channel = await requireChannel(data.channelId, me.id);
    await reapStaleCall(data.channelId);

    let callId = await activeCallId(data.channelId);
    if (!callId) {
      const candidate = newId();
      await db
        .insert(calls)
        .values({
          id: candidate,
          channelId: data.channelId,
          startedBy: me.id,
        })
        .onConflictDoNothing();
      callId = await activeCallId(data.channelId);
      if (!callId) throw new Error('Could not start the huddle.');
    }

    const now = new Date().toISOString();
    await db
      .insert(callParticipants)
      .values({
        callId,
        userId: me.id,
        lastSeenAt: now,
        leftAt: null,
      })
      .onConflictDoUpdate({
        target: [callParticipants.callId, callParticipants.userId],
        set: { leftAt: null, lastSeenAt: now, joinedAt: now },
      });
    await announceCall(channel.workspaceId, data.channelId);
    return { callId };
  });

export const heartbeatCallFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      callId: z.string(),
      muted: z.boolean(),
      cameraOn: z.boolean(),
      sharing: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [call] = await db.select().from(calls).where(eq(calls.id, data.callId));
    if (!call || call.endedAt) throw new Error('This call has ended.');
    const channel = await requireChannel(call.channelId, me.id);
    const [before] = await db
      .select({ muted: callParticipants.muted, cameraOn: callParticipants.cameraOn, sharing: callParticipants.sharing })
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, data.callId), eq(callParticipants.userId, me.id)));
    await db
      .update(callParticipants)
      .set({
        lastSeenAt: new Date().toISOString(),
        muted: data.muted,
        cameraOn: data.cameraOn,
        sharing: data.sharing,
      })
      .where(
        and(
          eq(callParticipants.callId, data.callId),
          eq(callParticipants.userId, me.id),
          isNull(callParticipants.leftAt),
        ),
      );
    // The heartbeat doubles as the mute, camera and screen-share update; announce only real changes.
    if (
      before &&
      (before.muted !== data.muted || before.cameraOn !== data.cameraOn || before.sharing !== data.sharing)
    ) {
      await announceCall(channel.workspaceId, call.channelId);
    }
    return { ok: true as const };
  });

export const leaveCallFn = createServerFn({ method: 'POST' })
  .validator(z.object({ callId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await db
      .update(callParticipants)
      .set({ leftAt: new Date().toISOString() })
      .where(and(eq(callParticipants.callId, data.callId), eq(callParticipants.userId, me.id)));
    if ((await liveParticipantCount(data.callId)) === 0) await endCall(data.callId);
    const [call] = await db
      .select({ channelId: calls.channelId, workspaceId: channels.workspaceId })
      .from(calls)
      .innerJoin(channels, eq(channels.id, calls.channelId))
      .where(eq(calls.id, data.callId));
    if (call) await announceCall(call.workspaceId, call.channelId);
    return { ok: true as const };
  });

export const sendCallSignalFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      callId: z.string(),
      toUserId: z.string(),
      kind: z.enum(['offer', 'answer', 'ice']),
      payload: z.unknown(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    const [call] = await db.select().from(calls).where(eq(calls.id, data.callId));
    if (!call || call.endedAt) throw new Error('This call has ended.');
    const channel = await requireChannel(call.channelId, me.id);
    await requireParticipant(data.callId, me.id);

    const recipient = await db
      .select({ userId: callParticipants.userId })
      .from(callParticipants)
      .where(
        and(
          eq(callParticipants.callId, data.callId),
          eq(callParticipants.userId, data.toUserId),
          isNull(callParticipants.leftAt),
        ),
      );
    if (recipient.length === 0) return { ok: false as const };
    const payload = JSON.stringify(data.payload);
    if (payload.length > 20_000) throw new Error('Signal payload is too large.');
    await db.insert(callSignals).values({
      id: newId(),
      callId: data.callId,
      fromUserId: me.id,
      toUserId: data.toUserId,
      kind: data.kind,
      payload,
    });
    await publish(channel.workspaceId, [toUser(data.toUserId, { t: 'signal', call: data.callId })]);
    return { ok: true as const };
  });

export const pollCallSignalsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ callId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireParticipant(data.callId, me.id);
    const rows = await db
      .select()
      .from(callSignals)
      .where(and(eq(callSignals.callId, data.callId), eq(callSignals.toUserId, me.id)))
      .orderBy(callSignals.createdAt)
      .limit(80);
    if (rows.length > 0) {
      await db.delete(callSignals).where(
        inArray(
          callSignals.id,
          rows.map((row) => row.id),
        ),
      );
    }
    return rows.map((row) => ({
      id: row.id,
      fromUserId: row.fromUserId,
      kind: row.kind as 'offer' | 'answer' | 'ice',
      payload: JSON.parse(row.payload) as {
        type?: string;
        sdp?: string;
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      },
    }));
  });

/** The part of `RTCIceServer` that crosses the wire. */
export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];
const TURN_TTL_SECONDS = 86_400;
// Credentials live for a day; reuse one set for an hour per isolate instead of minting one per call.
const TURN_REUSE_MS = 60 * 60 * 1000;
let mintedTurn: { servers: IceServerConfig[]; mintedAt: number } | null = null;

/** Static relay from `VITE_TURN_*` (build-time values), or nothing when they are not set. */
function configuredTurn(): IceServerConfig[] {
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (!url) return [];
  return [
    {
      urls: url,
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    },
  ];
}

/** Cloudflare returns `iceServers` as one object (or a list); port 53 URLs are dropped because browsers block them. */
function normalizeIceServers(raw: unknown): IceServerConfig[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const servers: IceServerConfig[] = [];
  for (const item of list) {
    const entry = item as Partial<IceServerConfig> | null;
    if (!entry || !entry.urls) continue;
    const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter(
      (url) => typeof url === 'string' && !/:53(\?|$)/.test(url),
    );
    if (urls.length === 0) continue;
    servers.push({ urls, username: entry.username, credential: entry.credential });
  }
  return servers;
}

async function mintCloudflareTurn(keyId: string, token: string): Promise<IceServerConfig[] | null> {
  if (mintedTurn && Date.now() - mintedTurn.mintedAt < TURN_REUSE_MS) return mintedTurn.servers;
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { iceServers?: unknown };
    const servers = normalizeIceServers(payload.iceServers);
    if (servers.length === 0) return null;
    mintedTurn = { servers, mintedAt: Date.now() };
    return servers;
  } catch {
    return null;
  }
}

/**
 * ICE servers for a huddle. With `CF_TURN_KEY_ID` and `CF_TURN_KEY_API_TOKEN` set in the server
 * environment, short-lived Cloudflare TURN credentials are minted here so no secret reaches the
 * browser. Otherwise (or if minting fails) it returns the public STUN servers plus any `VITE_TURN_*`
 * relay.
 */
export const getIceServersFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser();
  const keyId = env.CF_TURN_KEY_ID;
  const token = env.CF_TURN_KEY_API_TOKEN;
  if (keyId && token) {
    const minted = await mintCloudflareTurn(keyId, token);
    if (minted) return { iceServers: minted, source: 'cloudflare' as const };
  }
  return { iceServers: [...STUN_SERVERS, ...configuredTurn()], source: 'static' as const };
});
