import { Bold, Code2, Italic, Link2, ListTodo, Loader2 } from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { useEffect, useRef } from 'react';
import { taskProgress } from '../lib/markdown';
import { cn } from '../utils/cn';

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Write in Markdown...',
  ariaLabel = 'Description',
  variant = 'boxed',
  minHeight = 160,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  /** 'bare' reads as plain text, like Linear: no frame, formatting in a menu over the selection. */
  variant?: 'boxed' | 'bare';
  minHeight?: number;
}) {
  const onChangeRef = useRef(onChange);
  const lastSyncedValue = useRef(value);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  const progress = taskProgress(value);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'tiptap markdown-body',
        'aria-label': ariaLabel,
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      lastSyncedValue.current = markdown;
      onChangeRef.current(markdown);
    },
    onBlur: () => {
      onBlurRef.current?.();
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastSyncedValue.current) return;
    lastSyncedValue.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [editor, value]);

  function run(command: () => void) {
    command();
  }

  const tools = (
    <>
          <ToolButton
            label="Bold"
            active={editor?.isActive('bold')}
            onClick={() =>
              run(() => editor?.chain().focus().toggleBold().run())
            }
          >
            <Bold size={14} />
          </ToolButton>
          <ToolButton
            label="Italic"
            active={editor?.isActive('italic')}
            onClick={() =>
              run(() => editor?.chain().focus().toggleItalic().run())
            }
          >
            <Italic size={14} />
          </ToolButton>
          <ToolButton
            label="Inline code"
            active={editor?.isActive('code')}
            onClick={() => run(() => editor?.chain().focus().toggleCode().run())}
          >
            <Code2 size={14} />
          </ToolButton>
          <ToolButton
            label="Task list"
            active={editor?.isActive('taskList')}
            onClick={() => run(() => editor?.chain().focus().toggleTaskList().run())}
          >
            <ListTodo size={14} />
          </ToolButton>
          <ToolButton
            label="Link"
            active={editor?.isActive('link')}
            onClick={() => {
              if (!editor) return;
              const previous = editor.getAttributes('link').href as string | undefined;
              const url = window.prompt('Link URL', previous ?? 'https://');
              if (url === null) return;
              if (url === '') {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
              } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              }
            }}
          >
            <Link2 size={14} />
          </ToolButton>
    </>
  );

  if (variant === 'bare') {
    return (
      <div className="markdown-editor markdown-editor-bare">
        {editor ? (
          <>
            <BubbleMenu
              editor={editor}
              className="flex items-center gap-0.5 rounded-lg border border-line/80 bg-paper p-1 shadow-[var(--kora-shadow-popover)]"
            >
              {tools}
            </BubbleMenu>
            <EditorContent editor={editor} style={{ minHeight }} />
          </>
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-6 text-faint" style={{ minHeight }}>
            {value || placeholder}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'markdown-editor overflow-hidden rounded-xl border border-line bg-paper transition-[border-color,box-shadow] duration-150 ease-out',
        'focus-within:border-ink/25 focus-within:shadow-[0_0_0_3px_rgba(23,26,26,0.05)]',
      )}
    >
      <div className="flex h-10 items-center gap-1 border-b border-line-soft px-2">
        <span className="px-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
          Markdown
        </span>
        <div className="ml-2 flex items-center gap-0.5">{tools}</div>
        <div className="ml-auto flex items-center gap-2">
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
      </div>

      {editor ? (
        <EditorContent editor={editor} className="min-h-[160px] px-4 py-3" />
      ) : (
        <div className="flex min-h-[160px] items-center gap-2 px-4 py-3 text-[13px] text-faint">
          <Loader2 size={14} className="animate-spin" /> Preparing the editor
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-md transition-colors duration-150',
        active ? 'bg-canvas text-ink' : 'text-faint hover:bg-line-soft hover:text-ink',
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}
