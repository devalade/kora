import { createServerFn } from '@tanstack/react-start';
import { and, db, eq } from 'void/db';
import { githubInstallations, githubSettings, taskStatuses, workspaces } from '@schema';
import { z } from 'zod';
import { githubConfig, signInstallState } from './github-server';
import { publish, toWorkspace } from './realtime';
import { requireAdmin, requireUser, requireWorkspace } from './server';
import type { GithubSettings } from './types';

async function workspaceBySlug(slug: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) throw new Error('Workspace not found.');
  return workspace;
}

/** Everyone sees whether GitHub is connected; only admins change it. */
export const getGithubSettingsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<GithubSettings> => {
    const me = await requireUser();
    const workspace = await workspaceBySlug(data.slug);
    await requireWorkspace(workspace.id, me.id);
    const [installations, [settings]] = await Promise.all([
      db
        .select({
          id: githubInstallations.id,
          accountLogin: githubInstallations.accountLogin,
          accountType: githubInstallations.accountType,
        })
        .from(githubInstallations)
        .where(eq(githubInstallations.workspaceId, workspace.id)),
      db.select().from(githubSettings).where(eq(githubSettings.workspaceId, workspace.id)),
    ]);
    return {
      configured: Boolean(githubConfig()),
      installations,
      openStatusId: settings?.openStatusId ?? null,
      reviewStatusId: settings?.reviewStatusId ?? null,
      mergeStatusId: settings?.mergeStatusId ?? null,
    };
  });

/** The GitHub page that installs the Kora app, carrying a signed state for the callback. */
export const githubInstallUrlFn = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const workspace = await workspaceBySlug(data.slug);
    await requireAdmin(workspace.id, me.id, 'connect GitHub');
    const config = githubConfig();
    if (!config) throw new Error('GitHub is not set up on this server yet.');
    const state = await signInstallState({ w: workspace.id, u: me.id, exp: Date.now() + 15 * 60_000 }, config.clientSecret);
    return {
      url: `https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new?state=${encodeURIComponent(state)}`,
    };
  });

const statusId = z.string().max(64).nullable();

export const updateGithubSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ slug: z.string(), openStatusId: statusId, reviewStatusId: statusId, mergeStatusId: statusId }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser();
    const workspace = await workspaceBySlug(data.slug);
    await requireAdmin(workspace.id, me.id, 'change GitHub automation');
    const ids = [data.openStatusId, data.reviewStatusId, data.mergeStatusId].filter((id): id is string => Boolean(id));
    for (const id of ids) {
      const [status] = await db
        .select({ id: taskStatuses.id })
        .from(taskStatuses)
        .where(and(eq(taskStatuses.id, id), eq(taskStatuses.workspaceId, workspace.id)));
      if (!status) throw new Error('That status is not in this workspace.');
    }
    const values = {
      openStatusId: data.openStatusId,
      reviewStatusId: data.reviewStatusId,
      mergeStatusId: data.mergeStatusId,
      updatedAt: new Date().toISOString(),
    };
    await db
      .insert(githubSettings)
      .values({ workspaceId: workspace.id, ...values })
      .onConflictDoUpdate({ target: githubSettings.workspaceId, set: values });
    await publish(workspace.id, [toWorkspace({ t: 'issue' })]);
    return { ok: true as const };
  });

/** Stops listening to an installation. The app stays installed on GitHub until removed there. */
export const disconnectGithubFn = createServerFn({ method: 'POST' })
  .validator(z.object({ slug: z.string(), installationId: z.string().max(32) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const workspace = await workspaceBySlug(data.slug);
    await requireAdmin(workspace.id, me.id, 'disconnect GitHub');
    await db
      .delete(githubInstallations)
      .where(and(eq(githubInstallations.id, data.installationId), eq(githubInstallations.workspaceId, workspace.id)));
    await publish(workspace.id, [toWorkspace({ t: 'issue' })]);
    return { ok: true as const };
  });
