import { createFileRoute } from '@tanstack/react-router';
import { and, db, eq, inArray } from 'void/db';
import { users, workspaceMembers } from '@schema';
import { storage } from 'void/storage';
import { readSessionUser } from '../lib/session';

export const Route = createFileRoute('/api/avatars/$userId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const me = await readSessionUser();
        if (!me) return new Response('Sign in required.', { status: 401 });

        // Photos are visible to yourself and to people you share a workspace with.
        if (params.userId !== me.id) {
          const myWorkspaces = db
            .select({ id: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.userId, me.id));
          const [shared] = await db
            .select({ workspaceId: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.userId, params.userId),
                inArray(workspaceMembers.workspaceId, myWorkspaces),
              ),
            )
            .limit(1);
          if (!shared) return new Response('Not found.', { status: 404 });
        }

        const [row] = await db
          .select({ avatarKey: users.avatarKey })
          .from(users)
          .where(eq(users.id, params.userId));
        if (!row?.avatarKey) return new Response('Not found.', { status: 404 });
        const object = await storage.get(row.avatarKey);
        if (!object) return new Response('Not found.', { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // The URL carries a version (?v=), so each photo can be cached for good.
        headers.set('cache-control', 'private, max-age=31536000, immutable');
        headers.set('x-content-type-options', 'nosniff');
        headers.set('content-security-policy', "default-src 'none'; sandbox");
        headers.set('cross-origin-resource-policy', 'same-origin');
        return new Response(object.body, { headers });
      },
    },
  },
});
