import { cn } from '../utils/cn';
import { avatarTone, initials } from '../lib/people';

const textSizes = {
  '2xs': 'text-[9px]',
  xs: 'text-[10px]',
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
  xl: 'text-base',
  '2xl': 'text-xl',
};

const outerSizes = {
  '2xs': 'size-5',
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-11',
  xl: 'size-16',
  '2xl': 'size-24',
};

// The tinted ring scales with the avatar. A fixed 2px ring took a fifth of a 20px avatar and made
// the face look shrunk next to the text beside it.
const ringSizes = {
  '2xs': 'p-px',
  xs: 'p-px',
  sm: 'p-[2px]',
  md: 'p-[2px]',
  lg: 'p-[2px]',
  xl: 'p-[3px]',
  '2xl': 'p-1',
};

const statusDotSizes = {
  '2xs': 'size-[6px] border-[1.5px] right-0 bottom-0',
  xs: 'size-2 border-[1.5px] right-0 bottom-0',
  sm: 'size-[9px] border-2 right-0 bottom-0',
  md: 'size-2.5 border-2 right-0 bottom-0',
  lg: 'size-[11px] border-2 right-px bottom-px',
  xl: 'size-3.5 border-2 right-0.5 bottom-0.5',
  '2xl': 'size-[18px] border-[3px] right-1.5 bottom-1.5',
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
          'grid size-full place-items-center rounded-full',
          ringSizes[size],
          ring && 'ring-2 ring-paper',
        )}
        style={{ background: tone.ring }}
        aria-hidden="true"
      >
        <span
          className={cn(
            'grid size-full place-items-center rounded-full font-semibold tracking-wide select-none',
            (size === '2xs' || size === 'xs') && 'tracking-normal',
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
            'absolute rounded-full',
            statusDotSizes[size],
            online ? 'bg-mint-deep' : 'bg-faint',
          )}
          style={{ borderColor: 'var(--avatar-ring, #fffdf9)' }}
          aria-hidden="true"
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
