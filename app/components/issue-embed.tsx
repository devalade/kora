import { Link, useParams } from '@tanstack/react-router';
import { memo } from 'react';
import type { IssueRef } from '../lib/types';
import { cn } from '../utils/cn';
import { Avatar } from './avatar';
import { TaskPriorityIcon, TaskStatusIcon } from './task-icons';

function useWorkspaceSlug() {
  return useParams({ strict: false }).workspaceSlug ?? '';
}

/** A key like KOR-12 inline in a sentence: status icon, key and a short title. Links to the issue. */
export const IssueChip = memo(function IssueChip({
  issue,
  className,
}: {
  issue: IssueRef;
  className?: string;
}) {
  const workspaceSlug = useWorkspaceSlug();
  return (
    <Link
      to="/app/$workspaceSlug/tasks/$issueKey"
      params={{ workspaceSlug, issueKey: issue.key }}
      title={`${issue.key} · ${issue.title} · ${issue.status.name}`}
      className={cn(
        'mx-px inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line bg-paper px-1.5 align-bottom text-[13px] leading-none font-medium text-ink no-underline transition-[border-color,background-color] duration-100 ease-out hover:border-ink/20 hover:bg-line-soft',
        className,
      )}
    >
      <TaskStatusIcon status={issue.status} size={14} />
      <span className="shrink-0 tabular-nums">{issue.key}</span>
      <span className="max-w-[26ch] min-w-0 truncate font-normal text-muted">{issue.title}</span>
    </Link>
  );
});

/** A card for an issue that stands alone in a message: status, key, title, priority and assignee. */
export const IssueEmbed = memo(function IssueEmbed({
  issue,
  compact,
}: {
  issue: IssueRef;
  compact?: boolean;
}) {
  const workspaceSlug = useWorkspaceSlug();
  return (
    <Link
      to="/app/$workspaceSlug/tasks/$issueKey"
      params={{ workspaceSlug, issueKey: issue.key }}
      className={cn(
        'group/card flex w-full max-w-[540px] items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 no-underline transition-[border-color,box-shadow] duration-150 ease-out hover:border-ink/25 hover:shadow-[0_1px_2px_oklch(0_0_0_/_0.04),0_10px_24px_-18px_oklch(0_0_0_/_0.35)]',
        compact && 'gap-2.5 px-3 py-2.5',
      )}
    >
      <TaskStatusIcon status={issue.status} size={18} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] leading-5 text-faint">
          <span className="font-medium tabular-nums">{issue.key}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{issue.status.name}</span>
        </span>
        <span className="line-clamp-2 text-[13.5px] leading-5 font-semibold text-ink underline decoration-transparent underline-offset-2 transition-[text-decoration-color] duration-150 group-hover/card:decoration-ink/30">
          {issue.title}
        </span>
      </span>
      <TaskPriorityIcon priority={issue.priority} size={14} />
      {issue.assignee ? (
        <span title={issue.assignee.name} className="shrink-0">
          <Avatar name={issue.assignee.name} src={issue.assignee.avatarUrl} color={issue.assignee.avatarColor} size="xs" />
        </span>
      ) : (
        <span
          title="Unassigned"
          className="size-6 shrink-0 rounded-full border border-dashed border-line"
          aria-label="Unassigned"
        />
      )}
    </Link>
  );
});

/** Keys that sit alone on a line (outside code), in order, without repeats. */
export function standaloneIssueKeys(body: string) {
  const keys: string[] = [];
  let inFence = false;
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.trim().match(/^([A-Z][A-Z0-9]{1,4}-\d{1,6})$/);
    if (match && !keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

/** The embed cards for a message: one per resolved key that stands alone on its line. */
export function IssueEmbeds({
  body,
  issues,
  compact,
}: {
  body: string;
  issues?: IssueRef[];
  compact?: boolean;
}) {
  if (!issues || issues.length === 0) return null;
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const cards = standaloneIssueKeys(body)
    .map((key) => byKey.get(key))
    .filter((issue): issue is IssueRef => Boolean(issue));
  if (cards.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-2', compact ? 'mt-1.5' : 'mt-2')}>
      {cards.map((issue) => (
        <IssueEmbed key={issue.id} issue={issue} compact={compact} />
      ))}
    </div>
  );
}
