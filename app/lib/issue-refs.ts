import { createServerFn } from '@tanstack/react-start';
import { and, db, desc, eq, isNull, like, ne, or, sql } from 'void/db';
import {
  channelMembers,
  channels,
  issues,
  taskStatuses,
  teams,
  users,
  workspaces,
} from '@schema';
import { z } from 'zod';
import { toUserSummary } from './people';
import { requireUser, requireWorkspace } from './server';
import type { IssueRef, TaskPriority, TaskStatusCategory } from './types';

const RESULT_LIMIT = 8;
const CANDIDATE_LIMIT = 40;
const CATEGORIES: TaskStatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
const PRIORITIES: TaskPriority[] = [0, 1, 2, 3, 4];

export type IssueRefSearch = {
  issues: IssueRef[];
  channels: { id: string; name: string }[];
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Reads what the user typed after `#`. "kor", "KOR-1" and "kor1" all find KOR-1, KOR-10 and so on;
 * anything else is matched against title words.
 */
function parseQuery(raw: string) {
  const query = raw.trim().replace(/^#/, '').slice(0, 60);
  const keyShape = query.match(/^([a-z][a-z0-9]*?)-?(\d*)$/i);
  return {
    query,
    words: query
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4),
    teamPrefix: keyShape?.[1]?.toUpperCase() ?? null,
    digits: keyShape?.[2] ?? '',
    compact: /^[a-z0-9-]+$/i.test(query) ? query.replace(/-/g, '').toUpperCase() : null,
  };
}

export const searchIssueRefsFn = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        workspaceId: z.string().optional(),
        workspaceSlug: z.string().optional(),
        query: z.string().max(80).default(''),
      })
      .refine((value) => value.workspaceId || value.workspaceSlug, 'Pass a workspace.'),
  )
  .handler(async ({ data }): Promise<IssueRefSearch> => {
    const me = await requireUser();
    let workspaceId = data.workspaceId ?? '';
    if (!workspaceId && data.workspaceSlug) {
      const [workspace] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, data.workspaceSlug));
      if (!workspace) throw new Error('Workspace not found.');
      workspaceId = workspace.id;
    }
    await requireWorkspace(workspaceId, me.id);

    const { query, words, teamPrefix, digits, compact } = parseQuery(data.query);

    const matches = [];
    if (teamPrefix) {
      const numberMatch = digits
        ? sql`cast(${issues.number} as text) like ${`${digits}%`}`
        : undefined;
      matches.push(and(like(teams.key, `${escapeLike(teamPrefix)}%`), numberMatch));
    }
    if (compact) matches.push(sql`${teams.key} like ${`${escapeLike(compact)}%`} escape '\\'`);
    if (words.length > 0) {
      matches.push(
        and(...words.map((word) => sql`lower(${issues.title}) like ${`%${escapeLike(word.toLowerCase())}%`} escape '\\'`)),
      );
    }

    const [issueRows, channelRows] = await Promise.all([
      db
        .select({
          id: issues.id,
          number: issues.number,
          title: issues.title,
          priority: issues.priority,
          teamKey: teams.key,
          statusId: taskStatuses.id,
          statusName: taskStatuses.name,
          statusCategory: taskStatuses.category,
          statusColor: taskStatuses.color,
          statusPosition: taskStatuses.position,
          assigneeId: users.id,
          assigneeName: users.name,
          assigneeEmail: users.email,
          assigneeAvatarColor: users.avatarColor,
          assigneeAvatarKey: users.avatarKey,
          assigneeTitle: users.title,
          assigneeStatusEmoji: users.statusEmoji,
          assigneeStatusText: users.statusText,
          assigneeLastSeenAt: users.lastSeenAt,
        })
        .from(issues)
        .innerJoin(teams, eq(teams.id, issues.teamId))
        .innerJoin(taskStatuses, eq(taskStatuses.id, issues.status))
        .leftJoin(users, eq(users.id, issues.assigneeId))
        .where(
          and(
            eq(issues.workspaceId, workspaceId),
            isNull(issues.deletedAt),
            query ? or(...matches) : undefined,
          ),
        )
        .orderBy(desc(issues.updatedAt))
        .limit(CANDIDATE_LIMIT),
      db
        .select({ id: channels.id, name: channels.name })
        .from(channels)
        .innerJoin(
          channelMembers,
          and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, me.id)),
        )
        .where(
          and(
            eq(channels.workspaceId, workspaceId),
            ne(channels.kind, 'dm'),
            ne(channels.kind, 'studio'),
            query
              ? sql`lower(${channels.name}) like ${`%${escapeLike(query.toLowerCase())}%`} escape '\\'`
              : undefined,
          ),
        )
        .orderBy(channels.name)
        .limit(RESULT_LIMIT),
    ]);

    const wanted = compact ?? '';
    const now = Date.now();
    const scored = issueRows.map((row) => {
      const key = `${row.teamKey}-${row.number}`;
      const flat = key.replace('-', '');
      let rank = 3;
      if (wanted && flat === wanted) rank = 0;
      else if (wanted && flat.startsWith(wanted)) rank = 1;
      else if (teamPrefix && row.teamKey === teamPrefix) rank = 2;
      const ref: IssueRef = {
        id: row.id,
        key,
        title: row.title,
        status: {
          id: row.statusId,
          name: row.statusName,
          category: CATEGORIES.find((item) => item === row.statusCategory) ?? 'unstarted',
          color: row.statusColor,
          position: row.statusPosition,
        },
        priority: PRIORITIES.find((item) => item === row.priority) ?? 0,
        assignee: row.assigneeId
          ? toUserSummary(
              {
                id: row.assigneeId,
                name: row.assigneeName ?? '',
                email: row.assigneeEmail ?? '',
                avatarColor: row.assigneeAvatarColor ?? '',
                avatarKey: row.assigneeAvatarKey,
                title: row.assigneeTitle ?? '',
                statusEmoji: row.assigneeStatusEmoji ?? '',
                statusText: row.assigneeStatusText ?? '',
                lastSeenAt: row.assigneeLastSeenAt ?? new Date(0).toISOString(),
              },
              now,
            )
          : null,
      };
      return { rank, ref };
    });
    // Stable sort keeps the newest-updated order inside each rank.
    scored.sort((a, b) => a.rank - b.rank);

    return {
      issues: scored.slice(0, RESULT_LIMIT).map((item) => item.ref),
      channels: channelRows,
    };
  });
