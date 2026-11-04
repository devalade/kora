import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Columns3,
  CornerDownLeft,
  Layers,
  Map,
  MessageSquare,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TasksSnapshot } from '../lib/types';
import { cn } from '../utils/cn';

type CommandAction = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Plus;
  run: () => void;
};

export function TaskCommandMenu({
  open,
  onClose,
  snapshot,
  onNewIssue,
  onView,
  onProject,
  onChat,
  onStudio,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TasksSnapshot;
  onNewIssue: () => void;
  onView: (view: 'all' | 'mine' | 'board' | 'timeline') => void;
  onProject: (projectId: string) => void;
  onChat: () => void;
  onStudio: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const actions: CommandAction[] = [
    { id: 'new', label: 'New issue', hint: 'C', icon: Plus, run: onNewIssue },
    { id: 'all', label: 'Go to All issues', icon: Layers, run: () => onView('all') },
    { id: 'mine', label: 'Go to My issues', icon: UserRound, run: () => onView('mine') },
    { id: 'board', label: 'Go to Board', icon: Columns3, run: () => onView('board') },
    { id: 'timeline', label: 'Go to Timeline', icon: CalendarRange, run: () => onView('timeline') },
    ...snapshot.projects.map((project) => ({
      id: `project-${project.id}`,
      label: `Go to ${project.name}`,
      hint: project.key,
      icon: Layers,
      run: () => onProject(project.id),
    })),
    { id: 'chat', label: 'Go to Chat', icon: MessageSquare, run: onChat },
    { id: 'studio', label: 'Go to Studio', icon: Map, run: onStudio },
  ];
  const filtered = actions.filter((action) =>
    action.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 px-4 pt-[14vh] backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
    >
      <div className="animate-pop w-full max-w-xl overflow-hidden rounded-2xl border border-line/80 bg-paper shadow-[var(--kora-shadow-popover)]">
        <div className="flex items-center gap-2 border-b border-line-soft px-4">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter' && filtered[active]) {
                event.preventDefault();
                filtered[active].run();
                onClose();
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Type a command or search"
            className="h-12 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint sm:text-[14px]"
            aria-label="Command search"
          />
          <kbd className="task-kbd">esc</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted">No commands match.</p>
          )}
          {filtered.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className={cn(
                  'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors duration-100',
                  index === active ? 'bg-canvas text-ink' : 'text-ink-soft hover:bg-canvas/70',
                )}
              >
                <Icon size={15} className="text-muted" />
                <span className="flex-1">{action.label}</span>
                {action.hint && <span className="font-mono text-[10px] text-faint">{action.hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line-soft px-4 py-3 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUp size={12} />
            <ArrowDown size={12} /> navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CornerDownLeft size={12} /> open
          </span>
          <span className="ml-auto">Kora Tasks</span>
        </div>
      </div>
    </div>
  );
}
