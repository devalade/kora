import type { ReactNode } from 'react';
import { boxFaces, cylinderSide, ellipseOf, line, poly, project, shade, type Box } from './iso';

// Furniture for the Studio, built from boxes and cylinders with four-tone shading:
// top = base, left (+y) face a step darker, right (+x) face two steps darker, outline darkest.

export const PALETTE = {
  oak: '#e7d3b4',
  oakDeep: '#c9a77c',
  white: '#fbf8f2',
  frame: '#3a403e',
  ink: '#2a2f2e',
  sage: '#a9c7b5',
  sageDeep: '#7fa892',
  mint: '#bfe4d2',
  mintDeep: '#17795f',
  coral: '#ef5f3e',
  gold: '#e8b34a',
  terracotta: '#d4896a',
  leaf: '#5f9474',
  leafLight: '#86b394',
  leafDeep: '#3f7058',
  screen: '#eef5f1',
  glass: '#d6e9e3',
};

export function Block({
  box,
  color,
  edge = 0.9,
  children,
}: {
  box: Box;
  color: string;
  edge?: number;
  children?: ReactNode;
}) {
  const { top, left, right } = boxFaces(box);
  const stroke = shade(color, -0.42);
  return (
    <g strokeLinejoin="round">
      <path
        d={left}
        fill={shade(color, -0.07)}
        stroke={stroke}
        strokeWidth={edge}
        strokeOpacity={0.55}
      />
      <path
        d={right}
        fill={shade(color, -0.17)}
        stroke={stroke}
        strokeWidth={edge}
        strokeOpacity={0.55}
      />
      <path d={top} fill={color} stroke={stroke} strokeWidth={edge} strokeOpacity={0.55} />
      {children}
    </g>
  );
}

export function Cylinder({
  cx,
  cy,
  z,
  r,
  h,
  color,
}: {
  cx: number;
  cy: number;
  z: number;
  r: number;
  h: number;
  color: string;
}) {
  const top = ellipseOf(cx, cy, z + h, r);
  const stroke = shade(color, -0.42);
  const side = cylinderSide(cx, cy, z, r, h);
  return (
    <g>
      <path
        d={side}
        fill={shade(color, -0.08)}
        stroke={stroke}
        strokeWidth={0.9}
        strokeOpacity={0.55}
      />
      <path d={side} fill="url(#studio-cyl)" />
      <ellipse {...top} fill={color} stroke={stroke} strokeWidth={0.9} strokeOpacity={0.55} />
    </g>
  );
}

export function Shadow({
  x,
  y,
  w,
  d,
  soft = 0.35,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  soft?: number;
}) {
  return (
    <path
      d={poly([
        [x, y, 0],
        [x + w, y, 0],
        [x + w, y + d, 0],
        [x, y + d, 0],
      ])}
      fill="#171a1a"
      opacity={soft * 0.18}
      filter="url(#studio-soft)"
    />
  );
}

export function RoundShadow({
  cx,
  cy,
  r,
  opacity = 0.08,
}: {
  cx: number;
  cy: number;
  r: number;
  opacity?: number;
}) {
  const e = ellipseOf(cx, cy, 0, r);
  return <ellipse {...e} fill="#171a1a" opacity={opacity} filter="url(#studio-soft)" />;
}

// A desk seen from the sitter's side. `facing` is the direction the sitter looks:
// 'left' = toward +y (screen down-left), 'right' = toward +x (screen down-right).
export function Desk({
  x,
  y,
  facing,
  busy,
  personal,
}: {
  x: number;
  y: number;
  facing: 'left' | 'right';
  busy: boolean;
  personal: number;
}) {
  const H = 1.75;
  const top: Box =
    facing === 'left'
      ? { x: x - 1.9, y: y + 0.2, z: H - 0.14, w: 3.5, d: 1.5, h: 0.14 }
      : { x: x + 0.2, y: y - 1.9, z: H - 0.14, w: 1.5, d: 3.5, h: 0.14 };
  const legs: Box[] =
    facing === 'left'
      ? [
          {
            x: top.x + 0.12,
            y: top.y + 0.1,
            z: 0,
            w: 0.16,
            d: top.d - 0.2,
            h: H - 0.14,
          },
          {
            x: top.x + top.w - 0.28,
            y: top.y + 0.1,
            z: 0,
            w: 0.16,
            d: top.d - 0.2,
            h: H - 0.14,
          },
        ]
      : [
          {
            x: top.x + 0.1,
            y: top.y + 0.12,
            z: 0,
            w: top.w - 0.2,
            d: 0.16,
            h: H - 0.14,
          },
          {
            x: top.x + 0.1,
            y: top.y + top.d - 0.28,
            z: 0,
            w: top.w - 0.2,
            d: 0.16,
            h: H - 0.14,
          },
        ];
  const drawer: Box =
    facing === 'left'
      ? {
          x: top.x + top.w - 1.2,
          y: top.y + 0.15,
          z: H - 0.62,
          w: 0.9,
          d: top.d - 0.25,
          h: 0.48,
        }
      : {
          x: top.x + 0.15,
          y: top.y + top.d - 1.2,
          z: H - 0.62,
          w: top.w - 0.25,
          d: 0.9,
          h: 0.48,
        };
  // Monitor sits at the far end of the desk, its screen turned toward the sitter and the viewer.
  const monitor: Box =
    facing === 'left'
      ? { x: x - 1.72, y: y + 0.45, z: H + 0.32, w: 0.12, d: 1.1, h: 0.82 }
      : { x: x + 0.45, y: y - 1.72, z: H + 0.32, w: 1.1, d: 0.12, h: 0.82 };
  const keyboard: Box =
    facing === 'left'
      ? { x: x - 0.6, y: y + 0.4, z: H, w: 1.2, d: 0.42, h: 0.05 }
      : { x: x + 0.4, y: y - 0.6, z: H, w: 0.42, d: 1.2, h: 0.05 };
  const lamp = facing === 'left' ? [x + 1.15, y + 1.25] : [x + 1.25, y + 1.15];
  const mug = facing === 'left' ? [x + 1.05, y + 1.2] : [x + 1.2, y + 1.05];

  return (
    <g>
      <Shadow x={top.x + 0.1} y={top.y + 0.1} w={top.w} d={top.d} />
      {legs.map((leg, index) => (
        <Block key={index} box={leg} color={PALETTE.white} edge={0.7} />
      ))}
      <Block box={drawer} color={PALETTE.white} edge={0.7} />
      <Block box={top} color={PALETTE.oak} />
      <Block box={keyboard} color="#f6f2ea" edge={0.6} />
      <KeyRows box={keyboard} facing={facing} />
      <Monitor box={monitor} facing={facing} busy={busy} />
      {personal % 3 === 0 && (
        <Cylinder
          cx={mug[0]!}
          cy={mug[1]!}
          z={H}
          r={0.17}
          h={0.34}
          color={personal % 2 ? PALETTE.coral : PALETTE.white}
        />
      )}
      {personal % 3 === 1 && <DeskPlant cx={lamp[0]!} cy={lamp[1]!} z={H} />}
      {personal % 3 === 2 && <Notebook x={lamp[0]! - 0.4} y={lamp[1]! - 0.3} z={H} />}
    </g>
  );
}

function KeyRows({ box, facing }: { box: Box; facing: 'left' | 'right' }) {
  const z = box.z + box.h;
  const rows = [0.3, 0.55, 0.8];
  return (
    <g stroke="#c9c1b3" strokeWidth={0.6} strokeLinecap="round">
      {rows.map((t) =>
        facing === 'left' ? (
          <path
            key={t}
            d={line([
              [box.x + 0.1, box.y + box.d * t, z],
              [box.x + box.w - 0.1, box.y + box.d * t, z],
            ])}
          />
        ) : (
          <path
            key={t}
            d={line([
              [box.x + box.w * t, box.y + 0.1, z],
              [box.x + box.w * t, box.y + box.d - 0.1, z],
            ])}
          />
        ),
      )}
    </g>
  );
}

function Monitor({ box, facing, busy }: { box: Box; facing: 'left' | 'right'; busy: boolean }) {
  const stand =
    facing === 'left'
      ? {
          x: box.x - 0.05,
          y: box.y + box.d / 2 - 0.08,
          z: box.z - 0.32,
          w: 0.12,
          d: 0.16,
          h: 0.32,
        }
      : {
          x: box.x + box.w / 2 - 0.08,
          y: box.y - 0.05,
          z: box.z - 0.32,
          w: 0.16,
          d: 0.12,
          h: 0.32,
        };
  const foot =
    facing === 'left'
      ? {
          x: box.x - 0.2,
          y: box.y + box.d / 2 - 0.3,
          z: box.z - 0.36,
          w: 0.4,
          d: 0.6,
          h: 0.04,
        }
      : {
          x: box.x + box.w / 2 - 0.3,
          y: box.y - 0.2,
          z: box.z - 0.36,
          w: 0.6,
          d: 0.4,
          h: 0.04,
        };
  // The screen is the face toward the viewer on the sitter's side.
  const inset = 0.08;
  const screen =
    facing === 'left'
      ? poly([
          [box.x + box.w, box.y + inset, box.z + inset],
          [box.x + box.w, box.y + box.d - inset, box.z + inset],
          [box.x + box.w, box.y + box.d - inset, box.z + box.h - inset],
          [box.x + box.w, box.y + inset, box.z + box.h - inset],
        ])
      : poly([
          [box.x + inset, box.y + box.d, box.z + inset],
          [box.x + box.w - inset, box.y + box.d, box.z + inset],
          [box.x + box.w - inset, box.y + box.d, box.z + box.h - inset],
          [box.x + inset, box.y + box.d, box.z + box.h - inset],
        ]);
  const lines = [0.68, 0.52, 0.36].map((t, index) => {
    const z = box.z + box.h * t;
    const len = [0.62, 0.8, 0.45][index]!;
    return facing === 'left'
      ? line([
          [box.x + box.w, box.y + 0.2, z],
          [box.x + box.w, box.y + 0.2 + (box.d - 0.4) * len, z],
        ])
      : line([
          [box.x + 0.2, box.y + box.d, z],
          [box.x + 0.2 + (box.w - 0.4) * len, box.y + box.d, z],
        ]);
  });
  return (
    <g>
      <Block box={foot} color={PALETTE.frame} edge={0.5} />
      <Block box={stand} color={PALETTE.frame} edge={0.5} />
      <Block box={box} color={PALETTE.frame} edge={0.6} />
      <path d={screen} fill={busy ? PALETTE.screen : '#dfe3df'} />
      {busy && (
        <g stroke={PALETTE.mintDeep} strokeWidth={1.1} strokeLinecap="round" opacity={0.55}>
          {lines.map((d, index) => (
            <path key={index} d={d} className={index === 2 ? 'studio-caret' : undefined} />
          ))}
        </g>
      )}
    </g>
  );
}

function DeskPlant({ cx, cy, z }: { cx: number; cy: number; z: number }) {
  const [px, py] = project(cx, cy, z + 0.3);
  return (
    <g>
      <Cylinder cx={cx} cy={cy} z={z} r={0.2} h={0.3} color={PALETTE.white} />
      <g
        transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}
        stroke={PALETTE.leafDeep}
        strokeWidth={0.6}
      >
        <path d="M0 0q-6 -3 -5 -9q4 2 5 9Z" fill={PALETTE.leaf} />
        <path d="M0 0q5 -4 4 -10q-5 3 -4 10Z" fill={PALETTE.leafLight} />
        <path d="M0 0q-1 -7 1 -12q2 6 -1 12Z" fill={PALETTE.leaf} />
      </g>
    </g>
  );
}

function Notebook({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <g>
      <Block box={{ x, y, z, w: 0.7, d: 0.5, h: 0.06 }} color={PALETTE.gold} edge={0.5} />
      <path
        d={line([
          [x + 0.12, y, z + 0.06],
          [x + 0.12, y + 0.5, z + 0.06],
        ])}
        stroke="#a47622"
        strokeWidth={0.6}
      />
    </g>
  );
}

export function Chair({
  x,
  y,
  facing,
  color = '#4a5250',
}: {
  x: number;
  y: number;
  facing: 'left' | 'right';
  color?: string;
}) {
  const seat: Box = {
    x: x - 0.55,
    y: y - 0.55,
    z: 0.95,
    w: 1.1,
    d: 1.1,
    h: 0.18,
  };
  const back: Box =
    facing === 'left'
      ? { x: x - 0.55, y: y - 0.72, z: 1.1, w: 1.1, d: 0.16, h: 1.1 }
      : { x: x - 0.72, y: y - 0.55, z: 1.1, w: 0.16, d: 1.1, h: 1.1 };
  return (
    <g>
      <RoundShadow cx={x} cy={y} r={0.75} />
      <Cylinder cx={x} cy={y} z={0} r={0.38} h={0.06} color={PALETTE.frame} />
      <Block
        box={{ x: x - 0.06, y: y - 0.06, z: 0.06, w: 0.12, d: 0.12, h: 0.9 }}
        color={PALETTE.frame}
        edge={0.4}
      />
      <Block box={back} color={color} />
      <Block box={seat} color={color} />
    </g>
  );
}

export function Plant({
  cx,
  cy,
  scale = 1,
  pot = PALETTE.terracotta,
}: {
  cx: number;
  cy: number;
  scale?: number;
  pot?: string;
}) {
  const [px, py] = project(cx, cy, 1.1 * scale);
  const s = scale;
  return (
    <g>
      <RoundShadow cx={cx} cy={cy} r={0.75 * s} opacity={0.1} />
      <Cylinder cx={cx} cy={cy} z={0} r={0.48 * s} h={1.1 * s} color={pot} />
      <ellipse {...ellipseOf(cx, cy, 1.1 * s, 0.4 * s)} fill="#6d5340" />
      <g
        transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${s})`}
        stroke={PALETTE.leafDeep}
        strokeWidth={0.7}
        strokeLinejoin="round"
      >
        <path d="M0 0C-4 -8 -14 -10 -20 -6C-14 -2 -6 -1 0 0Z" fill={PALETTE.leaf} />
        <path d="M0 0C3 -9 13 -13 19 -10C15 -4 7 -1 0 0Z" fill={PALETTE.leaf} />
        <path d="M0 0C-6 -12 -6 -24 -1 -32C3 -24 3 -12 0 0Z" fill={PALETTE.leafLight} />
        <path d="M0 0C-8 -10 -16 -18 -16 -26C-9 -22 -3 -12 0 0Z" fill={PALETTE.leafLight} />
        <path d="M0 0C6 -10 13 -18 15 -26C8 -21 2 -11 0 0Z" fill={PALETTE.leaf} />
        <path
          d="M0 0C-2 -6 -8 -14 -9 -18"
          fill="none"
          stroke={PALETTE.leafDeep}
          strokeOpacity={0.5}
        />
        <path d="M0 0C1 -8 7 -16 9 -20" fill="none" stroke={PALETTE.leafDeep} strokeOpacity={0.5} />
      </g>
    </g>
  );
}

export function Sofa({ x, y, length }: { x: number; y: number; length: number }) {
  // Back against the x = 0 wall, seats facing +x.
  const color = PALETTE.sage;
  return (
    <g>
      <Shadow x={x} y={y} w={2.1} d={length} soft={0.6} />
      <Block box={{ x, y, z: 0, w: 2.1, d: length, h: 0.75 }} color={shade(color, -0.06)} />
      <Block box={{ x, y, z: 0.75, w: 0.6, d: length, h: 1.35 }} color={color} />
    </g>
  );
}

export function SofaFront({ x, y, length }: { x: number; y: number; length: number }) {
  const color = PALETTE.sage;
  const cushions = Math.round(length / 2.1);
  const each = (length - 0.5) / cushions;
  return (
    <g>
      {Array.from({ length: cushions }, (_, index) => (
        <Block
          key={index}
          box={{
            x: x + 0.6,
            y: y + 0.25 + index * each + 0.04,
            z: 0.75,
            w: 1.35,
            d: each - 0.08,
            h: 0.32,
          }}
          color={shade(color, 0.12)}
          edge={0.7}
        />
      ))}
      <Block box={{ x, y: y + length - 0.25, z: 0, w: 2.1, d: 0.5, h: 1.3 }} color={color} />
      <Block box={{ x, y: y - 0.25, z: 0, w: 2.1, d: 0.5, h: 1.3 }} color={color} />
    </g>
  );
}

export function Window({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const panes = Math.max(2, Math.round((x1 - x0) / 2));
  const step = (x1 - x0) / panes;
  return (
    <g>
      <path
        d={poly([
          [x0, 0.02, z0],
          [x1, 0.02, z0],
          [x1, 0.02, z1],
          [x0, 0.02, z1],
        ])}
        fill="#e3eeec"
        stroke="#c9d6d1"
        strokeWidth={1.4}
      />
      <path
        d={poly([
          [x0 + 0.3, 0.02, z0 + 0.25],
          [x0 + step * 0.7, 0.02, z0 + 0.25],
          [x0 + step * 0.45, 0.02, z1 - 0.25],
          [x0 + 0.3, 0.02, z1 - 0.25],
        ])}
        fill="#fffdf9"
        opacity={0.5}
      />
      {Array.from({ length: panes - 1 }, (_, index) => (
        <path
          key={index}
          d={line([
            [x0 + step * (index + 1), 0.02, z0],
            [x0 + step * (index + 1), 0.02, z1],
          ])}
          stroke="#c9d6d1"
          strokeWidth={1.6}
        />
      ))}
      <Block
        box={{
          x: x0 - 0.1,
          y: 0,
          z: z0 - 0.12,
          w: x1 - x0 + 0.2,
          d: 0.28,
          h: 0.12,
        }}
        color={PALETTE.white}
        edge={0.6}
      />
    </g>
  );
}

export function Frame({
  wall,
  at,
  z,
  w,
  h,
  children,
  color = PALETTE.white,
}: {
  wall: 'back' | 'side';
  at: number;
  z: number;
  w: number;
  h: number;
  children?: ReactNode;
  color?: string;
}) {
  const outer =
    wall === 'back'
      ? poly([
          [at, 0.03, z],
          [at + w, 0.03, z],
          [at + w, 0.03, z + h],
          [at, 0.03, z + h],
        ])
      : poly([
          [0.03, at, z],
          [0.03, at + w, z],
          [0.03, at + w, z + h],
          [0.03, at, z + h],
        ]);
  const inner =
    wall === 'back'
      ? poly([
          [at + 0.14, 0.03, z + 0.14],
          [at + w - 0.14, 0.03, z + 0.14],
          [at + w - 0.14, 0.03, z + h - 0.14],
          [at + 0.14, 0.03, z + h - 0.14],
        ])
      : poly([
          [0.03, at + 0.14, z + 0.14],
          [0.03, at + w - 0.14, z + 0.14],
          [0.03, at + w - 0.14, z + h - 0.14],
          [0.03, at + 0.14, z + h - 0.14],
        ]);
  return (
    <g>
      <path d={outer} fill={PALETTE.frame} />
      <path d={inner} fill={color} />
      {children}
    </g>
  );
}
