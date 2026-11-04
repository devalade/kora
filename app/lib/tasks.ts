import { createServerFn } from '@tanstack/react-start';
import { and, asc, db, desc, eq, inArray, sql } from 'void/db';
import {
  issueComments,
  issueLabels,
  issues,
  labels,
  projects,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { toUserSummary } from './people';
import { memberUsers, requireWorkspace, touchPresence } from './server';
import { readSessionUser } from './session';
import type {
  TaskComment,
  TaskIssue,
  TaskLabel,
  TaskPriority,
  TaskProject,
  TaskStatus,
  TasksSnapshot,
} from './types';

const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;
const PRIORITIES = [0, 1, 2, 3, 4] as const;

const issueSelection = {
  id: issues.id,
  number: issues.number,
  title: issues.title,
  description: issues.description,
  status: issues.status,
  priority: issues.priority,
  projectId: issues.projectId,
  projectName: projects.name,
  projectKey: projects.key,
  projectColor: projects.color,
  assigneeId: issues.assigneeId,
  assigneeName: users.name,
  assigneeEmail: users.email,
  assigneeAvatarColor: users.avatarColor,
  assigneeTitle: users.title,
  assigneeStatusEmoji: users.statusEmoji,
  assigneeStatusText: users.statusText,
  assigneeLastSeenAt: users.lastSeenAt,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
};

type IssueRow = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: number;
  projectId: string;
  projectName: string;
  projectKey: string;
  projectColor: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeAvatarColor: string | null;
  assigneeTitle: string | null;
  assigneeStatusEmoji: string | null;
  assigneeStatusText: string | null;
  assigneeLastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIssue(row: IssueRow, issueLabelsList: TaskLabel[], commentCount: number): TaskIssue {
  return {
    id: row.id,
    key: `${row.projectKey}-${row.number}`,
    number: row.number,
    title: row.title,
    description: row.description,
    status: STATUSES.includes(row.status as TaskStatus) ? (row.status as TaskStatus) : 'todo',
    priority: (PRIORITIES.includes(row.priority as TaskPriority) ? row.priority : 0) as TaskPriority,
    project: {
      id: row.projectId,
      name: row.projectName,
      key: row.projectKey,
      color: row.projectColor,
    },
    assignee:
      row.assigneeId && row.assigneeName && row.assigneeEmail && row.assigneeAvatarColor
        ? toUserSummary({
            id: row.assigneeId,
            name: row.assigneeName,
            email: row.assigneeEmail,
            avatarColor: row.assigneeAvatarColor,
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
  };
}

async function issueLabelsFor(issueIds: string[]) {
  if (issueIds.length === 0) return new Map<string, TaskLabel[]>();
  const rows = await db
    .select({
      issueId: issueLabels.issueId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.issueId, issueIds));
  const map = new Map<string, TaskLabel[]>();
  for (const row of rows) {
    const list = map.get(row.issueId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.issueId, list);
  }
  return map;
}

async function commentCountsFor(issueIds: string[]) {
  if (issueIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ issueId: issueComments.issueId, count: sql<number>`count(*)` })
    .from(issueComments)
    .where(inArray(issueComments.issueId, issueIds))
    .groupBy(issueComments.issueId);
  return new Map(rows.map((row) => [row.issueId, Number(row.count)]));
}

async function requireIssue(issueId: string, userId: string) {
  const [row] = await db
    .select({ id: issues.id, workspaceId: issues.workspaceId, projectId: issues.projectId })
    .from(issues)
    .where(eq(issues.id, issueId));
  if (!row) throw new Error('Issue not found.');
  await requireWorkspace(row.workspaceId, userId);
  return row;
}

export const getTasksFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    const membership = await requireWorkspace(workspace.id, me.id);
    await touchPresence(me.id);

    const [projectRows, labelRows, members, issueRows] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id))
        .orderBy(asc(projects.createdAt)),
      db.select().from(labels).where(eq(labels.workspaceId, workspace.id)).orderBy(asc(labels.name)),
      memberUsers(workspace.id),
      db
        .select(issueSelection)
        .from(issues)
        .innerJoin(projects, eq(projects.id, issues.projectId))
        .leftJoin(users, eq(users.id, issues.assigneeId))
        .where(eq(issues.workspaceId, workspace.id))
        .orderBy(desc(issues.updatedAt))
        .limit(300),
    ]);

    const ids = issueRows.map((row) => row.id);
    const [labelMap, commentMap] = await Promise.all([
      issueLabelsFor(ids),
      commentCountsFor(ids),
    ]);

    const issueViews = issueRows.map((row) =>
      toIssue(row, labelMap.get(row.id) ?? [], commentMap.get(row.id) ?? 0),
    );
    const projectCounts = new Map<string, number>();
    for (const issue of issueViews) {
      projectCounts.set(issue.project.id, (projectCounts.get(issue.project.id) ?? 0) + 1);
    }
    const projectsView: TaskProject[] = projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      key: project.key,
      color: project.color,
      description: project.description,
      issueCount: projectCounts.get(project.id) ?? 0,
    }));

    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
      TaskStatus,
      number
    >;
    for (const issue of issueViews) byStatus[issue.status] += 1;

    const counts = {
      all: issueViews.length,
      mine: issueViews.filter((issue) => issue.assignee?.id === me.id).length,
      byStatus,
    };

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        inviteCode: workspace.inviteCode,
        role: membership.role,
      },
      me,
      projects: projectsView,
      labels: labelRows.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      members,
      issues: issueViews,
      counts,
    } satisfies TasksSnapshot;
  });

export const getIssueFn = createServerFn({ method: 'GET' })
  .validator(z.object({ issueId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    await requireIssue(data.issueId, me.id);
    const [issueRow] = await db
      .select(issueSelection)
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(users, eq(users.id, issues.assigneeId))
      .where(eq(issues.id, data.issueId));
    if (!issueRow) throw new Error('Issue not found.');
    const [labelMap, commentMap, commentRows] = await Promise.all([
      issueLabelsFor([issueRow.id]),
      commentCountsFor([issueRow.id]),
      db
        .select({
          id: issueComments.id,
          body: issueComments.body,
          createdAt: issueComments.createdAt,
          authorId: users.id,
          authorName: users.name,
          authorEmail: users.email,
          authorAvatarColor: users.avatarColor,
          authorTitle: users.title,
          authorStatusEmoji: users.statusEmoji,
          authorStatusText: users.statusText,
          authorLastSeenAt: users.lastSeenAt,
        })
        .from(issueComments)
        .innerJoin(users, eq(users.id, issueComments.userId))
        .where(eq(issueComments.issueId, issueRow.id))
        .orderBy(asc(issueComments.createdAt)),
    ]);

    const comments: TaskComment[] = commentRows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: toUserSummary({
        id: row.authorId,
        name: row.authorName,
        email: row.authorEmail,
        avatarColor: row.authorAvatarColor,
        title: row.authorTitle,
        statusEmoji: row.authorStatusEmoji,
        statusText: row.authorStatusText,
        lastSeenAt: row.authorLastSeenAt,
      }),
    }));

    return {
      issue: toIssue(issueRow, labelMap.get(issueRow.id) ?? [], commentMap.get(issueRow.id) ?? 0),
      comments,
    };
  });

export const createIssueFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z.string(),
      projectId: z.string(),
      title: z.string().trim().min(1, 'Give the issue a title').max(200),
      description: z.string().max(8000).default(''),
      status: z.enum(STATUSES).default('todo'),
      priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(0),
      assigneeId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, data.slug));
    if (!workspace) throw new Error('Workspace not found.');
    await requireWorkspace(workspace.id, me.id);
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspace.id)));
    if (!project) throw new Error('Project not found.');

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

    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${issues.number}), 0)` })
      .from(issues)
      .where(eq(issues.projectId, project.id));
    const number = Number(maxRow?.max ?? 0) + 1;
    const issueId = newId();
    await db.insert(issues).values({
      id: issueId,
      workspaceId: workspace.id,
      projectId: project.id,
      number,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
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

    return { issueId, key: `${project.key}-${number}` };
  });

export const updateIssueFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      issueId: z.string(),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(8000).optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      assigneeId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const issue = await requireIssue(data.issueId, me.id);
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

    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (data.title !== undefined) set.title = data.title;
    if (data.description !== undefined) set.description = data.description;
    if (data.status !== undefined) set.status = data.status;
    if (data.priority !== undefined) set.priority = data.priority;
    if (data.assigneeId !== undefined) set.assigneeId = data.assigneeId;
    await db.update(issues).set(set).where(eq(issues.id, data.issueId));

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
    return { ok: true as const };
  });

export const deleteIssueFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    await requireIssue(data.issueId, me.id);
    await db.delete(issues).where(eq(issues.id, data.issueId));
    return { ok: true as const };
  });

export const addTaskCommentFn = createServerFn({ method: 'POST' })
  .validator(z.object({ issueId: z.string(), body: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    await requireIssue(data.issueId, me.id);
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
    const [row] = await db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        createdAt: issueComments.createdAt,
        authorId: users.id,
        authorName: users.name,
        authorEmail: users.email,
        authorAvatarColor: users.avatarColor,
        authorTitle: users.title,
        authorStatusEmoji: users.statusEmoji,
        authorStatusText: users.statusText,
        authorLastSeenAt: users.lastSeenAt,
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.userId))
      .where(eq(issueComments.id, commentId));
    return {
      comment: {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: toUserSummary({
          id: row.authorId,
          name: row.authorName,
          email: row.authorEmail,
          avatarColor: row.authorAvatarColor,
          title: row.authorTitle,
          statusEmoji: row.authorStatusEmoji,
          statusText: row.authorStatusText,
          lastSeenAt: row.authorLastSeenAt,
        }),
      } satisfies TaskComment,
    };
  });
