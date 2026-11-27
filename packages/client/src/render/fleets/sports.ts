import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  drawFrostBow,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';
import { hex } from '../theme.js';

const HULL = 0xf2f2f0;
const DECK = 0xc8ccd2;
const STRIPE_A = 0x1f4aa8;
const STRIPE_B = 0xd8282e;
const INK = 0x1a1c22;
const BAT = 0xd8b070;
const HELMET = 0x2a2e3a;

/** A transport's crew, along its rails, in tiles from its middle. */
const CREW = [
  [-0.17, -0.06],
  [0.17, -0.06],
  [-0.17, 0.14],
  [0.17, 0.14],
] as const;

/** Points moved along the ship, towards its stern. */
function aft(points: readonly number[], by: number): number[] {
  return points.map((v, i) => (i % 2 === 1 ? v + by : v));
}

/**
 * Sports' fleet: racing yachts, white hulls with two stripes down their middle and a race
 * number's roundel, the mainsail furled on its boom and a spinnaker ballooning out ahead of the
 * bow, holed by the hits; the grunt a helmeted batter, its bat on its shoulder or swung.
 */
export const SPORTS_FLEET: FleetLook = {
  key: 'sports',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = {
      color: INK,
      alpha: 0.6,
      width: Math.max(1, tile * 0.03),
      join: 'round' as const,
    };
    // The hull sits aft, the spinnaker ahead of it within the ship's length.
    const back = length * 0.08;
    const hull = aft(hullPoints(length * 0.84, beam * 0.9, HULLS.sleek), back);
    hullShadow(g, hull, tile, 0.2);
    g.poly(hull);
    g.fill({ color: HULL });
    g.stroke(line);
    g.poly(aft(inset(hullPoints(length * 0.84, beam * 0.9, HULLS.sleek), 0.66, 0.8), back));
    g.fill({ color: DECK });
    for (const [x, colour] of [
      [-0.08, STRIPE_A],
      [0.08, STRIPE_B],
    ] as const) {
      g.moveTo(x * beam, -half * 0.55 + back);
      g.lineTo(x * beam, half * 0.88);
      g.stroke({ color: colour, width: Math.max(1, beam * 0.1) });
    }
    // The roundel and its number, a 1 in ink.
    const ry = half * 0.5;
    g.circle(0, ry, tile * 0.13);
    g.fill({ color: 0xffffff });
    g.stroke(line);
    g.moveTo(-tile * 0.03, ry - tile * 0.04);
    g.lineTo(tile * 0.01, ry - tile * 0.07);
    g.lineTo(tile * 0.01, ry + tile * 0.07);
    g.stroke({ color: INK, width: Math.max(1, tile * 0.035) });
    // The boom along the deck, the mainsail furled on it.
    g.moveTo(0, -half * 0.2);
    g.lineTo(0, half * 0.22);
    g.stroke({ color: sail, width: Math.max(2, tile * 0.1), cap: 'round' });
    g.stroke({ color: INK, alpha: 0.3, width: Math.max(1, tile * 0.02) });
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.07);
      g.fill({ color: hex(art.campaign.grunt.tunic) });
      g.stroke(line);
    }
    // The spinnaker, ballooning ahead of the bow.
    const sy = -half * 0.5;
    const sw = beam * 1.45;
    const sd = tile * 0.42;
    g.moveTo(-sw / 2, sy);
    g.bezierCurveTo(-sw * 0.55, sy - sd * 1.3, sw * 0.55, sy - sd * 1.3, sw / 2, sy);
    g.quadraticCurveTo(0, sy - sd * 0.3, -sw / 2, sy);
    g.closePath();
    g.fill({ color: sail });
    g.stroke(line);
    g.moveTo(0, sy - sd * 0.25);
    g.lineTo(0, sy - sd * 0.95);
    g.stroke({ color: INK, alpha: 0.25, width: Math.max(1, tile * 0.02) });
    if (kind === 'frostship') drawFrostBow(g, sy - sd * 0.6, beam * 0.4);
    drawHoles(g, 0, sy - sd * 0.6, sw * 0.5, sailHits(hits, 0, 1), INK, 0);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, alpha: 0.6, width: Math.max(1, tile * 0.035) };
    const hx = smashing ? tile * 0.04 : tile * 0.24;
    const hy = smashing ? -tile * 0.12 : -tile * 0.02;
    const tx = smashing ? tile * 0.02 : tile * 0.12;
    const ty = smashing ? -tile * 0.6 : tile * 0.3;
    // The bat, thick at its end: on the shoulder, or swung up ahead.
    g.moveTo(hx, hy);
    g.lineTo(tx, ty);
    g.stroke({ color: BAT, width: Math.max(2, tile * 0.06), cap: 'round' });
    g.moveTo(hx + (tx - hx) * 0.5, hy + (ty - hy) * 0.5);
    g.lineTo(tx, ty);
    g.stroke({ color: BAT, width: Math.max(3, tile * 0.11), cap: 'round' });
    g.ellipse(0, tile * 0.02, tile * 0.3, tile * 0.17);
    g.fill({ color: hex(art.campaign.grunt.tunic) });
    g.stroke(line);
    g.circle(hx, hy, tile * 0.055);
    g.fill({ color: 0x2a2a2a });
    // The helmet, a white stripe over its crown and its face guard ahead.
    g.circle(0, 0, tile * 0.15);
    g.fill({ color: HELMET });
    g.stroke(line);
    g.moveTo(0, -tile * 0.13);
    g.lineTo(0, tile * 0.13);
    g.stroke({ color: 0xffffff, width: Math.max(1, tile * 0.035) });
    g.moveTo(-tile * 0.1, -tile * 0.14);
    g.quadraticCurveTo(0, -tile * 0.24, tile * 0.1, -tile * 0.14);
    g.stroke({ color: DECK, width: Math.max(1, tile * 0.03) });
  },
};
