import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Loader2, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getSessionUserFn, signInFn } from '../lib/auth';
import { AuthLayout } from '../components/auth-layout';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo';
import { errorMessage } from '../lib/errors';

function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : undefined;
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSessionUserFn();
    if (user) throw redirect({ to: search.redirect ?? '/app' });
  },
  head: () => ({ meta: [{ title: 'Sign in · Kora' }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signInFn({ data: { email, password } });
      await router.invalidate();
      if (search.redirect) window.location.assign(search.redirect);
      else await navigate({ to: '/app' });
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  function useDemo() {
    setEmail(DEMO_EMAIL ?? '');
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your workspace and pick up where the conversation stopped."
      footer={
        <>
          New to Kora?{' '}
          <Link
            to="/signup"
            search={{ redirect: search.redirect }}
            className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Create an account
          </Link>
        </>
      }
    >
      {DEMO_EMAIL && (
        <button
          type="button"
          onClick={useDemo}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-coral/25 bg-coral-soft/60 px-4 py-3 text-left transition hover:border-coral/50"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-coral text-white">
            <Sparkles size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">Try the demo workspace</span>
            <span className="block text-[11px] text-muted">
              {DEMO_EMAIL} · {DEMO_PASSWORD}
            </span>
          </span>
          <ArrowRight size={15} className="text-coral-deep" />
        </button>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Email</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/30">
            <Mail size={15} className="text-faint" />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              required
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink-soft">Password</span>
            <Link
              to="/forgot-password"
              search={{ email: email || undefined }}
              className="text-xs font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              Forgot password?
            </Link>
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/30">
            <LockKeyhole size={15} className="text-faint" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              required
            />
          </div>
        </label>

        {error && (
          <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper transition hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Sign in
        </button>
      </form>
    </AuthLayout>
  );
}
