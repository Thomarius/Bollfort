import type { FleetLook } from '../fleetLooks.js';
import {
  FROST,
  HULLS,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  hullPoints,
  hullShadow,
  holes,
  inset,
  sailHits,
  shipSize,
} from './kit.js';

/** The night city's hull plating and its neon, as its drone's frame and rotor rings are. */
const PLATE = 0x14161e;
const PLATE_LIT = 0x2a2e3a;
const NEON = 0x2ef2ff;
const MAGENTA = 0xff2bd6;
const VOID = 0x0a0b10;

/**
 * Cyberpunk's fleet: a dark speedboat, long in the bow, edged in a cyan neon line with its glow
 * under it, carrying two holo-panels for sails — flat bars lit in the kind's colour with a halo,
 * a hit cutting a dark glitch out of one — and a magenta running light at the stern. Its grunt
 * wears a dark helmet with a lit visor and swings a neon baton.
 */
export const CYBERPUNK_FLEET: FleetLook = {
  key: 'cyberpunk',
  lantern: MAGENTA,
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam * 0.92, HULLS.sleek);
    hullShadow(g, hull, tile, 0.3);
    g.poly(hull);
    g.fill({ color: PLATE });
    g.stroke({ color: NEON, alpha: 0.3, width: Math.max(2, tile * 0.12), join: 'round' });
    g.poly(hull);
    g.stroke({ color: NEON, width: Math.max(1, tile * 0.035), join: 'round' });
    g.poly(inset(hull, 0.6, 0.8));
    g.fill({ color: PLATE_LIT });
    // A spine down the deck, the plating's seam.
    g.moveTo(0, -half * 0.6).lineTo(0, half * 0.75);
    g.stroke({ color: NEON, alpha: 0.45, width: Math.max(1, tile * 0.02) });
    if (kind === 'frostship') {
      drawFrostBow(g, -half * 0.72, beam * 0.42);
      g.moveTo(0, -half).lineTo(0, -half * 0.55);
      g.stroke({ color: FROST, width: Math.max(1, tile * 0.04) });
    }
    if (kind === 'transport') drawCrew(g, tile, art, undefined, { color: NEON, width: 1 });
    for (const [m, at] of [-0.22, 0.2].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      const depth = tile * 0.14;
      g.roundRect(-width / 2, y - depth / 2, width, depth, depth * 0.3);
      g.stroke({ color: sail, alpha: 0.35, width: Math.max(2, tile * 0.12) });
      g.roundRect(-width / 2, y - depth / 2, width, depth, depth * 0.3);
      g.fill({ color: sail });
      g.stroke({ color: 0xffffff, alpha: 0.8, width: Math.max(1, tile * 0.02) });
      // A hit glitches the panel: a dark block cut out of its light.
      for (const hole of holes(width * 0.6, sailHits(hits, m), m)) {
        g.rect(hole.x - hole.r, y - depth * 0.35, hole.r * 2, depth * 0.7);
      }
      if (sailHits(hits, m) > 0) g.fill({ color: VOID });
    }
  },
  grunt(g, tile, art, smashing) {
    drawGruntBody(g, tile, art, smashing, {
      weapon: NEON,
      weaponWidth: smashing ? 0.1 : 0.07,
      outline: { color: VOID, width: Math.max(1, tile * 0.04) },
      hands: PLATE_LIT,
    });
    g.circle(0, 0, tile * 0.14);
    g.fill({ color: PLATE });
    g.stroke({ color: PLATE_LIT, width: Math.max(1, tile * 0.03) });
    // The visor, lit across the front of the helmet.
    g.roundRect(-tile * 0.11, -tile * 0.12, tile * 0.22, tile * 0.06, tile * 0.03);
    g.fill({ color: MAGENTA });
  },
};
