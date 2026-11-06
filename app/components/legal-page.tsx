import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Wordmark } from './logo';

/** Where people write about their account, their data or these terms. */
export const LEGAL_CONTACT = 'privacy@zecreator.com';
export const LEGAL_UPDATED = '6 November 2026';

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between px-5 py-6">
        <Link to="/" aria-label="Kora home">
          <Wordmark />
        </Link>
        <nav className="flex gap-4 text-[13px] text-muted">
          <Link to="/terms" className="hover:text-ink" activeProps={{ className: 'text-ink font-medium' }}>
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-ink" activeProps={{ className: 'text-ink font-medium' }}>
            Privacy
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[760px] px-5 pt-6 pb-20">
        <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-[13px] text-faint">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-[16px] leading-7 text-ink-soft">{intro}</p>
        <div className="legal mt-10 space-y-9">{children}</div>
        <p className="mt-14 border-t border-line pt-6 text-[14px] leading-6 text-muted">
          Questions? Write to{' '}
          <a href={`mailto:${LEGAL_CONTACT}`} className="font-medium text-ink underline decoration-line underline-offset-4">
            {LEGAL_CONTACT}
          </a>
          .
        </p>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-soft [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
