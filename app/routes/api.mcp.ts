import { createFileRoute } from '@tanstack/react-router';
import { callTool, MCP_TOOLS } from '../lib/mcp-tools';
import { GITHUB_ENABLED } from '../lib/features';
import { runAsUser, userForApiToken } from '../lib/session';

// Kora's MCP server: Streamable HTTP, stateless, JSON responses (no SSE stream is needed because
// every tool answers in one response). Authenticate with a personal token from Profile → AI agents:
//   claude mcp add --transport http kora https://<host>/api/mcp --header "Authorization: Bearer kora_…"

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BYTES = 256 * 1024;

const INSTRUCTIONS = `Kora is a team chat and issue tracker. Issues have keys like KOR-12.
Start with list_my_issues or search_issues, then get_issue for the full picture (it includes the git branch name).
When you start work, move the issue to an in-progress status with update_issue, and name your branch with gitBranch${GITHUB_ENABLED ? ' so the pull request links back automatically' : ''}.
Leave a short add_comment when you finish or get blocked. Everything you do is recorded as the person who owns this token.`;

type JsonRpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcError = (id: JsonRpcMessage['id'], code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message },
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function unauthorized(message: string) {
  return json(rpcError(null, -32001, message), 401, {
    'WWW-Authenticate': 'Bearer realm="kora", error="invalid_token"',
  });
}

async function answer(message: JsonRpcMessage, context: { me: Awaited<ReturnType<typeof userForApiToken>> & object; origin: string }) {
  const { id, method, params = {} } = message;
  switch (method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'kora', title: 'Kora', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      if (!MCP_TOOLS.some((tool) => tool.name === name)) return rpcError(id, -32602, `Unknown tool "${name}".`);
      const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
      const result = await runAsUser(context.me, () => callTool(name, args, context));
      return { jsonrpc: '2.0', id, result };
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        // Browsers send Origin; a page on another site must not drive this endpoint with a token.
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json(rpcError(null, -32000, 'Cross-origin requests are not allowed.'), 403);

        const authorization = request.headers.get('authorization') ?? '';
        const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token) return unauthorized('Send a Kora token: Authorization: Bearer kora_…');
        const me = await userForApiToken(token);
        if (!me) return unauthorized('That token is not valid. Create a new one in Kora: Profile → AI agents.');

        const declared = Number(request.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > MAX_BYTES) return json(rpcError(null, -32600, 'Request too large.'), 413);
        const raw = await request.text();
        if (raw.length > MAX_BYTES) return json(rpcError(null, -32600, 'Request too large.'), 413);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json(rpcError(null, -32700, 'Parse error'), 400);
        }

        const messages = (Array.isArray(body) ? body : [body]) as JsonRpcMessage[];
        if (messages.length === 0 || messages.length > 20) return json(rpcError(null, -32600, 'Invalid request'), 400);
        const context = { me, origin: url.origin };
        const replies = [];
        for (const message of messages) {
          if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            replies.push(rpcError(message?.id, -32600, 'Invalid request'));
            continue;
          }
          // Notifications (no id) get no reply.
          if (message.id === undefined) continue;
          replies.push(await answer(message, context));
        }
        if (replies.length === 0) return new Response(null, { status: 202 });
        return json(Array.isArray(body) ? replies : replies[0]);
      },
      // No server-initiated stream: every answer comes back on the POST.
      GET: async () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } }),
      DELETE: async () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } }),
    },
  },
});
