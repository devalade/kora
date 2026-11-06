import { createFileRoute } from '@tanstack/react-router';
import { db, inArray } from 'void/db';
import { users } from '@schema';
import { z } from 'zod';
import { realtimeConfig } from '../lib/realtime';
import { inChunks } from '../lib/server';

// The realtime worker reports who has a socket open: on connect, on the last disconnect, and every
// 30 seconds while anyone is connected. Presence everywhere in the app reads users.last_seen_at
// (online = seen in the last 75 s), so this is what keeps it live without the browser polling.
const Body = z.object({
  w: z.string(),
  online: z.array(z.string()).max(5000),
  offline: z.array(z.string()).max(5000),
});

const OFFLINE_AGO_MS = 76_000;

async function sameSecret(given: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
}

export const Route = createFileRoute('/api/realtime/presence')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = realtimeConfig();
        if (!config) return new Response('Realtime is not configured.', { status: 404 });
        if (!(await sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${config.secret}`))) {
          return new Response('Unauthorized', { status: 401 });
        }
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response('Bad request', { status: 400 });
        const now = Date.now();
        const { online, offline } = parsed.data;
        await inChunks(online, (chunk) =>
          db.update(users).set({ lastSeenAt: new Date(now).toISOString() }).where(inArray(users.id, chunk)).returning({ id: users.id }),
        );
        await inChunks(offline, (chunk) =>
          db
            .update(users)
            .set({ lastSeenAt: new Date(now - OFFLINE_AGO_MS).toISOString() })
            .where(inArray(users.id, chunk))
            .returning({ id: users.id }),
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
