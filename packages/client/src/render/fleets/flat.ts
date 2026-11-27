import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  drawPennant,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';

/** Minimal's ink and its hulls' greys: flat shapes in the style's one dark line. */
const INK = 0x16161c;
const HULL = 0x5a5f6a;
const DECK = 0x9aa0aa;

/**
 * Minimal's fleet: the shared ship pared down — a hull and a deck in two greys, two bellied sails,
 * one ink line round each — and a grunt as a disc with a head, as its drone is a disc.
 */
export const FLAT_FLEET: FleetLook = {
  key: 'flat',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1, tile * 0.04), join: 'round' as const };
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile, 0.18);
    g.poly(hull);
    g.fill({ color: HULL });
    g.stroke(line);
    g.poly(inset(hull, 0.72, 0.84));
    g.fill({ color: DECK });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.7, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art);
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      bellySail(g, y, width, tile * 0.24);
      g.fill({ color: sail });
      g.stroke(line);
      drawHoles(g, 0, y - tile * 0.1, width * 0.55, sailHits(hits, m), INK, m);
    }
    drawPennant(g, -0.24 * length - tile * 0.1, tile, sail);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.04) };
    drawGruntBody(g, tile, art, smashing, { outline: line, weapon: INK });
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: 0xffffff });
    g.stroke(line);
  },
};
