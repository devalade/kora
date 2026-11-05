import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2, Menu, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { deleteProjectFn, getTasksFn, updateProjectFn } from '../lib/tasks';
import type { TaskProject, TaskProjectStatus, TasksSnapshot } from '../lib/types';
import { assigneeOptions, DateSelect, ProjectIcon } from '../components/issue-fields';
import { NewIssueModal, useNewIssueShortcut } from '../components/new-issue';
import { NewProjectDialog, ProjectProgress, projectStatusOptions } from '../components/projects';
import { PropertySelect } from '../components/property-select';
import { Modal } from '../components/modal';
import { TasksSidebar } from '../components/tasks-sidebar';

export const Route = createFileRoute('/app/$workspaceSlug/tasks/projects')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => getTasksFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'Projects · Kora' }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const initial = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<TasksSnapshot>(initial);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TaskProject | null>(null);
  const [removing, setRemoving] = useState(false);

  async function remove(project: TaskProject) {
    setRemoving(true);
    try {
      await deleteProjectFn({ data: { projectId: project.id } });
      setSnapshot((current) => ({
        ...current,
        projects: current.projects.filter((item) => item.id !== project.id),
      }));
      setDeleting(null);
      toast.success(`Deleted ${project.name}. Its issues stay in their teams.`);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the project.');
    } finally {
      setRemoving(false);
    }
  }

  useEffect(() => setSnapshot(initial), [initial]);
  useNewIssueShortcut(() => ({}));

  async function update(project: TaskProject, patch: Partial<{
    status: TaskProjectStatus;
    leadId: string | null;
    targetDate: string | null;
  }>) {
    const before = snapshot;
    setSnapshot((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              ...(patch.status ? { status: patch.status } : {}),
              ...(patch.targetDate !== undefined ? { targetDate: patch.targetDate } : {}),
              ...(patch.leadId !== undefined
                ? { lead: current.members.find((member) => member.id === patch.leadId) ?? null }
                : {}),
            }
          : item,
      ),
    }));
    try {
      await updateProjectFn({ data: { projectId: project.id, ...patch } });
      void router.invalidate();
    } catch (error) {
      setSnapshot(before);
      toast.error(error instanceof Error ? error.message : 'Could not update the project.');
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <TasksSidebar
        snapshot={snapshot}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeView={null}
        activeSection="projects"
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
          <h1 className="text-[14px] font-semibold">Projects</h1>
          <span className="text-[12px] tabular-nums text-muted">{snapshot.projects.length}</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-coral px-3 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-coral-deep active:scale-[0.97]"
          >
            <Plus size={14} /> New project
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {snapshot.projects.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-20">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em]">No projects yet</h2>
              <p className="text-[14px] leading-6 text-muted">
                Teams own issues and their keys. A project gathers issues from any team around one
                goal, with a lead and a target date, so you can see how close it is.
              </p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-[13px] font-medium text-paper transition-colors duration-150 hover:bg-ink-soft"
              >
                <Plus size={14} /> Create the first project
              </button>
            </div>
          ) : (
            <div role="table" aria-label="Projects" className="min-w-0">
              <div
                role="row"
                className="hidden h-9 items-center gap-4 border-b border-line px-6 text-[12px] font-medium text-muted md:grid md:grid-cols-[minmax(0,1fr)_140px_160px_130px_88px_56px]"
              >
                <span role="columnheader">Name</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Lead</span>
                <span role="columnheader">Target date</span>
                <span role="columnheader">Progress</span>
                <span role="columnheader" className="text-right">
                  Issues
                </span>
              </div>
              {snapshot.projects.map((project) => (
                <div
                  key={project.id}
                  role="row"
                  className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line-soft px-4 py-3 transition-colors duration-100 hover:bg-ink/[0.02] md:h-14 md:grid-cols-[minmax(0,1fr)_140px_160px_130px_88px_56px] md:px-6 md:py-0"
                >
                  <Link
                    role="cell"
                    to="/app/$workspaceSlug/tasks"
                    params={{ workspaceSlug: params.workspaceSlug }}
                    search={{ view: 'all', project: project.id }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <ProjectIcon color={project.color} size={14} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{project.name}</span>
                      {project.description && (
                        <span className="block truncate text-[12px] text-muted">{project.description}</span>
                      )}
                    </span>
                  </Link>
                  <div role="cell" className="md:hidden">
                    <ProjectProgress done={project.doneCount} total={project.issueCount} />
                  </div>
                  <div role="cell" className="col-span-2 flex flex-wrap items-center gap-1 md:contents">
                    <div className="md:min-w-0">
                      <PropertySelect
                        variant="row"
                        value={project.status}
                        options={projectStatusOptions()}
                        onChange={(value) => void update(project, { status: value as TaskProjectStatus })}
                        ariaLabel={`${project.name} status`}
                        searchPlaceholder="Change status…"
                        numbered
                        className="[&>button]:w-auto md:[&>button]:w-full"
                      />
                    </div>
                    <div className="md:min-w-0">
                      <PropertySelect
                        variant="row"
                        value={project.lead?.id ?? ''}
                        options={assigneeOptions(snapshot)}
                        onChange={(value) => void update(project, { leadId: value || null })}
                        ariaLabel={`${project.name} lead`}
                        placeholder="No lead"
                        unsetValue=""
                        searchPlaceholder="Set lead…"
                        className="[&>button]:w-auto md:[&>button]:w-full"
                      />
                    </div>
                    <div className="md:min-w-0">
                      <DateSelect
                        variant="row"
                        value={project.targetDate}
                        onChange={(value) => void update(project, { targetDate: value })}
                        label="Target date"
                        placeholder="No target"
                      />
                    </div>
                  </div>
                  <div role="cell" className="hidden md:block">
                    <ProjectProgress done={project.doneCount} total={project.issueCount} />
                  </div>
                  <div role="cell" className="hidden text-right text-[13px] tabular-nums text-muted md:block">
                    {project.issueCount}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleting(project)}
                    aria-label={`Delete ${project.name}`}
                    title="Delete project"
                    className="absolute top-3 right-2 grid size-8 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 md:top-3"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        width="max-w-md"
        title="Delete this project?"
        description={
          deleting
            ? `${deleting.name} will be removed. Its ${deleting.issueCount} ${deleting.issueCount === 1 ? 'issue stays' : 'issues stay'} in their teams.`
            : ''
        }
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="h-9 rounded-md px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleting && void remove(deleting)}
            disabled={removing}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-danger px-3 text-[13px] font-medium text-white transition-[background-color,opacity] duration-150 hover:bg-danger/90 disabled:opacity-50"
          >
            {removing && <Loader2 size={14} className="animate-spin" />}
            Delete project
          </button>
        </div>
      </Modal>
      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        snapshot={snapshot}
      />
      <NewIssueModal snapshot={snapshot} />
    </div>
  );
}
