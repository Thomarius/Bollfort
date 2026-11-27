import type { Graphics } from 'pixi.js';

import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';

/** The power station's verdigris, porcelain insulators, copper windings and a spark's blue. */
const VERDIGRIS = 0x4f8a78;
const VERDIGRIS_DARK = 0x2a4a40;
const PORCELAIN = 0xe8ecf0;
const COPPER = 0xc87a3a;
const COPPER_DARK = 0x7a4420;
const SPARK = 0x9fe8ff;
const INK = 0x0a0e1c;

/** A lightning bolt across a sail at (0, y), `size` tall: the style's mark, in ink. */
function bolt(g: Graphics, y: number, size: number): void {
  const s = size;
  g.poly([
    s * 0.15,
    y - s * 0.5,
    -s * 0.25,
    y + s * 0.05,
    0,
    y + s * 0.05,
    -s * 0.15,
    y + s * 0.5,
    s * 0.25,
    y - s * 0.08,
    0,
    y - s * 0.08,
  ]);
  g.fill({ color: INK });
}

/**
 * Electric's fleet: a riveted hull in verdigris with porcelain rivets along its gunwale, a copper
 * coil standing amidships between two sails with a bolt on each — the frost ship's bow glowing
 * cold — and a grunt in a brass-goggled cap with a rod that sparks at its tip.
 */
export const ELECTRIC_FLEET: FleetLook = {
  key: 'electric',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile, 0.3);
    g.poly(hull);
    g.fill({ color: VERDIGRIS });
    g.stroke({ color: INK, width: Math.max(1, tile * 0.04), join: 'round' });
    const deck = inset(hull, 0.74, 0.86);
    g.poly(deck);
    g.fill({ color: VERDIGRIS_DARK });
    // Rivets along the gunwale, between the deck's edge and the hull's.
    for (let k = 0; k < hull.length; k += 4) {
      const x = ((hull[k] as number) + (deck[k] as number)) / 2;
      const y = ((hull[k + 1] as number) + (deck[k + 1] as number)) / 2;
      g.circle(x, y, Math.max(0.8, tile * 0.025));
    }
    g.fill({ color: PORCELAIN });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.7, beam * 0.45);
    if (kind === 'transport')
      drawCrew(g, tile, art, [
        [-0.16, 0.1],
        [0.16, 0.1],
        [0, -0.17],
      ]);
    // The coil amidships: copper rings round a porcelain core.
    const coil = tile * 0.16;
    g.circle(0, 0, coil);
    g.fill({ color: COPPER_DARK });
    for (const r of [0.85, 0.6]) {
      g.circle(0, 0, coil * r);
      g.stroke({ color: COPPER, width: Math.max(1, tile * 0.03) });
    }
    g.circle(0, 0, coil * 0.3);
    g.fill({ color: PORCELAIN });
    for (const [m, at] of [-0.26, 0.26].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      const depth = tile * 0.24;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke({ color: INK, width: Math.max(1, tile * 0.035), join: 'round' });
      bolt(g, y - depth * 0.45, depth * 0.75);
      drawHoles(g, 0, y - depth * 0.45, width * 0.55, sailHits(hits, m), INK, m);
    }
  },
  grunt(g, tile, art, smashing) {
    drawGruntBody(g, tile, art, smashing, {
      weapon: COPPER,
      weaponWidth: 0.07,
      outline: { color: INK, width: Math.max(1, tile * 0.035) },
    });
    // The rod's spark, at its tip.
    const tip = smashing ? [tile * 0.02, -tile * 0.6] : [tile * 0.28, -tile * 0.39];
    g.circle(tip[0] as number, tip[1] as number, tile * 0.07);
    g.fill({ color: SPARK, alpha: 0.5 });
    g.circle(tip[0] as number, tip[1] as number, tile * 0.035);
    g.fill({ color: 0xffffff });
    g.circle(0, 0, tile * 0.14);
    g.fill({ color: VERDIGRIS_DARK });
    g.stroke({ color: INK, width: Math.max(1, tile * 0.03) });
    // Goggles over the front of the cap.
    for (const side of [-1, 1]) g.circle(side * tile * 0.055, -tile * 0.08, tile * 0.045);
    g.fill({ color: COPPER });
    for (const side of [-1, 1]) g.circle(side * tile * 0.055, -tile * 0.08, tile * 0.022);
    g.fill({ color: SPARK });
  },
};
