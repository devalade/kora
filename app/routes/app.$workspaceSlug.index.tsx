import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSessionUserFn } from '../lib/auth';
import { workspaceSnapshotFn } from '../lib/chat';

export const Route = createFileRoute('/app/$workspaceSlug/')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
  },
  loader: async ({ params }) => {
    const snapshot = await workspaceSnapshotFn({ data: { slug: params.workspaceSlug } });
    if (!snapshot.channel) throw redirect({ to: '/app' });
    throw redirect({
      to: '/app/$workspaceSlug/$channelId',
      params: { workspaceSlug: params.workspaceSlug, channelId: snapshot.channel.id },
    });
  },
});
