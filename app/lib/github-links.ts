// Pure rules for linking GitHub pull requests to issues. No imports: shared by the client (branch
// names), the webhook (matching) and scripts/github.mjs's expectations.

export type PullRequestState = 'draft' | 'open' | 'merged' | 'closed';

export type PullRequestReference = {
  key: string;
  /** Merging should finish the issue: linked by branch or title, or by "Fixes KOR-12" in the body. */
  closes: boolean;
};

const KEY = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,4})-(\d{1,6})(?![0-9])/g;
const UPPER_KEY = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,4})-(\d{1,6})(?![0-9])/g;
// Linear's magic words. A closing word before a key makes merging finish that issue; a body
// mention without one only links (Linear's "Part of", "Ref" and plain mentions).
const CLOSING = /\b(?:close[sd]?|closing|fix(?:e[sd])?|fixing|resolve[sd]?|resolving|complete[sd]?|completing)\b[\s:]*$/i;

function keysIn(text: string, pattern: RegExp) {
  const keys: { key: string; index: number }[] = [];
  for (const match of text.matchAll(pattern)) {
    keys.push({ key: `${match[1]!.toUpperCase()}-${Number(match[2])}`, index: match.index ?? 0 });
  }
  return keys;
}

/**
 * Issue keys a pull request refers to. The branch (`alade/kor-12-search`) and title match in any
 * case, as Linear does; the body only matches upper-case keys, so prose like "utf-8" never links.
 */
export function pullRequestReferences(pr: { branch: string; title: string; body: string }): PullRequestReference[] {
  const found = new Map<string, boolean>();
  const add = (key: string, closes: boolean) => found.set(key, (found.get(key) ?? false) || closes);
  for (const { key } of keysIn(pr.branch, KEY)) add(key, true);
  for (const { key } of keysIn(pr.title, KEY)) add(key, true);
  const body = pr.body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  for (const { key, index } of keysIn(body, UPPER_KEY)) {
    add(key, CLOSING.test(body.slice(Math.max(0, index - 40), index)));
  }
  return [...found].slice(0, 20).map(([key, closes]) => ({ key, closes }));
}

export function pullRequestState(pr: { state: string; merged?: boolean | null; merged_at?: string | null; draft?: boolean | null }): PullRequestState {
  if (pr.merged || pr.merged_at) return 'merged';
  if (pr.state === 'closed') return 'closed';
  return pr.draft ? 'draft' : 'open';
}

/** Linear's "Copy git branch name": `alade/kor-12-search-across-issues`. */
export function gitBranchName(user: { name: string; email: string }, issue: { key: string; title: string }) {
  const handle =
    (user.email.split('@')[0] ?? user.name)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'me';
  const slug = issue.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `${handle}/${issue.key.toLowerCase()}${slug ? `-${slug}` : ''}`;
}
