import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawFrostBow,
  holes,
  hullPoints,
  inset,
  sailHits,
  shifted,
  shipSize,
} from './kit.js';
import { hex } from '../theme.js';

const INK = 0x141414;
const HULL = 0xb8682e;
const HULL_LIGHT = 0xe09a52;
const DECK = 0xf0c27a;
const PLASTER = 0xf0d0a8;

/** A transport's crew, in tiles from its middle. */
const CREW = [
  [-0.14, -0.02],
  [0.14, -0.02],
  [0, 0.13],
  [0, -0.16],
] as const;

/**
 * Cartoon's fleet: a tubby boat in a thick black line over a flat offset shadow, puffed sails and
 * a shine down the hull; each hit leaves a sticking plaster on a sail. The grunt is a brute, bald
 * and broad, with a club whose knob is as big as its head.
 */
export const CARTOON_FLEET: FleetLook = {
  key: 'cartoon',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const ink = { color: INK, width: Math.max(1.5, tile * 0.065), join: 'round' as const };
    const hull = hullPoints(length * 0.96, beam * 1.08, HULLS.canoe, 14);
    g.poly(shifted(hull, tile * 0.06, tile * 0.08));
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.poly(hull);
    g.fill({ color: HULL });
    g.stroke(ink);
    g.poly(inset(hull, 0.66, 0.8));
    g.fill({ color: DECK });
    g.stroke({ color: INK, width: Math.max(1, tile * 0.035) });
    // A shine down the port side.
    g.moveTo(-beam * 0.42, -half * 0.3);
    g.lineTo(-beam * 0.44, half * 0.3);
    g.stroke({ color: HULL_LIGHT, width: Math.max(1, tile * 0.05), cap: 'round' });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.7, beam * 0.5);
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.085);
      g.fill({ color: hex(art.campaign.grunt.tunic) });
      g.stroke({ color: INK, width: Math.max(1, tile * 0.03) });
    }
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.45 : 1.6);
      const depth = tile * 0.32;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke(ink);
      // Plasters stuck over the holes.
      for (const hole of holes(width * 0.5, sailHits(hits, m), m)) {
        const x = hole.x;
        const hy = y - depth * 0.45;
        const r = tile * 0.09;
        g.poly([
          x - r,
          hy - r * 0.55,
          x - r * 0.55,
          hy - r,
          x + r,
          hy + r * 0.55,
          x + r * 0.55,
          hy + r,
        ]);
        g.fill({ color: PLASTER });
        g.stroke({ color: INK, width: Math.max(1, tile * 0.025) });
      }
    }
  },
  grunt(g, tile, art, smashing) {
    const ink = { color: INK, width: Math.max(1, tile * 0.05) };
    const club = hex(art.campaign.grunt.club);
    const skin = hex(art.campaign.grunt.skin);
    const hx = smashing ? tile * 0.03 : tile * 0.3;
    const hy = smashing ? -tile * 0.14 : -tile * 0.04;
    const tx = smashing ? 0 : hx + tile * 0.04;
    const ty = hy - (smashing ? 0.4 : 0.28) * tile;
    // A big club: the handle inked, then the knob as big as its head.
    g.moveTo(hx, hy);
    g.lineTo(tx, ty);
    g.stroke({ color: INK, width: Math.max(3, tile * 0.11), cap: 'round' });
    g.moveTo(hx, hy);
    g.lineTo(tx, ty);
    g.stroke({ color: club, width: Math.max(2, tile * 0.06), cap: 'round' });
    g.circle(tx, ty, tile * (smashing ? 0.14 : 0.12));
    g.fill({ color: club });
    g.stroke(ink);
    g.ellipse(0, tile * 0.03, tile * 0.36, tile * 0.2);
    g.fill({ color: hex(art.campaign.grunt.tunic) });
    g.stroke(ink);
    g.circle(hx, hy, tile * 0.07);
    g.fill({ color: skin });
    g.stroke(ink);
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: skin });
    g.stroke(ink);
    g.circle(-tile * 0.04, -tile * 0.04, tile * 0.03);
    g.fill({ color: 0xffffff, alpha: 0.7 });
  },
};
