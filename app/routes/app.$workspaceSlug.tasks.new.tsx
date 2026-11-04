import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, Loader2, Menu, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { createIssueFn, getTasksFn } from '../lib/tasks';
import type { TaskPriority } from '../lib/types';
import { Avatar } from '../components/avatar';
import { PropertySelect } from '../components/property-select';
import { PRIORITY_META, TaskLabelPill, TaskPriorityIcon, TaskStatusIcon } from '../components/task-icons';
import { TasksSidebar } from '../components/tasks-sidebar';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/tasks/new')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { project?: string; status?: string } => ({
    project: typeof search.project === 'string' ? search.project : undefined,
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(
    snapshot.projects.find((project) => project.id === search.project)?.id ??
      snapshot.projects[0]?.id ??
      '',
  );
  const [statusId, setStatusId] = useState(
    snapshot.statuses.find((status) => status.id === search.status)?.id ??
      snapshot.statuses.find((status) => status.category === 'unstarted')?.id ??
      snapshot.statuses[0]?.id ??
      '',
  );
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [assigneeId, setAssigneeId] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const project = snapshot.projects.find((item) => item.id === projectId) ?? null;

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(520, Math.max(120, element.scrollHeight))}px`;
  }, [description]);

  async function submit() {
    if (saving) return;
    if (!title.trim()) {
      setError('Give the issue a title.');
      titleRef.current?.focus();
      return;
    }
    if (!projectId) {
      setError('Pick a project for this issue.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { key } = await createIssueFn({
        data: {
          slug: snapshot.workspace.slug,
          projectId,
          title,
          description,
          statusId: statusId || undefined,
          priority,
          assigneeId: assigneeId || null,
          labelIds,
        },
      });
      toast.success('Issue created.');
      navigate({
        to: '/app/$workspaceSlug/tasks/$issueKey',
        params: { workspaceSlug: params.workspaceSlug, issueKey: key },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the issue.');
      setSaving(false);
    }
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
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            data-audit-skip="A3"
            onClick={() => setSidebarOpen(true)}
            className="grid size-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink sm:size-9 md:hidden"
            aria-label="Open tasks navigation"
          >
            <Menu size={18} />
          </button>
          <Link
            to="/app/$workspaceSlug/tasks"
            params={{ workspaceSlug: params.workspaceSlug }}
            search={{ view: 'all', project: projectId || undefined }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
          >
            <ArrowLeft size={15} /> Tasks
          </Link>
          <span className="text-line">/</span>
          <span className="text-[13px] font-medium text-ink-soft">New issue</span>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12"
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
              <section className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  {project && (
                    <span
                      className="size-2 rounded-full"
                      style={{ background: project.color }}
                    />
                  )}
                  <span>{project?.name ?? 'No project'}</span>
                  <span className="text-faint">/</span>
                  <span className="text-faint">New issue</span>
                </div>

                <input
                  ref={titleRef}
                  autoFocus
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Issue title"
                  maxLength={200}
                  aria-label="Issue title"
                  aria-invalid={Boolean(error)}
                  className="mt-4 min-h-11 w-full border-0 bg-transparent p-0 text-[32px] leading-[1.15] font-semibold tracking-[-0.035em] outline-none placeholder:text-faint sm:text-[38px]"
                />
                {error && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-danger">
                    <AlertCircle size={14} /> {error}
                  </p>
                )}

                <textarea
                  ref={descriptionRef}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add a description, context, or a link"
                  rows={1}
                  maxLength={8000}
                  aria-label="Issue description"
                  className="mt-6 min-h-[120px] w-full resize-none overflow-y-auto rounded-xl border border-line bg-paper px-4 py-3.5 text-[16px] leading-6 outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:text-[14px]"
                />

              </section>

              <aside className="h-fit lg:sticky lg:top-8">
                <div className="rounded-2xl border border-line bg-paper p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold">Properties</h2>
                    <span className="text-[11px] text-faint">{snapshot.statuses.length} statuses</span>
                  </div>

                  <div className="mt-4 space-y-4">
                    <PropertyField label="Status">
                      <PropertySelect
                        value={statusId}
                        options={snapshot.statuses.map((status) => ({
                          value: status.id,
                          label: status.name,
                          icon: <TaskStatusIcon status={status} size={15} />,
                        }))}
                        onChange={(value) => setStatusId(value)}
                        ariaLabel="Status"
                      />
                    </PropertyField>

                    <PropertyField label="Priority">
                      <PropertySelect
                        value={String(priority)}
                        options={[0, 1, 2, 3, 4].map((value) => ({
                          value: String(value),
                          label: PRIORITY_META[value as TaskPriority].label,
                          icon: <TaskPriorityIcon priority={value as TaskPriority} size={15} />,
                        }))}
                        onChange={(value) => setPriority(Number(value) as TaskPriority)}
                        ariaLabel="Priority"
                      />
                    </PropertyField>

                    <PropertyField label="Assignee">
                      <PropertySelect
                        value={assigneeId}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...snapshot.members.map((member) => ({
                            value: member.id,
                            label: member.name,
                            icon: (
                              <Avatar
                                name={member.name}
                                color={member.avatarColor}
                                size="xs"
                              />
                            ),
                          })),
                        ]}
                        onChange={setAssigneeId}
                        ariaLabel="Assignee"
                      />
                    </PropertyField>

                    <PropertyField label="Project">
                      <PropertySelect
                        value={projectId}
                        options={snapshot.projects.map((item) => ({
                          value: item.id,
                          label: item.name,
                          icon: (
                            <span
                              className="size-2 rounded-full"
                              style={{ background: item.color }}
                            />
                          ),
                        }))}
                        onChange={setProjectId}
                        ariaLabel="Project"
                      />
                    </PropertyField>

                    <div>
                      <p className="text-[12px] font-medium text-muted">Labels</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {snapshot.labels.map((label) => {
                          const active = labelIds.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setLabelIds((current) =>
                                  active
                                    ? current.filter((id) => id !== label.id)
                                    : [...current, label.id],
                                )
                              }
                              className={cn(
                                'inline-flex rounded-md transition-[box-shadow,transform] duration-150',
                                active
                                  ? 'ring-2 ring-ink/25 ring-offset-2 ring-offset-paper'
                                  : 'opacity-75 hover:opacity-100',
                              )}
                            >
                              <TaskLabelPill label={label} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-10 min-w-[136px] items-center justify-center gap-2 rounded-lg bg-coral px-4 text-[13px] font-semibold text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-coral-deep active:scale-[0.97] disabled:opacity-70"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    <span className="relative inline-grid">
                      <span
                        className={cn('col-start-1 row-start-1', saving && 'invisible')}
                      >
                        Create issue
                      </span>
                      <span
                        className={cn('col-start-1 row-start-1', !saving && 'invisible')}
                        aria-hidden="true"
                      >
                        Creating
                      </span>
                    </span>
                  </button>
                  <Link
                    to="/app/$workspaceSlug/tasks"
                    params={{ workspaceSlug: params.workspaceSlug }}
                    search={{ view: 'all', project: projectId || undefined }}
                    className="inline-flex h-10 items-center rounded-lg px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink"
                  >
                    Cancel
                  </Link>
                </div>
                <p className="mt-3 text-[11px] text-faint">
                  <kbd className="task-kbd">⌘↵</kbd> to create
                </p>
              </aside>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function PropertyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}
