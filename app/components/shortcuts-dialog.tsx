import { useEffect, useState } from 'react';
import { Modal } from './modal';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Everywhere',
    rows: [
      [['?'], 'Show these shortcuts'],
      [[MOD, 'K'], 'Search messages, or the command menu in Tasks'],
      [['Esc'], 'Close a dialog, menu or thread'],
    ],
  },
  {
    title: 'Writing a message',
    rows: [
      [['Enter'], 'Send'],
      [['Shift', 'Enter'], 'New line'],
      [['@'], 'Mention a teammate'],
      [['#'], 'Link a channel or an issue'],
      [[MOD, 'B'], 'Bold'],
      [[MOD, 'I'], 'Italic'],
      [[MOD, 'E'], 'Code'],
      [[MOD, 'K'], 'Link'],
      [[MOD, 'V'], 'Paste an image or file to attach it'],
    ],
  },
  {
    title: 'Inbox and Tasks',
    rows: [
      [['C'], 'New issue (Tasks)'],
      [['J'], 'Next item'],
      [['K'], 'Previous item'],
      [['Enter'], 'Open the item'],
      [['U'], 'Mark read or unread (Inbox)'],
      [[MOD, '↵'], 'Post a comment'],
    ],
  },
];

/** Opens with ? anywhere except while typing. Mounted once in the root route. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" width="max-w-xl">
      <div className="scroll-thin -mx-1 max-h-[65vh] space-y-6 overflow-y-auto px-1">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">{group.title}</h3>
            <dl className="divide-y divide-line-soft">
              {group.rows.map(([keys, label]) => (
                <div key={label + keys.join()} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-[14px] text-ink-soft">{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((key) => (
                      <kbd
                        key={key}
                        className="min-w-6 rounded-md border border-line bg-canvas px-1.5 py-0.5 text-center font-mono text-[12px] text-ink"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
