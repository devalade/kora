import { cn } from '../utils/cn';

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
      <rect width="40" height="40" rx="13" fill="#EF5F3E" />
      <path
        d="M12 11.5v17M12 20.2l8.2-8.7M12 20.2l8.6 8.3"
        stroke="#FFF9F3"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 14.2c2.4 0 4 1.6 4 4.2v7.2c0 2.5-1.6 4.1-4 4.1"
        stroke="#FFF9F3"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="27" cy="20.2" r="1.7" fill="#151B19" />
    </svg>
  );
}

export function Wordmark({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark && <LogoMark size={30} />}
      <span className="text-[21px] font-semibold tracking-[-0.03em]">Kora</span>
    </span>
  );
}
