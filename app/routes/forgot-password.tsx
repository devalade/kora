import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Loader2, Mail, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { AuthLayout } from '../components/auth-layout';
import { requestPasswordResetFn } from '../lib/auth';
import { errorMessage } from '../lib/errors';

export const Route = createFileRoute('/forgot-password')({
  validateSearch: (search: Record<string, unknown>): { email?: string } => ({
    email: typeof search.email === 'string' ? search.email.slice(0, 254) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Reset your password · Kora' }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordResetFn({ data: { email } });
      setSentTo(email.trim());
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the email. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      Remembered it?{' '}
      <Link
        to="/login"
        className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
      >
        Back to sign in
      </Link>
    </>
  );

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle="The link is on its way." footer={footer}>
        <div className="flex items-start gap-3 rounded-2xl border border-mint-deep/20 bg-mint/25 px-4 py-4">
          <MailCheck size={18} className="mt-0.5 shrink-0 text-mint-deep" />
          <p className="text-sm leading-6 text-ink-soft">
            If <span className="font-semibold text-ink">{sentTo}</span> has a Kora account, it will get an email with a
            link to choose a new password. The link works once and expires in one hour.
          </p>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">
          Nothing after a few minutes? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            try another address
          </button>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you sign in with and we will send you a link to choose a new password."
      footer={footer}
    >
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
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              required
            />
          </div>
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper transition hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Send reset link
        </button>
      </form>
    </AuthLayout>
  );
}
