import { cn } from '../utils/cn';
import { avatarTone, initials } from '../lib/people';

const textSizes = {
  xs: 'text-[9px]',
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
  xl: 'text-base',
  '2xl': 'text-xl',
};

const outerSizes = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-11',
  xl: 'size-16',
  '2xl': 'size-24',
};

export function Avatar({
  name,
  size = 'md',
  online,
  className,
  ring,
}: {
  name: string;
  color: string;
  size?: keyof typeof outerSizes;
  online?: boolean;
  className?: string;
  ring?: boolean;
}) {
  const tone = avatarTone(name);

  return (
    <span className={cn('relative inline-grid shrink-0 rounded-full', outerSizes[size], className)}>
      <span
        className={cn(
          'grid size-full place-items-center rounded-full p-[2px]',
          ring && 'ring-2 ring-paper',
        )}
        style={{ background: tone.ring }}
        aria-hidden="true"
      >
        <span
          className={cn(
            'grid size-full place-items-center rounded-full font-semibold tracking-wide select-none',
            textSizes[size],
          )}
          style={{ background: tone.bg, color: tone.fg }}
        >
          {initials(name)}
        </span>
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2',
            online ? 'bg-mint-deep' : 'bg-faint',
          )}
          style={{ borderColor: 'var(--avatar-ring, #fffdf9)' }}
        />
      )}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { id: string; name: string; avatarColor: string }[];
  max?: number;
  size?: keyof typeof outerSizes;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((person) => (
        <Avatar key={person.id} name={person.name} color={person.avatarColor} size={size} ring />
      ))}
      {rest > 0 && (
        <span className="grid size-8 place-items-center rounded-full bg-sage text-[11px] font-semibold text-ink-soft ring-2 ring-paper">
          +{rest}
        </span>
      )}
    </div>
  );
}
