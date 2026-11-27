import type { Graphics } from 'pixi.js';

import type { FleetLook } from '../fleetLooks.js';
import { HULLS, drawFrostBow, hullPoints, hullShadow, inset, sailHits, shipSize } from './kit.js';
import { hex } from '../theme.js';

const HULL = 0x2a2430;
const DECK = 0x463c50;
const BONE = 0xeee6d2;
const SOCKET = 0x1a1420;
const GHOST = 0x7dff6a;

/** A transport's crew, skulls in red hoods, in tiles from its middle. */
const CREW = [
  [-0.15, -0.02],
  [0.15, -0.02],
  [0, 0.12],
  [0, -0.16],
] as const;

/**
 * A ragged sail across the beam at `y`: bellied as any, but its trailing edge torn into tatters,
 * deeper ones by the hits taken.
 */
function raggedSail(g: Graphics, y: number, width: number, depth: number, tears: number): void {
  const w = width / 2;
  const n = 6;
  g.moveTo(-w, y);
  g.bezierCurveTo(-w * 0.6, y - depth * 1.33, w * 0.6, y - depth * 1.33, w, y);
  for (let k = n - 1; k >= 0; k--) {
    const torn = (k * 5 + 2) % n < tears;
    g.lineTo(-w + (width * (k + 0.5)) / n, y - depth * (torn ? 0.8 : 0.3));
    g.lineTo(-w + (width * k) / n, y);
  }
  g.closePath();
}

/**
 * Halloween's fleet: ghost ships, dark hulls rimmed in a sickly green with ragged sails torn
 * deeper by every hit, a wisp at the bow and a green lantern at the stern; the grunt a skeleton
 * in the red tunic, swinging a bone.
 */
export const HALLOWEEN_FLEET: FleetLook = {
  key: 'halloween',
  lantern: GHOST,
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile, 0.35);
    g.poly(hull);
    g.fill({ color: HULL });
    g.stroke({ color: GHOST, alpha: 0.45, width: Math.max(1, tile * 0.03), join: 'round' });
    g.poly(inset(hull, 0.7, 0.84));
    g.fill({ color: DECK });
    // Broken planks across the deck.
    for (const y of [-0.1, 0.05, 0.36]) {
      g.moveTo(-beam * 0.3, y * length);
      g.lineTo(beam * 0.25, y * length + tile * 0.04);
    }
    g.stroke({ color: HULL, width: Math.max(1, tile * 0.03) });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, beam * 0.45);
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.075);
      g.fill({ color: hex(art.campaign.grunt.tunic) });
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.04);
      g.fill({ color: BONE });
    }
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      raggedSail(g, y, width, tile * 0.28, sailHits(hits, m) * 2);
      g.fill({ color: sail, alpha: 0.9 });
      g.stroke({ color: SOCKET, alpha: 0.6, width: Math.max(1, tile * 0.025) });
    }
    if (kind !== 'frostship') {
      g.circle(0, -half * 0.6, tile * 0.09);
      g.fill({ color: GHOST, alpha: 0.5 });
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: SOCKET, width: Math.max(1, tile * 0.035) };
    const hx = smashing ? tile * 0.04 : tile * 0.26;
    const hy = smashing ? -tile * 0.12 : -tile * 0.05;
    const tx = smashing ? tile * 0.02 : hx + tile * 0.02;
    const ty = hy - (smashing ? 0.5 : 0.36) * tile;
    // A bone, its knuckles at both ends.
    g.moveTo(hx, hy);
    g.lineTo(tx, ty);
    g.stroke({ color: BONE, width: Math.max(2, tile * 0.07), cap: 'round' });
    for (const [x, y] of [
      [hx, hy],
      [tx, ty],
    ] as const) {
      g.circle(x - tile * 0.035, y, tile * 0.045);
      g.circle(x + tile * 0.035, y, tile * 0.045);
    }
    g.fill({ color: BONE });
    g.ellipse(0, tile * 0.02, tile * 0.3, tile * 0.17);
    g.fill({ color: hex(art.campaign.grunt.tunic) });
    g.stroke(line);
    // The skull, its sockets looking ahead.
    g.circle(0, -tile * 0.01, tile * 0.14);
    g.fill({ color: BONE });
    g.stroke(line);
    for (const side of [-1, 1]) g.circle(side * tile * 0.055, -tile * 0.08, tile * 0.035);
    g.fill({ color: SOCKET });
  },
};
