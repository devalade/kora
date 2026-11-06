import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2, Menu, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { getTasksFn, getTrashFn, restoreIssueFn } from '../lib/tasks';
import { relativeTime } from '../lib/format';
import { NewIssueModal } from '../components/new-issue';
import { TaskStatusIcon } from '../components/task-icons';
import { TasksSidebar } from '../components/tasks-sidebar';

export const Route = createFileRoute('/app/$workspaceSlug/tasks/trash')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => {
    const [snapshot, trash] = await Promise.all([
      getTasksFn({ data: { slug: params.workspaceSlug } }),
      getTrashFn({ data: { slug: params.workspaceSlug } }),
    ]);
    return { snapshot, trash };
  },
  head: () => ({ meta: [{ title: 'Trash · Kora' }] }),
  component: TrashPage,
});

function daysLeft(purgeAt: string) {
  const days = Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? 'Deleted for good within a day' : `Deleted for good in ${days} days`;
}

function TrashPage() {
  const { snapshot, trash } = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(issueId: string, key: string) {
    setRestoring(issueId);
    try {
      await restoreIssueFn({ data: { issueId } });
      await router.invalidate();
      toast.success(`${key} restored.`, {
        action: {
          label: 'Open',
          onClick: () =>
            void navigate({
              to: '/app/$workspaceSlug/tasks/$issueKey',
              params: { workspaceSlug: params.workspaceSlug, issueKey: key },
            }),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not restore the issue.');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeView={null}
        activeSection="trash"
        onSignOut={async () => {
          await signOutFn();
          await navigate({ to: '/' });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-paper">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink md:hidden"
            aria-label="Open tasks navigation"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-[14px] font-semibold">Trash</h1>
          <span className="text-[12px] tabular-nums text-muted">{trash.issues.length}</span>
          <p className="ml-auto hidden text-[12px] text-muted sm:block">
            Deleted issues stay here for 30 days, with their comments and history.
          </p>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {trash.issues.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-20">
              <span className="grid size-10 place-items-center rounded-lg bg-line-soft text-muted">
                <Trash2 size={18} />
              </span>
              <h2 className="text-[18px] font-semibold tracking-[-0.01em]">The trash is empty</h2>
              <p className="text-[14px] leading-6 text-muted">
                When someone deletes an issue it lands here for 30 days, so a slip of the hand can
                always be undone.
              </p>
            </div>
          ) : (
            <ul aria-label="Deleted issues">
              {trash.issues.map((issue) => {
                const allowed = trash.canRestoreAll || issue.createdBy === trash.meId;
                return (
                  <li
                    key={issue.id}
                    className="flex min-h-14 items-center gap-3 border-b border-line-soft px-4 py-2 sm:px-6"
                  >
                    <TaskStatusIcon status={issue.status} size={14} />
                    <span className="w-14 shrink-0 text-[12px] tabular-nums text-muted">{issue.key}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink-soft">{issue.title}</span>
                      <span className="block truncate text-[12px] text-muted" suppressHydrationWarning>
                        Deleted {relativeTime(issue.deletedAt)} ago · {daysLeft(issue.purgeAt)}
                      </span>
                    </span>
                    {allowed ? (
                      <button
                        type="button"
                        onClick={() => void restore(issue.id, issue.key)}
                        disabled={restoring !== null}
                        aria-label={`Restore ${issue.key}`}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink-soft transition-colors duration-100 hover:bg-ink/[0.04] disabled:opacity-50"
                      >
                        {restoring === issue.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        Restore
                      </button>
                    ) : (
                      <span className="shrink-0 text-[12px] text-faint">Creator or admin can restore</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <NewIssueModal snapshot={snapshot} />
    </div>
  );
}
