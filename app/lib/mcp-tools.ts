// Server-only: the tools the MCP server (/api/mcp) offers AI agents. Each tool calls the same
// server functions the app uses, inside runAsUser, so an agent can do exactly what its owner can,
// and every change writes history, sends inbox items and pushes live updates like a click would.
import { getWorkspaceOverviewFn } from './chat';
import { GITHUB_ENABLED } from './features';
import { gitBranchName } from './github-links';
import { addTaskCommentFn, createIssueFn, getIssueFn, getTasksFn, searchTasksFn, updateIssueFn } from './tasks';
import type { TaskIssue, TaskIssueDetail, TasksSnapshot, UserSummary } from './types';

type JsonSchema = Record<string, unknown>;
export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
};
type Context = { me: UserSummary; origin: string };
type Args = Record<string, unknown>;

const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
const workspaceArg = {
  type: 'string',
  description: 'Workspace slug (from list_workspaces). Optional when you belong to one workspace.',
};
const keyArg = { type: 'string', description: 'Issue key, like KOR-12.' };

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_workspaces',
    title: 'List workspaces',
    description: 'The Kora workspaces you belong to, with their slugs and your role.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'workspace_info',
    title: 'Workspace teams, statuses and people',
    description:
      'Teams (and their issue keys), workflow statuses, projects, labels and members of a workspace. Use the names it returns when creating or updating issues.',
    inputSchema: { type: 'object', properties: { workspace: workspaceArg }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_my_issues',
    title: 'My open issues',
    description: 'Issues assigned to you that are not done or canceled, most recently updated first.',
    inputSchema: { type: 'object', properties: { workspace: workspaceArg }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_issues',
    title: 'Search issues',
    description:
      'Find issues by text in the key, title or description, optionally filtered by status name or assignee ("me", a name or an email).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: workspaceArg,
        query: { type: 'string', description: 'Words to look for. Leave out to list by filters only.' },
        status: { type: 'string', description: 'A status name, like "In Progress".' },
        assignee: { type: 'string', description: '"me", "none", a name or an email.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_issue',
    title: 'Read an issue',
    description:
      'An issue with its description, properties, recent comments and the git branch name to work on it.',
    inputSchema: {
      type: 'object',
      properties: { workspace: workspaceArg, key: keyArg },
      required: ['key'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_issue',
    title: 'Create an issue',
    description: 'Creates an issue. Returns its key and the git branch name to work on it.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: workspaceArg,
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string', description: 'Markdown. Checklists as "- [ ] step".', maxLength: 8000 },
        team: { type: 'string', description: 'Team key or name. Defaults to the first team.' },
        status: { type: 'string', description: 'Status name. Defaults to the first unstarted status.' },
        priority: { type: 'string', enum: ['none', 'urgent', 'high', 'medium', 'low'] },
        assignee: { type: 'string', description: '"me", a name or an email.' },
        project: { type: 'string', description: 'Project name.' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Existing label names.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_issue',
    title: 'Update an issue',
    description:
      'Changes an issue\'s title, description, status, priority, assignee or project. Only the fields you pass change. Use status to move work forward (for example "In Progress" when you start).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: workspaceArg,
        key: keyArg,
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string', description: 'Replaces the whole description (Markdown).', maxLength: 8000 },
        status: { type: 'string' },
        priority: { type: 'string', enum: ['none', 'urgent', 'high', 'medium', 'low'] },
        assignee: { type: 'string', description: '"me", "none", a name or an email.' },
        project: { type: 'string', description: 'Project name, or "none".' },
      },
      required: ['key'],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
  },
  {
    name: 'add_comment',
    title: 'Comment on an issue',
    description: 'Adds a Markdown comment to an issue. Followers get an inbox item.',
    inputSchema: {
      type: 'object',
      properties: { workspace: workspaceArg, key: keyArg, body: { type: 'string', maxLength: 4000 } },
      required: ['key', 'body'],
      additionalProperties: false,
    },
  },
];

class ToolError extends Error {}

function text(args: Args, name: string, required = false): string | undefined {
  const value = args[name];
  if (value === undefined || value === null) {
    if (required) throw new ToolError(`"${name}" is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new ToolError(`"${name}" must be a string.`);
  return value;
}

async function workspaceSlug(args: Args) {
  const given = text(args, 'workspace');
  const { workspaces } = await getWorkspaceOverviewFn();
  if (given) {
    const match = workspaces.find((workspace) => workspace.slug === given || workspace.name.toLowerCase() === given.toLowerCase());
    if (!match) throw new ToolError(`No workspace "${given}". Yours: ${workspaces.map((w) => w.slug).join(', ')}.`);
    return match.slug;
  }
  if (workspaces.length === 1) return workspaces[0]!.slug;
  throw new ToolError(`You are in ${workspaces.length} workspaces; pass "workspace": ${workspaces.map((w) => w.slug).join(', ')}.`);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function findMember(snapshot: TasksSnapshot, me: UserSummary, who: string) {
  if (same(who, 'me')) return me.id;
  if (same(who, 'none') || same(who, 'nobody')) return null;
  const member =
    snapshot.members.find((person) => same(person.email, who) || same(person.name, who)) ??
    snapshot.members.find((person) => same(person.name.split(' ')[0] ?? '', who));
  if (!member) throw new ToolError(`No member "${who}". Members: ${snapshot.members.map((person) => person.name).join(', ')}.`);
  return member.id;
}

function findStatus(snapshot: TasksSnapshot, name: string) {
  const status = snapshot.statuses.find((item) => same(item.name, name) || item.id === name);
  if (!status) throw new ToolError(`No status "${name}". Statuses: ${snapshot.statuses.map((item) => item.name).join(', ')}.`);
  return status.id;
}

function findProject(snapshot: TasksSnapshot, name: string) {
  if (same(name, 'none')) return null;
  const project = snapshot.projects.find((item) => same(item.name, name));
  if (!project) throw new ToolError(`No project "${name}". Projects: ${snapshot.projects.map((item) => item.name).join(', ') || 'none yet'}.`);
  return project.id;
}

function priorityValue(name: string) {
  const index = ['none', 'urgent', 'high', 'medium', 'low'].indexOf(name.toLowerCase());
  if (index < 0) throw new ToolError('priority is one of none, urgent, high, medium, low.');
  return index as 0 | 1 | 2 | 3 | 4;
}

function issueLine(issue: TaskIssue) {
  return {
    key: issue.key,
    title: issue.title,
    status: issue.status.name,
    priority: PRIORITY_NAMES[issue.priority],
    assignee: issue.assignee?.name ?? null,
    team: issue.team.key,
    project: issue.project?.name ?? null,
    labels: issue.labels.map((label) => label.name),
    dueDate: issue.dueDate,
    pullRequest: issue.pullRequest,
    updatedAt: issue.updatedAt,
  };
}

function issueDetailView(detail: TaskIssueDetail, context: Context, slug: string) {
  const issue = detail.issue;
  return {
    ...issueLine(issue),
    url: `${context.origin}/app/${slug}/tasks/${issue.key}`,
    gitBranch: gitBranchName(context.me, issue),
    description: issue.description,
    parent: detail.parent ? { key: detail.parent.key, title: detail.parent.title } : null,
    subIssues: detail.subIssues.map((child) => ({ key: child.key, title: child.title, status: child.status.name })),
    ...(GITHUB_ENABLED ? {
      pullRequests: detail.pullRequests.map((pr) => ({
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        review: pr.review,
        url: pr.url,
      })),
    } : {}),
    comments: detail.comments.slice(-10).map((comment) => ({
      author: comment.author.name,
      at: comment.createdAt,
      body: comment.body,
    })),
  };
}

async function issueByKey(slug: string, key: string) {
  try {
    return await getIssueFn({ data: { slug, issueKey: key.trim().toUpperCase() } });
  } catch {
    throw new ToolError(`No issue ${key} in ${slug}.`);
  }
}

const open = (issue: TaskIssue) => issue.status.category !== 'completed' && issue.status.category !== 'canceled';

async function runTool(name: string, args: Args, context: Context): Promise<unknown> {
  switch (name) {
    case 'list_workspaces': {
      const { workspaces } = await getWorkspaceOverviewFn();
      return workspaces.map((workspace) => ({ slug: workspace.slug, name: workspace.name, role: workspace.role }));
    }
    case 'workspace_info': {
      const snapshot = await getTasksFn({ data: { slug: await workspaceSlug(args) } });
      return {
        workspace: snapshot.workspace.name,
        teams: snapshot.teams.map((team) => ({ key: team.key, name: team.name })),
        statuses: snapshot.statuses.map((status) => ({ name: status.name, category: status.category })),
        projects: snapshot.projects.map((project) => ({ name: project.name, status: project.status })),
        labels: snapshot.labels.map((label) => label.name),
        members: snapshot.members.map((person) => ({ name: person.name, email: person.email, isYou: person.id === context.me.id })),
      };
    }
    case 'list_my_issues': {
      const snapshot = await getTasksFn({ data: { slug: await workspaceSlug(args) } });
      return snapshot.issues
        .filter((issue) => issue.assignee?.id === context.me.id && open(issue))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50)
        .map(issueLine);
    }
    case 'search_issues': {
      const slug = await workspaceSlug(args);
      const snapshot = await getTasksFn({ data: { slug } });
      const query = text(args, 'query')?.trim();
      let found = query ? await searchTasksFn({ data: { slug, query: query.slice(0, 100) } }) : snapshot.issues;
      const status = text(args, 'status');
      if (status) {
        const statusId = findStatus(snapshot, status);
        found = found.filter((issue) => issue.status.id === statusId);
      }
      const assignee = text(args, 'assignee');
      if (assignee) {
        const assigneeId = findMember(snapshot, context.me, assignee);
        found = found.filter((issue) => (issue.assignee?.id ?? null) === assigneeId);
      }
      const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50);
      return found.slice(0, limit).map(issueLine);
    }
    case 'get_issue': {
      const slug = await workspaceSlug(args);
      return issueDetailView(await issueByKey(slug, text(args, 'key', true)!), context, slug);
    }
    case 'create_issue': {
      const slug = await workspaceSlug(args);
      const snapshot = await getTasksFn({ data: { slug } });
      const teamName = text(args, 'team');
      const team = teamName
        ? snapshot.teams.find((item) => same(item.key, teamName) || same(item.name, teamName))
        : snapshot.teams[0];
      if (!team) throw new ToolError(`No team "${teamName}". Teams: ${snapshot.teams.map((item) => item.key).join(', ')}.`);
      const labelNames = Array.isArray(args.labels) ? args.labels.filter((item): item is string => typeof item === 'string') : [];
      const labelIds = labelNames.map((labelName) => {
        const label = snapshot.labels.find((item) => same(item.name, labelName));
        if (!label) throw new ToolError(`No label "${labelName}". Labels: ${snapshot.labels.map((item) => item.name).join(', ')}.`);
        return label.id;
      });
      const status = text(args, 'status');
      const assignee = text(args, 'assignee');
      const project = text(args, 'project');
      const priority = text(args, 'priority');
      const { key } = await createIssueFn({
        data: {
          slug,
          teamId: team.id,
          title: text(args, 'title', true)!,
          description: text(args, 'description') ?? '',
          statusId: status ? findStatus(snapshot, status) : undefined,
          priority: priority ? priorityValue(priority) : 0,
          assigneeId: assignee ? findMember(snapshot, context.me, assignee) : null,
          projectId: project ? findProject(snapshot, project) : null,
          labelIds,
        },
      });
      return issueDetailView(await issueByKey(slug, key), context, slug);
    }
    case 'update_issue': {
      const slug = await workspaceSlug(args);
      const detail = await issueByKey(slug, text(args, 'key', true)!);
      const snapshot = await getTasksFn({ data: { slug } });
      const patch: Parameters<typeof updateIssueFn>[0]['data'] = { issueId: detail.issue.id };
      const title = text(args, 'title');
      const description = text(args, 'description');
      const status = text(args, 'status');
      const priority = text(args, 'priority');
      const assignee = text(args, 'assignee');
      const project = text(args, 'project');
      if (title !== undefined) patch.title = title;
      if (description !== undefined) {
        patch.description = description;
        patch.descriptionBaseVersion = detail.issue.descriptionVersion;
      }
      if (status) patch.statusId = findStatus(snapshot, status);
      if (priority) patch.priority = priorityValue(priority);
      if (assignee) patch.assigneeId = findMember(snapshot, context.me, assignee);
      if (project) patch.projectId = findProject(snapshot, project);
      if (Object.keys(patch).length === 1) throw new ToolError('Pass at least one field to change.');
      await updateIssueFn({ data: patch });
      return issueDetailView(await issueByKey(slug, detail.issue.key), context, slug);
    }
    case 'add_comment': {
      const slug = await workspaceSlug(args);
      const detail = await issueByKey(slug, text(args, 'key', true)!);
      const body = text(args, 'body', true)!.trim();
      if (!body) throw new ToolError('The comment is empty.');
      await addTaskCommentFn({ data: { issueId: detail.issue.id, body } });
      return { ok: true, key: detail.issue.key, url: `${context.origin}/app/${slug}/tasks/${detail.issue.key}` };
    }
    default:
      throw new ToolError(`Unknown tool "${name}".`);
  }
}

/** An MCP tools/call result: JSON text on success, a readable message with isError on failure. */
export async function callTool(name: string, args: Args, context: Context) {
  try {
    const result = await runTool(name, args, context);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The tool failed.';
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}
