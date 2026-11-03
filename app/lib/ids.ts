const LOWER = '23456789abcdefghjkmnpqrstuvwxyz';
const UPPER = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

function pick(alphabet: string, size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function newId(size = 16) {
  return pick(LOWER, size);
}

export function newInviteCode() {
  return `${pick(UPPER, 4)}-${pick(UPPER, 4)}-${pick(UPPER, 4)}`;
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || `team-${newId(6)}`;
}
