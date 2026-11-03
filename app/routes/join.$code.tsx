import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Hash, Loader2, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn } from '../lib/auth';
import { joinWorkspaceFn } from '../lib/chat';
import { LogoMark } from '../components/logo';

export const Route = createFileRoute('/join/$code')({
  beforeLoad: async ({ params }) => {
    const user = await getSessionUserFn();
    if (!user) {
      throw redirect({
        to: '/login',
        search: { redirect: `/join/${params.code}` },
      });
    }
    return { user };
  },
  head: () => ({ meta: [{ title: 'Join a workspace · Kora' }] }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    try {
      const { slug } = await joinWorkspaceFn({ data: { code } });
      await router.invalidate();
      await navigate({ to: '/app/$workspaceSlug', params: { workspaceSlug: slug } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join this workspace.');
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-5">
      <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-7 shadow-[0_30px_80px_-50px_rgba(23,26,26,0.55)]">
        <LogoMark size={44} />
        <p className="mt-6 text-[11px] font-semibold tracking-[0.12em] text-coral-deep uppercase">
          Workspace invite
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">You are invited</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Join the workspace behind this code. You will land in its public channels and can start a
          direct message with anyone on the team.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas px-4 py-4">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-faint uppercase">Invite code</p>
          <p className="mt-1 font-mono text-xl tracking-[0.16em]">{code}</p>
        </div>

        <div className="mt-5 flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Hash size={12} /> Public channels
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users size={12} /> Threads and huddles
          </span>
        </div>

        <button
          type="button"
          onClick={() => void join()}
          disabled={busy}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-sm font-semibold text-white transition hover:bg-coral-deep disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Join workspace
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          Wrong account?{' '}
          <Link to="/app" className="font-semibold text-ink hover:underline">
            Go to your workspaces
          </Link>
        </p>
      </div>
    </div>
  );
}
