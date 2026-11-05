import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { getTasksFn } from '../lib/tasks';
import { IssueComposer, NewIssueModal } from '../components/new-issue';
import { TasksSidebar } from '../components/tasks-sidebar';

// Direct links to /tasks/new show the same composer as the "New issue" modal, on its own page.
export const Route = createFileRoute('/app/$workspaceSlug/tasks/new')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { team?: string; status?: string } => ({
    team: typeof search.team === 'string' ? search.team : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  loader: async ({ params }) => getTasksFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'New issue · Kora' }] }),
  component: NewIssuePage,
});

function NewIssuePage() {
  const snapshot = Route.useLoaderData();
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function backToList() {
    void navigate({
      to: '/app/$workspaceSlug/tasks',
      params: { workspaceSlug: params.workspaceSlug },
      search: { view: 'all', team: search.team },
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeView={null}
        onSignOut={async () => {
          await signOutFn();
          await navigate({ to: '/' });
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
            aria-label="Open tasks navigation"
          >
            <Menu size={18} />
          </button>
          <span className="text-[13px] font-medium">New issue</span>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:pt-[10vh]">
          <div className="mx-auto w-full max-w-[680px]">
            <IssueComposer
              snapshot={snapshot}
              defaults={{ teamId: search.team, statusId: search.status }}
              mode="page"
              onClose={backToList}
              onCreated={(key) => {
                toast.success(`${key} created`);
                void navigate({
                  to: '/app/$workspaceSlug/tasks/$issueKey',
                  params: { workspaceSlug: params.workspaceSlug, issueKey: key },
                });
              }}
            />
          </div>
        </div>
      </main>
      <NewIssueModal snapshot={snapshot} />
    </div>
  );
}
