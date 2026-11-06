// Server-only: tells the realtime worker (realtime/) what changed, after a write has committed.
// Client code never imports this file; it uses app/lib/realtime-client.ts.
import { db, eq } from 'void/db';
import { workspaceMembers } from '@schema';
import { env } from 'void/env';
import type { Published, RealtimeEvent } from './realtime-protocol';

export const toWorkspace = (event: RealtimeEvent): Published => ({ topic: 'w', event });
export const toChannel = (channelId: string, event: RealtimeEvent): Published => ({ topic: `c:${channelId}`, event });
export const toUser = (userId: string, event: RealtimeEvent): Published => ({ topic: `u:${userId}`, event });

export function realtimeConfig() {
  const url = env.REALTIME_URL?.replace(/\/+$/, '');
  const secret = env.REALTIME_SECRET;
  return url && secret ? { url, secret } : null;
}

/**
 * Fans events out to the workspace's open sockets. Never throws: the write it follows has already
 * succeeded, and a client that misses an event catches up when its socket reconnects.
 */
export async function publish(workspaceId: string, events: Published[]) {
  const config = realtimeConfig();
  if (!config || events.length === 0) return;
  try {
    const response = await fetch(`${config.url}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({ w: workspaceId, events }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) console.warn(`realtime: publish failed with ${response.status}`);
  } catch (error) {
    console.warn('realtime: publish failed', error instanceof Error ? error.message : error);
  }
}

/** A profile or photo changed: everyone in every workspace this person belongs to sees it. */
export async function publishProfileChange(userId: string) {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  await Promise.all(rows.map((row) => publish(row.workspaceId, [toWorkspace({ t: 'workspace' })])));
}
