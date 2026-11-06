import { createFileRoute } from '@tanstack/react-router';
import { db, eq } from 'void/db';
import { users } from '@schema';
import { storage } from 'void/storage';
import { readSessionUser } from '../lib/session';
import { newId } from '../lib/ids';
import { avatarUrlFor } from '../lib/people';
import { publishProfileChange } from '../lib/realtime';

// The client crops and resizes to 256px before uploading, so real photos are far below this.
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

async function removeStored(key: string | null) {
  if (!key) return;
  try {
    await storage.delete(key);
  } catch {
    // A missing object is fine; the database row is the source of truth.
  }
}

export const Route = createFileRoute('/api/avatar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await readSessionUser();
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        const declared = Number(request.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > MAX_BYTES + 100_000) {
          return Response.json({ error: 'Photos are limited to 2 MB.' }, { status: 413 });
        }
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: 'Choose a photo to upload.' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: 'Photos are limited to 2 MB.' }, { status: 400 });
        }
        const mime = (file.type || '').split(';')[0].trim().toLowerCase();
        const extension = ALLOWED.get(mime);
        if (!extension) {
          return Response.json({ error: 'Use a PNG, JPEG, WebP or GIF image.' }, { status: 400 });
        }

        const [current] = await db
          .select({ avatarKey: users.avatarKey })
          .from(users)
          .where(eq(users.id, me.id));
        // A fresh key per upload changes the URL, so caches never serve the previous photo.
        const key = `avatars/${me.id}/${newId()}.${extension}`;
        await storage.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
        await db.update(users).set({ avatarKey: key }).where(eq(users.id, me.id));
        await publishProfileChange(me.id);
        await removeStored(current?.avatarKey ?? null);
        return Response.json({ avatarUrl: avatarUrlFor(me.id, key) });
      },
      DELETE: async () => {
        const me = await readSessionUser();
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        const [current] = await db
          .select({ avatarKey: users.avatarKey })
          .from(users)
          .where(eq(users.id, me.id));
        await db.update(users).set({ avatarKey: null }).where(eq(users.id, me.id));
        await publishProfileChange(me.id);
        await removeStored(current?.avatarKey ?? null);
        return Response.json({ avatarUrl: null });
      },
    },
  },
});
