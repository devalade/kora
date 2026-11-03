import { createServerFn } from '@tanstack/react-start';
import { and, db, desc, eq, gt, isNull, ne } from 'void/db';
import {
  callParticipants,
  callSignals,
  calls,
  channelMembers,
  channels,
  officeActivities,
  officePresence,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { toUserSummary } from './people';
import { memberUsers, requireWorkspace, touchPresence } from './server';
import { readSessionUser } from './session';
import type { CallView, OfficeActivity, OfficePerson, OfficeSnapshot, OfficeStatus } from './types';

const ZONES = ['floor', 'focus', 'lounge', 'huddle', 'kitchen'] as const;
const CALL_STALE_MS = 120_000;
type Zone = (typeof ZONES)[number];

const ZONE_LABELS: Record<Zone, string> = {
  floor: 'the Studio floor',
  focus: 'the Focus room',
  lounge: 'the Lounge',
  huddle: 'the Huddle room',
  kitchen: 'the Kitchen',
};

const STATUS_LABELS: Record<OfficeStatus, string> = {
  available: 'Available',
  focus: 'Focus mode',
  away: 'Away',
  huddle: 'In a huddle',
};

const ZONE_SPOTS: Record<Zone, [number, number][]> = {
  floor: [
    [44, 56],
    [56, 49],
    [39, 44],
    [62, 62],
    [49, 68],
  ],
  focus: [
    [17, 24],
    [27, 24],
    [17, 36],
    [27, 36],
  ],
  lounge: [
    [18, 78],
    [34, 68],
    [24, 62],
  ],
  huddle: [
    [74, 22],
    [86, 34],
    [80, 28],
  ],
  kitchen: [
    [82, 76],
    [71, 79],
  ],
};

function asZone(value: string): Zone {
  return ZONES.includes(value as Zone) ? (value as Zone) : 'floor';
}

function asStatus(value: string): OfficeStatus {
  return value === 'focus' || value === 'away' || value === 'huddle' ? value : 'available';
}

async function officeActiveCall(channelId: string): Promise<CallView | null> {
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
    .orderBy(desc(calls.startedAt))
    .limit(1);
  if (!call) return null;
  const live = await db
    .select({
      userId: callParticipants.userId,
      name: users.name,
      avatarColor: users.avatarColor,
      muted: callParticipants.muted,
      cameraOn: callParticipants.cameraOn,
      sharing: callParticipants.sharing,
      joinedAt: callParticipants.joinedAt,
    })
    .from(callParticipants)
    .innerJoin(users, eq(users.id, callParticipants.userId))
    .where(
      and(
        eq(callParticipants.callId, call.id),
        isNull(callParticipants.leftAt),
        gt(
          callParticipants.lastSeenAt,
          new Date(Date.now() - CALL_STALE_MS).toISOString(),
        ),
      ),
    )
    .orderBy(callParticipants.joinedAt);
  if (live.length === 0) {
    await db.update(calls).set({ endedAt: new Date().toISOString() }).where(eq(calls.id, call.id));
    await db.delete(callSignals).where(eq(callSignals.callId, call.id));
    return null;
  }
  return {
    id: call.id,
    channelId: call.channelId,
    startedBy: call.startedBy,
    startedAt: call.startedAt,
    participants: live.map((row) => ({
      userId: row.userId,
      name: row.name,
      avatarColor: row.avatarColor,
      muted: row.muted,
      cameraOn: row.cameraOn,
      sharing: row.sharing,
      joinedAt: row.joinedAt,
    })),
  };
}

async function joinOfficeCall(channelId: string, userId: string) {
  const [existing] = await db
    .select({ id: calls.id })
    .from(calls)
    .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
    .limit(1);
  let callId = existing?.id ?? null;
  if (!callId) {
    const candidate = newId();
    await db
      .insert(calls)
      .values({ id: candidate, channelId, startedBy: userId })
      .onConflictDoNothing();
    const [created] = await db
      .select({ id: calls.id })
      .from(calls)
      .where(and(eq(calls.channelId, channelId), isNull(calls.endedAt)))
      .limit(1);
    callId = created?.id ?? null;
  }
  if (!callId) throw new Error('Could not start the huddle.');
  const now = new Date().toISOString();
  await db
    .insert(callParticipants)
    .values({ callId, userId, lastSeenAt: now, leftAt: null })
    .onConflictDoUpdate({
      target: [callParticipants.callId, callParticipants.userId],
      set: { leftAt: null, lastSeenAt: now, joinedAt: now },
    });
  return callId;
}

async function findStudioChannel(workspaceId: string) {
  const rows = await db
    .select()
    .from(channels)
    .where(and(eq(channels.workspaceId, workspaceId), eq(channels.kind, 'studio')))
    .limit(1);
  return rows[0] ?? null;
}

async function ensureStudioChannel(workspaceId: string, createdBy: string) {
  const existing = await findStudioChannel(workspaceId);
  if (existing) return existing;
  const channelId = newId();
  await db.insert(channels).values({
    id: channelId,
    workspaceId,
    name: '__studio',
    topic: 'The Studio huddle room.',
    kind: 'studio',
    createdBy,
  });
  const members = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  if (members.length > 0) {
    await db
      .insert(channelMembers)
      .values(members.map((member) => ({ channelId, userId: member.userId })))
      .onConflictDoNothing();
  }
  return (await findStudioChannel(workspaceId))!;
}

function nextSpot(
  zone: Zone,
  used: { zone: string; x: number; y: number }[],
): [number, number] {
  const spots = ZONE_SPOTS[zone];
  const taken = new Set(used.filter((row) => row.zone === zone).map((row) => `${row.x}:${row.y}`));
  const free = spots.find(([x, y]) => !taken.has(`${x}:${y}`));
  if (free) return free;
  const base = spots[used.length % spots.length] ?? [50, 55];
  return [Math.max(8, Math.min(92, base[0] + (used.length % 3) * 3 - 3)), Math.max(10, Math.min(88, base[1] + (used.length % 2) * 4))];
}

async function logOfficeActivity(
  workspaceId: string,
  userId: string,
  kind: string,
  detail: string,
) {
  await db.insert(officeActivities).values({
    id: newId(),
    workspaceId,
    userId,
    kind,
    detail,
  });
}

export const getOfficeFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    const membership = await requireWorkspace(workspace.id, me.id);
    await touchPresence(me.id);

    const [members, presenceRows, activityRows, studioChannel] = await Promise.all([
      memberUsers(workspace.id),
      db.select().from(officePresence).where(eq(officePresence.workspaceId, workspace.id)),
      db
        .select({
          id: officeActivities.id,
          kind: officeActivities.kind,
          detail: officeActivities.detail,
          createdAt: officeActivities.createdAt,
          authorId: users.id,
          authorName: users.name,
          authorEmail: users.email,
          authorAvatarColor: users.avatarColor,
          authorTitle: users.title,
          authorStatusEmoji: users.statusEmoji,
          authorStatusText: users.statusText,
          authorLastSeenAt: users.lastSeenAt,
        })
        .from(officeActivities)
        .innerJoin(users, eq(users.id, officeActivities.userId))
        .where(eq(officeActivities.workspaceId, workspace.id))
        .orderBy(desc(officeActivities.createdAt))
        .limit(24),
      findStudioChannel(workspace.id),
    ]);

    const presenceMap = new Map(presenceRows.map((row) => [row.userId, row]));
    const people: OfficePerson[] = members
      .map((user, index) => {
        const row = presenceMap.get(user.id);
        const zone = asZone(row?.zone ?? (index === 0 ? 'floor' : 'lounge'));
        const [x, y] = row
          ? [row.x, row.y]
          : nextSpot(
              zone,
              presenceRows.map((presence) => ({
                zone: presence.zone,
                x: presence.x,
                y: presence.y,
              })),
            );
        return {
          user,
          zone,
          x,
          y,
          activity: row?.activity || user.statusText || 'Around the Studio',
          status: asStatus(row?.status ?? (user.online ? 'available' : 'away')),
          updatedAt: row?.updatedAt ?? user.lastSeenAt,
          online: user.online,
        };
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || a.user.name.localeCompare(b.user.name));

    const activities: OfficeActivity[] = activityRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      detail: row.detail,
      createdAt: row.createdAt,
      user: toUserSummary({
        id: row.authorId,
        name: row.authorName,
        email: row.authorEmail,
        avatarColor: row.authorAvatarColor,
        title: row.authorTitle,
        statusEmoji: row.authorStatusEmoji,
        statusText: row.authorStatusText,
        lastSeenAt: row.authorLastSeenAt,
      }),
    }));

    const call = studioChannel ? await officeActiveCall(studioChannel.id) : null;

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        inviteCode: workspace.inviteCode,
        role: membership.role,
      },
      me,
      people,
      activities,
      studioChannelId: studioChannel?.id ?? null,
      call,
    } satisfies OfficeSnapshot;
  });

export const updateOfficeFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      zone: z.string().trim().min(1).max(20).optional(),
      activity: z.string().trim().max(80).optional(),
      status: z.enum(['available', 'focus', 'away', 'huddle']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    await requireWorkspace(workspace.id, me.id);

    const [current, others] = await Promise.all([
      db
        .select()
        .from(officePresence)
        .where(and(eq(officePresence.workspaceId, workspace.id), eq(officePresence.userId, me.id)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ zone: officePresence.zone, x: officePresence.x, y: officePresence.y })
        .from(officePresence)
        .where(and(eq(officePresence.workspaceId, workspace.id), ne(officePresence.userId, me.id))),
    ]);

    const requestedZone = data.zone ? asZone(data.zone) : null;
    const zone = requestedZone ?? asZone(current?.zone ?? 'floor');
    const zoneChanged = requestedZone !== null && requestedZone !== asZone(current?.zone ?? '');
    const [x, y] = zoneChanged
      ? nextSpot(zone, others)
      : [current?.x ?? nextSpot(zone, others)[0], current?.y ?? nextSpot(zone, others)[1]];
    const nextActivity =
      data.activity !== undefined
        ? data.activity
        : current?.activity || me.statusText || 'Around the Studio';
    const nextStatus =
      data.status ?? asStatus(current?.status ?? (me.online ? 'available' : 'away'));

    await db
      .insert(officePresence)
      .values({
        workspaceId: workspace.id,
        userId: me.id,
        zone,
        x,
        y,
        activity: nextActivity,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [officePresence.workspaceId, officePresence.userId],
        set: {
          zone,
          x,
          y,
          activity: nextActivity,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        },
      });

    const activityChanged = data.activity !== undefined && data.activity !== current?.activity;
    const statusChanged = data.status !== undefined && data.status !== current?.status;
    if (zoneChanged) {
      await logOfficeActivity(workspace.id, me.id, 'moved', `Moved to ${ZONE_LABELS[zone]}`);
    } else if (statusChanged) {
      await logOfficeActivity(
        workspace.id,
        me.id,
        'status',
        `Set status to ${STATUS_LABELS[nextStatus]}`,
      );
    } else if (activityChanged) {
      await logOfficeActivity(
        workspace.id,
        me.id,
        'activity',
        nextActivity ? `Is now “${nextActivity}”` : 'Cleared their activity',
      );
    }

    return { ok: true as const };
  });

export const joinStudioCallFn = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    await requireWorkspace(workspace.id, me.id);
    const studio = await ensureStudioChannel(workspace.id, me.id);
    const callId = await joinOfficeCall(studio.id, me.id);

    await db
      .insert(officePresence)
      .values({
        workspaceId: workspace.id,
        userId: me.id,
        zone: 'huddle',
        x: 74,
        y: 22,
        activity: 'In the Studio huddle',
        status: 'huddle',
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [officePresence.workspaceId, officePresence.userId],
        set: {
          zone: 'huddle',
          x: 74,
          y: 22,
          activity: 'In the Studio huddle',
          status: 'huddle',
          updatedAt: new Date().toISOString(),
        },
      });
    await logOfficeActivity(workspace.id, me.id, 'call', 'Joined the Studio huddle');

    return { callId, channelId: studio.id };
  });
