import { createServerFn } from '@tanstack/react-start';
import { and, db, eq } from 'void/db';
import { channelMembers, channels, workspaceMembers, workspaces } from '@schema';
import { z } from 'zod';
import { realtimeConfig } from './realtime';
import { TICKET_TTL_MS, signTicket } from './realtime-protocol';
import { requireUser } from './server';

export type RealtimeTicket = { socketUrl: string; ticket: string };

/**
 * A short-lived ticket for the realtime worker: this person, in this workspace, hearing the channels
 * and DMs they belong to right now. Null when realtime is not configured.
 */
export const getRealtimeTicketFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<RealtimeTicket | null> => {
    const me = await requireUser();
    const config = realtimeConfig();
    if (!config) return null;
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, me.id)),
      )
      .where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('You are not a member of this workspace.');
    const memberships = await db
      .select({ id: channelMembers.channelId })
      .from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId))
      .where(and(eq(channelMembers.userId, me.id), eq(channels.workspaceId, workspace.id)));
    const ticket = await signTicket(
      { w: workspace.id, u: me.id, c: memberships.map((row) => row.id), exp: Date.now() + TICKET_TTL_MS },
      config.secret,
    );
    return { socketUrl: `${config.url.replace(/^http/, 'ws')}/ws`, ticket };
  });
