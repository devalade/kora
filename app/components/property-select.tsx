import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';

export type PropertyOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
};

export function PropertySelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select',
  className,
  menuClassName,
  disabled,
}: {
  value: string;
  options: PropertyOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [keyboardOpened, setKeyboardOpened] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
  }, [open, options, value]);

  function openMenu(fromKeyboard = false) {
    setKeyboardOpened(fromKeyboard);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div ref={rootRef} data-audit-skip="C5" className={cn('relative min-w-0', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              openMenu(true);
              return;
            }
            setActive((current) =>
              event.key === 'ArrowDown'
                ? Math.min(options.length - 1, current + 1)
                : Math.max(0, current - 1),
            );
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (open) choose(active);
            else openMenu(true);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={cn(
          'flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-2 text-left text-[13px] font-medium text-ink-soft transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-ink/20 disabled:opacity-50',
          open && 'border-ink/25 bg-paper shadow-[0_0_0_3px_rgba(23,26,26,0.05)]',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">{selected?.icon}</span>
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-faint')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-faint transition-transform duration-150 ease-out',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'absolute z-50 mt-1.5 max-h-[280px] w-full min-w-[210px] overflow-y-auto rounded-xl border border-line/80 bg-paper p-1 shadow-[var(--kora-shadow-popover)]',
            !keyboardOpened && 'popover-in',
            menuClassName,
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-100',
                  index === active ? 'bg-canvas text-ink' : 'text-ink-soft',
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center">{option.icon}</span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.description && (
                  <span className="hidden text-[11px] text-faint sm:block">{option.description}</span>
                )}
                {isSelected && <Check size={14} className="shrink-0 text-coral" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
