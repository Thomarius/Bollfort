import type { Graphics, StrokeStyle } from 'pixi.js';
import type { ArtConfig, ShipKind } from '@bollfort/config';

import { hex } from '../theme.js';

/*
 * What the styles' ships and grunts are drawn with (CAMPAIGN CA15): every style's own drawing of
 * the enemy, made of the same measures, so the kinds keep their sizes and their sails' colours
 * (`art.campaign.sails`) in every look, and a grunt keeps its dark red tunic (§14.2, §14.3). A
 * ship is drawn bow up, centred on the origin, and turned to its heading by the campaign layer;
 * a grunt facing up, turned to its facing. Both are stamps, drawn once per tile size.
 */

/** A ship's measures at this tile size, in pixels, and its sail's colour. */
export interface ShipSize {
  readonly length: number;
  readonly beam: number;
  /** Half its length: the bow is at `-half`, the stern at `half`. */
  readonly half: number;
  readonly sail: number;
}

/** The beam by kind, in tiles: a transport the widest, as the design asks. */
const BEAMS: Record<ShipKind, number> = { raider: 0.7, transport: 0.86, frostship: 0.74 };

export function shipSize(tile: number, art: ArtConfig, kind: ShipKind): ShipSize {
  const length = 1.7 * tile * art.campaign.lengths[kind];
  return {
    length,
    beam: BEAMS[kind] * tile,
    half: length / 2,
    sail: hex(art.campaign.sails[kind]),
  };
}

/**
 * A hull's half-width along it, `t` from 0 at the bow to 1 at the stern, as a fraction of half
 * the beam. The forms the styles choose between.
 */
export type HullForm = (t: number) => number;

export const HULLS = {
  /** A sailing ship: a pointed bow, full amidships, a square stern. */
  ship: (t: number) => (t < 0.32 ? Math.sin((t / 0.32) * (Math.PI / 2)) : t > 0.9 ? 0.92 : 1),
  /** Pointed at both ends, a canoe's or a trireme's. */
  canoe: (t: number) => Math.sin(t * Math.PI) ** 0.6,
  /** Blunt all round, a barge's or a bathtub's. */
  barge: (t: number) => {
    const e = Math.min(t, 1 - t) / 0.18;
    return e >= 1 ? 1 : Math.sqrt(1 - (1 - e) ** 2);
  },
  /** A long point and a narrow stern: fast. */
  sleek: (t: number) => (t < 0.5 ? Math.sin((t / 0.5) * (Math.PI / 2)) : 1 - (t - 0.5) * 0.5),
  /** A junk's: a broad squared bow, curving to a high square stern. */
  junk: (t: number) => (t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : t > 0.88 ? 0.8 : 1),
} as const satisfies Record<string, HullForm>;

/**
 * The outline of a hull of this length and beam, as a flat list of points, bow up: `steps`
 * points a side, so a style's hull is as round as it needs and no rounder.
 */
export function hullPoints(length: number, beam: number, form: HullForm, steps = 12): number[] {
  const half = length / 2;
  const right: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    right.push((Math.max(0, form(t)) * beam) / 2, -half + t * length);
  }
  const left: number[] = [];
  for (let k = right.length - 2; k >= 0; k -= 2)
    left.push(-(right[k] as number), right[k + 1] as number);
  return [...right, ...left];
}

/** Points scaled about the origin: a deck inside its hull. */
export function inset(points: readonly number[], fx: number, fy = fx): number[] {
  return points.map((v, i) => v * (i % 2 === 0 ? fx : fy));
}

/** Points moved: a shadow beside what casts it. */
export function shifted(points: readonly number[], dx: number, dy: number): number[] {
  return points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
}

/** A hull's shadow on the water, down and to the right, as every style's light falls. */
export function hullShadow(
  g: Graphics,
  points: readonly number[],
  tile: number,
  alpha = 0.25,
): void {
  g.poly(shifted(points, tile * 0.05, tile * 0.07));
  g.fill({ color: 0x000000, alpha });
}

/**
 * A square sail across the beam at `y`, seen from above: its yard straight across and the cloth
 * bellied towards the bow by the wind behind it, `width` across and `depth` deep at its middle.
 * Left as a path to fill.
 */
export function bellySail(g: Graphics, y: number, width: number, depth: number): Graphics {
  const w = width / 2;
  g.moveTo(-w, y);
  g.bezierCurveTo(-w * 0.6, y - depth * 1.33, w * 0.6, y - depth * 1.33, w, y);
  g.closePath();
  return g;
}

/**
 * Where the hits have marked a sail `width` across centred on (x, y): a few spots each, the same
 * for every ship and spread across it, so two hits read as worse than one.
 */
export function holes(
  width: number,
  hits: number,
  salt = 0,
): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (let h = 0; h < hits; h++) {
    const k = h * 7 + salt * 3;
    out.push({
      x: (((k % 9) - 4) / 9) * width,
      y: ((((k * 5) % 7) - 3) / 7) * 0.08 * width,
      r: width * (0.06 + 0.02 * ((k + 1) % 3)),
    });
  }
  return out;
}

/** A ship's hits shared between its sails, the fore one (`sail` 0) marked first. */
export function sailHits(hits: number, sail: number, sails = 2): number {
  return Math.floor((hits + sails - 1 - sail) / sails);
}

/** The hits' marks on a sail, as holes of `colour` (the sea or a deck under, or char). */
export function drawHoles(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  hits: number,
  colour: number,
  salt = 0,
): void {
  if (hits <= 0) return;
  for (const hole of holes(width, hits, salt)) g.circle(x + hole.x, y + hole.y, hole.r);
  g.fill({ color: colour });
}

/** The soldiers a transport carries on its deck, waiting to land: heads in the grunts' tunic. */
export function drawCrew(
  g: Graphics,
  tile: number,
  art: ArtConfig,
  at: readonly (readonly [number, number])[] = CREW,
  outline?: StrokeStyle,
): void {
  for (const [x, y] of at) g.circle(x * tile, y * tile, tile * 0.075);
  g.fill({ color: hex(art.campaign.grunt.tunic) });
  if (outline !== undefined) g.stroke(outline);
}

/** The crew's places on a transport's deck, in tiles from its middle. */
export const CREW: readonly (readonly [number, number])[] = [
  [-0.15, -0.02],
  [0.15, -0.02],
  [0, 0.12],
  [0, -0.16],
];

/** A frost ship's cold glow at its bow, `y` along it. */
export function drawFrostBow(g: Graphics, y: number, r: number): void {
  g.circle(0, y, r);
  g.fill({ color: FROST, alpha: 0.4 });
  g.circle(0, y, r * 0.5);
  g.fill({ color: FROST, alpha: 0.6 });
}

export const FROST = 0xbfeaff;

/** A pennant streaming astern from a masthead at `y`, in the sail's colour. */
export function drawPennant(g: Graphics, y: number, tile: number, colour: number): void {
  g.poly([0, y, tile * 0.1, y + tile * 0.32, -tile * 0.02, y + tile * 0.26]);
  g.fill({ color: colour });
}

/** A grunt's measures at this tile size: its shoulders, its head. */
export interface GruntSize {
  readonly shoulders: number;
  readonly depth: number;
  readonly head: number;
}

export function gruntSize(tile: number): GruntSize {
  return { shoulders: tile * 0.3, depth: tile * 0.17, head: tile * 0.14 };
}

/**
 * A grunt's body, facing up: shoulders in the dark red tunic every style keeps, hands, and its
 * weapon held out at its right — or swung up ahead of it as it smashes. The head is the style's,
 * drawn after. `weapon` colours it; `long` lengthens it for a spear or a pole.
 */
export function drawGruntBody(
  g: Graphics,
  tile: number,
  art: ArtConfig,
  smashing: boolean,
  options: {
    weapon?: number;
    weaponWidth?: number;
    long?: number;
    outline?: StrokeStyle;
    hands?: number;
  } = {},
): void {
  const s = gruntSize(tile);
  const weapon = options.weapon ?? hex(art.campaign.grunt.club);
  const hx = smashing ? tile * 0.04 : s.shoulders * 0.85;
  const hy = smashing ? -tile * 0.12 : -tile * 0.05;
  const tip = weaponTip(tile, smashing, options.long);
  g.moveTo(hx, hy);
  g.lineTo(tip.x, tip.y);
  g.stroke({
    color: weapon,
    width: Math.max(2, tile * (options.weaponWidth ?? (smashing ? 0.12 : 0.09))),
    cap: 'round',
  });
  g.ellipse(0, tile * 0.02, s.shoulders, s.depth);
  g.fill({ color: hex(art.campaign.grunt.tunic) });
  g.stroke(options.outline ?? { color: 0x000000, alpha: 0.45, width: Math.max(1, tile * 0.035) });
  g.circle(hx, hy, tile * 0.055);
  g.fill({ color: options.hands ?? hex(art.campaign.grunt.skin) });
}

/**
 * Where a grunt's weapon ends, held out or raised (`drawGruntBody`'s measures), so a style can put
 * a blade's tip, a stein or a spearhead on it. `long` as given to the body.
 */
export function weaponTip(tile: number, smashing: boolean, long = 1): { x: number; y: number } {
  const reach = (smashing ? 0.48 : 0.34) * long;
  const hy = smashing ? -tile * 0.12 : -tile * 0.05;
  return {
    x: smashing ? tile * 0.02 : gruntSize(tile).shoulders * 0.85 + tile * 0.02,
    y: hy - reach * tile,
  };
}
