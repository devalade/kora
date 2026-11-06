import { createFileRoute } from '@tanstack/react-router';
import { and, db, eq } from 'void/db';
import { linkPreviews } from '@schema';
import { readSessionUser } from '../lib/session';
import { fetchGuarded, isSafePreviewUrl, readCapped } from '../lib/link-preview';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** One budget for DNS, up to three redirects and the whole body. */
const FETCH_DEADLINE_MS = 8000;

/** Only raster images pass: no SVG (scriptable), no HTML sniffed as an image. */
function isAllowedImageType(contentType: string) {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('xml');
}

/**
 * Link previews show a remote og:image. Loading it straight into every viewer's browser would tell
 * whoever hosts it who is reading the message and from where, so images load through this route: the
 * server fetches once and viewers only talk to Kora.
 *
 * Only an image URL that a stored link preview already holds can be fetched, so this is not an open
 * proxy. `page` is the previewed link (the table's primary key) and makes that check a key lookup.
 */
async function isStoredPreviewImage(imageUrl: string, pageUrl: string | null) {
  const where = pageUrl
    ? and(eq(linkPreviews.url, pageUrl), eq(linkPreviews.imageUrl, imageUrl))
    : eq(linkPreviews.imageUrl, imageUrl);
  const [row] = await db.select({ url: linkPreviews.url }).from(linkPreviews).where(where).limit(1);
  return Boolean(row);
}

export const Route = createFileRoute('/api/link-preview-image')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await readSessionUser();
        if (!me) return new Response('Sign in required.', { status: 401 });
        const params = new URL(request.url).searchParams;
        const raw = params.get('url') ?? '';
        const page = params.get('page');
        if (!raw || raw.length > 2000 || (page !== null && page.length > 2000)) {
          return new Response('Send a valid image URL.', { status: 400 });
        }
        if (!isSafePreviewUrl(raw)) return new Response('Not found.', { status: 404 });
        if (!(await isStoredPreviewImage(raw, page))) return new Response('Not found.', { status: 404 });

        const image = await fetchGuarded(raw, {
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
          deadlineMs: FETCH_DEADLINE_MS,
          read: async (response) => {
            const contentType = response.headers.get('content-type') ?? '';
            if (!isAllowedImageType(contentType)) {
              await response.body?.cancel();
              return null;
            }
            const bytes = await readCapped(response, MAX_IMAGE_BYTES, 'fail');
            if (bytes.byteLength === 0) return null;
            return { bytes, type: contentType.split(';')[0]!.trim().toLowerCase() };
          },
        });
        if (!image) return new Response('Not found.', { status: 404 });

        return new Response(image.bytes, {
          headers: {
            'content-type': image.type,
            'content-length': String(image.bytes.byteLength),
            'cache-control': 'private, max-age=86400',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'; sandbox",
            'cross-origin-resource-policy': 'same-origin',
          },
        });
      },
    },
  },
});
