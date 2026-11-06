import type { UserSummary } from './types';

export const AVATAR_COLORS = [
  '#D97757',
  '#5B8DEF',
  '#18A999',
  '#B07AA1',
  '#E0A23B',
  '#6C8E3B',
  '#D45D79',
  '#7C6EE6',
];

export function pickAvatarColor(seed: string) {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum = (sum + seed.charCodeAt(i)) % 997;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarKey?: string | null;
  title: string;
  statusEmoji: string;
  statusText: string;
  lastSeenAt: string;
};

/** The URL changes whenever the photo does, so browsers may cache each version forever. */
export function avatarUrlFor(userId: string, avatarKey: string | null | undefined) {
  if (!avatarKey) return null;
  const version = avatarKey.split('/').pop() ?? avatarKey;
  return `/api/avatars/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`;
}

export function toUserSummary(row: UserRow, now = Date.now()): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarColor: row.avatarColor,
    avatarUrl: avatarUrlFor(row.id, row.avatarKey),
    title: row.title,
    statusEmoji: row.statusEmoji,
    statusText: row.statusText,
    online: now - new Date(row.lastSeenAt).getTime() < 75_000,
    lastSeenAt: row.lastSeenAt,
  };
}

export function memberNameFromEmail(email: string) {
  const local = email.split('@')[0] ?? 'teammate';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}


/** A stable hue per name, from the premium-react identity system. */
export function hueOf(seed: string) {
  let h = 2166136261;
  for (const char of String(seed ?? '')) h = Math.imul(h ^ char.codePointAt(0)!, 16777619);
  return (h >>> 0) % 360;
}

export function avatarTone(seed: string) {
  const h = hueOf(seed);
  return {
    bg: `oklch(0.93 0.045 ${h})`,
    fg: `oklch(0.38 0.09 ${h})`,
    ring: `conic-gradient(from 210deg, oklch(0.74 0.13 ${h}), oklch(0.8 0.1 ${(h + 45) % 360}), oklch(0.74 0.13 ${h}))`,
  };
}
