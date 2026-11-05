import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LOGO_BUBBLE_PATH, LOGO_K_PATH } from '../logo';
import type { OfficePerson, OfficeSnapshot } from '../../lib/types';
import { cn } from '../../utils/cn';
import {
  Creature,
  CreatureDefs,
  CREATURE_HEIGHT,
  type CreatureMood,
  type CreaturePose,
} from './creature';
import {
  Block,
  Chair,
  Cylinder,
  Desk,
  Frame,
  PALETTE,
  Plant,
  RoundShadow,
  Shadow,
  Sofa,
  SofaFront,
  Window,
} from './furniture';
import { ellipseOf, hashOf, line, poly, project, shade, UNIT, VIEW, WORLD } from './iso';

// ---------- rooms and seats

export type ZoneId = 'floor' | 'focus' | 'lounge' | 'huddle' | 'kitchen';

type Rect = { x: number; y: number; w: number; d: number };

export const ROOMS: Record<ZoneId, Rect> = {
  focus: { x: 0, y: 0, w: 11, d: 10 },
  floor: { x: 11, y: 0, w: 12, d: 24 },
  huddle: { x: 23, y: 0, w: 11, d: 10 },
  lounge: { x: 0, y: 10, w: 11, d: 14 },
  kitchen: { x: 23, y: 10, w: 11, d: 14 },
};

type SeatKind = 'desk' | 'sofa' | 'huddle' | 'stand' | 'pouf';
type Seat = {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  facing: 'left' | 'right';
  kind: SeatKind;
};

function seat(
  zone: ZoneId,
  index: number,
  x: number,
  y: number,
  facing: 'left' | 'right',
  kind: SeatKind,
): Seat {
  return { id: `${zone}-${index}`, zone, x, y, facing, kind };
}

const SEATS: Record<ZoneId, Seat[]> = {
  focus: [
    seat('focus', 0, 2.7, 2.4, 'left', 'desk'),
    seat('focus', 1, 7.3, 2.4, 'left', 'desk'),
    seat('focus', 2, 2.7, 6.4, 'left', 'desk'),
    seat('focus', 3, 7.3, 6.4, 'left', 'desk'),
  ],
  floor: [
    seat('floor', 0, 14.2, 2.4, 'left', 'desk'),
    seat('floor', 1, 19.2, 2.4, 'left', 'desk'),
    seat('floor', 2, 14.2, 7.6, 'left', 'desk'),
    seat('floor', 3, 19.2, 7.6, 'left', 'desk'),
    seat('floor', 4, 16.7, 12.8, 'left', 'desk'),
  ],
  huddle: [
    seat('huddle', 0, 26.8, 3.8, 'left', 'huddle'),
    seat('huddle', 1, 31.2, 4.6, 'left', 'huddle'),
    seat('huddle', 2, 26.1, 6.5, 'right', 'huddle'),
    seat('huddle', 3, 29.6, 3.1, 'left', 'huddle'),
  ],
  lounge: [
    seat('lounge', 0, 1.9, 14.3, 'right', 'sofa'),
    seat('lounge', 1, 1.9, 16.9, 'right', 'sofa'),
    seat('lounge', 2, 8.2, 18.2, 'left', 'pouf'),
  ],
  kitchen: [
    seat('kitchen', 0, 26.4, 13.6, 'left', 'stand'),
    seat('kitchen', 1, 29.9, 13.8, 'left', 'stand'),
    seat('kitchen', 2, 33, 15.6, 'left', 'stand'),
    seat('kitchen', 3, 31.9, 18.6, 'left', 'stand'),
  ],
};

// Extra standing spots when a room is fuller than its furniture.
const OVERFLOW: Record<ZoneId, [number, number][]> = {
  focus: [
    [5, 8.6],
    [9.4, 8.4],
  ],
  floor: [
    [13, 16],
    [21, 15.6],
    [17, 21.6],
    [21.4, 21],
  ],
  huddle: [
    [27.2, 8.6],
    [32.6, 8],
  ],
  lounge: [
    [5.4, 12.2],
    [9.2, 15.2],
    [4.6, 22.4],
  ],
  kitchen: [
    [25.4, 21.6],
    [33, 21.8],
    [29.4, 22.6],
  ],
};

// The server hands out these spots in order (app/lib/office.ts). Matching them keeps seats stable.
const SERVER_SPOTS: Record<ZoneId, [number, number][]> = {
  floor: [
    [44, 56],
    [56, 49],
    [39, 44],
    [62, 62],
    [49, 68],
  ],
  focus: [
    [17, 24],
    [27, 24],
    [17, 36],
    [27, 36],
  ],
  lounge: [
    [18, 78],
    [34, 68],
    [24, 62],
  ],
  huddle: [
    [74, 22],
    [86, 34],
    [80, 28],
  ],
  kitchen: [
    [82, 76],
    [71, 79],
  ],
};

export function zoneOf(value: string): ZoneId {
  return value in ROOMS ? (value as ZoneId) : 'floor';
}

export type Placed = { person: OfficePerson; seat: Seat };

export function placePeople(people: OfficePerson[]): Placed[] {
  const placed: Placed[] = [];
  for (const zone of Object.keys(ROOMS) as ZoneId[]) {
    const here = people
      .filter((person) => zoneOf(person.zone) === zone)
      .map((person) => ({
        person,
        spot: SERVER_SPOTS[zone].findIndex(([x, y]) => x === person.x && y === person.y),
      }))
      .sort(
        (a, b) =>
          Number(b.person.online) - Number(a.person.online) ||
          (a.spot < 0 ? 99 : a.spot) - (b.spot < 0 ? 99 : b.spot) ||
          a.person.user.id.localeCompare(b.person.user.id),
      );
    const taken = new Set<number>();
    const seats = SEATS[zone];
    let overflow = 0;
    for (const { person, spot } of here) {
      let index = spot >= 0 && spot < seats.length && !taken.has(spot) ? spot : -1;
      if (index < 0) index = seats.findIndex((_, i) => !taken.has(i));
      if (index >= 0) {
        taken.add(index);
        placed.push({ person, seat: seats[index]! });
        continue;
      }
      const spots = OVERFLOW[zone];
      const [x, y] = spots[overflow % spots.length]!;
      const ring = Math.floor(overflow / spots.length);
      overflow += 1;
      placed.push({
        person,
        seat: seat(
          zone,
          100 + overflow,
          x + ring * 0.9,
          y + ring * 0.6,
          overflow % 2 ? 'left' : 'right',
          'stand',
        ),
      });
    }
  }
  return placed;
}

function moodOf(person: OfficePerson): CreatureMood {
  if (!person.online) return 'offline';
  return person.status;
}

const SEAT_Z: Record<SeatKind, number> = {
  desk: 1.1,
  sofa: 1.02,
  huddle: 1.1,
  stand: 0,
  pouf: 0.62,
};
const SPRITE = 1.5;

function anchorOf(seatValue: Seat) {
  return project(seatValue.x, seatValue.y, SEAT_Z[seatValue.kind]);
}

// ---------- scene

type Item = { key: string; depth: number; node: ReactNode };

export type StudioSceneProps = {
  people: OfficePerson[];
  meId: string;
  selectedId: string | null;
  call: OfficeSnapshot['call'];
  activeZone: string;
  zones: Record<string, { label: string; short: string }>;
  onSelect: (id: string | null) => void;
  onMove: (zone: string) => void;
  statusLabel: (person: OfficePerson) => string;
  statusDot: (person: OfficePerson) => string;
};

export function StudioScene({
  people,
  meId,
  selectedId,
  call,
  activeZone,
  zones,
  onSelect,
  onMove,
  statusLabel,
  statusDot,
}: StudioSceneProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [renderedWidth, setRenderedWidth] = useState<number>(VIEW.width);
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRenderedWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const placed = placePeople(people);
  const bySeat = new Map(placed.map((entry) => [entry.seat.id, entry]));
  const live = Boolean(call);
  const items: Item[] = [];

  const creatureOf = (entry: Placed, pose: CreaturePose, part: 'body' | 'hands' = 'body') => {
    const [sx, sy] = anchorOf(entry.seat);
    const mood = moodOf(entry.person);
    return (
      <g
        key={`${entry.person.user.id}-${entry.seat.id}-${part}`}
        transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)}) scale(${SPRITE})`}
      >
        <g className={cn(mood === 'offline' && 'kc-offline', mood === 'away' && 'kc-away')}>
          <g className={part === 'body' ? 'kc-arrive' : undefined}>
            <Creature
              id={entry.person.user.id}
              tint={entry.person.user.avatarColor}
              pose={pose}
              mood={mood}
              mirrored={entry.seat.facing === 'right'}
              part={part}
            />
          </g>
        </g>
      </g>
    );
  };

  const selectionRing = (entry: Placed | undefined) => {
    if (!entry || entry.person.user.id !== selectedId) return null;
    const e = ellipseOf(entry.seat.x, entry.seat.y, 0.02, 1.05);
    return (
      <ellipse
        {...e}
        fill="#ef5f3e"
        fillOpacity={0.1}
        stroke="#ef5f3e"
        strokeWidth={1.6}
        className="studio-ring"
      />
    );
  };

  // Desks: chair, sitter, desk, hands.
  for (const zone of ['focus', 'floor'] as const) {
    for (const s of SEATS[zone]) {
      const entry = bySeat.get(s.id);
      const typing = Boolean(entry && entry.person.online && entry.person.status !== 'away');
      items.push({
        key: s.id,
        depth: s.x + s.y + 0.4,
        node: (
          <g key={s.id}>
            {selectionRing(entry)}
            <Chair
              x={s.x}
              y={s.y}
              facing={s.facing}
              color={zone === 'focus' ? '#556b62' : '#4a5250'}
            />
            {entry && creatureOf(entry, 'type')}
            <Desk x={s.x} y={s.y} facing={s.facing} busy={typing} personal={hashOf(s.id) % 6} />
            {entry && typing && creatureOf(entry, 'type', 'hands')}
          </g>
        ),
      });
    }
  }

  // Huddle: chairs and sitters behind a round table.
  {
    const table = { cx: 28.6, cy: 5.6, r: 2 };
    items.push({
      key: 'huddle-set',
      depth: table.cx + table.cy,
      node: (
        <g key="huddle-set">
          <RoundShadow cx={table.cx} cy={table.cy} r={2.6} opacity={0.1} />
          {SEATS.huddle.map((s) => {
            const entry = bySeat.get(s.id);
            return (
              <g key={s.id}>
                {selectionRing(entry)}
                <Chair x={s.x} y={s.y} facing={s.facing} color="#c9dccf" />
                {entry && creatureOf(entry, 'sit')}
              </g>
            );
          })}
          <Cylinder cx={table.cx} cy={table.cy} z={0} r={0.5} h={0.06} color={PALETTE.frame} />
          <Block
            box={{
              x: table.cx - 0.1,
              y: table.cy - 0.1,
              z: 0.06,
              w: 0.2,
              d: 0.2,
              h: 1.5,
            }}
            color={PALETTE.frame}
            edge={0.4}
          />
          <Cylinder cx={table.cx} cy={table.cy} z={1.56} r={table.r} h={0.16} color={PALETTE.oak} />
          <ellipse
            {...ellipseOf(table.cx, table.cy, 1.72, table.r - 0.22)}
            fill="none"
            stroke={PALETTE.oakDeep}
            strokeOpacity={0.35}
            strokeWidth={0.8}
          />
          <Cylinder
            cx={table.cx - 0.4}
            cy={table.cy + 0.6}
            z={1.72}
            r={0.16}
            h={0.3}
            color={PALETTE.white}
          />
          <Cylinder
            cx={table.cx + 0.7}
            cy={table.cy - 0.2}
            z={1.72}
            r={0.16}
            h={0.3}
            color={PALETTE.coral}
          />
          <Block
            box={{
              x: table.cx - 0.3,
              y: table.cy - 0.9,
              z: 1.72,
              w: 1.1,
              d: 0.7,
              h: 0.05,
            }}
            color="#3a403e"
            edge={0.5}
          />
          <Block
            box={{
              x: table.cx + 0.1,
              y: table.cy + 0.6,
              z: 1.72,
              w: 0.3,
              d: 0.3,
              h: 0.12,
            }}
            color={PALETTE.ink}
            edge={0.4}
          />
          {live && (
            <ellipse {...ellipseOf(table.cx + 0.25, table.cy + 0.75, 1.86, 0.08)} fill="#3fd19a" />
          )}
        </g>
      ),
    });
  }

  // Lounge: sofa with sitters, the near arm drawn over them; a pouf; a coffee table.
  {
    const sofa = { x: 0.35, y: 13.1, length: 5.2 };
    items.push({
      key: 'sofa',
      depth: 2 + 15.7,
      node: (
        <g key="sofa">
          <Sofa x={sofa.x} y={sofa.y} length={sofa.length} />
          <SofaCushions x={sofa.x} y={sofa.y} length={sofa.length} />
          {SEATS.lounge
            .filter((s) => s.kind === 'sofa')
            .map((s) => {
              const entry = bySeat.get(s.id);
              return entry ? <g key={s.id}>{creatureOf(entry, 'sit')}</g> : null;
            })}
          <SofaFront x={sofa.x} y={sofa.y} length={sofa.length} />
        </g>
      ),
    });
    const pouf = SEATS.lounge.find((s) => s.kind === 'pouf')!;
    const pEntry = bySeat.get(pouf.id);
    items.push({
      key: 'pouf',
      depth: pouf.x + pouf.y,
      node: (
        <g key="pouf">
          {selectionRing(pEntry)}
          <RoundShadow cx={pouf.x} cy={pouf.y} r={0.9} />
          <Cylinder cx={pouf.x} cy={pouf.y} z={0} r={0.78} h={0.62} color={PALETTE.gold} />
          <ellipse
            {...ellipseOf(pouf.x, pouf.y, 0.62, 0.5)}
            fill="none"
            stroke="#c99335"
            strokeWidth={0.8}
          />
          {pEntry && creatureOf(pEntry, 'sit')}
        </g>
      ),
    });
    for (const s of SEATS.lounge.filter((value) => value.kind === 'sofa')) {
      const entry = bySeat.get(s.id);
      const ring = selectionRing(entry);
      if (ring)
        items.push({
          key: `${s.id}-ring`,
          depth: -1,
          node: <g key={`${s.id}-ring`}>{ring}</g>,
        });
    }
  }

  // Kitchen standing spots and anyone in overflow spots.
  for (const entry of placed.filter((value) => value.seat.kind === 'stand')) {
    items.push({
      key: entry.seat.id,
      depth: entry.seat.x + entry.seat.y + 0.2,
      node: (
        <g key={entry.seat.id}>
          {selectionRing(entry)}
          <RoundShadow cx={entry.seat.x} cy={entry.seat.y} r={0.7} opacity={0.12} />
          {creatureOf(entry, 'stand')}
        </g>
      ),
    });
  }

  items.push(...staticFurniture(live));
  const heads = layoutTags(placed, meId, VIEW.width / Math.max(240, renderedWidth));
  items.sort((a, b) => a.depth - b.depth);

  return (
    <div
      ref={frameRef}
      className="studio-scene relative w-full"
      style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
    >
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="absolute inset-0 size-full"
        role="img"
        aria-label={sceneSummary(placed, zones)}
      >
        <SceneDefs />
        <Shell activeZone={activeZone} onMove={onMove} live={live} />
        {items.map((item) => item.node)}
      </svg>

      <div className="absolute inset-0">
        {(Object.keys(ROOMS) as ZoneId[]).map((zone) => (
          <RoomPlaque
            key={zone}
            zone={zone}
            label={zones[zone]?.short ?? zone}
            count={placed.filter((entry) => entry.seat.zone === zone && entry.person.online).length}
            active={activeZone === zone}
            live={zone === 'huddle' && live}
            onMove={() => onMove(zone)}
          />
        ))}
        {placed.map((entry) => {
          const isMe = entry.person.user.id === meId;
          const [sx, sy] = anchorOf(entry.seat);
          const head = heads.get(entry.person.user.id) ?? sy;
          return (
            <button
              key={entry.person.user.id}
              type="button"
              onClick={() =>
                onSelect(selectedId === entry.person.user.id ? null : entry.person.user.id)
              }
              aria-label={`${entry.person.user.name}, ${entry.person.activity || statusLabel(entry.person)}`}
              aria-pressed={selectedId === entry.person.user.id}
              className="studio-tag group absolute flex flex-col items-center"
              style={{
                ...pinAt(sx, head),
                transform: 'translate(-50%, -24px)',
              }}
            >
              <span
                className={cn(
                  'studio-tag-pill flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap shadow-[var(--kora-shadow-composer)]',
                  selectedId === entry.person.user.id
                    ? 'bg-ink text-paper'
                    : 'bg-paper/95 text-ink group-hover:bg-paper',
                  !entry.person.online && 'text-muted',
                )}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', statusDot(entry.person))} />
                {isMe ? 'You' : firstName(entry.person.user.name)}
              </span>
              <span className="studio-tag-tip pointer-events-none absolute bottom-full mb-1 hidden max-w-[180px] truncate rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper group-hover:block group-focus-visible:block">
                {entry.person.activity || statusLabel(entry.person)}
              </span>
              <span
                className="studio-hit block"
                aria-hidden="true"
                style={{
                  width: `${((32 * SPRITE) / VIEW.width) * 100}cqw`,
                  height: `${((sy - head) / VIEW.width) * 100}cqw`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Name tags sit over heads. When two would overlap, the one further back lifts above the other.
// `k` converts screen pixels to viewBox units, so tags keep their pixel size at any scene width.
function layoutTags(placed: Placed[], meId: string, k: number) {
  const TAG_H = 28 * k;
  const boxes = placed
    .map((entry) => {
      const [sx, sy] = anchorOf(entry.seat);
      const name = entry.person.user.id === meId ? 'You' : firstName(entry.person.user.name);
      const lift = entry.person.online && entry.person.status === 'huddle' ? 26 : 6;
      return {
        id: entry.person.user.id,
        sx,
        top: sy - CREATURE_HEIGHT * SPRITE - lift,
        w: (name.length * 7 + 34) * k,
      };
    })
    .sort((a, b) => b.top - a.top);
  const done: typeof boxes = [];
  for (const box of boxes) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < placed.length + 1) {
      moved = false;
      for (const other of done) {
        const overlapX = Math.abs(box.sx - other.sx) < (box.w + other.w) / 2 + 4 * k;
        const overlapY = Math.abs(box.top - other.top) < TAG_H - 0.5;
        if (overlapX && overlapY) {
          box.top = other.top - TAG_H;
          moved = true;
        }
      }
    }
    done.push(box);
  }
  return new Map(done.map((box) => [box.id, box.top]));
}

function pinAt(sx: number, sy: number): CSSProperties {
  return {
    left: `${((sx / VIEW.width) * 100).toFixed(3)}%`,
    top: `${((sy / VIEW.height) * 100).toFixed(3)}%`,
  };
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function sceneSummary(placed: Placed[], zones: Record<string, { label: string }>) {
  const online = placed.filter((entry) => entry.person.online);
  if (online.length === 0) return 'The Studio is empty.';
  return `The Studio: ${online
    .map(
      (entry) =>
        `${firstName(entry.person.user.name)} in ${zones[entry.seat.zone]?.label ?? entry.seat.zone}`,
    )
    .join(', ')}.`;
}

// Plaques sit on the floor at the front corner of each room.
const PLAQUE_AT: Record<ZoneId, [number, number, number]> = {
  focus: [11, 8, 2.75],
  floor: [17.4, 22.6, 0],
  huddle: [23, 8, 2.75],
  lounge: [5.6, 22.4, 0],
  kitchen: [28.6, 22.4, 0],
};

function RoomPlaque({
  zone,
  label,
  count,
  active,
  live,
  onMove,
}: {
  zone: ZoneId;
  label: string;
  count: number;
  active: boolean;
  live: boolean;
  onMove: () => void;
}) {
  const [x, y, z] = PLAQUE_AT[zone];
  const [sx, sy] = project(x, y, z);
  return (
    <button
      type="button"
      onClick={onMove}
      aria-label={active ? `${label}, you are here` : `${label}, ${count} here. Move here`}
      className={cn(
        'studio-plaque absolute flex max-sm:hidden h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap shadow-[var(--kora-shadow-composer)]',
        active ? 'bg-ink text-paper' : 'bg-paper/90 text-ink-soft hover:bg-paper hover:text-ink',
      )}
      style={pinAt(sx, sy)}
    >
      {live && <span className="studio-live size-1.5 rounded-full bg-coral" />}
      {label}
      <span className={cn('tabular-nums', active ? 'text-paper/60' : 'text-faint')}>{count}</span>
      {!active && <span className="studio-plaque-move text-muted">Move here</span>}
    </button>
  );
}

function SceneDefs() {
  return (
    <>
      <CreatureDefs />
      <defs>
        <filter id="studio-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id="studio-cyl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fffdf9" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#fffdf9" stopOpacity="0" />
          <stop offset="1" stopColor="#171a1a" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id="studio-wall-back" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f4efe6" />
          <stop offset="1" stopColor="#ece5d9" />
        </linearGradient>
        <linearGradient id="studio-wall-side" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e9e2d6" />
          <stop offset="1" stopColor="#e0d8ca" />
        </linearGradient>
        <radialGradient id="studio-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#e8b34a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#e8b34a" stopOpacity="0" />
        </radialGradient>
      </defs>
    </>
  );
}

const FLOOR_TONE: Record<ZoneId, string> = {
  focus: '#ecdcc2',
  floor: '#f3eee5',
  huddle: '#e3ebe2',
  lounge: '#eee4d4',
  kitchen: '#f5f0e7',
};

// Floor slab, room floors, the two back walls and everything mounted on them.
function Shell({
  activeZone,
  onMove,
  live,
}: {
  activeZone: string;
  onMove: (zone: string) => void;
  live: boolean;
}) {
  const W = WORLD.w;
  const D = WORLD.d;
  const H = WORLD.wall;
  return (
    <g>
      {/* slab */}
      <path
        d={poly([
          [0, D, -0.55],
          [W, D, -0.55],
          [W, D, 0],
          [0, D, 0],
        ])}
        fill="#e4dccd"
        stroke="#cfc5b4"
        strokeWidth={0.8}
      />
      <path
        d={poly([
          [W, 0, -0.55],
          [W, D, -0.55],
          [W, D, 0],
          [W, 0, 0],
        ])}
        fill="#d6ccbb"
        stroke="#cfc5b4"
        strokeWidth={0.8}
      />

      {(Object.keys(ROOMS) as ZoneId[]).map((zone) => {
        const r = ROOMS[zone];
        return (
          <path
            key={zone}
            d={poly([
              [r.x, r.y, 0],
              [r.x + r.w, r.y, 0],
              [r.x + r.w, r.y + r.d, 0],
              [r.x, r.y + r.d, 0],
            ])}
            fill={FLOOR_TONE[zone]}
            stroke="#ddd3c3"
            strokeWidth={0.8}
            className={cn('studio-floor', activeZone === zone && 'is-active')}
            onClick={() => onMove(zone)}
          />
        );
      })}
      <FloorTexture />

      {/* walls */}
      <path
        d={poly([
          [0, 0, 0],
          [W, 0, 0],
          [W, 0, H],
          [0, 0, H],
        ])}
        fill="url(#studio-wall-back)"
      />
      <path
        d={poly([
          [0, 0, 0],
          [0, D, 0],
          [0, D, H],
          [0, 0, H],
        ])}
        fill="url(#studio-wall-side)"
      />
      <path
        d={poly([
          [-0.35, -0.35, H],
          [W, -0.35, H],
          [W, 0, H],
          [0, 0, H],
          [0, D, H],
          [-0.35, D, H],
        ])}
        fill="#fffdf9"
        stroke="#d9d0c1"
        strokeWidth={0.8}
      />
      <path
        d={poly([
          [W, -0.35, 0],
          [W, 0, 0],
          [W, 0, H],
          [W, -0.35, H],
        ])}
        fill="#ddd4c6"
        stroke="#d0c6b6"
        strokeWidth={0.8}
      />
      <path
        d={poly([
          [-0.35, D, 0],
          [0, D, 0],
          [0, D, H],
          [-0.35, D, H],
        ])}
        fill="#ebe4d8"
        stroke="#d0c6b6"
        strokeWidth={0.8}
      />
      <path
        d={line([
          [0, 0, H],
          [0, 0, 0],
        ])}
        stroke="#d6ccbc"
        strokeWidth={0.8}
      />
      {/* skirting */}
      <path
        d={poly([
          [0, 0, 0],
          [W, 0, 0],
          [W, 0, 0.22],
          [0, 0, 0.22],
        ])}
        fill="#fbf8f2"
        stroke="#ddd3c3"
        strokeWidth={0.6}
      />
      <path
        d={poly([
          [0, 0, 0],
          [0, D, 0],
          [0, D, 0.22],
          [0, 0, 0.22],
        ])}
        fill="#efe9de"
        stroke="#ddd3c3"
        strokeWidth={0.6}
      />

      {/* back wall: focus shelf, floor windows and logo, huddle screen */}
      <Shelf x0={1.4} x1={5.6} z={2.9} />
      <Frame wall="back" at={6.6} z={2.5} w={2.2} h={1.6} color="#f3d9cf">
        <path
          d={poly([
            [6.9, 0.04, 2.8],
            [8.5, 0.04, 2.8],
            [7.7, 0.04, 3.7],
          ])}
          fill="#ef5f3e"
          opacity={0.75}
        />
        <path
          d={poly([
            [7.2, 0.04, 2.8],
            [8.5, 0.04, 2.8],
            [8.5, 0.04, 3.2],
          ])}
          fill="#e8b34a"
          opacity={0.85}
        />
      </Frame>
      <Window x0={12.4} x1={16.6} z0={1.7} z1={4.3} />
      <WallLogo x={17.3} z={3.6} />
      <Window x0={19.4} x1={22.2} z0={1.7} z1={4.3} />
      <HuddleScreen live={live} />
      <Sconce x={32.8} z={3.4} />

      {/* side wall: whiteboard in focus, prints over the sofa, lounge clock */}
      <Frame wall="side" at={4.6} z={1.8} w={4.2} h={2.4} color="#fbfaf6">
        <path
          d={line([
            [0.04, 5.1, 3.7],
            [0.04, 7.4, 3.7],
          ])}
          stroke="#17795f"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <path
          d={line([
            [0.04, 5.1, 3.3],
            [0.04, 6.6, 3.3],
          ])}
          stroke="#a19b8f"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <path
          d={line([
            [0.04, 5.1, 2.95],
            [0.04, 7.9, 2.95],
          ])}
          stroke="#a19b8f"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <path
          d={line([
            [0.04, 5.1, 2.6],
            [0.04, 6.2, 2.6],
          ])}
          stroke="#ef5f3e"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <path
          d={poly([
            [0.05, 6.9, 2.2],
            [0.05, 8.4, 2.2],
            [0.05, 8.4, 2.9],
            [0.05, 6.9, 2.9],
          ])}
          fill="#f7ecd2"
          stroke="#e8b34a"
          strokeWidth={0.6}
        />
      </Frame>
      <Block
        box={{ x: 0, y: 4.8, z: 1.66, w: 0.35, d: 3.8, h: 0.1 }}
        color={PALETTE.white}
        edge={0.5}
      />
      <Frame wall="side" at={13.4} z={2.6} w={1.7} h={2} color="#dbe8e1">
        <path
          d={poly([
            [0.04, 13.6, 2.8],
            [0.04, 14.9, 2.8],
            [0.04, 14.2, 3.9],
          ])}
          fill="#17795f"
          opacity={0.55}
        />
        <ellipse
          cx={project(0.04, 14.6, 4)[0]}
          cy={project(0.04, 14.6, 4)[1]}
          rx={4}
          ry={4}
          fill="#e8b34a"
          opacity={0.85}
        />
      </Frame>
      <Frame wall="side" at={15.6} z={2.9} w={1.5} h={1.3} color="#f3d9cf">
        <path
          d={line([
            [0.04, 15.9, 3.3],
            [0.04, 16.8, 3.8],
          ])}
          stroke="#ef5f3e"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </Frame>
      <Bookcase />
    </g>
  );
}

function FloorTexture() {
  const planks: ReactNode[] = [];
  // Focus room: oak planks running along x.
  for (let y = 0.9; y < 10; y += 0.9) {
    planks.push(
      <path
        key={`p${y}`}
        d={line([
          [0, y, 0],
          [11, y, 0],
        ])}
        stroke="#dcc8a8"
        strokeWidth={0.6}
      />,
    );
  }
  // Kitchen: tile grid.
  const tiles: ReactNode[] = [];
  for (let x = 24; x < 34; x += 1.25)
    tiles.push(
      <path
        key={`tx${x}`}
        d={line([
          [x, 10, 0],
          [x, 24, 0],
        ])}
        stroke="#e6ded0"
        strokeWidth={0.6}
      />,
    );
  for (let y = 11.25; y < 24; y += 1.25)
    tiles.push(
      <path
        key={`ty${y}`}
        d={line([
          [23, y, 0],
          [34, y, 0],
        ])}
        stroke="#e6ded0"
        strokeWidth={0.6}
      />,
    );
  return (
    <g pointerEvents="none">
      {planks}
      {tiles}
      {/* lounge rug */}
      <path
        d={poly([
          [3.4, 12.6, 0.01],
          [9.6, 12.6, 0.01],
          [9.6, 19.4, 0.01],
          [3.4, 19.4, 0.01],
        ])}
        fill="#f1d7cc"
        stroke="#e3bfb0"
        strokeWidth={0.8}
      />
      <path
        d={poly([
          [3.9, 13.1, 0.01],
          [9.1, 13.1, 0.01],
          [9.1, 18.9, 0.01],
          [3.9, 18.9, 0.01],
        ])}
        fill="none"
        stroke="#fffdf9"
        strokeWidth={1}
        strokeOpacity={0.7}
      />
      {/* huddle carpet circle */}
      <ellipse
        {...ellipseOf(28.6, 5.6, 0.01, 4)}
        fill="#d5e3d8"
        stroke="#c2d6c8"
        strokeWidth={0.8}
      />
      {/* floor: a runner between the desk rows */}
      <path
        d={poly([
          [12, 15.6, 0.01],
          [22, 15.6, 0.01],
          [22, 21.4, 0.01],
          [12, 21.4, 0.01],
        ])}
        fill="#ebe5da"
        stroke="#e0d8ca"
        strokeWidth={0.8}
      />
    </g>
  );
}

function Shelf({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const books = [0.18, 0.22, 0.16, 0.2, 0.24, 0.18, 0.2];
  const colors = ['#ef5f3e', '#e8b34a', '#17795f', '#bfe4d2', '#fbf8f2', '#2a2f2e', '#d4896a'];
  let x = x0 + 0.3;
  const spines: ReactNode[] = [];
  books.forEach((w, index) => {
    const h = 0.55 + ((index * 37) % 5) * 0.06;
    spines.push(
      <Block
        key={index}
        box={{ x, y: 0.05, z: z + 0.1, w, d: 0.42, h }}
        color={colors[index]!}
        edge={0.4}
      />,
    );
    x += w + 0.02;
  });
  return (
    <g>
      {spines}
      <Plant cx={x1 - 0.5} cy={0.3} scale={0.42} pot={PALETTE.white} />
      <Block box={{ x: x0, y: 0, z, w: x1 - x0, d: 0.55, h: 0.1 }} color={PALETTE.oak} edge={0.6} />
    </g>
  );
}

function WallLogo({ x, z }: { x: number; z: number }) {
  // The Kora mark painted on the back wall, in the wall's own plane.
  const [ox, oy] = project(x, 0.03, z);
  const s = 1.3 / 40;
  const a = UNIT * Math.cos(Math.PI / 6) * s;
  const b = UNIT * 0.5 * s;
  const d = UNIT * s;
  return (
    <g transform={`matrix(${a} ${b} 0 ${d} ${ox} ${oy})`}>
      <path d={LOGO_BUBBLE_PATH} fill="#ef5f3e" />
      <path
        d={LOGO_K_PATH}
        stroke="#fff9f3"
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  );
}

function HuddleScreen({ live }: { live: boolean }) {
  const x0 = 26.4;
  const x1 = 30.8;
  const z0 = 2.5;
  const z1 = 4.3;
  const tiles = [
    [26.6, 29.3, 2.65, 4.15],
    [29.4, 30.6, 3.45, 4.15],
    [29.4, 30.6, 2.65, 3.35],
  ] as const;
  return (
    <g>
      <path
        d={poly([
          [x0, 0.03, z0],
          [x1, 0.03, z0],
          [x1, 0.03, z1],
          [x0, 0.03, z1],
        ])}
        fill="#e9ece8"
        stroke="#3a403e"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {live ? (
        <g className="studio-screen-live">
          {tiles.map(([a, b, c, e], index) => (
            <path
              key={index}
              d={poly([
                [a, 0.04, c],
                [b, 0.04, c],
                [b, 0.04, e],
                [a, 0.04, e],
              ])}
              fill={['#3b6f60', '#6b4a5f', '#5a6b8f'][index]}
            />
          ))}
          <ellipse
            cx={project(27.8, 0.04, 3.3)[0]}
            cy={project(27.8, 0.04, 3.3)[1]}
            rx={9}
            ry={9}
            fill="#bfe4d2"
            opacity={0.85}
          />
          <path
            d={poly([
              [26.2, 0.04, 2.62],
              [26.9, 0.04, 2.62],
              [26.9, 0.04, 2.82],
              [26.2, 0.04, 2.82],
            ])}
            fill="#ef5f3e"
          />
        </g>
      ) : (
        <g>
          <path
            d={line([
              [26.9, 0.04, 3.8],
              [28.9, 0.04, 3.8],
            ])}
            stroke="#17795f"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
          <path
            d={line([
              [26.9, 0.04, 3.35],
              [28.2, 0.04, 3.35],
            ])}
            stroke="#a19b8f"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path
            d={line([
              [26.9, 0.04, 2.95],
              [29.4, 0.04, 2.95],
            ])}
            stroke="#a19b8f"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path
            d={poly([
              [29.6, 0.04, 2.8],
              [30.4, 0.04, 2.8],
              [30.4, 0.04, 3.9],
              [29.6, 0.04, 3.9],
            ])}
            fill="#fde7e0"
          />
        </g>
      )}
      <Block
        box={{ x: x0 + 2.2, y: 0, z: z0 - 0.42, w: 1.4, d: 0.4, h: 0.16 }}
        color="#3a403e"
        edge={0.5}
      />
      <ellipse
        cx={project(x0 + 2.9, 0.42, z0 - 0.26)[0]}
        cy={project(x0 + 2.9, 0.42, z0 - 0.26)[1]}
        rx={1.6}
        ry={1.6}
        fill={live ? '#3fd19a' : '#6b7370'}
      />
    </g>
  );
}

function Sconce({ x, z }: { x: number; z: number }) {
  const [sx, sy] = project(x, 0.2, z);
  return (
    <g>
      <ellipse cx={sx} cy={sy + 6} rx={26} ry={30} fill="url(#studio-lamp)" />
      <Block
        box={{ x: x - 0.2, y: 0, z: z - 0.1, w: 0.4, d: 0.35, h: 0.5 }}
        color={PALETTE.gold}
        edge={0.5}
      />
    </g>
  );
}

function Bookcase() {
  const x = 0;
  const y = 20.2;
  const shelves = [0.2, 1.15, 2.1, 3.05];
  const colors = [
    '#ef5f3e',
    '#bfe4d2',
    '#e8b34a',
    '#17795f',
    '#fbf8f2',
    '#d4896a',
    '#2a2f2e',
    '#a9c7b5',
  ];
  return (
    <g>
      <Shadow x={x} y={y} w={1} d={3.2} soft={0.5} />
      <Block box={{ x, y, z: 0, w: 1, d: 3.2, h: 3.9 }} color={PALETTE.oak} />
      {shelves.map((z, row) => {
        const books: ReactNode[] = [];
        let cursor = y + 0.18;
        for (let i = 0; i < 9; i += 1) {
          const w = 0.16 + ((row * 7 + i * 3) % 4) * 0.04;
          if (cursor + w > y + 3.0) break;
          const h = 0.55 + ((row * 5 + i * 11) % 4) * 0.08;
          const lean = (row + i) % 7 === 3;
          if (!lean) {
            books.push(
              <Block
                key={i}
                box={{ x: x + 0.62, y: cursor, z: z + 0.04, w: 0.36, d: w, h }}
                color={colors[(row * 3 + i) % colors.length]!}
                edge={0.35}
              />,
            );
          }
          cursor += w + 0.02;
        }
        return (
          <g key={z}>
            {books}
            <Block
              box={{ x: x + 0.6, y: y + 0.08, z, w: 0.4, d: 3.04, h: 0.05 }}
              color={PALETTE.oakDeep}
              edge={0.35}
            />
          </g>
        );
      })}
    </g>
  );
}

function SofaCushions({ x, y, length }: { x: number; y: number; length: number }) {
  const color = shade(PALETTE.sage, 0.14);
  const cushions = 2;
  const each = (length - 0.5) / cushions;
  return (
    <g>
      {Array.from({ length: cushions }, (_, index) => (
        <Block
          key={index}
          box={{
            x: x + 0.6,
            y: y + 0.25 + index * each + 0.05,
            z: 0.75,
            w: 1.4,
            d: each - 0.1,
            h: 0.28,
          }}
          color={color}
          edge={0.7}
        />
      ))}
      <Block
        box={{ x: x + 0.62, y: y + 0.6, z: 1.03, w: 0.3, d: 0.8, h: 0.6 }}
        color="#f3d9cf"
        edge={0.6}
      />
    </g>
  );
}

// Furniture that never changes, as depth-sorted items.
function staticFurniture(live: boolean): Item[] {
  const items: Item[] = [];
  const add = (key: string, depth: number, node: ReactNode) =>
    items.push({ key, depth, node: <g key={key}>{node}</g> });

  // Glass walls around Focus and Huddle, cut into short panes so each sorts on its own.
  const panes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const run = (x0: number, y0: number, x1: number, y1: number, gap?: [number, number]) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(length);
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = [x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0] as const;
      const b = [x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1] as const;
      const along = x0 === x1 ? a[1] : a[0];
      const along1 = x0 === x1 ? b[1] : b[0];
      if (gap && along >= gap[0] - 0.01 && along1 <= gap[1] + 0.01) continue;
      panes.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] });
    }
  };
  run(11, 0, 11, 10, [7, 9]);
  run(0, 10, 11, 10, [9, 11]);
  run(23, 0, 23, 10, [7, 9]);
  run(23, 10, 34, 10, [23, 25]);
  const GH = 2.3;
  panes.forEach((p, index) => {
    add(
      `pane-${index}`,
      (p.x0 + p.x1) / 2 + (p.y0 + p.y1) / 2 - 0.05,
      <g>
        <path
          d={poly([
            [p.x0, p.y0, 0],
            [p.x1, p.y1, 0],
            [p.x1, p.y1, GH],
            [p.x0, p.y0, GH],
          ])}
          fill={PALETTE.glass}
          fillOpacity={0.34}
        />
        <path
          d={line([
            [p.x0, p.y0, GH],
            [p.x1, p.y1, GH],
          ])}
          stroke="#b9cbc4"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <path
          d={line([
            [p.x0, p.y0, 0.12],
            [p.x1, p.y1, 0.12],
          ])}
          stroke="#c9d6d1"
          strokeWidth={1.4}
        />
        <path
          d={line([
            [p.x0, p.y0, 1.25],
            [p.x1, p.y1, 1.25],
          ])}
          stroke="#fffdf9"
          strokeWidth={0.8}
          strokeOpacity={0.7}
        />
      </g>,
    );
  });
  // Mullions at the ends of each run and at door jambs.
  const posts: [number, number][] = [
    [11, 10],
    [11, 7],
    [11, 9],
    [9, 10],
    [23, 10],
    [23, 7],
    [23, 9],
    [25, 10],
    [34, 10],
    [0, 10],
    [11, 0],
    [23, 0],
  ];
  posts.forEach(([x, y], index) => {
    add(
      `post-${index}`,
      x + y + 0.02,
      <Block
        box={{ x: x - 0.08, y: y - 0.08, z: 0, w: 0.16, d: 0.16, h: GH + 0.05 }}
        color="#c9d6d1"
        edge={0.4}
      />,
    );
  });

  // Focus: a floor lamp in the corner and a plant by the door.
  add('focus-plant', 10 + 8.8, <Plant cx={10} cy={8.8} scale={0.85} />);
  add('focus-lamp', 0.9 + 9, <FloorLamp x={0.9} y={9} />);

  // Floor: a long shared table with stools, plants at the corners, a printer cabinet.
  add('floor-table', 17 + 18.5, <SharedTable />);
  add('floor-plant-a', 21.9 + 0.9, <Plant cx={21.9} cy={0.9} scale={1.05} />);
  add('floor-plant-b', 12 + 22.8, <Plant cx={12} cy={22.8} scale={1.25} pot={PALETTE.white} />);
  add('floor-plant-c', 22 + 23, <Plant cx={22} cy={23} scale={0.9} />);
  add(
    'floor-cabinet',
    22.2 + 12.5,
    <g>
      <Shadow x={21.4} y={11} w={1.4} d={3} soft={0.5} />
      <Block box={{ x: 21.6, y: 11, z: 0, w: 1.2, d: 3, h: 1.6 }} color={PALETTE.white} />
      <path
        d={line([
          [22.8, 12.5, 0.1],
          [22.8, 12.5, 1.5],
        ])}
        stroke="#ddd3c3"
        strokeWidth={0.7}
      />
      <Block
        box={{ x: 21.75, y: 11.4, z: 1.6, w: 0.9, d: 1.2, h: 0.5 }}
        color="#ebe6dd"
        edge={0.5}
      />
      <Block
        box={{ x: 21.85, y: 13, z: 1.6, w: 0.7, d: 0.6, h: 0.08 }}
        color="#fde7e0"
        edge={0.4}
      />
    </g>,
  );

  // Lounge: coffee table, floor lamp, plant.
  add(
    'lounge-table',
    5.6 + 15.8,
    <g>
      <Shadow x={4.6} y={14.6} w={2} d={2.6} soft={0.5} />
      <Block
        box={{ x: 4.6, y: 14.6, z: 0, w: 0.12, d: 0.12, h: 0.8 }}
        color={PALETTE.oakDeep}
        edge={0.4}
      />
      <Block
        box={{ x: 6.5, y: 14.6, z: 0, w: 0.12, d: 0.12, h: 0.8 }}
        color={PALETTE.oakDeep}
        edge={0.4}
      />
      <Block
        box={{ x: 4.6, y: 17.1, z: 0, w: 0.12, d: 0.12, h: 0.8 }}
        color={PALETTE.oakDeep}
        edge={0.4}
      />
      <Block
        box={{ x: 6.5, y: 17.1, z: 0, w: 0.12, d: 0.12, h: 0.8 }}
        color={PALETTE.oakDeep}
        edge={0.4}
      />
      <Block box={{ x: 4.5, y: 14.5, z: 0.8, w: 2.2, d: 2.8, h: 0.14 }} color={PALETTE.oak} />
      <Block
        box={{ x: 5, y: 15.1, z: 0.94, w: 1, d: 0.7, h: 0.12 }}
        color={PALETTE.coral}
        edge={0.5}
      />
      <Block
        box={{ x: 5.05, y: 15.15, z: 1.06, w: 0.9, d: 0.6, h: 0.08 }}
        color="#fbf8f2"
        edge={0.4}
      />
      <Cylinder cx={5.9} cy={16.6} z={0.94} r={0.18} h={0.3} color={PALETTE.white} />
    </g>,
  );
  add('lounge-lamp', 0.9 + 11.2, <FloorLamp x={0.9} y={11.2} />);
  add('lounge-plant', 10 + 22.5, <Plant cx={10} cy={22.5} scale={1.15} />);

  // Kitchen: counter with coffee machine and sink, fridge, a tall table with stools.
  add('kitchen-counter', 28 + 11, <Counter live={live} />);
  add(
    'kitchen-fridge',
    33 + 11.1,
    <g>
      <Block box={{ x: 32.3, y: 10.25, z: 0, w: 1.6, d: 1.6, h: 3.9 }} color="#f4f1ea" />
      <path
        d={line([
          [32.3, 11.85, 2.5],
          [33.9, 11.85, 2.5],
        ])}
        stroke="#d6cfc2"
        strokeWidth={0.8}
      />
      <Block
        box={{ x: 32.55, y: 11.85, z: 2.7, w: 0.08, d: 0.06, h: 0.8 }}
        color="#a19b8f"
        edge={0.3}
      />
      <Block
        box={{ x: 32.55, y: 11.85, z: 1.4, w: 0.08, d: 0.06, h: 0.8 }}
        color="#a19b8f"
        edge={0.3}
      />
      <Block
        box={{ x: 33.1, y: 11.85, z: 3.0, w: 0.4, d: 0.03, h: 0.5 }}
        color="#fde7e0"
        edge={0.3}
      />
    </g>,
  );
  add('kitchen-table', 28 + 18, <DiningTable x={25.6} y={17} />);
  add('kitchen-plant', 24.2 + 23, <Plant cx={24.2} cy={23} scale={0.95} pot={PALETTE.white} />);

  return items;
}

function FloorLamp({ x, y }: { x: number; y: number }) {
  const [sx, sy] = project(x, y, 3.2);
  return (
    <g>
      <RoundShadow cx={x} cy={y} r={0.5} />
      <Cylinder cx={x} cy={y} z={0} r={0.32} h={0.06} color={PALETTE.frame} />
      <Block
        box={{ x: x - 0.04, y: y - 0.04, z: 0.06, w: 0.08, d: 0.08, h: 2.8 }}
        color={PALETTE.frame}
        edge={0.3}
      />
      <ellipse cx={sx} cy={sy + 18} rx={34} ry={40} fill="url(#studio-lamp)" />
      <Cylinder cx={x} cy={y} z={2.8} r={0.45} h={0.55} color="#f2e2bd" />
    </g>
  );
}

function SharedTable() {
  const x = 13.4;
  const y = 17.4;
  const w = 7.2;
  const d = 2.2;
  const stools: [number, number][] = [
    [14.6, 16.6],
    [16.8, 16.6],
    [19, 16.6],
  ];
  const near: [number, number][] = [
    [14.6, 20.4],
    [16.8, 20.4],
    [19, 20.4],
  ];
  return (
    <g>
      {stools.map(([sx, sy]) => (
        <Stool key={`${sx}`} x={sx} y={sy} />
      ))}
      <Shadow x={x} y={y} w={w} d={d} soft={0.7} />
      <Block
        box={{ x: x + 0.3, y: y + 0.3, z: 0, w: 0.16, d: d - 0.6, h: 1.6 }}
        color={PALETTE.white}
        edge={0.5}
      />
      <Block
        box={{ x: x + w - 0.46, y: y + 0.3, z: 0, w: 0.16, d: d - 0.6, h: 1.6 }}
        color={PALETTE.white}
        edge={0.5}
      />
      <Block box={{ x, y, z: 1.6, w, d, h: 0.16 }} color={PALETTE.oak} />
      <Block
        box={{ x: x + 1, y: y + 0.6, z: 1.76, w: 1.3, d: 0.9, h: 0.06 }}
        color="#3a403e"
        edge={0.5}
      />
      <Block
        box={{ x: x + 1.05, y: y + 0.65, z: 1.82, w: 1.2, d: 0.8, h: 0.02 }}
        color="#dfe3df"
        edge={0.3}
      />
      <Block
        box={{ x: x + 3.6, y: y + 0.5, z: 1.76, w: 1, d: 1.2, h: 0.04 }}
        color="#fbf8f2"
        edge={0.4}
      />
      <Block
        box={{ x: x + 3.75, y: y + 0.7, z: 1.8, w: 0.5, d: 0.35, h: 0.02 }}
        color="#f7ecd2"
        edge={0.3}
      />
      <Block
        box={{ x: x + 3.75, y: y + 1.15, z: 1.8, w: 0.6, d: 0.35, h: 0.02 }}
        color="#dbe8e1"
        edge={0.3}
      />
      <Cylinder cx={x + 5.8} cy={y + 1.1} z={1.76} r={0.17} h={0.32} color={PALETTE.gold} />
      <Plant cx={x + 6.6} cy={y + 0.6} scale={0.32} pot={PALETTE.white} />
      {near.map(([sx, sy]) => (
        <Stool key={`n${sx}`} x={sx} y={sy} />
      ))}
    </g>
  );
}

function Stool({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <RoundShadow cx={x} cy={y} r={0.5} />
      <Block
        box={{ x: x - 0.05, y: y - 0.05, z: 0, w: 0.1, d: 0.1, h: 1.1 }}
        color={PALETTE.frame}
        edge={0.3}
      />
      <Cylinder cx={x} cy={y} z={1.1} r={0.42} h={0.14} color="#d7c2a2" />
    </g>
  );
}

function DiningTable({ x, y }: { x: number; y: number }) {
  const w = 4.8;
  const d = 1.8;
  return (
    <g>
      {[0.9, 2.4, 3.9].map((t) => (
        <Stool key={`b${t}`} x={x + t} y={y - 0.75} />
      ))}
      <Shadow x={x} y={y} w={w} d={d} soft={0.7} />
      <Block
        box={{ x: x + 0.3, y: y + 0.3, z: 0, w: 0.14, d: d - 0.6, h: 1.55 }}
        color={PALETTE.frame}
        edge={0.4}
      />
      <Block
        box={{ x: x + w - 0.44, y: y + 0.3, z: 0, w: 0.14, d: d - 0.6, h: 1.55 }}
        color={PALETTE.frame}
        edge={0.4}
      />
      <Block box={{ x, y, z: 1.55, w, d, h: 0.14 }} color={PALETTE.white} />
      <Cylinder cx={x + 1.1} cy={y + 0.6} z={1.69} r={0.16} h={0.28} color={PALETTE.coral} />
      <Cylinder cx={x + 3.7} cy={y + 1.1} z={1.69} r={0.16} h={0.28} color={PALETTE.mint} />
      <Block
        box={{ x: x + 1.9, y: y + 0.5, z: 1.69, w: 1, d: 0.8, h: 0.05 }}
        color="#f7ecd2"
        edge={0.4}
      />
      <Cylinder cx={x + 2.4} cy={y + 0.9} z={1.74} r={0.32} h={0.12} color={PALETTE.oak} />
      {[0.9, 2.4, 3.9].map((t) => (
        <Stool key={`f${t}`} x={x + t} y={y + d + 0.75} />
      ))}
    </g>
  );
}

function Counter({ live }: { live: boolean }) {
  const x = 25.3;
  const y = 10.25;
  const w = 6.8;
  const d = 1.4;
  const h = 1.8;
  const doors = [1.4, 2.8, 4.2, 5.6];
  const machine = { x: 30.4, y: 10.35, z: h + 0.1, w: 0.95, d: 0.85, h: 1.15 };
  return (
    <g>
      <Shadow x={x} y={y} w={w} d={d + 0.2} soft={0.5} />
      <Block box={{ x, y, z: 0, w, d, h }} color={PALETTE.white} />
      {doors.map((t) => (
        <path
          key={t}
          d={line([
            [x + t, y + d, 0.15],
            [x + t, y + d, h - 0.25],
          ])}
          stroke="#ddd3c3"
          strokeWidth={0.8}
        />
      ))}
      {doors.map((t) => (
        <path
          key={`k${t}`}
          d={line([
            [x + t - 0.22, y + d, h - 0.45],
            [x + t - 0.22, y + d, h - 0.75],
          ])}
          stroke="#a19b8f"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      ))}
      <Block
        box={{
          x: x - 0.05,
          y: y - 0.05,
          z: h,
          w: w + 0.1,
          d: d + 0.1,
          h: 0.12,
        }}
        color={PALETTE.oak}
      />
      {/* sink */}
      <path
        d={poly([
          [x + 0.9, y + 0.3, h + 0.121],
          [x + 2.3, y + 0.3, h + 0.121],
          [x + 2.3, y + 1.1, h + 0.121],
          [x + 0.9, y + 1.1, h + 0.121],
        ])}
        fill="#d9dedb"
        stroke="#b9c0bc"
        strokeWidth={0.7}
      />
      <Block
        box={{ x: x + 1.5, y: y + 0.08, z: h + 0.12, w: 0.12, d: 0.12, h: 0.6 }}
        color="#b9c0bc"
        edge={0.4}
      />
      <Block
        box={{ x: x + 1.5, y: y + 0.08, z: h + 0.66, w: 0.12, d: 0.5, h: 0.08 }}
        color="#b9c0bc"
        edge={0.4}
      />
      {/* coffee machine */}
      <Block box={machine} color="#2f3533" />
      <Block
        box={{
          x: machine.x + 0.1,
          y: machine.y + machine.d,
          z: machine.z + 0.25,
          w: machine.w - 0.2,
          d: 0.12,
          h: 0.12,
        }}
        color="#1f2423"
        edge={0.4}
      />
      <Cylinder
        cx={machine.x + machine.w / 2}
        cy={machine.y + machine.d + 0.25}
        z={machine.z}
        r={0.16}
        h={0.26}
        color={PALETTE.white}
      />
      <ellipse
        cx={project(machine.x + machine.w - 0.2, machine.y + machine.d, machine.z + 0.85)[0]}
        cy={project(machine.x + machine.w - 0.2, machine.y + machine.d, machine.z + 0.85)[1]}
        rx={1.6}
        ry={1.6}
        fill={PALETTE.coral}
      />
      <g
        className="kc-steam-wrap"
        stroke="#c9c1b3"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      >
        {(() => {
          const [sx, sy] = project(
            machine.x + machine.w / 2,
            machine.y + machine.d + 0.25,
            machine.z + 0.3,
          );
          return (
            <>
              <path className="kc-steam" d={`M${sx - 2} ${sy - 2}q-2 -3 0 -6t0 -6`} />
              <path className="kc-steam kc-steam-late" d={`M${sx + 2} ${sy - 3}q-2 -3 0 -6t0 -6`} />
            </>
          );
        })()}
      </g>
      {/* fruit bowl, jar, cups */}
      <Cylinder cx={x + 3.6} cy={y + 0.7} z={h + 0.12} r={0.45} h={0.18} color={PALETTE.white} />
      <circle
        cx={project(x + 3.5, y + 0.6, h + 0.42)[0]}
        cy={project(x + 3.5, y + 0.6, h + 0.42)[1]}
        r={3.4}
        fill={PALETTE.gold}
      />
      <circle
        cx={project(x + 3.75, y + 0.8, h + 0.4)[0]}
        cy={project(x + 3.75, y + 0.8, h + 0.4)[1]}
        r={3.2}
        fill={PALETTE.coral}
      />
      <Cylinder cx={x + 6.3} cy={y + 0.5} z={h + 0.12} r={0.22} h={0.5} color="#e6efe9" />
      <Cylinder cx={x + 4.5} cy={y + 1} z={h + 0.12} r={0.14} h={0.26} color={PALETTE.mint} />
    </g>
  );
}
