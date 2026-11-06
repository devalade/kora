import { createFileRoute } from '@tanstack/react-router';
import { githubConfig, handleGithubWebhook, validWebhookSignature } from '../lib/github-server';

// Pull request payloads are a few kilobytes; anything far larger is not for us.
const MAX_BYTES = 2 * 1024 * 1024;

// GitHub App webhook: pull_request, pull_request_review and installation events. Every delivery is
// signed with GITHUB_WEBHOOK_SECRET; unsigned or wrongly signed bodies are refused before parsing.
export const Route = createFileRoute('/api/github/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = githubConfig();
        if (!config) return new Response('GitHub is not configured.', { status: 404 });
        const declared = Number(request.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > MAX_BYTES) return new Response('Too large', { status: 413 });
        const body = await request.text();
        if (body.length > MAX_BYTES) return new Response('Too large', { status: 413 });
        if (!(await validWebhookSignature(body, request.headers.get('x-hub-signature-256'), config.webhookSecret))) {
          return new Response('Bad signature', { status: 401 });
        }
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response('Bad request', { status: 400 });
        }
        const note = await handleGithubWebhook(
          request.headers.get('x-github-event') ?? '',
          payload as Parameters<typeof handleGithubWebhook>[1],
        );
        return new Response(note, { status: 200 });
      },
    },
  },
});
