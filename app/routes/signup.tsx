import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Loader2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useState } from 'react';
import { getSessionUserFn, signUpFn } from '../lib/auth';
import { AuthLayout } from '../components/auth-layout';
import { track } from '../lib/analytics';
import { errorMessage } from '../lib/errors';

function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : undefined;
}

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSessionUserFn();
    if (user) throw redirect({ to: search.redirect ?? '/app' });
  },
  head: () => ({ meta: [{ title: 'Create an account · Kora' }] }),
  component: SignupPage,
});

function SignupPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signUpFn({ data: { name, email, password } });
      track('signed_up');
      await router.invalidate();
      if (search.redirect) window.location.assign(search.redirect);
      else await navigate({ to: '/app' });
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A workspace takes about ten seconds. Your first channels come with it."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            search={{ redirect: search.redirect }}
            className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Your name</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/30">
            <UserRound size={15} className="text-faint" />
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alade Yessoufou"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              required
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Work email</span>
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
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Password</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/30">
            <LockKeyhole size={15} className="text-faint" />
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              minLength={8}
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
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-sm font-semibold text-white transition hover:bg-coral-deep disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Create account
        </button>
      </form>
      <p className="mt-4 text-[11px] leading-5 text-faint">
        By creating an account you agree to the{' '}
        <Link to="/terms" className="underline decoration-line underline-offset-2 hover:text-ink">
          Terms
        </Link>{' '}
        and the{' '}
        <Link to="/privacy" className="underline decoration-line underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthLayout>
  );
}
