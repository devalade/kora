import { Loader2, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getMembersFn,
  removeMemberFn,
  setMemberRoleFn,
  type MemberWithRole,
  type WorkspaceRole,
} from '../lib/members';
import { Avatar } from './avatar';
import { Modal } from './modal';

const ROLE_COPY: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export function MembersDialog({
  open,
  onClose,
  workspaceId,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  meId?: string;
}) {
  const [members, setMembers] = useState<MemberWithRole[] | null>(null);
  const [myRole, setMyRole] = useState<WorkspaceRole>('member');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    getMembersFn({ data: { workspaceId } })
      .then((result) => {
        if (cancelled) return;
        setMembers(result.members);
        setMyRole(result.myRole);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load members.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  async function change(member: MemberWithRole, role: 'admin' | 'member') {
    setSaving(member.id);
    try {
      await setMemberRoleFn({ data: { workspaceId, userId: member.id, role } });
      setMembers((current) =>
        current?.map((item) => (item.id === member.id ? { ...item, role } : item)) ?? null,
      );
      toast.success(`${member.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not change the role.');
    } finally {
      setSaving(null);
    }
  }

  /** The owner removes anyone else; admins remove members. */
  function canRemove(member: MemberWithRole) {
    if (member.id === meId || member.role === 'owner') return false;
    if (myRole === 'owner') return true;
    return myRole === 'admin' && member.role === 'member';
  }

  async function remove(member: MemberWithRole) {
    if (
      !window.confirm(
        `Remove ${member.name} from the workspace? They lose access to every channel and DM here at once. Their messages and issues stay.`,
      )
    )
      return;
    setSaving(member.id);
    try {
      await removeMemberFn({ data: { workspaceId, userId: member.id } });
      setMembers((current) => current?.filter((item) => item.id !== member.id) ?? null);
      toast.success(`${member.name} was removed.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not remove them.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Members & roles"
      description="Admins can change the workflow, labels and teams, and delete any issue or project. Members create and edit work, and delete only issues they created."
    >
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {!members && !error && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading members
        </p>
      )}
      {members && (
        <ul className="divide-y divide-line-soft">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={member.name} color={member.avatarColor} src={member.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{member.name}</span>
                <span className="block truncate text-[12px] text-muted">{member.email}</span>
              </span>
              {myRole === 'owner' && member.role !== 'owner' ? (
                <span className="flex items-center gap-2">
                  {saving === member.id && <Loader2 size={13} className="animate-spin text-muted" />}
                  <select
                    value={member.role}
                    disabled={saving !== null}
                    aria-label={`Role for ${member.name}`}
                    onChange={(event) => void change(member, event.target.value as 'admin' | 'member')}
                    className="h-8 rounded-md border border-line bg-paper px-2 text-[16px] sm:text-[13px]"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </span>
              ) : (
                <span className="text-[12px] font-medium text-muted">{ROLE_COPY[member.role]}</span>
              )}
              {canRemove(member) && (
                <button
                  type="button"
                  onClick={() => void remove(member)}
                  disabled={saving !== null}
                  aria-label={`Remove ${member.name}`}
                  title="Remove from workspace"
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-danger/5 hover:text-danger disabled:opacity-50"
                >
                  <UserMinus size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
