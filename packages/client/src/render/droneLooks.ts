import type { Graphics } from 'pixi.js';

import { DRONE_TILES, PARKED, type DroneLook } from './drones.js';
import { drawBat } from './spooky.js';

/*
 * The base styles' drones (`DroneLook`, the user's choices of 2026-11-20): what circles a Drone
 * Tower in each style, from above, two-thirds of a tile across. A drone is drawn in a body of the
 * style's own colours, a mark in white that takes its owner's colour, and ink over both; at that
 * size a mark has to be large to be read as a colour at all, so each takes the biggest part the
 * idea gives — a bat's halo, a gull's bandana, a crane's whole paper.
 *
 * Birds share their outline (`drawBird`), so the Wild West's vultures, in a folder of their own,
 * fly as the pigeon, the robin and the gull do.
 */

/** Half a drone's span, in pixels, at this tile size: the unit everything here is drawn in. */
export function droneHalf(tile: number): number {
  return (DRONE_TILES * tile) / 2;
}

/**
 * A line's width, `1 / (2 × per)` of the tile and never under a pixel: half what the quadcopter's
 * edges were, since these drones are made of smaller parts, and an outline of a tile's fourteenth
 * filled a pigeon's body to its middle (seen in `?drones=preview`).
 */
export function droneLine(tile: number, per = 14): number {
  return Math.max(1, tile / (per * 2));
}

/** Points given in units of `s`, as a flat list, mirrored across the x axis by `side`. */
export function scaled(s: number, points: readonly number[], side = 1): number[] {
  return points.map((v, i) => (i % 2 === 0 ? v * s : v * s * side));
}

/**
 * How far out a pair of wings reaches in this pose, 1 spread wide: a flap seen from above
 * foreshortens them, down to `1 - depth` at the top and bottom of the beat. Parked, folded.
 */
export function wingSpan(pose: number, frames: number, depth = 0.5): number {
  if (pose === PARKED) return 0;
  return 1 - depth * (0.5 - 0.5 * Math.cos((pose / frames) * Math.PI * 2));
}

/** A bird's outline, in units of half its span, nose along +x. */
export interface BirdShape {
  readonly wing: 'pointed' | 'round' | 'fingered' | 'broad';
  readonly tail: 'fan' | 'fork' | 'square' | 'short';
  /** Its body's half-width; 0.17 unless said otherwise. */
  readonly girth?: number;
}

/** The colours `drawBird` fills a bird's parts with, and its outline. */
export interface BirdColours {
  readonly wing: number;
  readonly body: number;
  readonly tail: number;
  /** Its head, drawn by `drawBird` where given; a style may draw its own head in the ink. */
  readonly head?: number;
  readonly beak?: number;
  readonly outline: number;
}

/** One wing, out to `span`, on the side `side` (1 right of its course, -1 left). */
export function wingPoints(s: number, shape: BirdShape, span: number, side: number): number[] {
  const w = Math.max(span, 0.2);
  const points: Record<BirdShape['wing'], readonly number[]> = {
    pointed: [0.18, 0.12, -0.08, w, -0.3, w * 0.72, -0.22, 0.1],
    round: [0.24, 0.12, 0.18, w * 0.7, 0.04, w, -0.18, w * 0.98, -0.36, w * 0.7, -0.3, 0.1],
    fingered: [
      0.24,
      0.12,
      0.2,
      w * 0.86,
      0.13,
      w,
      0.05,
      w * 0.9,
      -0.02,
      w * 0.99,
      -0.1,
      w * 0.88,
      -0.16,
      w * 0.95,
      -0.26,
      w * 0.8,
      -0.32,
      w * 0.45,
      -0.27,
      0.1,
    ],
    broad: [
      0.3,
      0.12,
      0.28,
      w * 0.7,
      0.14,
      w * 0.96,
      -0.08,
      w,
      -0.3,
      w * 0.84,
      -0.42,
      w * 0.5,
      -0.32,
      0.1,
    ],
  };
  return scaled(s, points[shape.wing], side);
}

/** A wing folded along the bird's side, as it perches. */
export function foldedWingPoints(s: number, side: number): number[] {
  return scaled(s, [0.28, 0.1, 0.05, 0.25, -0.35, 0.2, -0.62, 0.05, -0.3, 0.04], side);
}

/** Its tail, behind it. */
export function tailPoints(s: number, shape: BirdShape): number[] {
  const points: Record<BirdShape['tail'], readonly number[]> = {
    fan: [-0.35, -0.1, -0.78, -0.22, -0.86, 0, -0.78, 0.22, -0.35, 0.1],
    fork: [-0.35, -0.1, -0.92, -0.26, -0.62, 0, -0.92, 0.26, -0.35, 0.1],
    square: [-0.35, -0.1, -0.76, -0.14, -0.76, 0.14, -0.35, 0.1],
    short: [-0.3, -0.12, -0.6, -0.15, -0.6, 0.15, -0.3, 0.12],
  };
  return scaled(s, points[shape.tail]);
}

/**
 * A bird from above in this pose — `frames` of a wingbeat, or perched with its wings folded —
 * its tail, wings, body and, where coloured, its head and beak, each outlined.
 */
export function drawBird(
  g: Graphics,
  tile: number,
  pose: number,
  frames: number,
  shape: BirdShape,
  colours: BirdColours,
  depth = 0.5,
): void {
  const s = droneHalf(tile);
  const edge = { width: droneLine(tile, 16), color: colours.outline, join: 'round' as const };
  g.poly(tailPoints(s, shape));
  g.fill({ color: colours.tail });
  g.stroke(edge);
  const span = wingSpan(pose, frames, depth);
  for (const side of [-1, 1]) {
    g.poly(pose === PARKED ? foldedWingPoints(s, side) : wingPoints(s, shape, span, side));
    g.fill({ color: colours.wing });
    g.stroke(edge);
  }
  g.ellipse(0, 0, s * 0.5, s * (shape.girth ?? 0.17));
  g.fill({ color: colours.body });
  g.stroke(edge);
  if (colours.beak !== undefined) {
    g.poly(scaled(s, [0.55, -0.06, 0.8, 0, 0.55, 0.06]));
    g.fill({ color: colours.beak });
    g.stroke(edge);
  }
  if (colours.head !== undefined) {
    g.circle(s * 0.45, 0, s * 0.17);
    g.fill({ color: colours.head });
    g.stroke(edge);
  }
}

/** A five-pointed star of outer radius `r`, its first point up. */
export function starPoints(x: number, y: number, r: number, inner = 0.45): number[] {
  const points: number[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const d = k % 2 === 0 ? r : r * inner;
    points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return points;
}

/** Minimal: a plain disc in the owner's colour, rimmed dark, and nothing else (the user's). */
export const FLAT_DRONE: DroneLook = {
  key: 'flat',
  shadow: false,
  mark(g, tile) {
    g.circle(0, 0, droneHalf(tile) * 0.62);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    g.circle(0, 0, droneHalf(tile) * 0.62);
    g.stroke({ width: droneLine(tile, 14), color: 0x16161c });
  },
};

/*
 * Medieval's and Night's falcon, one sprite for both (the user's): pixel art on the style's own
 * pixel, a tile's sixteenth, turned only in quarter turns so its pixels stay square. Rows run
 * across its course, columns along it, beak to the right. `o` outline, `b` brown, `l` its pale
 * back, `m` the hood in its owner's colour, `k` the beak.
 */
const FALCON: Readonly<Record<'out' | 'half' | 'folded', readonly string[]>> = {
  out: [
    '...o......',
    '...ob.....',
    '..obbo....',
    '..obbbo...',
    'o.obbbbo..',
    'ooblllbmmk',
    'ooblllbmmk',
    'o.obbbbo..',
    '..obbbo...',
    '..obbo....',
    '...ob.....',
    '...o......',
  ],
  half: [
    '..........',
    '..........',
    '..oo......',
    '..obbo....',
    'o.obbbbo..',
    'ooblllbmmk',
    'ooblllbmmk',
    'o.obbbbo..',
    '..obbo....',
    '..oo......',
    '..........',
    '..........',
  ],
  folded: [
    '..........',
    '..........',
    '..........',
    '..........',
    '.oobbbbo..',
    'oobbllbmmk',
    'oobbllbmmk',
    '.oobbbbo..',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
};
const FALCON_INK: Readonly<Record<string, number>> = {
  o: 0x2a1a0e,
  b: 0x8a5a2e,
  l: 0xc89a5c,
  k: 0xe0b030,
};

function drawFalcon(g: Graphics, tile: number, pose: number, which: 'body' | 'mark'): void {
  const u = Math.max(1, Math.round(tile / 16));
  const sprite = FALCON[pose === PARKED ? 'folded' : pose === 0 ? 'out' : 'half'];
  const rows = sprite.length;
  const cols = (sprite[0] as string).length;
  const colours = which === 'mark' ? { m: 0xffffff } : FALCON_INK;
  for (const [char, colour] of Object.entries(colours)) {
    let any = false;
    sprite.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        if (row[c] !== char) continue;
        g.rect((c - cols / 2) * u, (r - rows / 2) * u, u, u);
        any = true;
      }
    });
    if (any) g.fill({ color: colour });
  }
}

export const FALCON_DRONE: DroneLook = {
  key: 'falcon',
  frames: 2,
  beatMs: 520,
  faces: true,
  turns: 4,
  pixels: 16,
  shadow: false,
  parkedScale: 1,
  body: (g, tile, pose) => drawFalcon(g, tile, pose, 'body'),
  mark: (g, tile, pose) => drawFalcon(g, tile, pose, 'mark'),
};

/** Cyberpunk keeps the quadcopter, lit: neon rotor rings in the owner's colour over a dark frame. */
export const NEON_DRONE: DroneLook = {
  key: 'neon',
  body(g, tile) {
    const s = droneHalf(tile);
    g.moveTo(-s * 0.68, -s * 0.68).lineTo(s * 0.68, s * 0.68);
    g.moveTo(s * 0.68, -s * 0.68).lineTo(-s * 0.68, s * 0.68);
    g.stroke({ width: Math.max(2, tile / 8), color: 0x14161e });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.34);
    g.fill({ color: 0x0a0b10, alpha: 0.85 });
    g.poly(hexagon(0, 0, s * 0.3));
    g.fill({ color: 0x14161e });
    g.stroke({ width: droneLine(tile, 16), color: 0x2a2e3a });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.34);
    g.stroke({ width: droneLine(tile, 6), color: 0xffffff, alpha: 0.3 });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.34);
    g.stroke({ width: droneLine(tile, 14), color: 0xffffff });
    g.circle(0, 0, s * 0.13);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    g.circle(0, 0, droneHalf(tile) * 0.06);
    g.fill({ color: 0xffffff });
  },
};

const DIAGONALS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

function hexagon(x: number, y: number, r: number): number[] {
  const points: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    points.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return points;
}

/**
 * Blueprint draws the quadcopter as a drawing: the frame in the paper's white line, the rotors
 * dashed circles in the owner's colour, and a dimension line over it. No shadow on a drawing.
 */
export const DRAWN_DRONE: DroneLook = {
  key: 'drawn',
  shadow: false,
  mark(g, tile) {
    const s = droneHalf(tile);
    for (const [x, y] of DIAGONALS) {
      const [cx, cy, r] = [x * s * 0.68, y * s * 0.68, s * 0.34];
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.arc(cx, cy, r, a, a + Math.PI / 8);
      }
    }
    g.stroke({ width: droneLine(tile, 12), color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const line = { width: droneLine(tile, 18), color: 0xeaf2ff };
    g.moveTo(-s * 0.56, -s * 0.56).lineTo(s * 0.56, s * 0.56);
    g.moveTo(s * 0.56, -s * 0.56).lineTo(-s * 0.56, s * 0.56);
    g.stroke(line);
    g.rect(-s * 0.26, -s * 0.26, s * 0.52, s * 0.52);
    g.fill({ color: 0x1d4f8a });
    g.stroke(line);
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.05);
    g.fill({ color: 0xeaf2ff });
    // The dimension line across its span, ticked at both ends.
    const top = -s * 1.12;
    g.moveTo(-s, top).lineTo(s, top);
    g.moveTo(-s, top - s * 0.12).lineTo(-s, top + s * 0.12);
    g.moveTo(s, top - s * 0.12).lineTo(s, top + s * 0.12);
    g.stroke({ ...line, alpha: 0.75 });
  },
};

/**
 * Parchment's carrier pigeon, drawn in ink, a letter rolled on its back under a wax seal in the
 * owner's colour.
 */
const PIGEON: BirdShape = { wing: 'round', tail: 'fan' };
const SEPIA = 0x3a2a1a;
export const PIGEON_DRONE: DroneLook = {
  key: 'pigeon',
  frames: 4,
  beatMs: 380,
  faces: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    drawBird(g, tile, pose, 4, PIGEON, {
      wing: 0xb8ae98,
      body: 0xd8cfb8,
      tail: 0xa89e88,
      head: 0xc8bfa8,
      beak: 0x8a7a60,
      outline: SEPIA,
    });
    // The pigeon's dark bars across each wing, as an engraver would hatch them.
    if (pose !== PARKED) {
      const span = wingSpan(pose, 4);
      for (const side of [-1, 1]) {
        for (const at of [0.45, 0.65]) {
          g.moveTo(s * 0.08, s * span * at * side).lineTo(s * -0.2, s * span * at * side);
        }
      }
      g.stroke({ width: droneLine(tile, 18), color: SEPIA });
    }
    g.roundRect(-s * 0.3, -s * 0.09, s * 0.36, s * 0.18, s * 0.06);
    g.fill({ color: 0xf2e8cc });
    g.stroke({ width: droneLine(tile, 20), color: SEPIA });
  },
  mark(g, tile) {
    g.circle(-droneHalf(tile) * 0.12, 0, droneHalf(tile) * 0.15);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    g.circle(-droneHalf(tile) * 0.12, 0, droneHalf(tile) * 0.15);
    g.stroke({ width: droneLine(tile, 20), color: SEPIA });
  },
};

/**
 * Bricks' quadcopter built of toy bricks: grey bracket arms, black propellers turning, and a
 * studded two-by-two brick on top in the owner's colour.
 */
export const BRICK_DRONE: DroneLook = {
  key: 'brick',
  frames: 2,
  beatMs: 110,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    g.moveTo(-s * 0.7, -s * 0.7).lineTo(s * 0.7, s * 0.7);
    g.moveTo(s * 0.7, -s * 0.7).lineTo(-s * 0.7, s * 0.7);
    g.stroke({ width: Math.max(2, tile / 7), color: 0x1a1a1a });
    g.moveTo(-s * 0.7, -s * 0.7).lineTo(s * 0.7, s * 0.7);
    g.moveTo(s * 0.7, -s * 0.7).lineTo(-s * 0.7, s * 0.7);
    g.stroke({ width: Math.max(1, tile / 11), color: 0x9a9ca2 });
    const turn = pose === PARKED ? Math.PI / 4 : (pose * Math.PI) / 2 + Math.PI / 6;
    for (const [x, y] of DIAGONALS) {
      const [cx, cy, r] = [x * s * 0.7, y * s * 0.7, s * 0.34];
      g.moveTo(cx - Math.cos(turn) * r, cy - Math.sin(turn) * r);
      g.lineTo(cx + Math.cos(turn) * r, cy + Math.sin(turn) * r);
    }
    g.stroke({ width: Math.max(2, tile / 10), color: 0x1c1c20, cap: 'round' });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.7, y * s * 0.7, s * 0.08);
    g.fill({ color: 0x9a9ca2 });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.roundRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76, s * 0.06);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 18), color: 0x1a1a1a, alpha: 0.8 };
    g.roundRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76, s * 0.06);
    g.stroke(edge);
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.19, y * s * 0.19, s * 0.12);
    g.stroke(edge);
    // Each stud lit on its upper left, as Bricks lights its own.
    for (const [x, y] of DIAGONALS) {
      g.arc(x * s * 0.19, y * s * 0.19, s * 0.08, Math.PI, Math.PI * 1.5);
    }
    g.stroke({ width: droneLine(tile, 20), color: 0xffffff, alpha: 0.6 });
  },
};

/** A butterfly's forewing and hindwing, out to `span`, on one side. */
function butterflyWings(s: number, span: number, side: number): [number[], number[]] {
  const w = Math.max(span, 0.15);
  return [
    scaled(
      s,
      [0.1, 0.05, 0.38, w * 0.62, 0.34, w * 0.92, 0.12, w, -0.08, w * 0.7, -0.1, 0.1],
      side,
    ),
    scaled(s, [-0.04, 0.06, -0.02, w * 0.6, -0.2, w * 0.76, -0.44, w * 0.56, -0.38, 0.1], side),
  ];
}

/** Glass's butterfly of stained glass: panes in the owner's colour, leaded, a glint on each. */
const LEAD = 0x1c1c24;
export const GLASS_BUTTERFLY: DroneLook = {
  key: 'butterfly',
  frames: 4,
  beatMs: 300,
  faces: true,
  mark(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.3 : wingSpan(pose, 4, 0.7);
    for (const side of [-1, 1]) {
      for (const wing of butterflyWings(s, span, side)) g.poly(wing);
    }
    g.fill({ color: 0xffffff, alpha: 0.92 });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.3 : wingSpan(pose, 4, 0.7);
    const lead = { width: droneLine(tile, 11), color: LEAD, join: 'round' as const };
    for (const side of [-1, 1]) {
      const [fore, hind] = butterflyWings(s, span, side);
      g.poly(fore);
      g.poly(hind);
      g.stroke(lead);
      // A came across each wing, cutting it into two panes.
      g.moveTo(s * 0.02, s * 0.08 * side).lineTo(s * 0.3, s * span * 0.93 * side);
      g.moveTo(-s * 0.06, s * 0.08 * side).lineTo(-s * 0.26, s * span * 0.67 * side);
      g.stroke({ ...lead, width: droneLine(tile, 18) });
      g.moveTo(s * 0.2, s * span * 0.45 * side).lineTo(s * 0.32, s * span * 0.7 * side);
      g.stroke({ width: droneLine(tile, 22), color: 0xffffff, alpha: 0.55 });
    }
    g.ellipse(0, 0, s * 0.36, s * 0.08);
    g.fill({ color: LEAD });
    g.moveTo(s * 0.32, -s * 0.03).lineTo(s * 0.6, -s * 0.2);
    g.moveTo(s * 0.32, s * 0.03).lineTo(s * 0.6, s * 0.2);
    g.stroke({ width: droneLine(tile, 22), color: LEAD });
  },
};

/** Chocolate's bonbon, twirling, its wrapper in the owner's colour twisted at both ends. */
const COCOA = 0x3a1e10;
function bonbon(s: number): number[][] {
  return [
    scaled(
      s,
      [-0.36, -0.08, -0.92, -0.38, -0.82, -0.12, -0.96, 0, -0.82, 0.12, -0.92, 0.38, -0.36, 0.08],
    ),
    scaled(s, [0.36, -0.08, 0.92, -0.38, 0.82, -0.12, 0.96, 0, 0.82, 0.12, 0.92, 0.38, 0.36, 0.08]),
  ];
}
export const BONBON_DRONE: DroneLook = {
  key: 'bonbon',
  spin: 2.4,
  mark(g, tile) {
    const s = droneHalf(tile);
    for (const end of bonbon(s)) g.poly(end);
    g.circle(0, 0, s * 0.44);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 16), color: COCOA, join: 'round' as const };
    for (const end of bonbon(s)) g.poly(end);
    g.stroke(edge);
    // The pleats of each twist, running in to the knot.
    for (const side of [-1, 1]) {
      for (const y of [-0.22, 0, 0.22]) g.moveTo(side * 0.84 * s, y * s).lineTo(side * 0.44 * s, 0);
    }
    g.stroke({ width: droneLine(tile, 22), color: COCOA, alpha: 0.45 });
    g.circle(0, 0, s * 0.44);
    g.stroke(edge);
    g.arc(0, 0, s * 0.3, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke({ width: droneLine(tile, 12), color: 0xffffff, alpha: 0.7, cap: 'round' });
  },
};

/**
 * Halloween's bat, wings beating, a glow of the owner's colour round it — a bat is nearly black,
 * and only a halo shows whose it is — and two yellow eyes. `drawBat` faces up the screen, so it is
 * turned a quarter to face its course.
 */
export const BAT_DRONE: DroneLook = {
  key: 'bat',
  frames: 4,
  beatMs: 260,
  faces: true,
  markUnder: true,
  mark(g, tile) {
    const s = droneHalf(tile);
    g.circle(0, 0, s * 0.95);
    g.fill({ color: 0xffffff, alpha: 0.28 });
    g.circle(0, 0, s * 0.62);
    g.fill({ color: 0xffffff, alpha: 0.4 });
  },
  body(g, tile, pose) {
    const s = droneHalf(tile);
    g.save();
    g.rotateTransform(Math.PI / 2);
    if (pose === PARKED) drawBat(g, 0, 0, s * 0.55, 0.9, 0x1a1222);
    else drawBat(g, 0, 0, s, Math.sin((pose / 4) * Math.PI * 2), 0x1a1222);
    g.restore();
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    g.circle(s * 0.08, -s * 0.06, s * 0.05);
    g.circle(s * 0.08, s * 0.06, s * 0.05);
    g.fill({ color: 0xffd84a });
  },
};

/** Sakura's paper crane, folded from paper in the owner's colour. */
function crane(s: number, span: number): number[][] {
  const w = Math.max(span, 0.25);
  return [
    scaled(s, [0.16, 0, 0, 0.1, -0.22, 0, 0, -0.1]),
    scaled(s, [0.2, 0.04, 0.12, w, -0.16, w * 0.9, -0.4, 0.04]),
    scaled(s, [0.2, -0.04, 0.12, -w, -0.16, -w * 0.9, -0.4, -0.04]),
    scaled(s, [0.08, -0.05, 0.66, -0.12, 0.88, 0.04, 0.64, -0.03, 0.08, 0.05]),
    scaled(s, [-0.16, -0.05, -0.84, 0, -0.16, 0.05]),
  ];
}
export const CRANE_DRONE: DroneLook = {
  key: 'crane',
  frames: 3,
  beatMs: 760,
  faces: true,
  mark(g, tile, pose) {
    const s = droneHalf(tile);
    for (const part of crane(s, pose === PARKED ? 0.3 : wingSpan(pose, 3, 0.55))) g.poly(part);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.3 : wingSpan(pose, 3, 0.55);
    for (const part of crane(s, span)) g.poly(part);
    g.stroke({ width: droneLine(tile, 20), color: 0x2a2030, alpha: 0.8, join: 'round' });
    // The fold down each wing, the paper's crease.
    g.moveTo(s * 0.04, 0).lineTo(-s * 0.06, s * Math.max(span, 0.25));
    g.moveTo(s * 0.04, 0).lineTo(-s * 0.06, -s * Math.max(span, 0.25));
    g.stroke({ width: droneLine(tile, 22), color: 0x2a2030, alpha: 0.35 });
  },
};

/** Oktoberfest's beer mat, spinning like a frisbee, printed in the owner's colour. */
export const BEERMAT_DRONE: DroneLook = {
  key: 'beermat',
  spin: 5,
  mark(g, tile) {
    g.circle(0, 0, droneHalf(tile) * 0.66);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    g.circle(0, 0, s * 0.66);
    g.stroke({ width: droneLine(tile, 16), color: 0x3a2a14 });
    g.circle(0, 0, s * 0.48);
    g.stroke({ width: droneLine(tile, 18), color: 0xfff8e8 });
    // The Bavarian lozenges in its middle, which show it turning.
    const d = s * 0.14;
    for (const [x, y, c] of [
      [-1, -1, 0xfff8e8],
      [1, -1, 0x3a7ac8],
      [-1, 1, 0x3a7ac8],
      [1, 1, 0xfff8e8],
    ] as const) {
      g.poly([x * d, y * d - d, x * d + d, y * d, x * d, y * d + d, x * d - d, y * d]);
      g.fill({ color: c });
    }
  },
};

/**
 * Opera's quaver, flying upright on little gilt wings: its head in the owner's colour, its stem
 * and flag in the score's black, the flag trailing as it goes.
 */
export const QUAVER_DRONE: DroneLook = {
  key: 'quaver',
  frames: 4,
  beatMs: 420,
  mirrors: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    const lift = pose === PARKED ? -0.6 : Math.sin((pose / 4) * Math.PI * 2);
    for (const side of [-1, 1]) {
      // A wing out from the stem's middle, feathered in three scallops, its tip rising and falling.
      const [x0, y0] = [s * 0.12, -s * 0.12];
      const tipX = x0 + side * s * (pose === PARKED ? 0.42 : 0.78);
      const tipY = y0 - s * (0.32 + 0.3 * lift);
      g.moveTo(x0, y0 - s * 0.08);
      g.quadraticCurveTo((x0 + tipX) / 2, tipY - s * 0.1, tipX, tipY);
      g.quadraticCurveTo(tipX - side * s * 0.1, y0 + s * 0.1, x0, y0 + s * 0.12);
      g.closePath();
    }
    g.fill({ color: 0xe0b84a });
    g.stroke({ width: droneLine(tile, 18), color: 0x6a4a12, join: 'round' });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.ellipse(-s * 0.08, s * 0.5, s * 0.28, s * 0.2);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    g.ellipse(-s * 0.08, s * 0.5, s * 0.28, s * 0.2);
    g.stroke({ width: droneLine(tile, 16), color: 0x1a1410 });
    g.moveTo(s * 0.18, s * 0.45).lineTo(s * 0.18, -s * 0.72);
    g.stroke({ width: droneLine(tile, 10), color: 0x1a1410 });
    g.moveTo(s * 0.18, -s * 0.72);
    g.quadraticCurveTo(s * 0.26, -s * 0.36, s * 0.58, -s * 0.24);
    g.quadraticCurveTo(s * 0.5, -s * 0.16, s * 0.18, -s * 0.36);
    g.closePath();
    g.fill({ color: 0x1a1410 });
  },
};

/**
 * Office's quadcopter, the one style where a drone belongs: a beige plastic gadget, and a sticky
 * note in the owner's colour stuck on top.
 */
export const OFFICE_DRONE: DroneLook = {
  key: 'office',
  body(g, tile) {
    const s = droneHalf(tile);
    g.moveTo(-s * 0.66, -s * 0.66).lineTo(s * 0.66, s * 0.66);
    g.moveTo(s * 0.66, -s * 0.66).lineTo(-s * 0.66, s * 0.66);
    g.stroke({ width: Math.max(2, tile / 7), color: 0x4a463e });
    g.moveTo(-s * 0.66, -s * 0.66).lineTo(s * 0.66, s * 0.66);
    g.moveTo(s * 0.66, -s * 0.66).lineTo(-s * 0.66, s * 0.66);
    g.stroke({ width: Math.max(1, tile / 11), color: 0xd4ccb4 });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.66, y * s * 0.66, s * 0.34);
    g.fill({ color: 0x9a968c, alpha: 0.55 });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.66, y * s * 0.66, s * 0.34);
    g.stroke({ width: droneLine(tile, 18), color: 0x4a463e });
    g.roundRect(-s * 0.36, -s * 0.3, s * 0.72, s * 0.6, s * 0.16);
    g.fill({ color: 0xe2dac4 });
    g.stroke({ width: droneLine(tile, 16), color: 0x4a463e });
  },
  mark(g, tile) {
    g.poly(stickyNote(droneHalf(tile)));
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    g.poly(stickyNote(s));
    g.stroke({ width: droneLine(tile, 22), color: 0x4a463e, alpha: 0.7 });
    g.moveTo(-s * 0.14, -s * 0.02);
    g.quadraticCurveTo(-s * 0.04, -s * 0.12, s * 0.04, 0);
    g.quadraticCurveTo(s * 0.1, s * 0.08, s * 0.16, -s * 0.04);
    g.stroke({ width: droneLine(tile, 22), color: 0x2a3a7a });
  },
};

/** A sticky note a little askew. */
function stickyNote(s: number): number[] {
  const a = -0.18;
  const r = s * 0.32;
  const points: number[] = [];
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    points.push((x * Math.cos(a) - y * Math.sin(a)) * r, (x * Math.sin(a) + y * Math.cos(a)) * r);
  }
  return points;
}

/** Under the sea's squid, swimming in pulses: mantle first, its arms trailing and gathering. */
const SQUID_INK = 0x10203a;
function squidPulse(pose: number): number {
  return pose === PARKED ? 0 : Math.cos((pose / 4) * Math.PI * 2);
}
function squidMantle(s: number, pose: number): number[] {
  const k = 1 + 0.14 * squidPulse(pose);
  const points = [
    0.88, 0, 0.7, -0.12, 0.62, -0.13, 0.42, -0.36, 0.34, -0.19, 0.12, -0.26, -0.04, -0.2, -0.04,
    0.2, 0.12, 0.26, 0.34, 0.19, 0.42, 0.36, 0.62, 0.13, 0.7, 0.12,
  ];
  return scaled(
    s,
    points.map((v, i) => (i % 2 === 1 ? v * k : v)),
  );
}
/** Its arms: four short and thick, two long tentacles, spread wide after a pulse. */
function squidArms(
  g: Graphics,
  s: number,
  tile: number,
  pose: number,
  colour: number,
  more = 0,
): void {
  const spread = pose === PARKED ? 0.2 : 0.6 + 0.4 * squidPulse(pose);
  for (const y of [-0.13, -0.045, 0.045, 0.13]) {
    g.moveTo(0, y * s);
    g.quadraticCurveTo(-s * 0.26, y * s * (1 + spread), -s * 0.5, y * s * (1 + spread * 1.8));
  }
  g.stroke({ width: droneLine(tile, 6) + more, color: colour, cap: 'round' });
  for (const side of [-1, 1]) {
    g.moveTo(0, side * s * 0.03);
    g.quadraticCurveTo(-s * 0.5, side * s * 0.05, -s * 0.9, side * s * (0.06 + spread * 0.22));
  }
  g.stroke({ width: droneLine(tile, 12) + more, color: colour, cap: 'round' });
}
export const SQUID_DRONE: DroneLook = {
  key: 'squid',
  frames: 4,
  beatMs: 720,
  faces: true,
  body(g, tile, pose) {
    // The arms' outline: the same strokes dark and wider, under the mark's.
    squidArms(g, droneHalf(tile), tile, pose, SQUID_INK, droneLine(tile, 10) * 2);
  },
  mark(g, tile, pose) {
    const s = droneHalf(tile);
    squidArms(g, s, tile, pose, 0xffffff);
    g.poly(squidMantle(s, pose));
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    g.poly(squidMantle(s, pose));
    g.stroke({ width: droneLine(tile, 10), color: SQUID_INK, join: 'round' });
    for (const [x, y] of [
      [0.55, 0.04],
      [0.36, -0.08],
      [0.24, 0.1],
    ] as const) {
      g.circle(x * s, y * s, s * 0.045);
    }
    g.fill({ color: SQUID_INK, alpha: 0.3 });
    for (const side of [-1, 1]) g.circle(s * 0.04, side * s * 0.15, s * 0.08);
    g.fill({ color: 0xffffff });
    g.stroke({ width: droneLine(tile, 20), color: SQUID_INK });
    for (const side of [-1, 1]) g.circle(s * 0.05, side * s * 0.16, s * 0.04);
    g.fill({ color: SQUID_INK });
  },
};

/** Electric's ball lightning: a glow in the owner's colour round a white-hot core, crackling. */
export const BALL_LIGHTNING: DroneLook = {
  key: 'balllightning',
  frames: 4,
  beatMs: 260,
  shadow: false,
  mark(g, tile) {
    const s = droneHalf(tile);
    g.circle(0, 0, s * 0.85);
    g.fill({ color: 0xffffff, alpha: 0.22 });
    g.circle(0, 0, s * 0.58);
    g.fill({ color: 0xffffff, alpha: 0.5 });
    g.circle(0, 0, s * 0.38);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    g.circle(0, 0, s * 0.2);
    g.fill({ color: 0xffffff });
    // Three arcs out from the core, jagged, in new places every frame.
    const p = pose === PARKED ? 0 : pose;
    for (let k = 0; k < 3; k++) {
      const a = p * 1.7 + (k * Math.PI * 2) / 3;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      g.moveTo(cos * s * 0.2, sin * s * 0.2);
      for (let j = 1; j <= 4; j++) {
        const d = s * (0.2 + j * 0.19);
        const off = s * 0.12 * (j % 2 === 0 ? 1 : -1) * (k % 2 === 0 ? 1 : -1);
        g.lineTo(cos * d - sin * off, sin * d + cos * off);
      }
    }
    g.stroke({ width: droneLine(tile, 16), color: 0xffffff, join: 'round' });
  },
};

/**
 * The Cartoon's biplane from above, inked round: its wings and tail in the owner's colour with a
 * white star on each wing, its propeller a blur.
 */
const INKED = 0x141414;
export const BIPLANE_DRONE: DroneLook = {
  key: 'biplane',
  frames: 2,
  beatMs: 90,
  faces: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    const ink = { width: droneLine(tile, 12), color: INKED, join: 'round' as const };
    g.poly(scaled(s, [0.56, -0.12, 0.62, 0, 0.56, 0.12, -0.72, 0.07, -0.78, 0, -0.72, -0.07]));
    g.fill({ color: 0xfffaf0 });
    g.stroke(ink);
    g.ellipse(s * 0.66, 0, s * 0.06, s * 0.42);
    g.fill({ color: 0x8a8a8a, alpha: 0.45 });
    const blade = pose === 0 ? 0.42 : 0.3;
    g.moveTo(s * 0.66, -s * blade).lineTo(s * 0.66, s * blade);
    g.stroke({ width: droneLine(tile, 12), color: INKED, alpha: 0.6, cap: 'round' });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.roundRect(-s * 0.1, -s * 0.96, s * 0.36, s * 1.92, s * 0.14);
    g.roundRect(-s * 0.74, -s * 0.34, s * 0.2, s * 0.68, s * 0.08);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const ink = { width: droneLine(tile, 12), color: INKED, join: 'round' as const };
    g.roundRect(-s * 0.1, -s * 0.96, s * 0.36, s * 1.92, s * 0.14);
    g.roundRect(-s * 0.74, -s * 0.34, s * 0.2, s * 0.68, s * 0.08);
    g.stroke(ink);
    for (const side of [-1, 1]) g.poly(starPoints(s * 0.08, side * s * 0.62, s * 0.13));
    g.fill({ color: 0xffffff });
    g.circle(-s * 0.3, 0, s * 0.09);
    g.fill({ color: INKED });
  },
};

/**
 * Christmas's robin: a brown bird whose red breast is the owner's colour, plump enough that it
 * shows each side of its head.
 */
const ROBIN: BirdShape = { wing: 'round', tail: 'square', girth: 0.24 };
export const ROBIN_DRONE: DroneLook = {
  key: 'robin',
  frames: 4,
  beatMs: 240,
  faces: true,
  body(g, tile, pose) {
    drawBird(g, tile, pose, 4, ROBIN, {
      wing: 0x6a4a2e,
      body: 0x8a6a46,
      tail: 0x5a3e26,
      outline: 0x2a1a10,
    });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.ellipse(s * 0.3, 0, s * 0.3, s * 0.27);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 16), color: 0x2a1a10 };
    g.ellipse(s * 0.3, 0, s * 0.3, s * 0.27);
    g.stroke(edge);
    g.circle(s * 0.52, 0, s * 0.15);
    g.fill({ color: 0x8a6a46 });
    g.stroke(edge);
    g.poly(scaled(s, [0.64, -0.05, 0.82, 0, 0.64, 0.05]));
    g.fill({ color: 0x2a1a10 });
  },
};

/** A moth's forewing and hindwing on one side, broad and blunt. */
function mothWings(s: number, span: number, side: number): [number[], number[]] {
  const w = Math.max(span, 0.2);
  return [
    scaled(s, [0.18, 0.06, 0.12, w, -0.14, w * 0.9, -0.12, 0.08], side),
    scaled(s, [-0.06, 0.08, -0.14, w * 0.72, -0.4, w * 0.5, -0.32, 0.06], side),
  ];
}
/** Noir's moth, fluttering unsteadily as round a streetlamp, eyespots in the owner's colour. */
export const MOTH_DRONE: DroneLook = {
  key: 'moth',
  frames: 3,
  beatMs: 150,
  faces: true,
  wobble: 0.12,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.35 : wingSpan(pose, 3, 0.6);
    const edge = { width: droneLine(tile, 18), color: 0x2a2826, join: 'round' as const };
    for (const side of [-1, 1]) {
      const [fore, hind] = mothWings(s, span, side);
      g.poly(hind);
      g.fill({ color: 0x8a8680 });
      g.stroke(edge);
      g.poly(fore);
      g.fill({ color: 0xb8b4aa });
      g.stroke(edge);
      g.moveTo(s * 0.06, s * 0.1 * side).lineTo(s * 0.06, s * span * 0.85 * side);
      g.moveTo(s * 0.02, s * 0.1 * side).lineTo(s * -0.1, s * span * 0.8 * side);
      g.stroke({ width: droneLine(tile, 24), color: 0x4a4844 });
    }
  },
  mark(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.35 : wingSpan(pose, 3, 0.6);
    for (const side of [-1, 1]) g.circle(-s * 0.02, s * span * 0.6 * side, s * 0.13);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    const span = pose === PARKED ? 0.35 : wingSpan(pose, 3, 0.6);
    for (const side of [-1, 1]) g.circle(-s * 0.02, s * span * 0.6 * side, s * 0.13);
    g.stroke({ width: droneLine(tile, 22), color: 0x1a1816 });
    for (const side of [-1, 1]) g.circle(-s * 0.02, s * span * 0.6 * side, s * 0.05);
    g.fill({ color: 0x1a1816 });
    g.ellipse(0, 0, s * 0.32, s * 0.1);
    g.fill({ color: 0x2a2826 });
    g.moveTo(s * 0.28, -s * 0.04).lineTo(s * 0.5, -s * 0.18);
    g.moveTo(s * 0.28, s * 0.04).lineTo(s * 0.5, s * 0.18);
    g.stroke({ width: droneLine(tile, 22), color: 0x2a2826 });
  },
};

/**
 * Sports' broadcast camera drone (the user's): a white shell on arms in the owner's colour, its
 * rotors guarded, the camera's gimbal at its nose and the red light that says it is live.
 */
export const CAMERA_DRONE: DroneLook = {
  key: 'camera',
  faces: true,
  body(g, tile) {
    const s = droneHalf(tile);
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.62, y * s * 0.62, s * 0.32);
    g.fill({ color: 0x8a8e96, alpha: 0.5 });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.moveTo(-s * 0.62, -s * 0.62).lineTo(s * 0.62, s * 0.62);
    g.moveTo(s * 0.62, -s * 0.62).lineTo(-s * 0.62, s * 0.62);
    g.stroke({ width: Math.max(2, tile / 8), color: 0xffffff });
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.62, y * s * 0.62, s * 0.34);
    g.stroke({ width: droneLine(tile, 12), color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 18), color: 0x2a2c30 };
    for (const [x, y] of DIAGONALS) g.circle(x * s * 0.62, y * s * 0.62, s * 0.4);
    g.stroke(edge);
    g.roundRect(-s * 0.4, -s * 0.22, s * 0.76, s * 0.44, s * 0.2);
    g.fill({ color: 0xf2f2f2 });
    g.stroke(edge);
    g.circle(s * 0.42, 0, s * 0.14);
    g.fill({ color: 0x1c1e22 });
    g.circle(s * 0.45, -s * 0.03, s * 0.05);
    g.fill({ color: 0x6ab0ff });
    g.circle(-s * 0.22, 0, s * 0.06);
    g.fill({ color: 0xff3030 });
  },
};

/** The Pirates' gull, in a bandana of the owner's colour, polka-dotted. */
const GULL: BirdShape = { wing: 'pointed', tail: 'square' };
export const GULL_DRONE: DroneLook = {
  key: 'gull',
  frames: 4,
  beatMs: 560,
  faces: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    drawBird(
      g,
      tile,
      pose,
      4,
      GULL,
      { wing: 0xb8c0c8, body: 0xf4f4f0, tail: 0xf4f4f0, head: 0xf4f4f0, outline: 0x3a3e44 },
      0.35,
    );
    if (pose === PARKED) return;
    // The black tips of a gull's wings.
    const span = wingSpan(pose, 4, 0.35);
    for (const side of [-1, 1]) {
      g.poly(scaled(s, [-0.02, span * 0.78, -0.08, span, -0.24, span * 0.78], side));
    }
    g.fill({ color: 0x1a1a1a });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.circle(s * 0.42, 0, s * 0.19);
    g.poly(scaled(s, [0.3, -0.05, 0.08, -0.2, 0.12, -0.04, 0.08, 0.12, 0.3, 0.05]));
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 18), color: 0x3a3e44, join: 'round' as const };
    g.circle(s * 0.42, 0, s * 0.19);
    g.stroke(edge);
    for (const [x, y] of [
      [0.36, -0.08],
      [0.48, 0.07],
      [0.32, 0.09],
    ] as const) {
      g.circle(x * s, y * s, s * 0.035);
    }
    g.fill({ color: 0xffffff });
    g.poly(scaled(s, [0.58, -0.05, 0.84, 0, 0.58, 0.05]));
    g.fill({ color: 0xe8b830 });
    g.stroke(edge);
  },
};

/**
 * The Anime's mascot familiar: a round puff in the owner's colour on little angel wings, big
 * shining eyes and a blush, held upright and facing the player as such a creature always is.
 */
const ANIME_INK = 0x2a2440;
export const MASCOT_DRONE: DroneLook = {
  key: 'mascot',
  frames: 4,
  beatMs: 420,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    const bob = pose === PARKED ? 0 : Math.sin((pose / 4) * Math.PI * 2) * s * 0.06;
    const lift = pose === PARKED ? -0.5 : Math.sin((pose / 4) * Math.PI * 2);
    for (const side of [-1, 1]) {
      const [x0, y0] = [side * s * 0.36, -s * 0.06 + bob];
      const tip = { x: side * s * (pose === PARKED ? 0.68 : 0.98), y: y0 - s * (0.3 + 0.3 * lift) };
      g.moveTo(x0, y0 - s * 0.1);
      g.quadraticCurveTo(x0 + side * s * 0.2, tip.y - s * 0.1, tip.x, tip.y);
      g.quadraticCurveTo(
        tip.x - side * s * 0.02,
        y0 + s * 0.06,
        x0 + side * s * 0.36,
        y0 + s * 0.14,
      );
      g.quadraticCurveTo(x0 + side * s * 0.2, y0 + s * 0.2, x0, y0 + s * 0.14);
      g.closePath();
    }
    g.fill({ color: 0xffffff });
    g.stroke({ width: droneLine(tile, 18), color: ANIME_INK, join: 'round' });
  },
  mark(g, tile, pose) {
    const s = droneHalf(tile);
    const bob = pose === PARKED ? 0 : Math.sin((pose / 4) * Math.PI * 2) * s * 0.06;
    g.circle(0, bob, s * 0.48);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    const bob = pose === PARKED ? 0 : Math.sin((pose / 4) * Math.PI * 2) * s * 0.06;
    g.circle(0, bob, s * 0.48);
    g.stroke({ width: droneLine(tile, 14), color: ANIME_INK });
    for (const side of [-1, 1]) g.ellipse(side * s * 0.18, bob - s * 0.02, s * 0.09, s * 0.13);
    g.fill({ color: ANIME_INK });
    for (const side of [-1, 1]) g.circle(side * s * 0.18 - s * 0.03, bob - s * 0.07, s * 0.04);
    g.fill({ color: 0xffffff });
    for (const side of [-1, 1]) g.ellipse(side * s * 0.3, bob + s * 0.14, s * 0.08, s * 0.04);
    g.fill({ color: 0xff7aa8, alpha: 0.7 });
    g.moveTo(-s * 0.06, bob + s * 0.16);
    g.quadraticCurveTo(-s * 0.03, bob + s * 0.22, 0, bob + s * 0.16);
    g.quadraticCurveTo(s * 0.03, bob + s * 0.22, s * 0.06, bob + s * 0.16);
    g.moveTo(0, bob - s * 0.48);
    g.quadraticCurveTo(s * 0.1, bob - s * 0.7, s * 0.2, bob - s * 0.62);
    g.stroke({ width: droneLine(tile, 20), color: ANIME_INK, cap: 'round' });
  },
};

/**
 * Mythology's owl of Athena, in black-figure: black on the vase's red, its feathers and eyes
 * incised, a band across its wings in the owner's colour.
 */
const OWL: BirdShape = { wing: 'broad', tail: 'short', girth: 0.22 };
const BLACK_FIGURE = 0x1a1410;
const INCISED = 0xd07a48;
export const OWL_DRONE: DroneLook = {
  key: 'owl',
  frames: 4,
  beatMs: 620,
  faces: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    drawBird(g, tile, pose, 4, OWL, {
      wing: BLACK_FIGURE,
      body: BLACK_FIGURE,
      tail: BLACK_FIGURE,
      outline: BLACK_FIGURE,
    });
    g.circle(s * 0.36, 0, s * 0.25);
    g.fill({ color: BLACK_FIGURE });
  },
  mark(g, tile, pose) {
    if (pose === PARKED) return;
    const s = droneHalf(tile);
    const span = wingSpan(pose, 4);
    for (const side of [-1, 1]) {
      g.poly(scaled(s, [0.16, 0.2, 0.14, span * 0.8, 0.02, span * 0.86, 0.02, 0.2], side));
    }
    g.fill({ color: 0xffffff });
  },
  ink(g, tile, pose) {
    const s = droneHalf(tile);
    const cut = { width: droneLine(tile, 22), color: INCISED };
    if (pose !== PARKED) {
      const span = wingSpan(pose, 4);
      for (const side of [-1, 1]) {
        g.moveTo(-s * 0.1, s * 0.2 * side).lineTo(-s * 0.14, s * span * 0.8 * side);
        g.moveTo(-s * 0.22, s * 0.18 * side).lineTo(-s * 0.26, s * span * 0.6 * side);
      }
      g.stroke(cut);
    }
    for (const side of [-1, 1]) g.circle(s * 0.42, side * s * 0.1, s * 0.07);
    g.stroke(cut);
    for (const side of [-1, 1]) g.circle(s * 0.42, side * s * 0.1, s * 0.025);
    g.fill({ color: INCISED });
  },
};

/** The look a base style's theme brings, by its id: what `Theme.drone` answers. */
export const BASE_DRONES = {
  flat: FLAT_DRONE,
  pixel: FALCON_DRONE,
  night: FALCON_DRONE,
  cyberpunk: NEON_DRONE,
  blueprint: DRAWN_DRONE,
  parchment: PIGEON_DRONE,
  bricks: BRICK_DRONE,
  glass: GLASS_BUTTERFLY,
  chocolate: BONBON_DRONE,
  halloween: BAT_DRONE,
  sakura: CRANE_DRONE,
  oktoberfest: BEERMAT_DRONE,
  opera: QUAVER_DRONE,
  office: OFFICE_DRONE,
  undersea: SQUID_DRONE,
  electric: BALL_LIGHTNING,
  cartoon: BIPLANE_DRONE,
  christmas: ROBIN_DRONE,
  noir: MOTH_DRONE,
  sports: CAMERA_DRONE,
  pirates: GULL_DRONE,
  anime: MASCOT_DRONE,
  mythology: OWL_DRONE,
} as const satisfies Record<string, DroneLook>;
