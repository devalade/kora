import { createServerFn } from '@tanstack/react-start';
import { and, asc, db, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'void/db';
import {
  issueComments,
  issueEditors,
  issueEvents,
  issueLabels,
  issueLinks,
  issues,
  labels,
  projects,
  teams,
  taskStatuses,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { issueSubscribers, notify, recordIssueEvent } from './activity';
import { newId } from './ids';
import { markdownToPlainText } from './markdown';
import { toUserSummary } from './people';
import {
  inChunks,
  isAdminRole,
  memberUsers,
  requireAdmin,
  requireUser,
  requireWorkspace,
  touchPresence,
} from './server';
import { publish, toWorkspace } from './realtime';
import { readSessionUser } from './session';
import {
  DEFAULT_TASK_STATUSES,
  TASK_LABEL_COLORS,
  TASK_STATUS_CATEGORIES,
} from './task-config';
import type {
  IssueEventKind,
  TaskComment,
  TaskEvent,
  TaskIssue,
  TaskProject,
  TaskProjectStatus,
  TaskIssueDetail,
  TaskLabel,
  TaskPriority,
  TaskTeam,
  TaskStatus,
  TaskStatusCategory,
  TasksSnapshot,
  PullRequestLink,
} from './types';
import type { PullRequestState } from './github-links';

const PRIORITIES = [0, 1, 2, 3, 4] as const;
const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
const PROJECT_STATUSES = ['backlog', 'planned', 'started', 'paused', 'completed', 'canceled'] as const;
const COMMENT_TYPING_WINDOW_MS = 5_000;
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex color.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-04.');
const idListSchema = z.array(z.string().max(64)).max(50);

function colorForLabel(name: string) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return TASK_LABEL_COLORS[Math.abs(hash) % TASK_LABEL_COLORS.length] ?? TASK_LABEL_COLORS[0];
}


/** Someone with an issue open pings every 20 s; they are listed as viewing for this long after. */
const ISSUE_VIEWER_WINDOW_MS = 50_000;

/** Every open tasks screen in the workspace refreshes: the list, the issue page, the sidebar counts. */
async function issueChanged(workspaceId: string, issueId?: string) {
  await publish(workspaceId, [toWorkspace({ t: 'issue', ...(issueId ? { i: issueId } : {}) })]);
}

const issueSelection = {
  id: issues.id,
  number: issues.number,
  title: issues.title,
  description: issues.description,
  statusId: issues.status,
  statusName: taskStatuses.name,
  statusCategory: taskStatuses.category,
  statusColor: taskStatuses.color,
  statusPosition: taskStatuses.position,
  priority: issues.priority,
  startDate: issues.startDate,
  dueDate: issues.dueDate,
  parentId: issues.parentIssueId,
  teamId: issues.teamId,
  teamName: teams.name,
  teamKey: teams.key,
  teamColor: teams.color,
  projectId: issues.projectId,
  projectName: projects.name,
  projectColor: projects.color,
  assigneeId: issues.assigneeId,
  assigneeName: users.name,
  assigneeEmail: users.email,
  assigneeAvatarColor: users.avatarColor,
  assigneeAvatarKey: users.avatarKey,
  assigneeTitle: users.title,
  assigneeStatusEmoji: users.statusEmoji,
  assigneeStatusText: users.statusText,
  assigneeLastSeenAt: users.lastSeenAt,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
  descriptionVersion: issues.descriptionVersion,
};

type IssueRow = {
  id: string;
  number: number;
  title: string;
  description: string;
  statusId: string;
  statusName: string;
  statusCategory: string;
  statusColor: string;
  statusPosition: number;
  priority: number;
  startDate: string | null;
  dueDate: string | null;
  parentId: string | null;
  teamId: string;
  teamName: string;
  teamKey: string;
  teamColor: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeAvatarColor: string | null;
  assigneeAvatarKey: string | null;
  assigneeTitle: string | null;
  assigneeStatusEmoji: string | null;
  assigneeStatusText: string | null;
  assigneeLastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  descriptionVersion: number;
};

function toProjectStatus(value: string): TaskProjectStatus {
  return PROJECT_STATUSES.includes(value as TaskProjectStatus)
    ? (value as TaskProjectStatus)
    : 'planned';
}

function statusCategory(value: string): TaskStatusCategory {
  return TASK_STATUS_CATEGORIES.includes(value as TaskStatusCategory)
    ? (value as TaskStatusCategory)
    : 'unstarted';
}

function toStatus(row: {
  id: string;
  name: string;
  category: string;
  color: string;
  position: number;
}): TaskStatus {
  return {
    id: row.id,
    name: row.name,
    category: statusCategory(row.category),
    color: row.color,
    position: row.position,
  };
}

async function ensureTaskStatuses(workspaceId: string) {
  const existing = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.workspaceId, workspaceId))
    .orderBy(asc(taskStatuses.position), asc(taskStatuses.createdAt));
  if (existing.length > 0) return existing.map(toStatus);

  await db
    .insert(taskStatuses)
    .values(
      // Status ids are global primary keys, so every workspace gets its own.
      DEFAULT_TASK_STATUSES.map((status) => ({
        ...status,
        id: newId(),
        workspaceId,
      })),
    )
    .onConflictDoNothing();

  const created = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.workspaceId, workspaceId))
    .orderBy(asc(taskStatuses.position), asc(taskStatuses.createdAt));
  return created.map(toStatus);
}

const TEAM_KEY = /^[A-Z][A-Z0-9]{1,4}$/;

function teamKeyFrom(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const key = letters.replace(/^[0-9]+/, '').slice(0, 3);
  return key.length >= 2 ? key : 'TSK';
}

// Workspaces created before teams existed have none, and issues need one for their key.
async function createDefaultTeam(workspaceId: string, workspaceName: string, userId: string) {
  await db
    .insert(teams)
    .values({
      id: newId(),
      workspaceId,
      name: workspaceName,
      key: teamKeyFrom(workspaceName),
      createdBy: userId,
    })
    .onConflictDoNothing();
  return db
    .select()
    .from(teams)
    .where(eq(teams.workspaceId, workspaceId))
    .orderBy(asc(teams.createdAt));
}

async function workspaceForSlug(slug: string, userId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) throw new Error('Workspace not found.');
  const membership = await requireWorkspace(workspace.id, userId);
  const statuses = await ensureTaskStatuses(workspace.id);
  return { workspace, membership, statuses };
}

function toIssue(row: IssueRow, issueLabelsList: TaskLabel[], commentCount: number): TaskIssue {
  return {
    id: row.id,
    key: `${row.teamKey}-${row.number}`,
    number: row.number,
    title: row.title,
    description: row.description,
    status: {
      id: row.statusId,
      name: row.statusName,
      category: statusCategory(row.statusCategory),
      color: row.statusColor,
      position: row.statusPosition,
    },
    priority: (PRIORITIES.includes(row.priority as TaskPriority) ? row.priority : 0) as TaskPriority,
    startDate: row.startDate,
    dueDate: row.dueDate,
    parentId: row.parentId,
    subIssueCount: 0,
    subIssueDone: 0,
    team: {
      id: row.teamId,
      name: row.teamName,
      key: row.teamKey,
      color: row.teamColor,
    },
    project:
      row.projectId && row.projectName
        ? { id: row.projectId, name: row.projectName, color: row.projectColor ?? '#5B8DEF' }
        : null,
    assignee:
      row.assigneeId && row.assigneeName && row.assigneeEmail && row.assigneeAvatarColor
        ? toUserSummary({
            id: row.assigneeId,
            name: row.assigneeName,
            email: row.assigneeEmail,
            avatarColor: row.assigneeAvatarColor,
            avatarKey: row.assigneeAvatarKey,
            title: row.assigneeTitle ?? '',
            statusEmoji: row.assigneeStatusEmoji ?? '',
            statusText: row.assigneeStatusText ?? '',
            lastSeenAt: row.assigneeLastSeenAt ?? new Date().toISOString(),
          })
        : null,
    labels: issueLabelsList,
    commentCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    descriptionVersion: row.descriptionVersion,
    pullRequest: null,
  };
}

async function issueLabelsFor(issueIds: string[]) {
  if (issueIds.length === 0) return new Map<string, TaskLabel[]>();
  const rows = await inChunks(issueIds, (chunk) =>
    db
      .select({
        issueId: issueLabels.issueId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(issueLabels)
      .innerJoin(labels, eq(labels.id, issueLabels.labelId))
      .where(inArray(issueLabels.issueId, chunk)),
  );
  const map = new Map<string, TaskLabel[]>();
  for (const row of rows) {
    const list = map.get(row.issueId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.issueId, list);
  }
  return map;
}

const PR_RANK: Record<PullRequestState, number> = { closed: 0, draft: 1, open: 2, merged: 3 };

/** Per issue: how many pull requests are linked, and the most advanced one's state. */
async function pullRequestsFor(issueIds: string[]) {
  const map = new Map<string, NonNullable<TaskIssue['pullRequest']>>();
  if (issueIds.length === 0) return map;
  const rows = await inChunks(issueIds, (chunk) =>
    db
      .select({ issueId: issueLinks.issueId, state: issueLinks.state })
      .from(issueLinks)
      .where(inArray(issueLinks.issueId, chunk)),
  );
  for (const row of rows) {
    const state = row.state as PullRequestState;
    const current = map.get(row.issueId);
    map.set(row.issueId, {
      count: (current?.count ?? 0) + 1,
      state: current && PR_RANK[current.state] >= PR_RANK[state] ? current.state : state,
    });
  }
  return map;
}

async function commentCountsFor(issueIds: string[]) {
  if (issueIds.length === 0) return new Map<string, number>();
  const rows = await inChunks(issueIds, (chunk) =>
    db
      .select({ issueId: issueComments.issueId, count: sql<number>`count(*)` })
      .from(issueComments)
      .where(inArray(issueComments.issueId, chunk))
      .groupBy(issueComments.issueId),
  );
  return new Map(rows.map((row) => [row.issueId, Number(row.count)]));
}

/** Loads an issue the user may act on. Issues in the trash are hidden unless restoring. */
async function requireIssue(issueId: string, userId: string, { allowDeleted = false } = {}) {
  const [row] = await db
    .select({
      id: issues.id,
      workspaceId: issues.workspaceId,
      teamId: issues.teamId,
      startDate: issues.startDate,
      dueDate: issues.dueDate,
      createdBy: issues.createdBy,
      deletedAt: issues.deletedAt,
    })
    .from(issues)
    .where(eq(issues.id, issueId));
  if (!row || (row.deletedAt && !allowDeleted)) throw new Error('Issue not found.');
  const membership = await requireWorkspace(row.workspaceId, userId);
  return { ...row, role: membership.role };
}

function parseIssueKey(key: string) {
  const separator = key.lastIndexOf('-');
  if (separator < 1) throw new Error('Issue not found.');
  const teamKey = key.slice(0, separator);
  const number = Number(key.slice(separator + 1));
  if (!Number.isInteger(number) || number < 1) throw new Error('Issue not found.');
  return { teamKey, number };
}

async function issueRowById(issueId: string) {
  const [row] = await db
    .select(issueSelection)
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
    .leftJoin(users, eq(users.id, issues.assigneeId))
    .where(eq(issues.id, issueId));
  return row ?? null;
}

async function issueKeyById(issueId: string | null) {
  if (!issueId) return null;
  const [row] = await db
    .select({ key: teams.key, number: issues.number })
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .where(eq(issues.id, issueId));
  return row ? `${row.key}-${row.number}` : null;
}

/** Writes one history line per field that changed between two reads of the same issue. */
async function recordChanges(
  before: IssueRow,
  after: IssueRow,
  actorId: string,
  labelChange?: { added: string[]; removed: string[] },
) {
  const lines: [IssueEventKind, string | null, string | null][] = [];
  if (before.title !== after.title) lines.push(['title', before.title, after.title]);
  if (before.statusId !== after.statusId) lines.push(['status', before.statusName, after.statusName]);
  if (before.priority !== after.priority) {
    lines.push(['priority', PRIORITY_NAMES[before.priority] ?? null, PRIORITY_NAMES[after.priority] ?? null]);
  }
  if (before.assigneeId !== after.assigneeId) {
    lines.push(['assignee', before.assigneeName, after.assigneeName]);
  }
  if (before.projectId !== after.projectId) {
    lines.push(['project', before.projectName, after.projectName]);
  }
  if (before.parentId !== after.parentId) {
    lines.push(['parent', await issueKeyById(before.parentId), await issueKeyById(after.parentId)]);
  }
  if (before.startDate !== after.startDate) lines.push(['start_date', before.startDate, after.startDate]);
  if (before.dueDate !== after.dueDate) lines.push(['due_date', before.dueDate, after.dueDate]);
  if (labelChange && (labelChange.added.length > 0 || labelChange.removed.length > 0)) {
    lines.push(['labels', labelChange.removed.join(', ') || null, labelChange.added.join(', ') || null]);
  }
  for (const [kind, from, to] of lines) await recordIssueEvent(after.id, actorId, kind, from, to);
}

async function issueRowByKey(workspaceId: string, issueKey: string) {
  const { teamKey, number } = parseIssueKey(issueKey);
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.workspaceId, workspaceId), eq(teams.key, teamKey)));
  if (!team) throw new Error('Issue not found.');
  const [row] = await db
    .select(issueSelection)
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
    .leftJoin(users, eq(users.id, issues.assigneeId))
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        isNull(issues.deletedAt),
        eq(issues.teamId, team.id),
        eq(issues.number, number),
      ),
    );
  if (!row) throw new Error('Issue not found.');
  return row;
}

function toComment(row: {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorAvatarColor: string;
  authorAvatarKey: string | null;
  authorTitle: string;
  authorStatusEmoji: string;
  authorStatusText: string;
  authorLastSeenAt: string;
}): TaskComment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: toUserSummary({
      id: row.authorId,
      name: row.authorName,
      email: row.authorEmail,
      avatarColor: row.authorAvatarColor,
      avatarKey: row.authorAvatarKey,
      title: row.authorTitle,
      statusEmoji: row.authorStatusEmoji,
      statusText: row.authorStatusText,
      lastSeenAt: row.authorLastSeenAt,
    }),
  };
}

type EventRow = {
  id: string;
  kind: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorAvatarColor: string | null;
  actorAvatarKey: string | null;
  actorTitle: string | null;
  actorStatusEmoji: string | null;
  actorStatusText: string | null;
  actorLastSeenAt: string | null;
};

function toEvent(row: EventRow): TaskEvent {
  let to = row.toValue;
  if (row.kind === 'mentioned' && to) {
    // Stored as JSON so the chat side can add fields; the history line only needs the channel.
    try {
      const parsed = JSON.parse(to) as { channelName?: string };
      to = parsed.channelName ? `#${parsed.channelName}` : null;
    } catch {
      to = null;
    }
  }
  return {
    id: row.id,
    kind: row.kind as IssueEventKind,
    actor:
      row.actorId && row.actorName && row.actorEmail && row.actorAvatarColor
        ? toUserSummary({
            id: row.actorId,
            name: row.actorName,
            email: row.actorEmail,
            avatarColor: row.actorAvatarColor,
            avatarKey: row.actorAvatarKey,
            title: row.actorTitle ?? '',
            statusEmoji: row.actorStatusEmoji ?? '',
            statusText: row.actorStatusText ?? '',
            lastSeenAt: row.actorLastSeenAt ?? new Date().toISOString(),
          })
        : null,
    from: row.fromValue,
    to,
    createdAt: row.createdAt,
  };
}

async function issueDetail(row: IssueRow): Promise<TaskIssueDetail> {
  const creatorRows = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
      avatarKey: users.avatarKey,
      title: users.title,
      statusEmoji: users.statusEmoji,
      statusText: users.statusText,
      lastSeenAt: users.lastSeenAt,
    })
    .from(issues)
    .innerJoin(users, eq(users.id, issues.createdBy))
    .where(eq(issues.id, row.id));
  const eventRows = db
    .select({
      id: issueEvents.id,
      kind: issueEvents.kind,
      fromValue: issueEvents.fromValue,
      toValue: issueEvents.toValue,
      createdAt: issueEvents.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      actorAvatarColor: users.avatarColor,
      actorAvatarKey: users.avatarKey,
      actorTitle: users.title,
      actorStatusEmoji: users.statusEmoji,
      actorStatusText: users.statusText,
      actorLastSeenAt: users.lastSeenAt,
    })
    .from(issueEvents)
    .leftJoin(users, eq(users.id, issueEvents.actorId))
    .where(eq(issueEvents.issueId, row.id))
    .orderBy(asc(issueEvents.createdAt))
    .limit(200);
  const [
    labelMap,
    commentMap,
    commentRows,
    childRows,
    parentRow,
    editorRows,
    creatorRow,
    historyRows,
    linkRows,
  ] = await Promise.all([
    issueLabelsFor([row.id]),
    commentCountsFor([row.id]),
    db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        createdAt: issueComments.createdAt,
        authorId: users.id,
        authorName: users.name,
        authorEmail: users.email,
        authorAvatarColor: users.avatarColor,
        authorAvatarKey: users.avatarKey,
        authorTitle: users.title,
        authorStatusEmoji: users.statusEmoji,
        authorStatusText: users.statusText,
        authorLastSeenAt: users.lastSeenAt,
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.userId))
      .where(eq(issueComments.issueId, row.id))
      .orderBy(asc(issueComments.createdAt)),
    db
      .select(issueSelection)
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
      .leftJoin(users, eq(users.id, issues.assigneeId))
      .where(and(eq(issues.parentIssueId, row.id), isNull(issues.deletedAt)))
      .orderBy(asc(issues.number)),
    row.parentId
      ? db
          .select(issueSelection)
          .from(issues)
          .innerJoin(teams, eq(teams.id, issues.teamId))
      .leftJoin(projects, eq(projects.id, issues.projectId))
          .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
          .leftJoin(users, eq(users.id, issues.assigneeId))
          .where(and(eq(issues.id, row.parentId), isNull(issues.deletedAt)))
      : Promise.resolve([]),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarColor: users.avatarColor,
        avatarKey: users.avatarKey,
        title: users.title,
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        lastSeenAt: users.lastSeenAt,
        typingAt: issueEditors.typingAt,
        typingField: issueEditors.typingField,
      })
      .from(issueEditors)
      .innerJoin(users, eq(users.id, issueEditors.userId))
      .where(
        and(
          eq(issueEditors.issueId, row.id),
          gt(issueEditors.updatedAt, new Date(Date.now() - ISSUE_VIEWER_WINDOW_MS).toISOString()),
        ),
      ),
    creatorRows,
    eventRows,
    db
      .select()
      .from(issueLinks)
      .where(eq(issueLinks.issueId, row.id))
      .orderBy(desc(issueLinks.updatedAt))
      .limit(20),
  ]);

  const typingSince = new Date(Date.now() - COMMENT_TYPING_WINDOW_MS).toISOString();
  const subIssues = childRows.map((child) =>
    toIssue(child, [], 0),
  );
  const subIssueDone = subIssues.filter((child) => child.status.category === 'completed').length;
  const parent = parentRow[0] ? toIssue(parentRow[0], [], 0) : null;
  const pullRequests: PullRequestLink[] = linkRows.map((link) => ({
    id: link.id,
    repo: link.repo,
    number: link.number,
    url: link.url,
    title: link.title,
    state: link.state as PullRequestState,
    review: link.review === 'approved' || link.review === 'changes_requested' ? link.review : null,
    authorLogin: link.authorLogin,
    branch: link.branch,
    updatedAt: link.updatedAt,
  }));
  return {
    pullRequests,
    issue: {
      ...toIssue(row, labelMap.get(row.id) ?? [], commentMap.get(row.id) ?? 0),
      pullRequest: pullRequests.length
        ? {
            count: pullRequests.length,
            state: pullRequests.reduce<PullRequestState>(
              (best, link) => (PR_RANK[link.state] > PR_RANK[best] ? link.state : best),
              'closed',
            ),
          }
        : null,
      subIssueCount: subIssues.length,
      subIssueDone,
    },
    comments: commentRows.map(toComment),
    parent,
    subIssues,
    editors: editorRows.map((editor) => toUserSummary(editor)),
    createdBy: creatorRow[0] ? toUserSummary(creatorRow[0]) : null,
    events: historyRows.map(toEvent),
    commentTyping: editorRows
      .filter(
        (editor) =>
          editor.typingAt && editor.typingAt > typingSince && editor.typingField !== 'description',
      )
      .map((editor) => toUserSummary(editor)),
    descriptionEditing: editorRows
      .filter(
        (editor) =>
          editor.typingAt && editor.typingAt > typingSince && editor.typingField === 'description',
      )
      .map((editor) => toUserSummary(editor)),
  };
}

/** Hard-deletes issues that have sat in the trash for 30 days. Bounded so a load never stalls. */
async function purgeExpiredTrash(workspaceId: string) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const expired = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.workspaceId, workspaceId), lt(issues.deletedAt, cutoff)))
    .limit(20);
  if (expired.length === 0) return;
  const ids = expired.map((row) => row.id);
  await db.update(issues).set({ parentIssueId: null }).where(inArray(issues.parentIssueId, ids));
  await db.delete(issues).where(inArray(issues.id, ids));
}

export const getTasksFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, membership, statuses } = await workspaceForSlug(data.slug, me.id);
    await touchPresence(me.id);

    await purgeExpiredTrash(workspace.id);
    const [[totalRow], existingTeams, labelRows, members, issueRows, projectRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(issues)
        .where(and(eq(issues.workspaceId, workspace.id), isNull(issues.deletedAt))),
      db
        .select()
        .from(teams)
        .where(eq(teams.workspaceId, workspace.id))
        .orderBy(asc(teams.createdAt)),
      db.select().from(labels).where(eq(labels.workspaceId, workspace.id)).orderBy(asc(labels.name)),
      memberUsers(workspace.id),
      db
        .select(issueSelection)
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
      .leftJoin(projects, eq(projects.id, issues.projectId))
        .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
        .leftJoin(users, eq(users.id, issues.assigneeId))
        .where(and(eq(issues.workspaceId, workspace.id), isNull(issues.deletedAt)))
        .orderBy(desc(issues.updatedAt))
        .limit(500),
      db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id))
        .orderBy(asc(projects.createdAt)),
    ]);

    const teamRows =
      existingTeams.length > 0
        ? existingTeams
        : await createDefaultTeam(workspace.id, workspace.name, me.id);

    const ids = issueRows.map((row) => row.id);
    const [labelMap, commentMap, prMap] = await Promise.all([
      issueLabelsFor(ids),
      commentCountsFor(ids),
      pullRequestsFor(ids),
    ]);

    const issueViews = issueRows.map((row) => ({
      ...toIssue(row, labelMap.get(row.id) ?? [], commentMap.get(row.id) ?? 0),
      pullRequest: prMap.get(row.id) ?? null,
    }));
    const subIssueCounts = new Map<string, { total: number; done: number }>();
    for (const issue of issueViews) {
      if (!issue.parentId) continue;
      const counts = subIssueCounts.get(issue.parentId) ?? { total: 0, done: 0 };
      counts.total += 1;
      if (issue.status.category === 'completed') counts.done += 1;
      subIssueCounts.set(issue.parentId, counts);
    }
    const issuesWithSubIssues = issueViews.map((issue) => ({
      ...issue,
      subIssueCount: subIssueCounts.get(issue.id)?.total ?? 0,
      subIssueDone: subIssueCounts.get(issue.id)?.done ?? 0,
    }));
    const teamCounts = new Map<string, number>();
    for (const issue of issuesWithSubIssues) {
      teamCounts.set(issue.team.id, (teamCounts.get(issue.team.id) ?? 0) + 1);
    }
    const teamsView: TaskTeam[] = teamRows.map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key,
      color: team.color,
      description: team.description,
      issueCount: teamCounts.get(team.id) ?? 0,
    }));

    const byStatus: Record<string, number> = Object.fromEntries(
      statuses.map((status) => [status.id, 0]),
    );
    for (const issue of issuesWithSubIssues) {
      byStatus[issue.status.id] = (byStatus[issue.status.id] ?? 0) + 1;
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        inviteCode: workspace.inviteCode,
        role: membership.role,
      },
      me,
      teams: teamsView,
      projects: projectRows.map((project): TaskProject => {
        const projectIssues = issuesWithSubIssues.filter((issue) => issue.project?.id === project.id);
        const lead = project.leadId ? members.find((member) => member.id === project.leadId) : null;
        return {
          id: project.id,
          name: project.name,
          description: project.description,
          color: project.color,
          status: toProjectStatus(project.status),
          lead: lead ?? null,
          startDate: project.startDate,
          targetDate: project.targetDate,
          issueCount: projectIssues.length,
          doneCount: projectIssues.filter((issue) => issue.status.category === 'completed').length,
        };
      }),
      labels: labelRows.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      statuses,
      members,
      issues: issuesWithSubIssues,
      counts: {
        all: issuesWithSubIssues.length,
        total: Number(totalRow?.count ?? issuesWithSubIssues.length),
        mine: issuesWithSubIssues.filter((issue) => issue.assignee?.id === me.id).length,
        byStatus,
      },
    } satisfies TasksSnapshot;
  });

// Server-side task search lives next to getTasksFn so it shares the list's row selection.
const TASK_SEARCH_LIMIT = 50;

// Escape LIKE wildcards so "100%" or "a_b" match literally.
const likeContains = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Finds issues by title or key ("KOR-12", "kor-1" or "12") across EVERY non-deleted issue of the
 * workspace, not only the most recent ones the task list loads. Returns the same shape the list
 * uses, newest update first.
 */
export const searchTasksFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().max(100), query: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }): Promise<TaskIssue[]> => {
    const me = await requireUser();
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    await requireWorkspace(workspace.id, me.id);

    const pattern = likeContains(data.query);
    const key = sql`${teams.key} || '-' || ${issues.number}`;
    const rows = await db
      .select(issueSelection)
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
      .leftJoin(users, eq(users.id, issues.assigneeId))
      .where(
        and(
          eq(issues.workspaceId, workspace.id),
          isNull(issues.deletedAt),
          sql`(${issues.title} LIKE ${pattern} ESCAPE '\\' OR ${key} LIKE ${pattern} ESCAPE '\\')`,
        ),
      )
      .orderBy(desc(issues.updatedAt))
      .limit(TASK_SEARCH_LIMIT);
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [labelMap, commentMap, prMap, children] = await Promise.all([
      issueLabelsFor(ids),
      commentCountsFor(ids),
      pullRequestsFor(ids),
      // Sub-issue progress, counted over live children only.
      inChunks(ids, (chunk) =>
        db
          .select({ parentId: issues.parentIssueId, category: taskStatuses.category })
          .from(issues)
          .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
          .where(and(inArray(issues.parentIssueId, chunk), isNull(issues.deletedAt))),
      ),
    ]);
    const progress = new Map<string, { total: number; done: number }>();
    for (const child of children) {
      if (!child.parentId) continue;
      const entry = progress.get(child.parentId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (child.category === 'completed') entry.done += 1;
      progress.set(child.parentId, entry);
    }
    return rows.map((row) => ({
      ...toIssue(row, labelMap.get(row.id) ?? [], commentMap.get(row.id) ?? 0),
      pullRequest: prMap.get(row.id) ?? null,
      subIssueCount: progress.get(row.id)?.total ?? 0,
      subIssueDone: progress.get(row.id)?.done ?? 0,
    }));
  });

export const touchIssueEditorFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string(), leave: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
    if (data.leave) {
      await db
        .delete(issueEditors)
        .where(and(eq(issueEditors.issueId, data.issueId), eq(issueEditors.userId, me.id)));
      await publish(issue.workspaceId, [toWorkspace({ t: 'editors', i: data.issueId })]);
      return { ok: true as const };
    }
    const now = new Date().toISOString();
    const [before] = await db
      .select({ updatedAt: issueEditors.updatedAt })
      .from(issueEditors)
      .where(and(eq(issueEditors.issueId, data.issueId), eq(issueEditors.userId, me.id)));
    await db
      .insert(issueEditors)
      .values({ issueId: data.issueId, userId: me.id, updatedAt: now })
      .onConflictDoUpdate({
        target: [issueEditors.issueId, issueEditors.userId],
        set: { updatedAt: now },
      });
    // Announce only arrivals; the heartbeat that keeps someone listed is not news.
    if (!before || Date.parse(before.updatedAt) < Date.now() - ISSUE_VIEWER_WINDOW_MS) {
      await publish(issue.workspaceId, [toWorkspace({ t: 'editors', i: data.issueId })]);
    }
    return { ok: true as const };
  });

export const setIssueTypingFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      issueId: z.string(),
      active: z.boolean(),
      field: z.enum(['comment', 'description']).default('comment'),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
    const now = new Date().toISOString();
    const typingAt = data.active ? now : null;
    const typingField = data.active ? data.field : null;
    await db
      .insert(issueEditors)
      .values({ issueId: data.issueId, userId: me.id, updatedAt: now, typingAt, typingField })
      .onConflictDoUpdate({
        target: [issueEditors.issueId, issueEditors.userId],
        set: { updatedAt: now, typingAt, typingField },
      });
    await publish(issue.workspaceId, [toWorkspace({ t: 'editors', i: data.issueId })]);
    return { ok: true as const };
  });

export const getIssueFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string(), issueKey: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace } = await workspaceForSlug(data.slug, me.id);
    const row = await issueRowByKey(workspace.id, data.issueKey);
    return issueDetail(row);
  });

export const createIssueFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      teamId: z.string(),
      projectId: z.string().max(64).nullable().optional(),
      title: z.string().trim().min(1, 'Give the issue a title').max(200),
      description: z.string().max(8000).default(''),
      statusId: z.string().optional(),
      priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(0),
      assigneeId: z.string().nullable().optional(),
      labelIds: idListSchema.default([]),
      parentIssueId: z.string().nullable().optional(),
      startDate: dateSchema.nullable().optional(),
      dueDate: dateSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, statuses } = await workspaceForSlug(data.slug, me.id);
    let teamId = data.teamId;
    if (data.parentIssueId) {
      const [parent] = await db
        .select({ id: issues.id, workspaceId: issues.workspaceId, teamId: issues.teamId })
        .from(issues)
        .where(eq(issues.id, data.parentIssueId));
      if (!parent || parent.workspaceId !== workspace.id) throw new Error('Parent issue not found.');
      teamId = parent.teamId;
    }
    if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
      throw new Error('The due date cannot be before the start date.');
    }
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspace.id)));
    if (!team) throw new Error('Team not found.');

    const status = data.statusId
      ? statuses.find((item) => item.id === data.statusId)
      : statuses.find((item) => item.category === 'unstarted') ?? statuses[0];
    if (!status) throw new Error('Create a workflow status first.');

    if (data.assigneeId) {
      const member = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, data.assigneeId),
          ),
        );
      if (member.length === 0) throw new Error('Pick a teammate in this workspace.');
    }

    const issueId = newId();
    // The number is computed inside the insert so two concurrent creates cannot pick the same one.
    await db.insert(issues).values({
      id: issueId,
      workspaceId: workspace.id,
      teamId: team.id,
      number: sql`(select coalesce(max(${issues.number}), 0) + 1 from ${issues} where ${issues.teamId} = ${team.id})`,
      title: data.title,
      description: data.description,
      status: status.id,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      parentIssueId: data.parentIssueId ?? null,
      projectId: data.projectId ? await requireProjectId(workspace.id, data.projectId) : null,
      startDate: data.startDate ?? null,
      dueDate: data.dueDate ?? null,
      createdBy: me.id,
    });

    if (data.labelIds.length > 0) {
      const valid = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.workspaceId, workspace.id), inArray(labels.id, data.labelIds)));
      if (valid.length > 0) {
        await db
          .insert(issueLabels)
          .values(valid.map((label) => ({ issueId, labelId: label.id })))
          .onConflictDoNothing();
      }
    }

    const [created] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(eq(issues.id, issueId));
    await recordIssueEvent(issueId, me.id, 'created');
    if (data.assigneeId) {
      await notify({
        workspaceId: workspace.id,
        userIds: [data.assigneeId],
        actorId: me.id,
        kind: 'issue_assigned',
        issueId,
        body: data.title,
      });
    }
    await issueChanged(workspace.id, issueId);
    return { issueId, key: `${team.key}-${created?.number ?? ''}` };
  });

const MAX_PARENT_DEPTH = 50;

/** The parent must be another issue in the workspace, and not one of the issue's own sub-issues. */
async function assertValidParent(workspaceId: string, issueId: string, parentId: string) {
  if (parentId === issueId) throw new Error('An issue cannot be its own parent.');
  let cursor: string | null = parentId;
  for (let depth = 0; cursor && depth < MAX_PARENT_DEPTH; depth++) {
    const [row] = await db
      .select({ workspaceId: issues.workspaceId, parentId: issues.parentIssueId })
      .from(issues)
      .where(eq(issues.id, cursor));
    if (!row || row.workspaceId !== workspaceId) throw new Error('Parent issue not found.');
    if (row.parentId === issueId) {
      throw new Error('That issue is already below this one. Pick a parent outside its sub-issues.');
    }
    cursor = row.parentId;
  }
}

export const updateIssueFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      issueId: z.string(),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(8000).optional(),
      statusId: z.string().optional(),
      priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      assigneeId: z.string().nullable().optional(),
      labelIds: idListSchema.optional(),
      startDate: dateSchema.nullable().optional(),
      dueDate: dateSchema.nullable().optional(),
      // A sub-issue is an ordinary issue with a parent; null detaches it.
      parentIssueId: z.string().max(64).nullable().optional(),
      projectId: z.string().max(64).nullable().optional(),
      // The description version the editor started from; a newer one on the server is a conflict.
      descriptionBaseVersion: z.number().int().min(0).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
    if (data.projectId) await requireProjectId(issue.workspaceId, data.projectId);
    const before = await issueRowById(data.issueId);
    const labelsBefore =
      data.labelIds !== undefined ? (await issueLabelsFor([data.issueId])).get(data.issueId) ?? [] : [];
    if (data.parentIssueId) await assertValidParent(issue.workspaceId, data.issueId, data.parentIssueId);
    if (data.assigneeId) {
      const member = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, issue.workspaceId),
            eq(workspaceMembers.userId, data.assigneeId),
          ),
        );
      if (member.length === 0) throw new Error('Pick a teammate in this workspace.');
    }
    if (data.statusId) {
      const [status] = await db
        .select({ id: taskStatuses.id })
        .from(taskStatuses)
        .where(
          and(
            eq(taskStatuses.workspaceId, issue.workspaceId),
            eq(taskStatuses.id, data.statusId),
          ),
        );
      if (!status) throw new Error('Pick a status in this workspace.');
    }

    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (data.title !== undefined) set.title = data.title;
    if (data.description !== undefined) set.description = data.description;
    if (data.statusId !== undefined) set.status = data.statusId;
    if (data.priority !== undefined) set.priority = data.priority;
    if (data.assigneeId !== undefined) set.assigneeId = data.assigneeId;
    if (data.startDate !== undefined) set.startDate = data.startDate;
    if (data.dueDate !== undefined) set.dueDate = data.dueDate;
    if (data.parentIssueId !== undefined) set.parentIssueId = data.parentIssueId;
    if (data.projectId !== undefined) set.projectId = data.projectId;
    const nextStart = data.startDate !== undefined ? data.startDate : issue.startDate;
    const nextDue = data.dueDate !== undefined ? data.dueDate : issue.dueDate;
    if (nextStart && nextDue && nextDue < nextStart) {
      throw new Error('The due date cannot be before the start date.');
    }
    let descriptionVersion: number | undefined;
    if (data.description !== undefined) {
      // Compare-and-set in one statement, so two saves at the same instant cannot both win.
      set.descriptionVersion = sql`${issues.descriptionVersion} + 1`;
      const where =
        data.descriptionBaseVersion === undefined
          ? eq(issues.id, data.issueId)
          : and(
              eq(issues.id, data.issueId),
              eq(issues.descriptionVersion, data.descriptionBaseVersion),
            );
      const saved = await db
        .update(issues)
        .set(set)
        .where(where)
        .returning({ version: issues.descriptionVersion });
      if (saved.length === 0) {
        const [latest] = await db
          .select({ description: issues.description, version: issues.descriptionVersion })
          .from(issues)
          .where(eq(issues.id, data.issueId));
        return {
          ok: false as const,
          conflict: { description: latest?.description ?? '', version: latest?.version ?? 0 },
        };
      }
      descriptionVersion = saved[0]?.version;
    } else {
      await db.update(issues).set(set).where(eq(issues.id, data.issueId));
    }

    if (data.labelIds !== undefined) {
      await db.delete(issueLabels).where(eq(issueLabels.issueId, data.issueId));
      if (data.labelIds.length > 0) {
        const valid = await db
          .select({ id: labels.id })
          .from(labels)
          .where(
            and(eq(labels.workspaceId, issue.workspaceId), inArray(labels.id, data.labelIds)),
          );
        if (valid.length > 0) {
          await db
            .insert(issueLabels)
            .values(valid.map((label) => ({ issueId: data.issueId, labelId: label.id })))
            .onConflictDoNothing();
        }
      }
    }

    // History and inbox. Reading the row again gives display names for whatever changed.
    const after = await issueRowById(data.issueId);
    if (before && after) {
      let labelChange: { added: string[]; removed: string[] } | undefined;
      if (data.labelIds !== undefined) {
        const labelsAfter = (await issueLabelsFor([data.issueId])).get(data.issueId) ?? [];
        labelChange = {
          added: labelsAfter.filter((l) => !labelsBefore.some((b) => b.id === l.id)).map((l) => l.name),
          removed: labelsBefore.filter((b) => !labelsAfter.some((l) => l.id === b.id)).map((b) => b.name),
        };
      }
      await recordChanges(before, after, me.id, labelChange);
      if (after.assigneeId && after.assigneeId !== before.assigneeId) {
        await notify({
          workspaceId: issue.workspaceId,
          userIds: [after.assigneeId],
          actorId: me.id,
          kind: 'issue_assigned',
          issueId: data.issueId,
          body: after.title,
        });
      }
      if (after.statusId !== before.statusId) {
        await notify({
          workspaceId: issue.workspaceId,
          userIds: await issueSubscribers(data.issueId),
          actorId: me.id,
          kind: 'issue_status',
          issueId: data.issueId,
          body: after.statusName,
        });
      }
    }
    await issueChanged(issue.workspaceId, data.issueId);
    return { ok: true as const, descriptionVersion };
  });

/** Returns the project id when it belongs to the workspace; throws otherwise. */
async function requireProjectId(workspaceId: string, projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
  if (!row) throw new Error('Project not found.');
  return row.id;
}

export const deleteIssueFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
    if (issue.createdBy !== me.id && !isAdminRole(issue.role)) {
      throw new Error('Only the person who created this issue or a workspace admin can delete it.');
    }
    // Soft delete: the issue goes to the trash for 30 days and can be restored with everything on it.
    await db
      .update(issues)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(issues.id, data.issueId));
    await recordIssueEvent(data.issueId, me.id, 'deleted');
    await issueChanged(issue.workspaceId, data.issueId);
    return { ok: true as const };
  });

export const restoreIssueFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id, { allowDeleted: true });
    if (!issue.deletedAt) return { ok: true as const };
    if (issue.createdBy !== me.id && !isAdminRole(issue.role)) {
      throw new Error('Only the person who created this issue or a workspace admin can restore it.');
    }
    await db.update(issues).set({ deletedAt: null }).where(eq(issues.id, data.issueId));
    await recordIssueEvent(data.issueId, me.id, 'restored');
    await issueChanged(issue.workspaceId, data.issueId);
    return { ok: true as const };
  });

const TRASH_DAYS = 30;

/** Issues deleted in the last 30 days, newest first, for the Trash page. */
export const getTrashFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, membership } = await workspaceForSlug(data.slug, me.id);
    const rows = await db
      .select({ ...issueSelection, deletedAt: issues.deletedAt, createdBy: issues.createdBy })
      .from(issues)
      .innerJoin(teams, eq(teams.id, issues.teamId))
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
      .leftJoin(users, eq(users.id, issues.assigneeId))
      .where(and(eq(issues.workspaceId, workspace.id), isNotNull(issues.deletedAt)))
      .orderBy(desc(issues.deletedAt))
      .limit(100);
    return {
      canRestoreAll: isAdminRole(membership.role),
      meId: me.id,
      issues: rows.map((row) => ({
        ...toIssue(row, [], 0),
        deletedAt: row.deletedAt ?? '',
        createdBy: row.createdBy,
        purgeAt: new Date(
          new Date(row.deletedAt ?? Date.now()).getTime() + TRASH_DAYS * 86_400_000,
        ).toISOString(),
      })),
    };
  });

export const addTaskCommentFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string(), body: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
    const commentId = newId();
    await db.insert(issueComments).values({
      id: commentId,
      issueId: data.issueId,
      userId: me.id,
      body: data.body,
    });
    await db
      .update(issues)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(issues.id, data.issueId));
    await notify({
      workspaceId: issue.workspaceId,
      userIds: await issueSubscribers(data.issueId),
      actorId: me.id,
      kind: 'issue_comment',
      issueId: data.issueId,
      body: markdownToPlainText(data.body),
    });
    // Posting ends the typing state right away instead of waiting for it to expire.
    await db
      .update(issueEditors)
      .set({ typingAt: null })
      .where(and(eq(issueEditors.issueId, data.issueId), eq(issueEditors.userId, me.id)));
    const [row] = await db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        createdAt: issueComments.createdAt,
        authorId: users.id,
        authorName: users.name,
        authorEmail: users.email,
        authorAvatarColor: users.avatarColor,
        authorAvatarKey: users.avatarKey,
        authorTitle: users.title,
        authorStatusEmoji: users.statusEmoji,
        authorStatusText: users.statusText,
        authorLastSeenAt: users.lastSeenAt,
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.userId))
      .where(eq(issueComments.id, commentId));
    await issueChanged(issue.workspaceId, data.issueId);
    return { comment: toComment(row) };
  });

export const createLabelFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      name: z.string().trim().min(1, 'Give the label a name').max(30),
      issueId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace } = await workspaceForSlug(data.slug, me.id);
    const rows = await db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.workspaceId, workspace.id));
    let label = rows.find((row) => row.name.toLowerCase() === data.name.toLowerCase());
    const created = !label;
    if (!label) {
      label = {
        id: newId(),
        name: data.name,
        color: colorForLabel(data.name),
      };
      await db.insert(labels).values({
        id: label.id,
        workspaceId: workspace.id,
        name: label.name,
        color: label.color,
      });
    }
    if (data.issueId) {
      const issue = await requireIssue(data.issueId, me.id);
      if (issue.workspaceId !== workspace.id) throw new Error('Issue not found.');
      await db
        .insert(issueLabels)
        .values({ issueId: data.issueId, labelId: label.id })
        .onConflictDoNothing();
    }
    await issueChanged(workspace.id, data.issueId);
    return { label, created };
  });

export const updateLabelFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      labelId: z.string(),
      name: z.string().trim().min(1).max(30).optional(),
      color: colorSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [label] = await db.select().from(labels).where(eq(labels.id, data.labelId));
    if (!label) throw new Error('Label not found.');
    await requireWorkspace(label.workspaceId, me.id);
    if (data.name && data.name.toLowerCase() !== label.name.toLowerCase()) {
      const rows = await db
        .select({ id: labels.id, name: labels.name })
        .from(labels)
        .where(eq(labels.workspaceId, label.workspaceId));
      if (rows.some((row) => row.name.toLowerCase() === data.name?.toLowerCase())) {
        throw new Error('A label with that name already exists.');
      }
    }
    const set: Record<string, unknown> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.color !== undefined) set.color = data.color;
    if (Object.keys(set).length > 0) {
      await db.update(labels).set(set).where(eq(labels.id, data.labelId));
    }
    await issueChanged(label.workspaceId);
    return { ok: true as const };
  });

export const deleteLabelFn = createServerFn({ method: 'POST' })
  .validator(z.object({ labelId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [label] = await db.select().from(labels).where(eq(labels.id, data.labelId));
    if (!label) throw new Error('Label not found.');
    await requireAdmin(label.workspaceId, me.id, 'delete labels');
    await db.delete(labels).where(eq(labels.id, data.labelId));
    await issueChanged(label.workspaceId);
    return { ok: true as const };
  });

export const createTaskStatusFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      name: z.string().trim().min(1, 'Give the status a name').max(32),
      category: z.enum(TASK_STATUS_CATEGORIES),
      color: colorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, statuses } = await workspaceForSlug(data.slug, me.id);
    await requireAdmin(workspace.id, me.id, 'change the workflow');
    const duplicate = statuses.some(
      (status) => status.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (duplicate) throw new Error('A status with that name already exists.');
    const id = newId();
    const position = statuses.reduce((max, status) => Math.max(max, status.position), -1) + 1;
    await db.insert(taskStatuses).values({
      id,
      workspaceId: workspace.id,
      name: data.name,
      category: data.category,
      color: data.color,
      position,
    });
    await issueChanged(workspace.id);
    return {
      status: {
        id,
        name: data.name,
        category: data.category,
        color: data.color,
        position,
      } satisfies TaskStatus,
    };
  });

export const updateTaskStatusFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      statusId: z.string(),
      name: z.string().trim().min(1).max(32).optional(),
      category: z.enum(TASK_STATUS_CATEGORIES).optional(),
      color: colorSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [status] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, data.statusId));
    if (!status) throw new Error('Status not found.');
    await requireAdmin(status.workspaceId, me.id, 'change the workflow');
    if (data.name && data.name.toLowerCase() !== status.name.toLowerCase()) {
      const rows = await db
        .select({ id: taskStatuses.id, name: taskStatuses.name })
        .from(taskStatuses)
        .where(eq(taskStatuses.workspaceId, status.workspaceId));
      if (rows.some((row) => row.name.toLowerCase() === data.name?.toLowerCase())) {
        throw new Error('A status with that name already exists.');
      }
    }
    const set: Record<string, unknown> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.category !== undefined) set.category = data.category;
    if (data.color !== undefined) set.color = data.color;
    if (Object.keys(set).length > 0) {
      await db.update(taskStatuses).set(set).where(eq(taskStatuses.id, data.statusId));
    }
    await issueChanged(status.workspaceId);
    return { ok: true as const };
  });

export const reorderTaskStatusesFn = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string(), statusIds: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, statuses } = await workspaceForSlug(data.slug, me.id);
    await requireAdmin(workspace.id, me.id, 'change the workflow');
    const currentIds = new Set(statuses.map((status) => status.id));
    if (
      data.statusIds.length !== statuses.length ||
      data.statusIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error('The workflow changed. Refresh and try again.');
    }
    await Promise.all(
      data.statusIds.map((id, index) =>
        db
          .update(taskStatuses)
          .set({ position: index })
          .where(
            and(eq(taskStatuses.id, id), eq(taskStatuses.workspaceId, workspace.id)),
          ),
      ),
    );
    await issueChanged(workspace.id);
    return { ok: true as const };
  });

export const deleteTaskStatusFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      statusId: z.string(),
      moveToStatusId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [status] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, data.statusId));
    if (!status) throw new Error('Status not found.');
    await requireAdmin(status.workspaceId, me.id, 'change the workflow');

    const rows = await db
      .select()
      .from(taskStatuses)
      .where(eq(taskStatuses.workspaceId, status.workspaceId));
    if (rows.length <= 1) throw new Error('Keep at least one workflow status.');
    if (data.moveToStatusId === status.id) {
      throw new Error('Pick a different status to move issues to.');
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(
        and(eq(issues.workspaceId, status.workspaceId), eq(issues.status, status.id)),
      );
    const count = Number(countRow?.count ?? 0);

    if (count > 0) {
      if (!data.moveToStatusId) {
        throw new Error(`Move ${count} ${count === 1 ? 'issue' : 'issues'} to another status first.`);
      }
      const target = rows.find((row) => row.id === data.moveToStatusId);
      if (!target) throw new Error('Pick a status in this workspace.');
      await db
        .update(issues)
        .set({ status: target.id, updatedAt: new Date().toISOString() })
        .where(
          and(eq(issues.workspaceId, status.workspaceId), eq(issues.status, status.id)),
        );
    }

    await db.delete(taskStatuses).where(eq(taskStatuses.id, status.id));
    await issueChanged(status.workspaceId);
    return { moved: count };
  });

export const createTeamFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      name: z.string().trim().min(1, 'Give the team a name').max(40),
      key: z
        .string()
        .trim()
        .transform((value) => value.toUpperCase())
        .refine((value) => TEAM_KEY.test(value), 'Use 2 to 5 letters or digits, starting with a letter.'),
      color: colorSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace } = await workspaceForSlug(data.slug, me.id);
    await requireAdmin(workspace.id, me.id, 'create teams');
    const [taken] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspace.id), eq(teams.key, data.key)));
    if (taken) throw new Error(`Another team already uses the key ${data.key}.`);
    const id = newId();
    await db.insert(teams).values({
      id,
      workspaceId: workspace.id,
      name: data.name,
      key: data.key,
      color: data.color ?? colorForLabel(data.name),
      createdBy: me.id,
    });
    await issueChanged(workspace.id);
    return { id, key: data.key };
  });

const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const createProjectFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      name: z.string().trim().min(1, 'Give the project a name').max(60),
      description: z.string().max(2000).default(''),
      color: colorSchema.optional(),
      status: projectStatusSchema.default('planned'),
      leadId: z.string().max(64).nullable().optional(),
      startDate: dateSchema.nullable().optional(),
      targetDate: dateSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace } = await workspaceForSlug(data.slug, me.id);
    if (data.leadId) await requireMember(workspace.id, data.leadId);
    if (data.startDate && data.targetDate && data.targetDate < data.startDate) {
      throw new Error('The target date cannot be before the start date.');
    }
    const id = newId();
    await db.insert(projects).values({
      id,
      workspaceId: workspace.id,
      name: data.name,
      description: data.description,
      color: data.color ?? colorForLabel(data.name),
      status: data.status,
      leadId: data.leadId ?? null,
      startDate: data.startDate ?? null,
      targetDate: data.targetDate ?? null,
      createdBy: me.id,
    });
    await issueChanged(workspace.id);
    return { id };
  });

export const updateProjectFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.string(),
      name: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(2000).optional(),
      color: colorSchema.optional(),
      status: projectStatusSchema.optional(),
      leadId: z.string().max(64).nullable().optional(),
      startDate: dateSchema.nullable().optional(),
      targetDate: dateSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId));
    if (!project) throw new Error('Project not found.');
    await requireWorkspace(project.workspaceId, me.id);
    if (data.leadId) await requireMember(project.workspaceId, data.leadId);
    const start = data.startDate !== undefined ? data.startDate : project.startDate;
    const target = data.targetDate !== undefined ? data.targetDate : project.targetDate;
    if (start && target && target < start) {
      throw new Error('The target date cannot be before the start date.');
    }
    const { projectId, ...changes } = data;
    await db
      .update(projects)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    await issueChanged(project.workspaceId);
    return { ok: true as const };
  });

export const deleteProjectFn = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId));
    if (!project) throw new Error('Project not found.');
    await requireAdmin(project.workspaceId, me.id, 'delete projects');
    // Issues stay; they just leave the project (the foreign key also does this on delete).
    await db.update(issues).set({ projectId: null }).where(eq(issues.projectId, data.projectId));
    await db.delete(projects).where(eq(projects.id, data.projectId));
    await issueChanged(project.workspaceId);
    return { ok: true as const };
  });

async function requireMember(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  if (!row) throw new Error('Pick a teammate in this workspace.');
}
