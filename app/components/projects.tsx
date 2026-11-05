import { useRouter } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createProjectFn } from '../lib/tasks';
import type { TaskProjectStatus, TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';
import { assigneeOptions, DateSelect } from './issue-fields';
import { Modal } from './modal';
import { PropertySelect, type PropertyOption } from './property-select';
import { TaskStatusCategoryIcon } from './task-icons';

export const PROJECT_STATUS_META: Record<
  TaskProjectStatus,
  { label: string; category: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'; color: string }
> = {
  backlog: { label: 'Backlog', category: 'backlog', color: '#a19b8f' },
  planned: { label: 'Planned', category: 'unstarted', color: '#736f66' },
  started: { label: 'In progress', category: 'started', color: '#e0a23b' },
  paused: { label: 'Paused', category: 'unstarted', color: '#a19b8f' },
  completed: { label: 'Completed', category: 'completed', color: '#17795f' },
  canceled: { label: 'Canceled', category: 'canceled', color: '#a19b8f' },
};

export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as TaskProjectStatus[];

export function ProjectStatusIcon({ status, size = 14 }: { status: TaskProjectStatus; size?: number }) {
  const meta = PROJECT_STATUS_META[status];
  return <TaskStatusCategoryIcon category={meta.category} color={meta.color} size={size} />;
}

export function projectStatusOptions(): PropertyOption[] {
  return PROJECT_STATUSES.map((status) => ({
    value: status,
    label: PROJECT_STATUS_META[status].label,
    icon: <ProjectStatusIcon status={status} />,
  }));
}

/** A ring that fills with the share of done issues, like Linear's project progress. */
export function ProjectProgress({ done, total, size = 16 }: { done: number; total: number; size?: number }) {
  const ratio = total === 0 ? 0 : done / total;
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] tabular-nums text-muted">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-mint-deep)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {Math.round(ratio * 100)}%
    </span>
  );
}

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/25 focus:shadow-[0_0_0_3px_rgba(23,26,26,0.05)] sm:h-9 sm:text-[13px]';

export function NewProjectDialog({
  open,
  onClose,
  snapshot,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
  onCreated?: (projectId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskProjectStatus>('planned');
  const [leadId, setLeadId] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setName('');
    setDescription('');
    setStatus('planned');
    setLeadId('');
    setStartDate(null);
    setTargetDate(null);
  }, [open]);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const { id } = await createProjectFn({
        data: {
          slug: snapshot.workspace.slug,
          name: name.trim(),
          description,
          status,
          leadId: leadId || null,
          startDate,
          targetDate,
        },
      });
      await router.invalidate();
      toast.success(`Created ${name.trim()}.`);
      onClose();
      onCreated?.(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="A project groups issues from any team around one goal and a target date."
      width="max-w-lg"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        className="space-y-5"
      >
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Studio launch"
            maxLength={60}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium">Summary</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does done look like?"
            maxLength={2000}
            rows={2}
            className={cn(fieldClass, 'h-auto min-h-[72px] resize-y py-2 sm:h-auto')}
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <PropertySelect
            variant="chip"
            value={status}
            options={projectStatusOptions()}
            onChange={(value) => setStatus(value as TaskProjectStatus)}
            ariaLabel="Project status"
            searchPlaceholder="Change status…"
            numbered
          />
          <PropertySelect
            variant="chip"
            value={leadId}
            options={assigneeOptions(snapshot)}
            onChange={setLeadId}
            ariaLabel="Lead"
            placeholder="Lead"
            unsetValue=""
            searchPlaceholder="Set lead…"
          />
          <DateSelect
            variant="chip"
            value={startDate}
            onChange={setStartDate}
            label="Start date"
            placeholder="Start date"
            prefix="Starts"
          />
          <DateSelect
            variant="chip"
            value={targetDate}
            onChange={setTargetDate}
            label="Target date"
            placeholder="Target date"
            prefix="Target"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md px-3 text-[13px] font-medium text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="inline-flex h-9 min-w-[128px] items-center justify-center gap-1.5 rounded-md bg-coral px-3 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-coral-deep active:scale-[0.97] disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}
