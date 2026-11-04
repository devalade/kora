export type LinkPreviewData = {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string;
  domain: string;
};

const HTML_META = /<meta\b[^>]*>/gi;
const HTML_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function codePoint(value: number) {
  try {
    return String.fromCodePoint(value);
  } catch {
    return '';
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => codePoint(Number.parseInt(digits, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name: string) => {
      const lower = name.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      return ' ';
    });
}

function clean(value: string, max: number) {
  return decodeEntities(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function readAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name || attributes.has(name)) continue;
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function metaMap(html: string) {
  const metas = new Map<string, string>();
  const matches = html.match(HTML_META) ?? [];
  for (const tag of matches) {
    const attributes = readAttributes(tag);
    const key = (attributes.get('property') ?? attributes.get('name') ?? '').trim().toLowerCase();
    const content = attributes.get('content');
    if (!key || !content || metas.has(key)) continue;
    metas.set(key, content);
  }
  return metas;
}

function firstMeta(metas: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = metas.get(key);
    if (value) return value;
  }
  return '';
}

function absoluteImage(value: string, base: string) {
  if (!value) return null;
  try {
    const image = new URL(decodeEntities(value), base);
    if (image.protocol !== 'http:' && image.protocol !== 'https:') return null;
    return image.href.slice(0, 2000);
  } catch {
    return null;
  }
}

export function parseLinkPreview(html: string, baseUrl: string): LinkPreviewData | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  const metas = metaMap(html);
  const titleTag = html.match(HTML_TITLE)?.[1] ?? '';
  const title = clean(
    firstMeta(metas, ['og:title', 'twitter:title']) || titleTag,
    240,
  );
  const description = clean(
    firstMeta(metas, ['og:description', 'twitter:description', 'description']),
    360,
  );
  const imageUrl = absoluteImage(
    firstMeta(metas, [
      'og:image:secure_url',
      'og:image',
      'twitter:image',
      'twitter:image:src',
    ]),
    parsed.href,
  );
  if (!title && !description && !imageUrl) return null;
  const domain = parsed.hostname.replace(/^www\./i, '') || parsed.hostname;
  const siteName = clean(firstMeta(metas, ['og:site_name', 'application-name']), 80) || domain;
  return {
    url: parsed.href,
    title,
    description,
    imageUrl,
    siteName,
    domain,
  };
}

export function extractPreviewUrls(body: string, limit = 2) {
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(body)) !== null) {
    let value = match[0].replace(TRAILING_PUNCTUATION, '');
    while (value.endsWith(')') && (value.match(/\(/g)?.length ?? 0) < (value.match(/\)/g)?.length ?? 0)) {
      value = value.slice(0, -1);
    }
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const normalized = url.href;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
      if (urls.length >= limit) break;
    } catch {
      // Ignore text that only looks like a URL.
    }
  }
  return urls;
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }
  if (host.includes(':')) return true;
  if (/^[0-9.]+$/.test(host)) return true;
  return false;
}

export function isSafePreviewUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  if (!host || isPrivateHostname(host)) return false;
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!looksLikeIp && !host.includes('.') && !host.includes(':')) return false;
  return true;
}
