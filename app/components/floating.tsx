import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

const GAP = 4;
const EDGE = 8;

/**
 * A menu rendered on document.body and positioned from its trigger, so a scrolling panel never
 * clips it or grows a scrollbar because of it, and it stays above dialogs. It opens upward when
 * there is more room above, follows the trigger while the page scrolls, and stays on screen.
 */
export function FloatingMenu({
  anchor,
  menuRef,
  align = 'start',
  matchWidth,
  className,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  align?: 'start' | 'end';
  /** Make the menu at least as wide as its trigger (form fields). */
  matchWidth?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999 });
  const frame = useRef(0);

  useLayoutEffect(() => {
    function place() {
      const trigger = anchor.current;
      const menu = menuRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const naturalHeight = menu?.scrollHeight ?? 320;
      const up = below < Math.min(naturalHeight, 320) && above > below;
      const width = menu?.offsetWidth ?? 220;
      let left = align === 'end' ? rect.right - width : rect.left;
      left = Math.max(EDGE, Math.min(left, viewportWidth - width - EDGE));
      setStyle({
        position: 'fixed',
        left,
        ...(up ? { bottom: viewportHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
        maxHeight: Math.max(160, up ? above : below),
        minWidth: matchWidth ? rect.width : undefined,
      });
    }
    function schedule() {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(place);
    }
    place();
    // A second pass once the menu has its real size (for upward placement and right-edge clamping).
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [anchor, menuRef, align, matchWidth]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={menuRef}
      style={style}
      className={cn(
        'z-[70] flex w-max min-w-[220px] max-w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-lg border border-line/80 bg-paper shadow-[var(--kora-shadow-popover)]',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
