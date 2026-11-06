import { createFileRoute } from '@tanstack/react-router';
import { db, eq } from 'void/db';
import { githubInstallations, workspaces } from '@schema';
import {
  ensureDefaultGithubSettings,
  githubConfig,
  installationForUser,
  readInstallState,
} from '../lib/github-server';
import { publish, toWorkspace } from '../lib/realtime';
import { isAdminRole, requireWorkspace } from '../lib/server';
import { readSessionUser } from '../lib/session';

function back(slug: string | null, result: string) {
  const path = slug ? `/app/${slug}/tasks?github=${encodeURIComponent(result)}` : '/app';
  return new Response(null, { status: 302, headers: { Location: path } });
}

// GitHub sends the admin here after they install the app (the App's "Callback URL", with "Request
// user authorization during installation" on). We connect the installation only when the signed
// state matches this session and GitHub confirms, through the person's own token, that they can see
// the installation.
export const Route = createFileRoute('/api/github/setup')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const config = githubConfig();
        if (!config) return new Response('GitHub is not configured.', { status: 404 });
        const url = new URL(request.url);
        const me = await readSessionUser();
        if (!me) return new Response(null, { status: 302, headers: { Location: '/login' } });
        const state = await readInstallState(url.searchParams.get('state') ?? '', config.clientSecret);
        if (!state || state.u !== me.id) return back(null, 'expired');
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, state.w));
        if (!workspace) return back(null, 'expired');
        const membership = await requireWorkspace(workspace.id, me.id).catch(() => null);
        if (!membership || !isAdminRole(membership.role)) return back(workspace.slug, 'not-admin');

        const installationId = url.searchParams.get('installation_id') ?? '';
        const code = url.searchParams.get('code') ?? '';
        if (!/^\d{1,20}$/.test(installationId) || !code) return back(workspace.slug, 'cancelled');
        const installation = await installationForUser(code, installationId).catch(() => null);
        if (!installation) return back(workspace.slug, 'not-yours');

        const [existing] = await db
          .select()
          .from(githubInstallations)
          .where(eq(githubInstallations.id, installationId));
        if (existing && existing.workspaceId !== workspace.id) return back(workspace.slug, 'in-use');
        await db
          .insert(githubInstallations)
          .values({
            id: installationId,
            workspaceId: workspace.id,
            accountLogin: installation.accountLogin,
            accountType: installation.accountType,
            connectedBy: me.id,
          })
          .onConflictDoUpdate({
            target: githubInstallations.id,
            set: { accountLogin: installation.accountLogin, accountType: installation.accountType },
          });
        await ensureDefaultGithubSettings(workspace.id);
        await publish(workspace.id, [toWorkspace({ t: 'issue' })]);
        return back(workspace.slug, 'connected');
      },
    },
  },
});
