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
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
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
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isPrivateHostname(host)) return false;
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!looksLikeIp && !host.includes('.') && !host.includes(':')) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Server-side fetching: address checks, DNS-over-HTTPS and a guarded fetch with a total deadline.
//
// Everything below is plain TypeScript with no imports, so scripts/ssrf.mjs can run it directly.
//
// Workers in production already refuse to connect to private address space, so this is the second
// line of defence and also what keeps local development honest. It cannot close DNS rebinding
// completely, because the runtime resolves the name again when it connects; the per-hop checks and
// the platform block cover that gap.
// ---------------------------------------------------------------------------------------------

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

/** Parses an IPv6 literal (with `::`, a dotted IPv4 tail or a zone id) into 16 bytes. */
function parseIPv6(value: string): number[] | null {
  let text = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!text.includes(':')) return null;
  if (text.includes('.')) {
    const cut = text.lastIndexOf(':');
    const v4 = parseIPv4(text.slice(cut + 1));
    if (!v4) return null;
    text = `${text.slice(0, cut + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (part: string) => (part === '' ? [] : part.split(':'));
  const head = groupsOf(halves[0] ?? '');
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const word = Number.parseInt(group, 16);
    bytes.push(word >> 8, word & 255);
  }
  return bytes.length === 16 ? bytes : null;
}

function isPrivateIPv4(o: number[]) {
  const [a, b, c] = o as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 || // private
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, including cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved and broadcast
  );
}

function isPrivateIPv6(b: number[]) {
  const zeros = (from: number, to: number) => b.slice(from, to).every((byte) => byte === 0);
  const embedded = (at: number) => isPrivateIPv4(b.slice(at, at + 4));
  if (zeros(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: and ::1
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) >= 0x80) return true; // fe80::/10 link-local and fec0::/10 site-local
  if (b[0] === 0xff) return true; // multicast
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return embedded(12); // ::ffff:a.b.c.d
  if (zeros(0, 12)) return embedded(12); // deprecated IPv4-compatible ::a.b.c.d
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return zeros(4, 12) ? embedded(12) : true; // 64:ff9b::/96 NAT64, 64:ff9b:1::/48 local use
  }
  if (b[0] === 0x20 && b[1] === 0x02) return embedded(2); // 2002::/16 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
  if (b[0] === 0x01 && zeros(1, 8)) return true; // 100::/64 discard-only
  return false;
}

/** True for an address that must never be fetched. Anything that does not parse counts as private. */
export function isPrivateAddress(address: string) {
  const text = address.trim();
  const v4 = parseIPv4(text);
  if (v4) return isPrivateIPv4(v4);
  const v6 = parseIPv6(text);
  if (v6) return isPrivateIPv6(v6);
  return true;
}

/** Resolves a hostname to its A and AAAA addresses, or null when it cannot be resolved. */
export type HostResolver = (host: string) => Promise<string[] | null>;

const DNS_CACHE_MS = 5 * 60 * 1000;
const DNS_CACHE_MAX = 500;
const dnsCache = new Map<string, { addresses: string[] | null; expires: number }>();

type DohAnswer = { type: number; data: string };

async function dohLookup(host: string, type: 'A' | 'AAAA'): Promise<string[] | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { Status?: number; Answer?: DohAnswer[] };
  // Status 0 is NOERROR; an empty answer (no AAAA record, say) is fine, a lookup error is not.
  if (payload.Status !== 0 && payload.Status !== 3) return null;
  const wanted = type === 'A' ? 1 : 28;
  return (payload.Answer ?? []).filter((answer) => answer.type === wanted).map((answer) => answer.data);
}

/** Looks a host up over DNS-over-HTTPS (Cloudflare), A and AAAA together, cached for five minutes. */
export const resolveWithDoh: HostResolver = async (host) => {
  const key = host.toLowerCase();
  const cached = dnsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.addresses;
  let addresses: string[] | null = null;
  try {
    const [v4, v6] = await Promise.all([dohLookup(key, 'A'), dohLookup(key, 'AAAA')]);
    // A failed family fails the whole lookup: an unchecked record could be the private one.
    if (v4 && v6) addresses = [...v4, ...v6];
  } catch {
    addresses = null;
  }
  if (dnsCache.size >= DNS_CACHE_MAX) dnsCache.clear();
  // Failures are remembered briefly so a dead resolver does not add a timeout to every request.
  dnsCache.set(key, { addresses, expires: Date.now() + (addresses ? DNS_CACHE_MS : 15_000) });
  return addresses;
};

/**
 * True when `host` is safe to connect to: not a local-looking name, and every address it resolves to
 * is public. Fails closed when resolution fails or returns nothing.
 */
export async function isPublicHost(host: string, resolve: HostResolver = resolveWithDoh) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!name) return false;
  if (name.includes(':') || /^[0-9.]+$/.test(name)) return !isPrivateAddress(name);
  if (isPrivateHostname(name)) return false;
  const addresses = await resolve(name);
  if (!addresses || addresses.length === 0) return false;
  return addresses.every((address) => !isPrivateAddress(address));
}

/** Reads a response body up to `maxBytes`: cut off (`truncate`) or refused (`fail`) beyond that. */
export async function readCapped(response: Response, maxBytes: number, overflow: 'truncate' | 'fail') {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (overflow === 'fail' && Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error('Response is too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - size;
    if (value.byteLength > remaining) {
      if (overflow === 'fail') {
        await reader.cancel();
        throw new Error('Response is too large.');
      }
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
  return merged;
}

export const MAX_PREVIEW_REDIRECTS = 3;

export type GuardedFetch<T> = {
  accept: string;
  /** Total time for every hop plus the body, not just for the headers. */
  deadlineMs: number;
  maxRedirects?: number;
  resolve?: HostResolver;
  /** Reads the final response; it runs under the same deadline. Return null to give up. */
  read: (response: Response, finalUrl: string) => Promise<T | null>;
};

/**
 * Fetches a public URL: each hop (the first request and up to three redirects) must pass the name
 * check and the DNS check, and one timer covers all of it until `read` finishes.
 */
export async function fetchGuarded<T>(target: string, options: GuardedFetch<T>): Promise<T | null> {
  const { accept, deadlineMs, maxRedirects = MAX_PREVIEW_REDIRECTS, resolve, read } = options;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Timed out.'));
    }, deadlineMs);
  });
  expired.catch(() => undefined);

  const run = async (): Promise<T | null> => {
    let current = target;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!isSafePreviewUrl(current)) return null;
      if (!(await isPublicHost(new URL(current).hostname, resolve))) return null;
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept, 'accept-language': 'en-US,en;q=0.8' },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) return null;
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      return await read(response, current);
    }
    return null;
  };

  try {
    return await Promise.race([run(), expired]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
