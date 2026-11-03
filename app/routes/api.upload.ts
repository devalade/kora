import { createFileRoute } from '@tanstack/react-router';
import { db } from 'void/db';
import { attachments } from '@schema';
import { storage } from 'void/storage';
import { readSessionUser } from '../lib/session';
import { newId } from '../lib/ids';

const MAX_BYTES = 25 * 1024 * 1024;

const BLOCKED = new Set([
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'image/svg+xml',
]);

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await readSessionUser();
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return Response.json({ error: 'Choose a file to upload.' }, { status: 400 });
        }
        if (file.size === 0) {
          return Response.json({ error: 'That file is empty.' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: 'Files are limited to 25 MB.' }, { status: 400 });
        }
        const mime = file.type || 'application/octet-stream';
        if (BLOCKED.has(mime)) {
          return Response.json({ error: 'That file type is not supported.' }, { status: 400 });
        }
        const id = newId();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'file';
        const key = `uploads/${me.id}/${id}-${safeName}`;
        await storage.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: mime },
        });
        await db.insert(attachments).values({
          id,
          uploaderId: me.id,
          name: file.name.slice(0, 160) || safeName,
          mime,
          size: file.size,
          storageKey: key,
        });
        return Response.json({
          id,
          name: file.name.slice(0, 160) || safeName,
          mime,
          size: file.size,
        });
      },
    },
  },
});
