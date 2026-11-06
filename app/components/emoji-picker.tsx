import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Search } from 'lucide-react';
import { EMOJI_CATEGORIES, searchEmojis } from '../lib/emoji-data';
import { FloatingMenu } from './floating';
import { cn } from '../utils/cn';

const RECENT_KEY = 'kora.recentEmojis';
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Remembers an emoji in the shared recent list (composer and reactions use the same one). */
export function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage; recents are a convenience.
  }
}

/**
 * Search, recents and every category in one scrolling grid. Arrow keys are not wired: the search
 * field plus Enter picks the first match, which is the fast path.
 */
export function EmojiPicker({ onPick, label = 'Pick an emoji' }: { onPick: (emoji: string) => void; label?: string }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => (query.trim() ? searchEmojis(query) : null), [query]);

  function pick(emoji: string) {
    rememberEmoji(emoji);
    onPick(emoji);
  }

  return (
    <div role="dialog" aria-label={label} className="flex w-[312px] max-w-[calc(100vw-16px)] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results?.[0]) {
              event.preventDefault();
              pick(results[0].emoji);
            }
          }}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
        />
      </div>
      <div className="scroll-thin max-h-[min(300px,50vh)] overflow-y-auto px-1.5 pb-2">
        {results ? (
          results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-muted">No emoji match “{query.trim()}”.</p>
          ) : (
            <EmojiGrid emojis={results.map((entry) => ({ emoji: entry.emoji, title: entry.words }))} onPick={pick} />
          )
        ) : (
          <>
            {recent.length > 0 && (
              <Section title="Recent">
                <EmojiGrid emojis={recent.map((emoji) => ({ emoji, title: emoji }))} onPick={pick} />
              </Section>
            )}
            {EMOJI_CATEGORIES.map((category) => (
              <Section key={category.name} title={category.name}>
                <EmojiGrid
                  emojis={category.emojis.map((entry) => ({ emoji: entry.emoji, title: entry.words }))}
                  onPick={pick}
                />
              </Section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="sticky top-0 z-10 bg-paper px-1.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function EmojiGrid({ emojis, onPick }: { emojis: { emoji: string; title: string }[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8">
      {emojis.map(({ emoji, title }) => (
        <button
          key={emoji}
          type="button"
          title={title}
          aria-label={title.split(' ')[0] || emoji}
          onClick={() => onPick(emoji)}
          className="grid size-9 place-items-center rounded-[9px] text-[20px] leading-none transition-[background-color,transform] duration-100 ease-out hover:bg-line-soft active:scale-[0.94]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** The picker in a floating panel anchored to a button. Closes on outside click and Escape. */
export function EmojiPopover({
  anchor,
  onPick,
  onClose,
  align = 'end',
  label,
}: {
  anchor: RefObject<HTMLElement | null>;
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: 'start' | 'end';
  label?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, onClose]);
  return (
    <FloatingMenu
      anchor={anchor}
      menuRef={menuRef}
      align={align}
      className={cn('popover-in z-[70] overflow-hidden rounded-[16px] border border-line/70 bg-paper shadow-[var(--kora-shadow-popover)]')}
    >
      <EmojiPicker label={label} onPick={onPick} />
    </FloatingMenu>
  );
}
