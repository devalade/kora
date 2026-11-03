import { createServerFn } from '@tanstack/react-start';
import { and, db, eq, gt, inArray, isNull } from 'void/db';
import { callParticipants, callSignals, calls } from '@schema';
import { z } from 'zod';
import { requireChannel, requireUser } from './server';
import { newId } from './ids';

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

export const joinCallFn = createServerFn({ method: 'POST' })
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await requireChannel(data.channelId, me.id);
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
    await requireChannel(call.channelId, me.id);
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
    await requireChannel(call.channelId, me.id);
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
