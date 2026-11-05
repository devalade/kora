import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { createTeamFn } from '../lib/tasks';
import { TASK_LABEL_COLORS } from '../lib/task-config';
import { cn } from '../utils/cn';
import { Modal } from './modal';

const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]';

function suggestKey(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[0-9]+/, '');
  return letters.slice(0, 3);
}

export function TeamDialog({
  open,
  onClose,
  workspaceSlug,
}: {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<string>(TASK_LABEL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setName('');
    setKey('');
    setKeyEdited(false);
    setColor(TASK_LABEL_COLORS[0]);
  }, [open]);

  const effectiveKey = keyEdited ? key : suggestKey(name);
  const keyValid = /^[A-Z][A-Z0-9]{1,4}$/.test(effectiveKey);

  async function submit() {
    if (!name.trim() || !keyValid || saving) return;
    setSaving(true);
    try {
      const team = await createTeamFn({
        data: { slug: workspaceSlug, name: name.trim(), key: effectiveKey, color },
      });
      await router.invalidate();
      onClose();
      toast.success(`Created ${name.trim()}. New issues get ${team.key}-1, ${team.key}-2…`);
      void navigate({
        to: '/app/$workspaceSlug/tasks',
        params: { workspaceSlug },
        search: (prev) => ({ ...prev, view: 'all', team: team.id, label: undefined, status: undefined }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the team.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New team"
      description="Teams group issues and give them their key, like KOR-12."
      width="max-w-md"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-5"
      >
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mobile app"
            maxLength={40}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium">Key</span>
          <input
            value={effectiveKey}
            onChange={(event) => {
              setKeyEdited(true);
              setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
            }}
            placeholder="MOB"
            aria-describedby="team-key-hint"
            className={cn(inputClass, 'font-mono uppercase')}
          />
          <span id="team-key-hint" className="mt-2 block text-[12px] text-muted">
            2 to 5 letters or digits, starting with a letter.
          </span>
        </label>
        <div>
          <span className="mb-2 block text-[13px] font-medium">Color</span>
          <div className="flex items-center gap-2">
            {TASK_LABEL_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                className={cn(
                  'size-6 rounded-md transition-[box-shadow,transform] duration-150',
                  color === option
                    ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-paper'
                    : 'hover:scale-105',
                )}
                style={{ background: option }}
                aria-label={`Use ${option}`}
                aria-pressed={color === option}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-4 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink sm:h-9"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !keyValid || saving}
            className="inline-flex h-10 min-w-[128px] items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-semibold text-paper transition-[background-color,opacity] duration-150 hover:bg-ink-soft disabled:opacity-40 sm:h-9"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Create team
          </button>
        </div>
      </form>
    </Modal>
  );
}
