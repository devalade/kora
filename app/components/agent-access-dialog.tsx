import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createApiTokenFn, listApiTokensFn, revokeApiTokenFn, type ApiTokenView } from '../lib/api-tokens';
import { relativeTime } from '../lib/format';
import { Modal } from './modal';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold text-muted">{label}</span>
      <div className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
        <code className="min-w-0 flex-1 text-[12px] leading-5 break-all text-ink">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              },
              () => toast.error('Copy failed.'),
            );
          }}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-line-soft hover:text-ink"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={14} className="text-mint-deep" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/** Personal tokens for the MCP server, so Claude Code or another agent can work on your issues as you. */
export function AgentAccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tokens, setTokens] = useState<ApiTokenView[] | null>(null);
  const [name, setName] = useState('Claude Code');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    void listApiTokensFn().then(setTokens, () => setTokens([]));
  }, [open]);

  async function create() {
    setCreating(true);
    try {
      const { token } = await createApiTokenFn({ data: { name } });
      setCreated(token);
      setTokens(await listApiTokensFn());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the token.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: ApiTokenView) {
    if (!window.confirm(`Revoke "${token.name}"? Agents using it stop working right away.`)) return;
    try {
      await revokeApiTokenFn({ data: { id: token.id } });
      setTokens((current) => current?.filter((item) => item.id !== token.id) ?? null);
      toast.success('Token revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke.');
    }
  }

  const endpoint = typeof window === 'undefined' ? '/api/mcp' : `${window.location.origin}/api/mcp`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI agents"
      description="Let Claude Code or another MCP client read, create and update your issues. It acts as you."
      width="max-w-xl"
    >
      <div className="space-y-5">
        {created ? (
          <div className="space-y-3 rounded-xl border border-mint/60 bg-mint/10 p-4">
            <p className="text-[13px] font-medium text-ink">Copy this token now. Kora will not show it again.</p>
            <CopyField label="Token" value={created} />
            <CopyField
              label="Add to Claude Code"
              value={`claude mcp add --transport http kora ${endpoint} --header "Authorization: Bearer ${created}"`}
            />
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Token name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                placeholder="Claude Code on my laptop"
                className="h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30"
              />
            </label>
            <button
              type="button"
              onClick={() => void create()}
              disabled={!name.trim() || creating}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Create token
            </button>
          </div>
        )}

        <section>
          <h3 className="text-[13px] font-semibold text-ink">Your tokens</h3>
          {!tokens ? (
            <Loader2 size={16} className="mt-3 animate-spin text-muted" />
          ) : tokens.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">No tokens yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft rounded-xl border border-line">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{token.name}</span>
                    <span className="block text-[11px] text-muted" suppressHydrationWarning>
                      <code>{token.prefix}…</code> ·{' '}
                      {token.lastUsedAt ? `used ${relativeTime(token.lastUsedAt)}` : 'never used'} · created{' '}
                      {relativeTime(token.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(token)}
                    className="h-8 rounded-md px-2.5 text-[12px] font-medium text-muted hover:bg-line-soft hover:text-danger"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[12px] leading-5 text-muted">
          Tools: list your issues, search, read an issue with its branch name and pull requests, create and
          update issues, and comment. Treat a token like a password: anyone with it can act as you.
        </p>
      </div>
    </Modal>
  );
}
