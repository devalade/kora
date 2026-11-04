import type { UserSummary } from './types';

type MentionPerson = Pick<UserSummary, 'id' | 'name' | 'email' | 'title' | 'online'>;

export function mentionHandle(person: Pick<MentionPerson, 'name' | 'email'>) {
  const local = person.email.split('@')[0] ?? '';
  const fromEmail = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (fromEmail) return fromEmail;
  const fromName = person.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return fromName || 'teammate';
}

export function mentionLookup(people: MentionPerson[]) {
  const lookup = new Map<string, MentionPerson>();
  for (const person of people) {
    lookup.set(mentionHandle(person), person);
  }
  return lookup;
}

export function matchMentionPeople<T extends MentionPerson>(people: T[], query: string) {
  const needle = query.trim().toLowerCase();
  const scored = people.map((person) => {
    const handle = mentionHandle(person);
    const name = person.name.toLowerCase();
    const first = name.split(/\s+/)[0] ?? '';
    const email = person.email.toLowerCase();
    let score = -1;
    if (!needle) score = 1;
    else if (handle.startsWith(needle) || first.startsWith(needle)) score = 3;
    else if (name.startsWith(needle)) score = 2;
    else if (handle.includes(needle) || name.includes(needle) || email.includes(needle)) score = 1;
    return { person, handle, score };
  });
  return scored
    .filter((item) => item.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.person.online) - Number(a.person.online) ||
        a.person.name.localeCompare(b.person.name),
    )
    .map((item) => ({ ...item.person, handle: item.handle }));
}

export function findMentionTrigger(text: string, cursor: number) {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const match = before.match(/(^|[\s([{])@([a-zA-Z0-9._-]*)$/);
  if (!match) return null;
  const query = match[2] ?? '';
  return {
    start: before.length - query.length - 1,
    end: cursor,
    query,
  };
}

export type MentionTrigger = NonNullable<ReturnType<typeof findMentionTrigger>>;
