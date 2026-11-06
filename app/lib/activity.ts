// Server-only: the issue history line and the inbox. Client code never imports this file.
import { and, db, eq, inArray, isNull } from 'void/db';
import { issueComments, issueEvents, issues, notifications, teams } from '@schema';
import { newId } from './ids';
import { publish, toUser } from './realtime';
import type { IssueEventKind, NotificationKind } from './types';

/** Appends one line to an issue's history. Values are short strings (a status id, a name, a date). */
export async function recordIssueEvent(
  issueId: string,
  actorId: string | null,
  kind: IssueEventKind,
  fromValue: string | null = null,
  toValue: string | null = null,
) {
  await db.insert(issueEvents).values({ id: newId(), issueId, actorId, kind, fromValue, toValue });
}

/** People who follow an issue, like Linear's subscribers: its creator, assignee and commenters. */
export async function issueSubscribers(issueId: string) {
  const [[issue], commenters] = await Promise.all([
    db
      .select({ createdBy: issues.createdBy, assigneeId: issues.assigneeId })
      .from(issues)
      .where(eq(issues.id, issueId)),
    db
      .selectDistinct({ userId: issueComments.userId })
      .from(issueComments)
      .where(eq(issueComments.issueId, issueId)),
  ]);
  const ids = new Set<string>();
  if (issue?.createdBy) ids.add(issue.createdBy);
  if (issue?.assigneeId) ids.add(issue.assigneeId);
  for (const row of commenters) ids.add(row.userId);
  return [...ids];
}

/** Sends one inbox item to each recipient except the person who acted. */
export async function notify({
  workspaceId,
  userIds,
  actorId,
  kind,
  issueId = null,
  channelId = null,
  messageId = null,
  body = '',
}: {
  workspaceId: string;
  userIds: string[];
  actorId: string;
  kind: NotificationKind;
  issueId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  body?: string;
}) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (recipients.length === 0) return;
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      id: newId(),
      workspaceId,
      userId,
      actorId,
      kind,
      issueId,
      channelId,
      messageId,
      body: body.slice(0, 280),
    })),
  );
  await publish(workspaceId, recipients.map((userId) => toUser(userId, { t: 'inbox' })));
}

const ISSUE_KEY = /\b([A-Z][A-Z0-9]{1,4})-(\d{1,6})\b/g;

/** Finds issue keys like KOR-12 in text. Returns unique keys in order of appearance. */
export function issueKeysIn(text: string) {
  const keys: string[] = [];
  for (const match of text.matchAll(ISSUE_KEY)) {
    if (!keys.includes(match[0])) keys.push(match[0]);
  }
  return keys.slice(0, 20);
}

/** Resolves keys like KOR-12 to issue ids in one workspace. Unknown keys are skipped. */
export async function issueIdsForKeys(workspaceId: string, keys: string[]) {
  if (keys.length === 0) return new Map<string, string>();
  const parsed = keys.map((key) => {
    const [teamKey, number] = key.split('-');
    return { key, teamKey, number: Number(number) };
  });
  const rows = await db
    .select({ id: issues.id, teamKey: teams.key, number: issues.number })
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        isNull(issues.deletedAt),
        inArray(teams.key, [...new Set(parsed.map((item) => item.teamKey))]),
        inArray(issues.number, [...new Set(parsed.map((item) => item.number))]),
      ),
    );
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.teamKey}-${row.number}`;
    if (keys.includes(key)) map.set(key, row.id);
  }
  return map;
}
