import { Check } from 'lucide-react';
import { createContext, useContext } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';

const TaskLineContext = createContext<number | null>(null);

export function MarkdownView({
  source,
  onToggleTask,
  emptyText = 'Nothing written yet.',
  className,
}: {
  source: string;
  onToggleTask?: (lineIndex: number) => void;
  emptyText?: string;
  className?: string;
}) {
  if (!source.trim()) {
    return <p className={cn('markdown-empty', className)}>{emptyText}</p>;
  }

  const components: Components = {
    input: ({ node: _node, ...props }) => {
      if (props.type !== 'checkbox') return <input {...props} />;
      const line = useContext(TaskLineContext);
      const checked = Boolean(props.checked);
      if (line === null) return <input {...props} />;
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? 'Mark task incomplete' : 'Mark task complete'}
          disabled={!onToggleTask}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggleTask?.(line - 1)}
          className={cn('md-task-checkbox', checked && 'is-checked')}
        >
          <span className="md-task-box">
            {checked && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          </span>
        </button>
      );
    },
    li: ({ node, children, ...props }) => {
      const line = node?.position?.start?.line ?? null;
      const classNames = Array.isArray(node?.properties?.className)
        ? node?.properties?.className.map(String) ?? []
        : node?.properties?.className
          ? [String(node.properties.className)]
          : [];
      const isTask = classNames.includes('task-list-item');
      return (
        <li {...props}>
          {isTask && line !== null ? (
            <TaskLineContext.Provider value={line}>{children}</TaskLineContext.Provider>
          ) : (
            children
          )}
        </li>
      );
    },
    a: ({ node: _node, children, ...props }) => (
      <a {...props} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
  };

  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
