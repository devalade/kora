import { GitBranch, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  disconnectGithubFn,
  getGithubSettingsFn,
  githubInstallUrlFn,
  updateGithubSettingsFn,
} from '../lib/github';
import { useLiveRefresh } from '../lib/realtime-client';
import type { GithubSettings, TasksSnapshot } from '../lib/types';
import { Modal } from './modal';
import { PropertySelect, type PropertyOption } from './property-select';
import { TaskStatusIcon } from './task-icons';

type RuleKey = 'openStatusId' | 'reviewStatusId' | 'mergeStatusId';

const RULES: { key: RuleKey; label: string; hint: string }[] = [
  { key: 'openStatusId', label: 'When a pull request opens', hint: 'Drafts too' },
  { key: 'reviewStatusId', label: 'When review is requested', hint: 'Or a draft is marked ready with reviewers' },
  { key: 'mergeStatusId', label: 'When a pull request merges', hint: 'Only issues the PR closes' },
];

export function GithubDialog({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
}) {
  const slug = snapshot.workspace.slug;
  const isAdmin = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin';
  const [settings, setSettings] = useState<GithubSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    try {
      setSettings(await getGithubSettingsFn({ data: { slug } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load GitHub settings.');
    }
  }, [open, slug]);

  useEffect(() => {
    void load();
  }, [load]);
  // Another admin connecting or changing a rule refreshes this dialog too.
  useLiveRefresh(slug, load, (event) => event.t === 'issue' && !event.i);

  const statusOptions: PropertyOption[] = [
    { value: '', label: "Don't change the status" },
    ...snapshot.statuses.map((status) => ({
      value: status.id,
      label: status.name,
      icon: <TaskStatusIcon status={status} size={14} />,
    })),
  ];

  async function connect() {
    setBusy('connect');
    try {
      const { url } = await githubInstallUrlFn({ data: { slug } });
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the GitHub connection.');
      setBusy(null);
    }
  }

  async function disconnect(installationId: string, login: string) {
    setBusy(installationId);
    try {
      await disconnectGithubFn({ data: { slug, installationId } });
      toast.success(`Disconnected ${login}`, {
        description: 'To stop GitHub sending events, uninstall the Kora app in your GitHub settings too.',
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect.');
    } finally {
      setBusy(null);
    }
  }

  async function setRule(key: RuleKey, value: string) {
    if (!settings) return;
    const next = { ...settings, [key]: value || null };
    setSettings(next);
    try {
      await updateGithubSettingsFn({
        data: {
          slug,
          openStatusId: next.openStatusId,
          reviewStatusId: next.reviewStatusId,
          mergeStatusId: next.mergeStatusId,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.');
      void load();
    }
  }

  const connected = (settings?.installations.length ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="GitHub"
      description="Link pull requests to issues and move issues as the work moves."
      width="max-w-xl"
    >
      {!settings ? (
        <div className="flex h-24 items-center justify-center text-muted">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !settings.configured ? (
        <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-[13px] leading-5 text-ink-soft">
          <p className="font-medium text-ink">GitHub is not set up on this server yet.</p>
          <p className="mt-1">
            Create a GitHub App, then set <code>GITHUB_APP_SLUG</code>, <code>GITHUB_CLIENT_ID</code>,{' '}
            <code>GITHUB_CLIENT_SECRET</code> and <code>GITHUB_WEBHOOK_SECRET</code>. The README has the steps.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Connection</h3>
            {connected ? (
              <ul className="mt-2 divide-y divide-line-soft rounded-xl border border-line">
                {settings.installations.map((installation) => (
                  <li key={installation.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="grid size-7 place-items-center rounded-md bg-ink text-paper">
                      <GitBranch size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{installation.accountLogin}</span>
                      <span className="block text-[11px] text-muted">
                        {installation.accountType === 'User' ? 'Personal account' : 'Organization'}
                      </span>
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void disconnect(installation.id, installation.accountLogin)}
                        disabled={busy === installation.id}
                        className="h-8 rounded-md px-2.5 text-[12px] font-medium text-muted hover:bg-line-soft hover:text-danger disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-muted">
                {isAdmin
                  ? 'Install the Kora app on the GitHub account or organization that owns your repositories.'
                  : 'Not connected. Ask a workspace admin to connect GitHub.'}
              </p>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy === 'connect'}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-paper hover:bg-ink-soft disabled:opacity-60"
              >
                {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                {connected ? 'Connect another account' : 'Connect GitHub'}
              </button>
            )}
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">How pull requests link</h3>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Put the issue key in the branch name or the pull request title (<code>alade/kor-12-search</code>,{' '}
              <code>KOR-12 Search</code>), or write <code>Fixes KOR-12</code> in the description. Copy a branch
              name from any issue with ⌘⇧. (period). A mention like <code>Part of KOR-12</code> links without
              finishing the issue on merge.
            </p>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">Move linked issues</h3>
            <p className="mt-1 text-[12px] text-muted">
              Issues only move forward. Finished or canceled issues stay where they are.
            </p>
            <div className="mt-3 space-y-2">
              {RULES.map((rule) => (
                <div key={rule.key} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink-soft">{rule.label}</span>
                    <span className="block text-[11px] text-faint">{rule.hint}</span>
                  </span>
                  <div className="w-[200px] shrink-0">
                    <PropertySelect
                      variant="field"
                      value={settings[rule.key] ?? ''}
                      options={statusOptions}
                      onChange={(value) => void setRule(rule.key, value)}
                      ariaLabel={rule.label}
                      unsetValue=""
                      placeholder="Don't change"
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
