// Server-only: GitHub webhooks, the install callback's checks, and status automation. Client code
// never imports this file; app/lib/github.ts holds the server functions the settings dialog calls.
import { and, asc, db, eq, inArray } from 'void/db';
import { GITHUB_ENABLED } from './features';
import { githubInstallations, githubSettings, issueLinks, issues, taskStatuses } from '@schema';
import { env } from 'void/env';
import { issueIdsForKeys, notify, recordIssueEvent } from './activity';
import { pullRequestReferences, pullRequestState, type PullRequestState } from './github-links';
import { newId } from './ids';
import { publish, toWorkspace } from './realtime';

const encoder = new TextEncoder();

export function githubConfig() {
  if (!GITHUB_ENABLED) return null;
  const { GITHUB_APP_SLUG, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET } = env;
  if (!GITHUB_APP_SLUG || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_WEBHOOK_SECRET) return null;
  return {
    appSlug: GITHUB_APP_SLUG,
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    webhookSecret: GITHUB_WEBHOOK_SECRET,
  };
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** GitHub signs every delivery: `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export async function validWebhookSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  return sameText(header.slice(7), await hmacHex(secret, body));
}

// The install link carries a signed state (workspace, person, expiry) so the callback knows who
// started it. It is not enough on its own: the callback also asks GitHub whether that person can
// see the installation, so nobody can attach someone else's installation to their workspace.
type InstallState = { w: string; u: string; exp: number };

export async function signInstallState(state: InstallState, secret: string) {
  const body = btoa(JSON.stringify(state)).replaceAll('=', '');
  return `${body}.${await hmacHex(secret, `install:${body}`)}`;
}

export async function readInstallState(token: string, secret: string): Promise<InstallState | null> {
  const [body, signature] = token.split('.');
  if (!body || !signature || !sameText(signature, await hmacHex(secret, `install:${body}`))) return null;
  try {
    const state = JSON.parse(atob(body)) as InstallState;
    return typeof state.w === 'string' && typeof state.u === 'string' && state.exp > Date.now() ? state : null;
  } catch {
    return null;
  }
}

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Kora',
  'X-GitHub-Api-Version': '2022-11-28',
};

/** The installation as the person who just installed sees it, or null if they cannot see it. */
export async function installationForUser(code: string, installationId: string) {
  const config = githubConfig();
  if (!config) return null;
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Kora' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
    signal: AbortSignal.timeout(8000),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return null;
  for (let page = 1; page <= 5; page += 1) {
    const response = await fetch(`https://api.github.com/user/installations?per_page=100&page=${page}`, {
      headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      installations: { id: number; account: { login: string; type: string } | null }[];
    };
    const match = data.installations.find((item) => String(item.id) === installationId);
    if (match) return { id: installationId, accountLogin: match.account?.login ?? 'GitHub', accountType: match.account?.type ?? 'Organization' };
    if (data.installations.length < 100) break;
  }
  return null;
}

/** First connection: In Progress when a PR opens, In Review on review request, Done on merge. */
export async function ensureDefaultGithubSettings(workspaceId: string) {
  const [existing] = await db.select().from(githubSettings).where(eq(githubSettings.workspaceId, workspaceId));
  if (existing) return;
  const statuses = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.workspaceId, workspaceId))
    .orderBy(asc(taskStatuses.position));
  const started = statuses.filter((status) => status.category === 'started');
  const review = started.find((status) => /review/i.test(status.name));
  await db
    .insert(githubSettings)
    .values({
      workspaceId,
      openStatusId: started.find((status) => status !== review)?.id ?? started[0]?.id ?? null,
      reviewStatusId: review?.id ?? null,
      mergeStatusId: statuses.find((status) => status.category === 'completed')?.id ?? null,
    })
    .onConflictDoNothing();
}

const CATEGORY_RANK: Record<string, number> = { backlog: 0, unstarted: 1, started: 2, completed: 3, canceled: 3 };

/** Automation only moves an issue forward; it never reopens finished work or undoes a review. */
function isForward(
  current: { category: string; position: number },
  target: { category: string; position: number },
) {
  const from = CATEGORY_RANK[current.category] ?? 1;
  const to = CATEGORY_RANK[target.category] ?? 1;
  if (from >= 3) return false;
  return to > from || (to === from && target.position > current.position);
}

type PullRequestPayload = {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  user?: { login: string } | null;
  head?: { ref: string } | null;
  requested_reviewers?: unknown[];
};

type WebhookPayload = {
  action?: string;
  installation?: { id: number; account?: { login: string; type: string } | null };
  repository?: { full_name: string };
  pull_request?: PullRequestPayload;
  review?: { state: string };
};

const STATE_WORDS: Record<PullRequestState, string> = {
  draft: 'draft',
  open: 'open',
  merged: 'merged',
  closed: 'closed',
};

/** Handles one webhook delivery. Returns a short note for the delivery log on GitHub. */
export async function handleGithubWebhook(event: string, payload: WebhookPayload): Promise<string> {
  const installationId = payload.installation?.id;
  if (!installationId) return 'ignored: no installation';
  const [installation] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.id, String(installationId)));

  if (event === 'installation' && payload.action === 'deleted') {
    if (installation) {
      await db.delete(githubInstallations).where(eq(githubInstallations.id, installation.id));
      await publish(installation.workspaceId, [toWorkspace({ t: 'issue' })]);
    }
    return 'installation removed';
  }
  if (!installation) return 'ignored: installation is not connected to a workspace';
  if (event === 'ping') return 'pong';

  const pr = payload.pull_request;
  const repo = payload.repository?.full_name;
  if (!pr || !repo) return `ignored: ${event}`;
  if (event === 'pull_request_review') {
    return reviewSubmitted(installation.workspaceId, repo, pr.number, payload.review?.state ?? '');
  }
  if (event !== 'pull_request') return `ignored: ${event}`;
  return pullRequestChanged(installation.workspaceId, repo, pr, payload.action ?? '');
}

async function reviewSubmitted(workspaceId: string, repo: string, number: number, state: string) {
  const review = state.toLowerCase() === 'approved' ? 'approved' : state.toLowerCase() === 'changes_requested' ? 'changes_requested' : null;
  if (!review) return 'ignored: comment review';
  const rows = await db
    .update(issueLinks)
    .set({ review, updatedAt: new Date().toISOString() })
    .where(and(eq(issueLinks.workspaceId, workspaceId), eq(issueLinks.repo, repo), eq(issueLinks.number, number)))
    .returning({ issueId: issueLinks.issueId });
  await publish(workspaceId, rows.map((row) => toWorkspace({ t: 'issue', i: row.issueId })));
  return `review ${review} on ${rows.length} issue(s)`;
}

async function pullRequestChanged(workspaceId: string, repo: string, pr: PullRequestPayload, action: string) {
  const state = pullRequestState(pr);
  const references = pullRequestReferences({ branch: pr.head?.ref ?? '', title: pr.title, body: pr.body ?? '' });
  const idsByKey = await issueIdsForKeys(
    workspaceId,
    references.map((reference) => reference.key),
  );
  const wanted = new Map<string, boolean>();
  for (const reference of references) {
    const issueId = idsByKey.get(reference.key);
    if (issueId) wanted.set(issueId, (wanted.get(issueId) ?? false) || reference.closes);
  }

  const existing = await db
    .select()
    .from(issueLinks)
    .where(and(eq(issueLinks.workspaceId, workspaceId), eq(issueLinks.repo, repo), eq(issueLinks.number, pr.number)));
  const now = new Date().toISOString();
  const prLabel = `${repo}#${pr.number}`;
  const touched = new Set<string>();

  // An edit that removes the key unlinks the issue.
  const dropped = existing.filter((link) => !wanted.has(link.issueId));
  if (dropped.length) {
    await db.delete(issueLinks).where(inArray(issueLinks.id, dropped.map((link) => link.id)));
    for (const link of dropped) touched.add(link.issueId);
  }

  for (const [issueId, closes] of wanted) {
    const link = existing.find((item) => item.issueId === issueId);
    const values = {
      url: pr.html_url,
      title: pr.title.slice(0, 300),
      state,
      authorLogin: pr.user?.login ?? '',
      branch: (pr.head?.ref ?? '').slice(0, 200),
      closes,
      updatedAt: now,
    };
    if (!link) {
      await db
        .insert(issueLinks)
        .values({ id: newId(), issueId, workspaceId, repo, number: pr.number, ...values })
        .onConflictDoUpdate({ target: [issueLinks.issueId, issueLinks.repo, issueLinks.number], set: values });
      await recordIssueEvent(issueId, null, 'pull_request', null, `${prLabel} ${values.title}`);
    } else {
      await db.update(issueLinks).set(values).where(eq(issueLinks.id, link.id));
      if (link.state !== state) {
        await recordIssueEvent(issueId, null, 'pull_request', prLabel, STATE_WORDS[state]);
      }
    }
    touched.add(issueId);
  }

  const moved = await automateStatuses(workspaceId, wanted, { state, action, pr, prLabel });
  await publish(workspaceId, [...touched].map((issueId) => toWorkspace({ t: 'issue', i: issueId })));
  return `${prLabel} ${state}: ${wanted.size} linked, ${dropped.length} unlinked, ${moved} moved`;
}

async function automateStatuses(
  workspaceId: string,
  linked: Map<string, boolean>,
  context: { state: PullRequestState; action: string; pr: PullRequestPayload; prLabel: string },
) {
  if (linked.size === 0) return 0;
  const [settings] = await db.select().from(githubSettings).where(eq(githubSettings.workspaceId, workspaceId));
  if (!settings) return 0;
  const { state, action, pr } = context;
  const reviewRequested =
    action === 'review_requested' || (action === 'ready_for_review' && (pr.requested_reviewers?.length ?? 0) > 0);
  const targetId =
    state === 'merged' && action === 'closed'
      ? settings.mergeStatusId
      : state === 'open' && reviewRequested
        ? (settings.reviewStatusId ?? settings.openStatusId)
        : (state === 'open' || state === 'draft') && ['opened', 'reopened', 'ready_for_review', 'converted_to_draft', 'edited', 'synchronize'].includes(action)
          ? settings.openStatusId
          : null;
  if (!targetId) return 0;

  const statuses = await db.select().from(taskStatuses).where(eq(taskStatuses.workspaceId, workspaceId));
  const target = statuses.find((status) => status.id === targetId);
  if (!target) return 0;
  const rows = await db
    .select({ id: issues.id, status: issues.status, assigneeId: issues.assigneeId, createdBy: issues.createdBy })
    .from(issues)
    .where(inArray(issues.id, [...linked.keys()]));

  let moved = 0;
  for (const row of rows) {
    // Merging finishes only the issues the PR closes; a "Part of KOR-12" mention stays open.
    if (state === 'merged' && !linked.get(row.id)) continue;
    const current = statuses.find((status) => status.id === row.status);
    if (!current || current.id === target.id || !isForward(current, target)) continue;
    await db.update(issues).set({ status: target.id, updatedAt: new Date().toISOString() }).where(eq(issues.id, row.id));
    await recordIssueEvent(row.id, null, 'status', current.name, target.name);
    moved += 1;
    // The history line covers every move; the inbox only hears when a PR finishes the issue.
    if (target.category !== 'completed') continue;
    await notify({
      workspaceId,
      userIds: [row.assigneeId ?? row.createdBy],
      actorId: null,
      kind: 'issue_pr',
      issueId: row.id,
      body: `${context.prLabel} ${STATE_WORDS[state]}: ${pr.title}`,
    });
  }
  return moved;
}
