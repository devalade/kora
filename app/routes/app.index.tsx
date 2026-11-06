import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Hash, Loader2, LogOut, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { createWorkspaceFn, getWorkspaceOverviewFn, joinWorkspaceFn } from '../lib/chat';
import type { WorkspaceOverview } from '../lib/types';
import { Avatar } from '../components/avatar';
import { LogoMark, Wordmark } from '../components/logo';

export const Route = createFileRoute('/app/')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async () => getWorkspaceOverviewFn(),
  head: () => ({ meta: [{ title: 'Your workspaces · Kora' }] }),
  component: AppIndexPage,
});

function AppIndexPage() {
  const overview = Route.useLoaderData() as WorkspaceOverview;
  const navigate = useNavigate();
  const router = useRouter();
  const [creating, setCreating] = useState(overview.workspaces.length === 0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (overview.workspaces.length === 0) setCreating(true);
  }, [overview.workspaces.length]);

  async function create() {
    setBusy(true);
    try {
      const { slug } = await createWorkspaceFn({ data: { name } });
      await router.invalidate();
      await navigate({ to: '/app/$workspaceSlug', params: { workspaceSlug: slug } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setJoining(true);
    try {
      const { slug } = await joinWorkspaceFn({ data: { code } });
      await router.invalidate();
      await navigate({ to: '/app/$workspaceSlug', params: { workspaceSlug: slug } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join the workspace.');
    } finally {
      setJoining(false);
    }
  }

  async function signOut() {
    await signOutFn();
    await router.invalidate();
    await navigate({ to: '/' });
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[44%_56%]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-bright lg:flex">
        <div className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-[#25322d] blur-3xl" />
        <div className="pointer-events-none absolute right-[-120px] bottom-[-160px] size-[420px] rounded-full bg-coral/10 blur-3xl" />
        <div className="relative">
          <Wordmark className="text-sidebar-bright" />
          <p className="mt-16 max-w-sm font-display text-[52px] leading-[0.98] tracking-[-0.02em]">
            Pick a room.
            <br />
            Start talking.
          </p>
          <p className="mt-5 max-w-sm text-sm leading-6 text-sidebar-text">
            Every workspace is its own home for channels, threads, files, and huddles. Bring your
            team, keep the context in one place.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {[
            { label: 'Channels', value: 'Organized' },
            { label: 'Threads', value: 'Focused' },
            { label: 'Huddles', value: 'One click' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-sidebar-line bg-white/[0.03] p-3">
              <p className="text-[10px] tracking-[0.1em] text-sidebar-text uppercase">{item.label}</p>
              <p className="mt-1.5 text-sm font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-10">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:block">{overview.me.email}</span>
            <Avatar name={overview.me.name} src={overview.me.avatarUrl} color={overview.me.avatarColor} size="sm" online />
            <button
              type="button"
              onClick={() => void signOut()}
              className="grid size-9 place-items-center rounded-xl text-muted hover:bg-line-soft hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-xl flex-1 px-5 pt-8 pb-16 sm:px-10">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-coral-deep uppercase">
            Welcome back, {overview.me.name.split(' ')[0]}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Your workspaces
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Open a workspace, or start a new one for a team or a project.
          </p>

          <div className="mt-7 space-y-2.5">
            {overview.workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                to="/app/$workspaceSlug"
                params={{ workspaceSlug: workspace.slug }}
                className="group flex items-center gap-4 rounded-2xl border border-line bg-paper p-4 transition hover:border-ink/25 hover:shadow-[0_14px_40px_-28px_rgba(23,26,26,0.5)]"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-lg font-semibold text-paper">
                  {workspace.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{workspace.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {workspace.role}
                    </span>
                    <span>·</span>
                    <span className="font-mono">/{workspace.slug}</span>
                  </span>
                </span>
                <ArrowRight
                  size={17}
                  className="text-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
                />
              </Link>
            ))}
          </div>

          {creating ? (
            <div className="mt-8 rounded-2xl border border-line bg-paper p-5">
              <h2 className="text-sm font-semibold">Create a workspace</h2>
              <p className="mt-1 text-xs text-muted">
                We will set up #general and #random so you can start immediately.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && name.trim()) void create();
                  }}
                  placeholder="Acme Studio"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={!name.trim() || busy}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-coral px-4 text-sm font-semibold text-white transition hover:bg-coral-deep disabled:opacity-40"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Create
                </button>
              </div>
              {overview.workspaces.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="mt-3 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5 text-left text-sm font-medium text-muted transition hover:border-ink/30 hover:text-ink"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-line-soft">
                <Plus size={16} />
              </span>
              Create another workspace
            </button>
          )}

          <div className="mt-8 rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center gap-2">
              <Hash size={15} className="text-muted" />
              <h2 className="text-sm font-semibold">Join with an invite code</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              Ask an owner for the code from their Invite people dialog.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="KORA-DEMO-2026"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 font-mono text-xs tracking-[0.1em] uppercase outline-none focus:border-ink/30"
              />
              <button
                type="button"
                onClick={() => void join()}
                disabled={!code.trim() || joining}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink px-4 text-sm font-semibold transition hover:bg-ink hover:text-paper disabled:opacity-40"
              >
                {joining && <Loader2 size={14} className="animate-spin" />}
                Join
              </button>
            </div>
          </div>

          <p className="mt-10 flex items-center gap-2 text-[11px] text-faint">
            <LogoMark size={14} /> Kora runs on Cloudflare Workers, D1, and R2.
          </p>
        </div>
      </section>
    </div>
  );
}
