import { cn } from '../utils/cn';

// The mark is a speech bubble carrying a K: chat first, Kora by name.
// Every stroke shares one weight, and the K is centred on the bubble's body, not its tail.
export const LOGO_BUBBLE_PATH =
  'M11 3h18a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H15.5l-7.2 5.2c-.7.5-1.6 0-1.6-.8V32A8 8 0 0 1 3 25V11a8 8 0 0 1 8-8z';
export const LOGO_K_PATH = 'M14.5 10.5v15.5M25 10.5l-8.3 8.3M19.7 15.6l6 10.4';

export function LogoMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d={LOGO_BUBBLE_PATH} fill="#EF5F3E" />
      <path
        d={LOGO_K_PATH}
        stroke="#FFF9F3"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {mark && <LogoMark size={30} />}
      <span className="text-[21px] font-semibold tracking-[-0.03em]">Kora</span>
    </span>
  );
}
