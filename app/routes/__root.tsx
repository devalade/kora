import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { getSessionUserFn } from '../lib/auth';
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
    ],
  }),
  loader: () => getSessionUserFn(),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
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
