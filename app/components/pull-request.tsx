import { Check, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, X } from 'lucide-react';
import type { PullRequestState } from '../lib/github-links';
import type { PullRequestLink } from '../lib/types';
import { cn } from '../utils/cn';

// GitHub's own state colors, so a PR reads the same here as on GitHub.
const STATE_STYLE: Record<PullRequestState, { icon: typeof GitPullRequest; color: string; label: string }> = {
  draft: { icon: GitPullRequestDraft, color: '#6e7781', label: 'Draft' },
  open: { icon: GitPullRequest, color: '#1a7f37', label: 'Open' },
  merged: { icon: GitMerge, color: '#8250df', label: 'Merged' },
  closed: { icon: GitPullRequestClosed, color: '#cf222e', label: 'Closed' },
};

export function PullRequestIcon({
  state,
  size = 14,
  className,
}: {
  state: PullRequestState;
  size?: number;
  className?: string;
}) {
  const style = STATE_STYLE[state];
  const Icon = style.icon;
  return <Icon size={size} color={style.color} className={cn('shrink-0', className)} aria-hidden="true" />;
}

/** The small badge on list and board rows: the most advanced PR's state, and the count when > 1. */
export function PullRequestBadge({ pullRequest }: { pullRequest: { state: PullRequestState; count: number } }) {
  const label = `${pullRequest.count} pull ${pullRequest.count === 1 ? 'request' : 'requests'}, ${STATE_STYLE[pullRequest.state].label.toLowerCase()}`;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted tabular-nums" title={label} aria-label={label}>
      <PullRequestIcon state={pullRequest.state} size={13} />
      {pullRequest.count > 1 && pullRequest.count}
    </span>
  );
}

/** Linked pull requests on the issue page, newest activity first. */
export function PullRequestList({ pullRequests }: { pullRequests: PullRequestLink[] }) {
  return (
    <ul className="space-y-1">
      {pullRequests.map((pr) => (
        <li key={pr.id}>
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-100 hover:bg-ink/[0.04]"
          >
            <PullRequestIcon state={pr.state} className="mt-[3px]" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-ink group-hover:underline">{pr.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="truncate">
                  {pr.repo.split('/')[1] ?? pr.repo}#{pr.number}
                </span>
                <span aria-hidden="true">·</span>
                <span>{STATE_STYLE[pr.state].label}</span>
                {pr.review === 'approved' && (
                  <span className="inline-flex items-center gap-0.5 text-[#1a7f37]">
                    <Check size={11} /> Approved
                  </span>
                )}
                {pr.review === 'changes_requested' && (
                  <span className="inline-flex items-center gap-0.5 text-[#cf222e]">
                    <X size={11} /> Changes requested
                  </span>
                )}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
