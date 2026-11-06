import { useNavigate } from '@tanstack/react-router';
import { Loader2, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { leaveWorkspaceFn, renameWorkspaceFn } from '../lib/members';
import type { WorkspaceSnapshot } from '../lib/types';
import { Modal } from './modal';

/** Admins rename the workspace; anyone but the owner can leave it. */
export function WorkspaceSettingsDialog({
  open,
  onClose,
  workspace,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceSnapshot['workspace'];
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState<'save' | 'leave' | null>(null);
  const isAdmin = workspace.role === 'owner' || workspace.role === 'admin';

  useEffect(() => {
    if (open) setName(workspace.name);
  }, [open, workspace.name]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy('save');
    try {
      await renameWorkspaceFn({ data: { workspaceId: workspace.id, name } });
      toast.success('Workspace renamed.');
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename the workspace.');
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!window.confirm(`Leave ${workspace.name}? You lose access to its channels, DMs and tasks until someone invites you again.`)) return;
    setBusy('leave');
    try {
      await leaveWorkspaceFn({ data: { workspaceId: workspace.id } });
      toast.success(`You left ${workspace.name}.`);
      onClose();
      await navigate({ to: '/app' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not leave the workspace.');
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Workspace settings">
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Workspace name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!isAdmin}
            maxLength={60}
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-ink/30 disabled:text-muted"
          />
          <span className="mt-1 block text-[11px] text-faint">
            {isAdmin ? 'The web address stays the same, so shared links keep working.' : 'Only admins can rename the workspace.'}
          </span>
        </label>
        {isAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy !== null || name.trim().length < 2 || name.trim() === workspace.name}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
            >
              {busy === 'save' && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        )}
      </form>
      <div className="mt-5 border-t border-line pt-4">
        {workspace.role === 'owner' ? (
          <p className="text-xs text-muted">You own this workspace, so you cannot leave it.</p>
        ) : (
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-40"
          >
            {busy === 'leave' ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={15} />}
            Leave workspace
          </button>
        )}
      </div>
    </Modal>
  );
}
