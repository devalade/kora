import { cn } from '../utils/cn';
import { initials } from '../lib/people';

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-16 text-lg',
  '2xl': 'size-24 text-2xl',
};

export function Avatar({
  name,
  color,
  size = 'md',
  online,
  className,
  ring,
}: {
  name: string;
  color: string;
  size?: keyof typeof sizes;
  online?: boolean;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'grid place-items-center rounded-[30%] font-semibold tracking-wide text-white select-none',
          sizes[size],
          ring && 'ring-2 ring-paper',
        )}
        style={{ background: color }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-current',
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
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((person) => (
        <Avatar key={person.id} name={person.name} color={person.avatarColor} size={size} ring />
      ))}
      {rest > 0 && (
        <span className="grid size-8 place-items-center rounded-[30%] bg-sage text-[11px] font-semibold text-ink-soft ring-2 ring-paper">
          +{rest}
        </span>
      )}
    </div>
  );
}
