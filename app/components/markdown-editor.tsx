import { Bold, Code2, Italic, Link2, ListTodo } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { taskProgress, toggleTaskAtLine } from '../lib/markdown';
import { cn } from '../utils/cn';
import { MarkdownView } from './markdown-view';

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  onToggleTask,
  placeholder = 'Write in Markdown...',
  ariaLabel = 'Description',
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onToggleTask?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const progress = taskProgress(value);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(420, Math.max(160, input.scrollHeight))}px`;
  }, [value]);

  function wrap(prefix: string, suffix: string, fallback: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function insertTask() {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const needsNewline = start > 0 && value[start - 1] !== '\n';
    const prefix = `${needsNewline ? '\n' : ''}- [ ] `;
    const next = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + prefix.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

  function toggleTask(lineIndex: number) {
    const next = toggleTaskAtLine(value, lineIndex);
    if (onToggleTask) onToggleTask(next);
    else onChange(next);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex h-10 items-center gap-1 border-b border-line-soft px-2">
        <span className="px-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
          Markdown
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton label="Bold" onClick={() => wrap('**', '**', 'bold text')}>
            <Bold size={14} />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => wrap('*', '*', 'italic text')}>
            <Italic size={14} />
          </ToolButton>
          <ToolButton label="Inline code" onClick={() => wrap('`', '`', 'code')}>
            <Code2 size={14} />
          </ToolButton>
          <ToolButton label="Task list" onClick={insertTask}>
            <ListTodo size={14} />
          </ToolButton>
          <ToolButton
            label="Link"
            onClick={() => wrap('[', '](https://)', 'link text')}
          >
            <Link2 size={14} />
          </ToolButton>
        </div>
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={6}
        maxLength={8000}
        spellCheck
        aria-label={ariaLabel}
        className="block min-h-[160px] w-full resize-none overflow-y-auto bg-paper px-4 py-3 text-[16px] leading-6 outline-none placeholder:text-faint sm:text-[14px]"
      />

      <div className="border-t border-line-soft bg-canvas/35">
        <div className="flex h-9 items-center gap-2 px-4">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
            Preview
          </span>
          {progress.total > 0 && (
            <span
              className={cn(
                'inline-flex h-6 items-center rounded-md px-1.5 text-[11px] font-medium tabular-nums',
                progress.done === progress.total
                  ? 'bg-mint/40 text-mint-deep'
                  : 'bg-line-soft text-muted',
              )}
            >
              {progress.done}/{progress.total} done
            </span>
          )}
        </div>
        <div className="px-4 pb-4">
          <MarkdownView
            source={value}
            onToggleTask={toggleTask}
            emptyText="The rendered Markdown appears here."
          />
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-faint transition-colors duration-150 hover:bg-line-soft hover:text-ink"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
