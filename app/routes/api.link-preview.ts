import { createFileRoute } from '@tanstack/react-router';
import { db, eq } from 'void/db';
import { linkPreviews } from '@schema';
import { readSessionUser } from '../lib/session';
import {
  fetchGuarded,
  isSafePreviewUrl,
  parseLinkPreview,
  readCapped,
  type LinkPreviewData,
} from '../lib/link-preview';

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HTML_BYTES = 600_000;
/** One budget for DNS, every redirect hop and reading the body, so a slow-drip server cannot hold a request open. */
const FETCH_DEADLINE_MS = 7000;

function fetchPreview(target: string): Promise<LinkPreviewData | null> {
  return fetchGuarded(target, {
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.4',
    deadlineMs: FETCH_DEADLINE_MS,
    read: async (response, finalUrl) => {
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml')) {
        await response.body?.cancel();
        return null;
      }
      const bytes = await readCapped(response, MAX_HTML_BYTES, 'truncate');
      const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const preview = parseLinkPreview(html, finalUrl);
      return preview ? { ...preview, url: target } : null;
    },
  });
}

async function cachedPreview(url: string) {
  const [row] = await db.select().from(linkPreviews).where(eq(linkPreviews.url, url)).limit(1);
  if (!row) return null;
  if (Date.now() - new Date(row.fetchedAt).getTime() > CACHE_MS) return null;
  if (!row.title && !row.description && !row.imageUrl) return null;
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
    domain: row.domain,
  } satisfies LinkPreviewData;
}

async function storePreview(preview: LinkPreviewData) {
  const fetchedAt = new Date().toISOString();
  await db
    .insert(linkPreviews)
    .values({
      url: preview.url,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      siteName: preview.siteName,
      domain: preview.domain,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [linkPreviews.url],
      set: {
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        siteName: preview.siteName,
        domain: preview.domain,
        fetchedAt,
      },
    });
}

const inflight = new Map<string, Promise<LinkPreviewData | null>>();

export const Route = createFileRoute('/api/link-preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await readSessionUser();
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        const raw = new URL(request.url).searchParams.get('url') ?? '';
        if (!raw || raw.length > 2000) {
          return Response.json({ error: 'Send a valid URL.' }, { status: 400 });
        }
        let url: string;
        try {
          url = new URL(raw).href;
        } catch {
          return Response.json({ error: 'Send a valid URL.' }, { status: 400 });
        }
        if (!isSafePreviewUrl(url)) {
          return Response.json({ preview: null }, { status: 200 });
        }
        const cached = await cachedPreview(url);
        if (cached) return Response.json({ preview: cached });

        let pending = inflight.get(url);
        if (!pending) {
          pending = fetchPreview(url);
          inflight.set(url, pending);
          pending.finally(() => inflight.delete(url));
        }
        const preview = await pending;
        if (preview) {
          await storePreview(preview).catch(() => undefined);
        }
        return Response.json({ preview });
      },
    },
  },
});
