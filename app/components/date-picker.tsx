import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../utils/cn';

// Dates are calendar days, stored as YYYY-MM-DD. All arithmetic runs in UTC so a day never shifts
// with the viewer's time zone; "today" is the viewer's local day.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const monthTitle = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromIso(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function localToday() {
  const now = new Date();
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function addDays(value: string, days: number) {
  const date = fromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Same day in another month, clamped to that month's last day (Jan 31 + 1 month = Feb 28). */
function addMonths(value: string, months: number) {
  const date = fromIso(value);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return toIso(target);
}

/** 0 = Monday ... 6 = Sunday. */
function weekdayIndex(value: string) {
  return (fromIso(value).getUTCDay() + 6) % 7;
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

/** Six full weeks starting on the Monday on or before the 1st, so the grid never changes height. */
function monthGrid(month: string) {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function quickPicks(today: string) {
  const nextMonday = addDays(today, 7 - weekdayIndex(today));
  return [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: nextMonday },
    { label: '2 weeks', value: addDays(today, 14) },
  ];
}

/**
 * A month calendar for one date: quick picks, a keyboard-driven grid (arrows, Page Up/Down for
 * months, Shift+Page Up/Down for years, Home/End for the week, Enter to pick), and Clear.
 * Follows the WAI-ARIA date picker dialog pattern; focus lands on the selected day (or today).
 */
export function CalendarPanel({
  value,
  label,
  onSelect,
  onClear,
  onClose,
}: {
  value: string | null;
  label: string;
  onSelect: (value: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const today = useMemo(localToday, []);
  const [focused, setFocused] = useState(value ?? today);
  const month = monthKey(focused);
  const days = useMemo(() => monthGrid(month), [month]);
  const gridRef = useRef<HTMLDivElement>(null);
  // How the next highlighted day gets focus: once on open, always from the keyboard, never from the
  // month arrows (focus stays on the arrow, as in the WAI-ARIA pattern).
  const focusMode = useRef<'open' | 'keyboard' | 'none'>('open');
  const titleId = useId();

  // Keyboard moves focus with the highlighted day; the first render focuses it once the menu is placed.
  useEffect(() => {
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`);
    if (!button) return;
    if (focusMode.current === 'keyboard') {
      button.focus();
      return;
    }
    if (focusMode.current !== 'open') return;
    const frame = requestAnimationFrame(() => {
      focusMode.current = 'none';
      button.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);

  function move(next: string, mode: 'keyboard' | 'none' = 'keyboard') {
    focusMode.current = mode;
    setFocused(next);
  }

  function onGridKey(event: KeyboardEvent) {
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayIndex(focused)),
      End: () => addDays(focused, 6 - weekdayIndex(focused)),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
    };
    const step = keys[event.key];
    if (step) {
      event.preventDefault();
      move(step());
    }
  }

  function onPanelKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={label}
      onKeyDown={onPanelKey}
      className="flex min-h-0 w-[17.5rem] flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-line-soft p-1.5">
        {quickPicks(today).map((pick) => (
          <button
            key={pick.label}
            type="button"
            onClick={() => onSelect(pick.value)}
            className={cn(
              'h-7 rounded-md px-1.5 text-[12px] font-medium whitespace-nowrap text-ink-soft transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink',
              value === pick.value && 'bg-coral-soft text-coral-deep hover:bg-coral-soft hover:text-coral-deep',
            )}
          >
            {pick.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <p id={titleId} aria-live="polite" className="text-[13px] font-semibold text-ink">
          {monthTitle.format(fromIso(`${month}-01`))}
        </p>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => move(addMonths(focused, -1), 'none')}
            aria-label="Previous month"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => move(addMonths(focused, 1), 'none')}
            aria-label="Next month"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div ref={gridRef} role="grid" aria-labelledby={titleId} onKeyDown={onGridKey} className="px-2 pb-2">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((day, index) => (
            <span
              key={day}
              role="columnheader"
              aria-label={WEEKDAY_NAMES[index]}
              className="grid h-7 place-items-center text-[11px] font-medium text-faint"
            >
              {day}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const inMonth = monthKey(day) === month;
              const selected = day === value;
              const isToday = day === today;
              return (
                <span key={day} role="gridcell" aria-selected={selected} className="grid place-items-center">
                  <button
                    type="button"
                    data-day={day}
                    tabIndex={day === focused ? 0 : -1}
                    aria-label={`${dayLabel.format(fromIso(day))}${isToday ? ', today' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={selected}
                    onClick={() => onSelect(day)}
                    onFocus={() => setFocused(day)}
                    className={cn(
                      'relative grid size-9 place-items-center rounded-md text-[13px] tabular-nums transition-colors duration-100',
                      inMonth ? 'text-ink' : 'text-faint',
                      !selected && 'hover:bg-ink/[0.05]',
                      selected && 'bg-ink font-semibold text-paper',
                      isToday && !selected && 'font-semibold text-coral-deep',
                    )}
                  >
                    {Number(day.slice(8))}
                    {isToday && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full',
                          selected ? 'bg-paper' : 'bg-coral',
                        )}
                      />
                    )}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {value && onClear && (
        <div className="flex items-center justify-between border-t border-line-soft px-3 py-2">
          <span className="text-[12px] text-muted tabular-nums">{dayLabel.format(fromIso(value))}</span>
          <button
            type="button"
            onClick={onClear}
            className="h-7 rounded-md px-2 text-[12px] font-medium text-muted transition-colors duration-100 hover:bg-ink/[0.05] hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
