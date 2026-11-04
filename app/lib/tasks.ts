import { createServerFn } from '@tanstack/react-start';
import { and, asc, db, desc, eq, inArray, sql } from 'void/db';
import {
  issueComments,
  issueLabels,
  issues,
  labels,
  projects,
  taskStatuses,
  users,
  workspaceMembers,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { toUserSummary } from './people';
import { memberUsers, requireWorkspace, touchPresence } from './server';
import { readSessionUser } from './session';
import {
  DEFAULT_TASK_STATUSES,
  TASK_LABEL_COLORS,
  TASK_STATUS_CATEGORIES,
} from './task-config';
import type {
  TaskComment,
  TaskIssue,
  TaskIssueDetail,
  TaskLabel,
  TaskPriority,
  TaskProject,
  TaskStatus,
  TaskStatusCategory,
  TasksSnapshot,
} from './types';

const PRIORITIES = [0, 1, 2, 3, 4] as const;
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex color.');

function colorForLabel(name: string) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return TASK_LABEL_COLORS[Math.abs(hash) % TASK_LABEL_COLORS.length] ?? TASK_LABEL_COLORS[0];
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
  statusId: string;
  statusName: string;
  statusCategory: string;
  statusColor: string;
  statusPosition: number;
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
      DEFAULT_TASK_STATUSES.map((status) => ({
        ...status,
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
    key: `${row.projectKey}-${row.number}`,
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

function parseIssueKey(key: string) {
  const separator = key.lastIndexOf('-');
  if (separator < 1) throw new Error('Issue not found.');
  const projectKey = key.slice(0, separator);
  const number = Number(key.slice(separator + 1));
  if (!Number.isInteger(number) || number < 1) throw new Error('Issue not found.');
  return { projectKey, number };
}

async function issueRowByKey(workspaceId: string, issueKey: string) {
  const { projectKey, number } = parseIssueKey(issueKey);
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, projectKey)));
  if (!project) throw new Error('Issue not found.');
  const [row] = await db
    .select(issueSelection)
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
    .leftJoin(users, eq(users.id, issues.assigneeId))
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        eq(issues.projectId, project.id),
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
      title: row.authorTitle,
      statusEmoji: row.authorStatusEmoji,
      statusText: row.authorStatusText,
      lastSeenAt: row.authorLastSeenAt,
    }),
  };
}

async function issueDetail(row: IssueRow): Promise<TaskIssueDetail> {
  const [labelMap, commentMap, commentRows] = await Promise.all([
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
        authorTitle: users.title,
        authorStatusEmoji: users.statusEmoji,
        authorStatusText: users.statusText,
        authorLastSeenAt: users.lastSeenAt,
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.userId))
      .where(eq(issueComments.issueId, row.id))
      .orderBy(asc(issueComments.createdAt)),
  ]);

  return {
    issue: toIssue(row, labelMap.get(row.id) ?? [], commentMap.get(row.id) ?? 0),
    comments: commentRows.map(toComment),
  };
}

export const getTasksFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, membership, statuses } = await workspaceForSlug(data.slug, me.id);
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
        .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
        .leftJoin(users, eq(users.id, issues.assigneeId))
        .where(eq(issues.workspaceId, workspace.id))
        .orderBy(desc(issues.updatedAt))
        .limit(500),
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

    const byStatus: Record<string, number> = Object.fromEntries(
      statuses.map((status) => [status.id, 0]),
    );
    for (const issue of issueViews) {
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
      projects: projectsView,
      labels: labelRows.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      statuses,
      members,
      issues: issueViews,
      counts: {
        all: issueViews.length,
        mine: issueViews.filter((issue) => issue.assignee?.id === me.id).length,
        byStatus,
      },
    } satisfies TasksSnapshot;
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
      projectId: z.string(),
      title: z.string().trim().min(1, 'Give the issue a title').max(200),
      description: z.string().max(8000).default(''),
      statusId: z.string().optional(),
      priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(0),
      assigneeId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, statuses } = await workspaceForSlug(data.slug, me.id);
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspace.id)));
    if (!project) throw new Error('Project not found.');

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
      status: status.id,
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
      statusId: z.string().optional(),
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
    return { label, created };
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
    await requireWorkspace(status.workspaceId, me.id);
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
    return { ok: true as const };
  });

export const reorderTaskStatusesFn = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string(), statusIds: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const me = await readSessionUser();
    if (!me) throw new Error('Sign in required.');
    const { workspace, statuses } = await workspaceForSlug(data.slug, me.id);
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
    await requireWorkspace(status.workspaceId, me.id);

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
    return { moved: count };
  });
