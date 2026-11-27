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
  sailHits,
  shipSize,
} from './kit.js';

/** Noir's black, its lamplight white and the greys between. */
const BLACK = 0x101014;
const LAMP = 0xf6eedc;
const FELT = 0x2a2a30;
const FELT_LIT = 0x4a4a52;
const BAT = 0xb89a6a;

/**
 * Noir's fleet: a black hull edged in lamplight white, its deck hatched across in thin white
 * strokes as the style shades, two sails in the kind's colour lined in black, a hit a black hole
 * through one. Its grunt wears a fedora — a dark brim, its crown and band — and carries a bat.
 */
export const NOIR_FLEET: FleetLook = {
  key: 'noir',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile, 0.4);
    g.poly(hull);
    g.fill({ color: BLACK });
    g.stroke({ color: LAMP, width: Math.max(1, tile * 0.04), join: 'round' });
    // Hatching across the deck, each stroke inside the hull's width where it is drawn.
    const step = tile * 0.12;
    for (let y = -half * 0.55; y < half * 0.85; y += step) {
      const t = (y + half) / length;
      const w = (HULLS.ship(t) * beam) / 2 - tile * 0.1;
      if (w <= 0) continue;
      g.moveTo(-w, y + step * 0.5).lineTo(w, y - step * 0.5);
    }
    g.stroke({ color: LAMP, alpha: 0.45, width: Math.max(1, tile * 0.018) });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.7, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, { color: LAMP, width: 1 });
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      const depth = tile * 0.24;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke({ color: BLACK, width: Math.max(1, tile * 0.05), join: 'round' });
      drawHoles(g, 0, y - depth * 0.45, width * 0.55, sailHits(hits, m), BLACK, m);
    }
  },
  grunt(g, tile, art, smashing) {
    drawGruntBody(g, tile, art, smashing, {
      weapon: BAT,
      weaponWidth: smashing ? 0.13 : 0.1,
      outline: { color: LAMP, alpha: 0.7, width: Math.max(1, tile * 0.03) },
    });
    // The fedora: brim, crown, band.
    g.ellipse(0, -tile * 0.01, tile * 0.2, tile * 0.17);
    g.fill({ color: FELT });
    g.stroke({ color: LAMP, alpha: 0.6, width: Math.max(1, tile * 0.025) });
    g.ellipse(0, -tile * 0.01, tile * 0.11, tile * 0.09);
    g.fill({ color: FELT_LIT });
    g.stroke({ color: BLACK, width: Math.max(1, tile * 0.03) });
    g.moveTo(0, -tile * 0.08).lineTo(0, tile * 0.06);
    g.stroke({ color: BLACK, alpha: 0.7, width: Math.max(1, tile * 0.02) });
  },
};
