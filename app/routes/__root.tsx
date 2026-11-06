import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { LogoMark } from '../components/logo';
import { ShortcutsDialog } from '../components/shortcuts-dialog';
import { captureError, startAnalytics } from '../lib/analytics';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { getSessionUserFn } from '../lib/auth';
import { siteOrigin } from '../lib/site';
import '../styles.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Kora · Team chat for people who ship' },
      {
        name: 'description',
        content:
          'Kora is team chat with threads, files, search, and one-click calls. Built on Cloudflare with Void and TanStack Start.',
      },
      { name: 'theme-color', content: '#151b19' },
      // Link previews in Slack, X, LinkedIn, iMessage and the like.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Kora' },
      { property: 'og:url', content: siteOrigin() },
      { property: 'og:title', content: 'Kora · Team chat for people who ship' },
      {
        property: 'og:description',
        content: 'Channels, threads, huddles and Linear-style tasks in one calm room.',
      },
      { property: 'og:image', content: `${siteOrigin()}/og.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Kora: team chat for people who ship' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Kora · Team chat for people who ship' },
      {
        name: 'twitter:description',
        content: 'Channels, threads, huddles and Linear-style tasks in one calm room.',
      },
      { name: 'twitter:image', content: `${siteOrigin()}/og.png` },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  loader: () => getSessionUserFn(),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootComponent() {
  const user = Route.useLoaderData();
  useEffect(() => {
    startAnalytics(user);
  }, [user]);
  return (
    <RootDocument>
      <Outlet />
      <ShortcutsDialog />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#171a1a',
            color: '#f7f4ee',
            border: '1px solid #2a2f2e',
            borderRadius: '14px',
            fontFamily: 'Instrument Sans, sans-serif',
          },
        }}
      />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function StatusPage({
  code,
  title,
  body,
  children,
}: {
  code: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <LogoMark size={40} />
        <p className="mt-8 font-mono text-[13px] text-muted">{code}</p>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-3 text-[15px] leading-6 text-muted">{body}</p>
        <div className="mt-7 flex flex-wrap gap-2">{children}</div>
      </div>
    </main>
  );
}

const primaryButton =
  'inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-soft';
const secondaryButton =
  'inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-line-soft';

function NotFound() {
  return (
    <StatusPage
      code="404"
      title="This page does not exist"
      body="The link may be old, or the channel, issue or workspace was moved or deleted."
    >
      <Link to="/app" className={primaryButton}>
        Go to your workspaces
      </Link>
      <Link to="/" className={secondaryButton}>
        Kora home
      </Link>
    </StatusPage>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    captureError(error);
  }, [error]);
  return (
    <StatusPage
      code="Error"
      title="Something went wrong"
      body="Kora hit a problem showing this page. Trying again usually fixes it; your messages and issues are safe."
    >
      <button
        type="button"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
        className={primaryButton}
      >
        Try again
      </button>
      <Link to="/app" className={secondaryButton}>
        Go to your workspaces
      </Link>
    </StatusPage>
  );
}
