// Isometric camera for the Studio scene.
// World units: x runs to the right-down, y to the left-down, z up. One unit is about one foot.
// The camera is the classic 30 degree isometric view, so a box shows its top, its +y face (left)
// and its +x face (right). Light comes from the upper left: top lightest, left mid, right darkest.

export const UNIT = 20;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

export const WORLD = { w: 34, d: 24, wall: 5.2 } as const;

const PAD_X = 28;
const PAD_TOP = 36;
const PAD_BOTTOM = 28;

export const ORIGIN = {
  x: PAD_X + WORLD.d * UNIT * COS,
  y: PAD_TOP + WORLD.wall * UNIT,
};

export const VIEW = {
  width: Math.round((WORLD.w + WORLD.d) * UNIT * COS + PAD_X * 2),
  height: Math.round((WORLD.w + WORLD.d) * UNIT * SIN + WORLD.wall * UNIT + PAD_TOP + PAD_BOTTOM),
};

export type Pt = [number, number];

export function project(x: number, y: number, z = 0): Pt {
  return [ORIGIN.x + (x - y) * UNIT * COS, ORIGIN.y + (x + y) * UNIT * SIN - z * UNIT];
}

export function poly(points: [number, number, number][]) {
  return (
    points
      .map(([x, y, z], index) => {
        const [sx, sy] = project(x, y, z);
        return `${index === 0 ? 'M' : 'L'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
      })
      .join('') + 'Z'
  );
}

export function line(points: [number, number, number][]) {
  return points
    .map(([x, y, z], index) => {
      const [sx, sy] = project(x, y, z);
      return `${index === 0 ? 'M' : 'L'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
    })
    .join('');
}

export type Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
};

export function boxFaces({ x, y, z, w, d, h }: Box) {
  const top = poly([
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]);
  const left = poly([
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]);
  const right = poly([
    [x + w, y, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
  ]);
  return { top, left, right };
}

// A horizontal circle projects to an axis-aligned ellipse.
export function ellipseOf(cx: number, cy: number, z: number, r: number) {
  const [x, y] = project(cx, cy, z);
  return {
    cx: x,
    cy: y,
    rx: r * Math.SQRT2 * UNIT * COS,
    ry: r * Math.SQRT2 * UNIT * SIN,
  };
}

export function cylinderSide(cx: number, cy: number, z: number, r: number, h: number) {
  const bottom = ellipseOf(cx, cy, z, r);
  const top = ellipseOf(cx, cy, z + h, r);
  return `M${(bottom.cx - bottom.rx).toFixed(1)} ${top.cy.toFixed(1)}L${(bottom.cx - bottom.rx).toFixed(1)} ${bottom.cy.toFixed(1)}A${bottom.rx.toFixed(1)} ${bottom.ry.toFixed(1)} 0 0 0 ${(bottom.cx + bottom.rx).toFixed(1)} ${bottom.cy.toFixed(1)}L${(bottom.cx + bottom.rx).toFixed(1)} ${top.cy.toFixed(1)}Z`;
}

// Depth key for the painter's order: larger is nearer the viewer.
export function depthOf(x: number, y: number) {
  return x + y;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value.padEnd(6, '0');
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [200, 190, 175];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Mix toward warm ink (negative) or paper (positive). Keeps shadows warm instead of grey.
export function shade(hex: string, amount: number) {
  const base = hexToRgb(hex);
  const target: [number, number, number] = amount < 0 ? [23, 26, 26] : [255, 253, 249];
  const t = Math.abs(amount);
  return toHex([
    base[0] + (target[0] - base[0]) * t,
    base[1] + (target[1] - base[1]) * t,
    base[2] + (target[2] - base[2]) * t,
  ]);
}

export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

// FNV-1a. Deterministic per id: accessories, blink phase, idle phase.
export function hashOf(seed: string) {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.codePointAt(0)!, 16777619);
  return h >>> 0;
}

export function percentOf([sx, sy]: Pt) {
  return {
    left: `${((sx / VIEW.width) * 100).toFixed(3)}%`,
    top: `${((sy / VIEW.height) * 100).toFixed(3)}%`,
  };
}
