import { createFileRoute } from '@tanstack/react-router';
import { storage } from 'void/storage';
import { readSessionUser } from '../lib/session';
import { attachmentForUser } from '../lib/attachments';

export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const me = await readSessionUser();
        if (!me) return new Response('Sign in required.', { status: 401 });
        const row = await attachmentForUser(params.id, me.id);
        if (!row) return new Response('Not found.', { status: 404 });
        const object = await storage.get(row.storageKey);
        if (!object) return new Response('Not found.', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('cache-control', 'private, max-age=3600');
        headers.set('x-content-type-options', 'nosniff');
        const inline =
          row.mime.startsWith('image/') ||
          row.mime.startsWith('video/') ||
          row.mime.startsWith('audio/') ||
          row.mime === 'application/pdf' ||
          row.mime.startsWith('text/plain');
        const disposition = inline ? 'inline' : 'attachment';
        headers.set(
          'content-disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        );
        return new Response(object.body, { headers });
      },
    },
  },
});
