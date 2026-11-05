import { LOGO_BUBBLE_PATH } from '../logo';
import { hashOf, mix, shade } from './iso';

// The Kora creature. One species for the whole team: a soft bubble-shaped body whose tail is the
// tail of the Kora speech bubble, two round ears, a pale belly and a three-quarter face.
// Tint comes from the person's avatar colour, the accessory from their id, the pose from their state.
// Local coordinates: origin at the bottom centre, the face turned toward the viewer's left.

export type CreaturePose = 'type' | 'sit' | 'stand';
export type CreatureMood = 'available' | 'focus' | 'away' | 'huddle' | 'offline';

export const ACCESSORIES = ['sprout', 'beanie', 'glasses', 'scarf', 'bow', 'cap'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export function accessoryOf(id: string): Accessory {
  return ACCESSORIES[hashOf(`creature:${id}`) % ACCESSORIES.length]!;
}

export function phaseOf(id: string) {
  // Negative delays start every loop mid-cycle so teammates never blink in unison.
  return (hashOf(`phase:${id}`) % 4000) / 1000;
}

const BODY =
  'M-15 -24C-15 -33 -8.5 -38 0 -38C8.5 -38 15 -33 15 -24L15 -7C15 -2.8 12.2 0 8 0L-8 0C-12.2 0 -15 -2.8 -15 -7Z';
const TAIL = 'M-11.5 -5.5L-19.6 1.2C-20.3 1.8 -19.8 2.9 -18.9 2.6L-6.5 -1Z';
const INK = '#2a2f2e';

export const CREATURE_HEIGHT = 40;

export function CreatureDefs() {
  return (
    <defs>
      <linearGradient id="kc-shade" x1="0" x2="1" y1="0" y2="0.25">
        <stop offset="0" stopColor="#fffdf9" stopOpacity="0.28" />
        <stop offset="0.42" stopColor="#fffdf9" stopOpacity="0" />
        <stop offset="1" stopColor="#171a1a" stopOpacity="0.16" />
      </linearGradient>
      <linearGradient id="kc-top" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fffdf9" stopOpacity="0.22" />
        <stop offset="0.5" stopColor="#fffdf9" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

type CreatureProps = {
  id: string;
  tint: string;
  pose: CreaturePose;
  mood: CreatureMood;
  mirrored?: boolean;
  part?: 'body' | 'hands';
  still?: boolean;
};

export function Creature({ id, tint, pose, mood, mirrored, part = 'body', still }: CreatureProps) {
  const accessory = accessoryOf(id);
  const delay = `-${phaseOf(id)}s`;
  const dark = shade(tint, -0.22);
  const deep = shade(tint, -0.38);
  const belly = mix(tint, '#fffdf9', 0.62);
  const flip = mirrored ? 'scale(-1 1)' : undefined;
  const animate = !still && mood !== 'offline';

  if (part === 'hands') {
    return (
      <g transform={flip}>
        <g className={animate ? 'kc-type-l' : undefined} style={{ animationDelay: delay }}>
          <ellipse
            cx={-10.4}
            cy={-8.4}
            rx={3.4}
            ry={2.3}
            fill={tint}
            stroke={deep}
            strokeWidth={0.7}
          />
        </g>
        <g className={animate ? 'kc-type-r' : undefined} style={{ animationDelay: delay }}>
          <ellipse
            cx={-0.8}
            cy={-3.6}
            rx={3.4}
            ry={2.3}
            fill={tint}
            stroke={deep}
            strokeWidth={0.7}
          />
        </g>
      </g>
    );
  }

  const asleep = mood === 'offline';
  const away = mood === 'away';

  return (
    <g transform={flip}>
      <g className={animate ? 'kc-breathe' : undefined} style={{ animationDelay: delay }}>
        {pose === 'stand' && (
          <>
            <ellipse cx={-5.5} cy={-0.8} rx={4.4} ry={2.3} fill={dark} />
            <ellipse cx={5.5} cy={-0.8} rx={4.4} ry={2.3} fill={dark} />
          </>
        )}
        <path d={TAIL} fill={tint} stroke={deep} strokeWidth={0.8} strokeLinejoin="round" />
        <ellipse
          cx={-8.4}
          cy={-34.6}
          rx={3.7}
          ry={4.6}
          transform="rotate(-20 -8.4 -34.6)"
          fill={tint}
          stroke={deep}
          strokeWidth={0.8}
        />
        <ellipse
          cx={8.4}
          cy={-34.6}
          rx={3.7}
          ry={4.6}
          transform="rotate(20 8.4 -34.6)"
          fill={tint}
          stroke={deep}
          strokeWidth={0.8}
        />
        <ellipse
          cx={-8.4}
          cy={-34.2}
          rx={1.6}
          ry={2.4}
          transform="rotate(-20 -8.4 -34.2)"
          fill={dark}
          opacity={0.55}
        />
        <path d={BODY} fill={tint} />
        <path d={BODY} fill="url(#kc-shade)" />
        <path d={BODY} fill="url(#kc-top)" />
        <ellipse cx={-1.8} cy={-9.6} rx={9.4} ry={7.6} fill={belly} opacity={0.9} />
        <path d={BODY} fill="none" stroke={deep} strokeWidth={0.9} strokeLinejoin="round" />

        {pose === 'stand' && !away && (
          <>
            <ellipse
              cx={-14.6}
              cy={-13}
              rx={2.8}
              ry={4.4}
              transform="rotate(14 -14.6 -13)"
              fill={tint}
              stroke={deep}
              strokeWidth={0.7}
            />
            <ellipse
              cx={14.6}
              cy={-13}
              rx={2.8}
              ry={4.4}
              transform="rotate(-14 14.6 -13)"
              fill={tint}
              stroke={deep}
              strokeWidth={0.7}
            />
          </>
        )}

        <Face mood={mood} delay={delay} animate={animate} asleep={asleep} tint={tint} />
        <AccessoryArt accessory={accessory} focus={mood === 'focus'} />
        {mood === 'focus' && <Headphones />}
        {away && <Mug animate={animate} tint={tint} deep={deep} />}
      </g>
      {mood === 'huddle' && <TalkBubble animate={animate} delay={delay} mirrored={mirrored} />}
      {asleep && <Sleep />}
    </g>
  );
}

function Face({
  mood,
  delay,
  animate,
  asleep,
  tint,
}: {
  mood: CreatureMood;
  delay: string;
  animate: boolean;
  asleep: boolean;
  tint: string;
}) {
  if (asleep) {
    return (
      <g stroke={INK} strokeWidth={1.2} strokeLinecap="round" fill="none">
        <path d="M-9.6 -22.6q2.1 1.6 4.2 0" />
        <path d="M-0.6 -22.6q2.1 1.6 4.2 0" />
        <path d="M-4.4 -17.8h2.6" />
      </g>
    );
  }
  const lidded = mood === 'away';
  return (
    <g>
      <ellipse cx={-11.4} cy={-18.4} rx={2.5} ry={1.5} fill="#ef5f3e" opacity={0.28} />
      <ellipse cx={4.8} cy={-18.4} rx={2.5} ry={1.5} fill="#ef5f3e" opacity={0.28} />
      <g className={animate ? 'kc-blink' : undefined} style={{ animationDelay: delay }}>
        <ellipse cx={-7.5} cy={-23} rx={2.1} ry={2.7} fill={INK} />
        <ellipse cx={1.5} cy={-23} rx={2.1} ry={2.7} fill={INK} />
        <circle cx={-6.8} cy={-24} r={0.8} fill="#fffdf9" />
        <circle cx={2.2} cy={-24} r={0.8} fill="#fffdf9" />
      </g>
      {lidded && (
        <g fill={tint}>
          <rect x={-10} y={-26.4} width={5} height={3.2} rx={1} />
          <rect x={-1} y={-26.4} width={5} height={3.2} rx={1} />
          <path
            d="M-9.8 -23.2h4.6M-0.8 -23.2h4.6"
            stroke={INK}
            strokeWidth={0.9}
            strokeLinecap="round"
          />
        </g>
      )}
      {mood === 'huddle' ? (
        <g className={animate ? 'kc-talk' : undefined} style={{ animationDelay: delay }}>
          <ellipse cx={-3} cy={-18.2} rx={1.7} ry={1.5} fill={INK} />
        </g>
      ) : (
        <path
          d="M-4.6 -18.8q1.6 1.7 3.2 0"
          stroke={INK}
          strokeWidth={1.1}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
}

function AccessoryArt({ accessory, focus }: { accessory: Accessory; focus: boolean }) {
  switch (accessory) {
    case 'sprout':
      return (
        <g>
          <path
            d="M0 -37.6q-0.6 -3 0.8 -5.4"
            stroke="#17795f"
            strokeWidth={1.1}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M0.8 -43q-5.4 -3.2 -7.6 0.2q4.2 2.6 7.6 -0.2Z"
            fill="#3f9a78"
            stroke="#17795f"
            strokeWidth={0.6}
          />
          <path
            d="M0.8 -43q4.2 -4.8 7.4 -2q-3 3.8 -7.4 2Z"
            fill="#6fb895"
            stroke="#17795f"
            strokeWidth={0.6}
          />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path
            d="M-14.2 -28C-14.2 -36.4 -7.6 -40.6 0 -40.6C7.6 -40.6 14.2 -36.4 14.2 -28Z"
            fill="#e8b34a"
            stroke="#a47622"
            strokeWidth={0.8}
          />
          <path
            d="M-8 -39q0.6 5 0 10M-2.6 -40.4v11.6M2.6 -40.4v11.6M8 -39q-0.6 5 0 10"
            stroke="#c99335"
            strokeWidth={0.7}
            opacity={0.7}
          />
          <rect
            x={-15}
            y={-30.2}
            width={30}
            height={4.4}
            rx={2.2}
            fill="#d9a23f"
            stroke="#a47622"
            strokeWidth={0.8}
          />
          <circle cx={0} cy={-41.6} r={2.8} fill="#f2cf7e" stroke="#a47622" strokeWidth={0.7} />
        </g>
      );
    case 'glasses':
      return (
        <g fill="#fffdf9" fillOpacity={0.2} stroke={INK} strokeWidth={1.1}>
          <circle cx={-7.5} cy={-23} r={3.9} />
          <circle cx={1.5} cy={-23} r={3.9} />
          <path d="M-3.6 -23.4q1 -0.9 1.2 0" fill="none" />
          <path d="M5.4 -23.6l7.6 -1.6" fill="none" />
        </g>
      );
    case 'scarf':
      return (
        <g stroke="#b9442a" strokeWidth={0.7} strokeLinejoin="round">
          <path d="M-14.8 -15.4Q0 -11 14.8 -15.4L14.8 -11.4Q0 -7 -14.8 -11.4Z" fill="#ef5f3e" />
          <path d="M-8.6 -10.6l-1 7.8l4.4 0.6l0.4 -7.8Z" fill="#e35a3a" />
          <path d="M-9.4 -4.2l4.4 0.6" stroke="#fde7e0" strokeWidth={0.8} />
        </g>
      );
    case 'bow':
      return focus ? null : (
        <g
          transform="translate(8.6 -32.4) rotate(16)"
          stroke="#b9442a"
          strokeWidth={0.7}
          strokeLinejoin="round"
        >
          <path d="M0 0L-5.2 -3.4L-5.2 3.4Z" fill="#ef5f3e" />
          <path d="M0 0L5.2 -3.4L5.2 3.4Z" fill="#ef5f3e" />
          <circle r={1.6} fill="#d84a2b" />
        </g>
      );
    case 'cap':
      return (
        <g stroke="#1d3a33" strokeWidth={0.8} strokeLinejoin="round">
          <path
            d="M-13.4 -29C-13.4 -36.2 -7 -39.8 0 -39.8C7 -39.8 13.4 -36.2 13.4 -29Z"
            fill="#2f5d51"
          />
          <path d="M-13.4 -29.4q-7 0.2 -9.2 3q5.6 1.2 10.4 -0.6Z" fill="#244a40" />
          <circle cx={0} cy={-39.6} r={1.2} fill="#17795f" />
        </g>
      );
  }
}

function Headphones() {
  return (
    <g>
      <path
        d="M-14.6 -25.6C-15.6 -40.4 15.6 -40.4 14.6 -25.6"
        stroke={INK}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <rect x={-18} y={-29.4} width={6} height={10} rx={3} fill={INK} />
      <rect x={12} y={-29.4} width={6} height={10} rx={3} fill={INK} />
      <rect x={-17} y={-27.4} width={2} height={6} rx={1} fill="#e8b34a" />
    </g>
  );
}

function Mug({ animate, tint, deep }: { animate: boolean; tint: string; deep: string }) {
  return (
    <g>
      <g stroke="#a19b8f" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.7}>
        <path className={animate ? 'kc-steam' : undefined} d="M-12.6 -18q-1.6 -2 0 -4t0 -4" />
        <path
          className={animate ? 'kc-steam kc-steam-late' : undefined}
          d="M-9.4 -18.4q-1.6 -2 0 -4t0 -4"
        />
      </g>
      <path
        d="M-15.6 -16.6h8v6.4a2.4 2.4 0 0 1 -2.4 2.4h-3.2a2.4 2.4 0 0 1 -2.4 -2.4Z"
        fill="#fffdf9"
        stroke="#a19b8f"
        strokeWidth={0.8}
      />
      <path d="M-7.6 -15.2a2.4 2.4 0 0 1 0 4.4" stroke="#a19b8f" strokeWidth={1} fill="none" />
      <ellipse cx={-11.6} cy={-16.6} rx={4} ry={1.1} fill="#8a5a3b" />
      <ellipse cx={-17} cy={-10.2} rx={3} ry={2.6} fill={tint} stroke={deep} strokeWidth={0.7} />
    </g>
  );
}

function TalkBubble({
  animate,
  delay,
  mirrored,
}: {
  animate: boolean;
  delay: string;
  mirrored?: boolean;
}) {
  // The Kora bubble, small, over the head while someone talks in the huddle.
  return (
    <g
      transform={`translate(${mirrored ? -16 : 6} -60) scale(0.42)${mirrored ? ' scale(-1 1) translate(-40 0)' : ''}`}
    >
      <g className={animate ? 'kc-bubble' : undefined} style={{ animationDelay: delay }}>
        <path d={LOGO_BUBBLE_PATH} fill="#ef5f3e" />
        <circle cx={13} cy={18} r={2.6} fill="#fff9f3" />
        <circle cx={20} cy={18} r={2.6} fill="#fff9f3" />
        <circle cx={27} cy={18} r={2.6} fill="#fff9f3" />
      </g>
    </g>
  );
}

function Sleep() {
  return (
    <g stroke="#a19b8f" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 -46h4l-4 4.4h4" />
      <path d="M13.6 -52.4h2.8l-2.8 3h2.8" opacity={0.7} />
    </g>
  );
}

// A head-and-shoulders crop of the creature for lists and cards. Reads at 32px.
export function CreatureBadge({
  id,
  tint,
  mood,
  size = 32,
  className,
}: {
  id: string;
  tint: string;
  mood: CreatureMood;
  size?: number;
  className?: string;
}) {
  const ground = mix(tint, '#fffdf9', 0.82);
  return (
    <svg
      width={size}
      height={size}
      viewBox="-22 -46 44 44"
      className={className}
      aria-hidden="true"
    >
      <rect x={-22} y={-46} width={44} height={44} rx={22} fill={ground} />
      <clipPath id={`kc-badge-${id}`}>
        <rect x={-22} y={-46} width={44} height={44} rx={22} />
      </clipPath>
      <g clipPath={`url(#kc-badge-${id})`}>
        <g transform="translate(1 4) ">
          <Creature
            id={id}
            tint={tint}
            pose="sit"
            mood={mood === 'huddle' ? 'available' : mood}
            still
          />
        </g>
      </g>
    </svg>
  );
}
