import { createFileRoute } from '@tanstack/react-router';
import { and, db, eq, inArray, isNull, lt, sql } from 'void/db';
import { attachments } from '@schema';
import { storage } from 'void/storage';
import { readSessionUser } from '../lib/session';
import { newId } from '../lib/ids';
import { throttleWrite } from '../lib/rate-limit';

const MAX_BYTES = 25 * 1024 * 1024;
/** Everything one person has uploaded, attached to a message or not. */
const USER_QUOTA_BYTES = 500 * 1024 * 1024;
/** A file that never reached a message within this long is abandoned. */
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 25;

function megabytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Opportunistic cleanup, run on each upload: removes this user's uploads that were never attached to
 * a message and are over a day old, R2 object first and then the row, a bounded batch at a time.
 * A row stays if its object could not be deleted, so the next upload retries it.
 */
async function removeAbandonedUploads(userId: string) {
  const cutoff = new Date(Date.now() - ORPHAN_AFTER_MS).toISOString();
  const stale = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(
      and(
        eq(attachments.uploaderId, userId),
        isNull(attachments.messageId),
        lt(attachments.createdAt, cutoff),
      ),
    )
    .limit(CLEANUP_BATCH);
  if (stale.length === 0) return;
  const removed: string[] = [];
  for (const row of stale) {
    try {
      await storage.delete(row.storageKey);
      removed.push(row.id);
    } catch {
      // Keep the row; a later upload tries again.
    }
  }
  if (removed.length > 0) {
    // Guard on message_id again so a file attached while this ran is never deleted.
    await db
      .delete(attachments)
      .where(and(inArray(attachments.id, removed), isNull(attachments.messageId)));
  }
}

async function usedBytes(userId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${attachments.size}), 0)` })
    .from(attachments)
    .where(eq(attachments.uploaderId, userId));
  return Number(row?.total ?? 0);
}

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
        const declaredLength = Number(request.headers.get('content-length') ?? '0');
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 1_000_000) {
          return Response.json({ error: 'Files are limited to 25 MB.' }, { status: 413 });
        }
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
        const mime = (file.type || 'application/octet-stream')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (BLOCKED.has(mime) || mime === 'image/svg+xml') {
          return Response.json({ error: 'That file type is not supported.' }, { status: 400 });
        }
        try {
          await throttleWrite('upload', me.id);
        } catch (error) {
          return Response.json({ error: (error as Error).message }, { status: 429 });
        }
        await removeAbandonedUploads(me.id).catch(() => undefined);
        const used = await usedBytes(me.id);
        if (used + file.size > USER_QUOTA_BYTES) {
          return Response.json(
            {
              error: `You have used ${megabytes(used)} of your ${megabytes(USER_QUOTA_BYTES)} file storage. Free up space before uploading ${megabytes(file.size)} more.`,
            },
            { status: 413 },
          );
        }
        const id = newId();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'file';
        const key = `uploads/${me.id}/${id}-${safeName}`;
        await storage.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: mime },
        });
        try {
          await db.insert(attachments).values({
            id,
            uploaderId: me.id,
            name: file.name.slice(0, 160) || safeName,
            mime,
            size: file.size,
            storageKey: key,
          });
        } catch (error) {
          await storage.delete(key).catch(() => undefined);
          throw error;
        }
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
