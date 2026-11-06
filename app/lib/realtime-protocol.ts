// Shared by the app and the realtime worker (realtime/src/index.ts). No imports: it runs in both.
//
// Events say what changed and where, never the content; a client refetches what it shows. Topics:
//   'w'            everyone in the workspace
//   'c:<channel>'  members of one channel or DM (granted by the ticket)
//   'u:<user>'     one person, in every open tab

export type RealtimeEvent =
  /** A message, reply or reaction changed in a channel. `m` is the thread parent, when there is one. */
  | { t: 'chat'; c: string; m?: string }
  | { t: 'typing'; c: string }
  /** A huddle started, ended, or someone joined, left, muted or shared. */
  | { t: 'call'; c: string }
  /** WebRTC signals are waiting for this person in a call. */
  | { t: 'signal'; call: string }
  /** An issue changed (`i`), or the workflow, labels, teams or projects changed (no `i`). */
  | { t: 'issue'; i?: string }
  /** Someone opened, left or is typing in an issue. */
  | { t: 'editors'; i: string }
  | { t: 'inbox' }
  /** This person read a channel in another tab. */
  | { t: 'read' }
  /** Channels, members, roles, profiles or the studio changed. */
  | { t: 'workspace' }
  /** Someone came online or went offline. Sent by the worker itself. */
  | { t: 'presence' }
  /** This person's channel access changed: fetch a new ticket so their socket hears the new channels. */
  | { t: 'grants' };

export type Published = { topic: string; event: RealtimeEvent };

/** What a ticket allows: one workspace, as one person, hearing these channels. */
export type Grant = { w: string; u: string; c: string[]; exp: number };

export const TICKET_TTL_MS = 5 * 60_000;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signTicket(grant: Grant, secret: string) {
  const body = base64url(encoder.encode(JSON.stringify(grant)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

/** The grant, or null when the ticket is forged, malformed or expired. */
export async function verifyTicket(ticket: string, secret: string, now = Date.now()): Promise<Grant | null> {
  const [body, signature] = ticket.split('.');
  if (!body || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const grant = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Grant;
    if (typeof grant.w !== 'string' || typeof grant.u !== 'string' || !Array.isArray(grant.c)) return null;
    return grant.exp > now ? grant : null;
  } catch {
    return null;
  }
}

/** Whether a socket holding `grant` should hear `topic`. */
export function hears(grant: Pick<Grant, 'u' | 'c'>, topic: string) {
  if (topic === 'w') return true;
  if (topic.startsWith('u:')) return topic.slice(2) === grant.u;
  if (topic.startsWith('c:')) return grant.c.includes(topic.slice(2));
  return false;
}
