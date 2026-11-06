import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import { FloatingMenu } from './floating';

export type PropertyOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
};

export type PropertyVariant = 'field' | 'row' | 'chip';

// Trigger styles. 'row' is the borderless line in the issue side panel; 'chip' is the small
// bordered pill under the title in the create modal; 'field' is a full form control.
export const propertyTrigger: Record<PropertyVariant, string> = {
  field:
    'flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-paper px-2 text-left text-[13px] font-medium text-ink-soft transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-ink/20 disabled:opacity-50',
  row: 'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium text-ink-soft transition-colors duration-100 hover:bg-ink/[0.045] disabled:opacity-50',
  chip: 'inline-flex h-7 max-w-[200px] min-w-0 items-center gap-1.5 rounded-md border border-line bg-paper px-2 text-left text-[12px] font-medium text-ink-soft transition-[border-color,background-color] duration-100 hover:border-ink/20 hover:bg-canvas disabled:opacity-50',
};

const triggerOpen: Record<PropertyVariant, string> = {
  field: 'border-ink/25 bg-paper shadow-[0_0_0_3px_rgba(23,26,26,0.05)]',
  row: 'bg-ink/[0.045]',
  chip: 'border-ink/25 bg-canvas',
};

export function PropertySelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select',
  searchPlaceholder,
  variant = 'field',
  hideLabel,
  numbered,
  unsetValue,
  emptyIcon,
  className,
  menuClassName,
  disabled,
}: {
  value: string;
  options: PropertyOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  /** Shows a filter input at the top of the menu, like Linear's "Change status…". */
  searchPlaceholder?: string;
  variant?: PropertyVariant;
  /** Show only the icon in the trigger (chips that speak through their icon, like priority). */
  hideLabel?: boolean;
  /** Number keys 1–9 pick an option while the filter is empty. */
  numbered?: boolean;
  /** When value equals this, the trigger shows the placeholder (Linear: "Priority", not "No priority"). */
  unsetValue?: string;
  /** Icon for the trigger while it shows the placeholder. */
  emptyIcon?: ReactNode;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const unset = unsetValue !== undefined && value === unsetValue;
  const selected = unset ? undefined : options.find((option) => option.value === value);
  const triggerIcon = selected?.icon ?? (unset ? options.find((o) => o.value === value)?.icon ?? emptyIcon : emptyIcon);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      // The menu lives in a portal, so it counts as inside too.
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    requestAnimationFrame(() => (searchPlaceholder ? searchRef.current : listRef.current)?.focus());
    // Only when the menu opens; options change on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  function close(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(option: PropertyOption | undefined) {
    if (!option) return;
    onChange(option.value);
    close();
  }

  function onMenuKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) =>
        event.key === 'ArrowDown'
          ? Math.min(visible.length - 1, current + 1)
          : Math.max(0, current - 1),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(visible[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (numbered && !query && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      choose(options[Number(event.key) - 1]);
    }
  }

  return (
    // A1: an assignee row starts with an avatar, whose centred initials the audit reads as the
    // row's text edge. The trigger boxes themselves share one left edge.
    <div ref={rootRef} data-audit-skip="C5 A1" className={cn('relative min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        title={hideLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(propertyTrigger[variant], open && triggerOpen[variant])}
      >
        {(triggerIcon || variant !== 'chip') && (
          <span
            className={cn('grid shrink-0 place-items-center', variant === 'chip' ? 'size-4' : 'size-5')}
          >
            {triggerIcon}
          </span>
        )}
        {!hideLabel && (
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted')}>
            {selected?.label ?? placeholder}
          </span>
        )}
        {variant === 'field' && (
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-faint transition-transform duration-150 ease-out',
              open && 'rotate-180',
            )}
          />
        )}
      </button>

      {open && (
        <FloatingMenu
          anchor={triggerRef}
          menuRef={menuRef}
          matchWidth={variant === 'field'}
          className={cn('popover-in', menuClassName)}
        >
          {searchPlaceholder && (
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onMenuKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
              className="h-9 w-full border-b border-line-soft bg-transparent px-3 text-[16px] outline-none placeholder:text-faint sm:text-[13px]"
            />
          )}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={searchPlaceholder ? -1 : 0}
            onKeyDown={searchPlaceholder ? undefined : onMenuKey}
            aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
            className="max-h-[280px] min-h-0 overflow-y-auto p-1 outline-none"
          >
            {visible.length === 0 && (
              <p className="px-2 py-2 text-[13px] text-muted">No matches</p>
            )}
            {visible.map((option, index) => {
              const isSelected = option.value === value;
              const shortcut = numbered && !query ? options.indexOf(option) + 1 : 0;
              return (
                <div
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]',
                    index === active ? 'bg-ink/[0.05] text-ink' : 'text-ink-soft',
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center">{option.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.description && (
                    <span className="hidden text-[12px] text-faint sm:block">{option.description}</span>
                  )}
                  {isSelected && <Check size={14} className="shrink-0 text-ink-soft" />}
                  {shortcut > 0 && shortcut < 10 && (
                    <span className="w-3 shrink-0 text-right text-[12px] tabular-nums text-faint">
                      {shortcut}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </FloatingMenu>
      )}
    </div>
  );
}
