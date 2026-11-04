import { createFileRoute } from '@tanstack/react-router';
import { db, eq } from 'void/db';
import { linkPreviews } from '@schema';
import { readSessionUser } from '../lib/session';
import {
  isSafePreviewUrl,
  parseLinkPreview,
  type LinkPreviewData,
} from '../lib/link-preview';

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HTML_BYTES = 600_000;
const MAX_REDIRECTS = 3;

async function readCapped(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Page is too large.');
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - size;
    if (value.byteLength > remaining) {
      chunks.push(value.subarray(0, remaining));
      size = maxBytes;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchPreview(target: string): Promise<LinkPreviewData | null> {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafePreviewUrl(current)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.4',
          'accept-language': 'en-US,en;q=0.8',
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      try {
        current = new URL(location, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml')) {
      return null;
    }
    try {
      const html = await readCapped(response, MAX_HTML_BYTES);
      const preview = parseLinkPreview(html, current);
      return preview ? { ...preview, url: target } : null;
    } catch {
      return null;
    }
  }
  return null;
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
