import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { AuthLayout } from '../components/auth-layout';
import { checkResetTokenFn, resetPasswordFn } from '../lib/auth';
import { errorMessage } from '../lib/errors';

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token.slice(0, 100) : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => (deps.token ? checkResetTokenFn({ data: { token: deps.token } }) : { valid: false }),
  // The token is a credential: keep it out of referrers sent to anything this page loads.
  head: () => ({ meta: [{ title: 'Choose a new password · Kora' }, { name: 'referrer', content: 'no-referrer' }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const { valid } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPasswordFn({ data: { token: token ?? '', password } });
      await router.invalidate();
      await navigate({ to: '/app' });
    } catch (caught) {
      setError(errorMessage(caught, 'Could not reset the password.'));
      setBusy(false);
    }
  }

  if (!valid) {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links work once and expire after an hour."
        footer={
          <Link to="/login" className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            Back to sign in
          </Link>
        }
      >
        <Link
          to="/forgot-password"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper transition hover:bg-ink-soft"
        >
          Send a new link <ArrowRight size={15} />
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You will be signed in, and signed out everywhere else."
      footer={
        <Link to="/login" className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
      >
        <PasswordField label="New password" value={password} onChange={setPassword} autoFocus />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} />
        {error && (
          <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password.length < 8}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper transition hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Save and sign in
        </button>
      </form>
    </AuthLayout>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink/30">
        <LockKeyhole size={15} className="text-faint" />
        <input
          type="password"
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          required
        />
      </div>
    </label>
  );
}
