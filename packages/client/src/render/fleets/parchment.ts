import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawFrostBow,
  drawGruntBody,
  drawPennant,
  holes,
  hullPoints,
  inset,
  sailHits,
  shipSize,
} from './kit.js';
import { hex } from '../theme.js';

/** An old chart's sepia ink and the vellum its hulls are left in. */
const SEPIA = 0x3a2a1a;
const VELLUM = 0xd8c49a;
const WASH = 0xb89868;

/**
 * Parchment's fleet: a ship as a chart-maker inks one in the margin — a washed hull with its
 * planks ruled in sepia, sails bellied with a fold line drawn through them, tears inked round
 * where the hits went — and a grunt in ink with a pike.
 */
export const PARCHMENT_FLEET: FleetLook = {
  key: 'parchment',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: SEPIA, width: Math.max(1, tile * 0.045), join: 'round' as const };
    const thin = { color: SEPIA, width: Math.max(1, tile * 0.025), alpha: 0.7 };
    const hull = hullPoints(length, beam, HULLS.ship);
    g.poly(hull);
    g.fill({ color: WASH });
    // Planks ruled along the hull, either side of the deck.
    for (const side of [-1, 1]) {
      g.moveTo(side * beam * 0.36, -half * 0.45);
      g.lineTo(side * beam * 0.36, half * 0.85);
    }
    g.stroke(thin);
    g.poly(hull);
    g.stroke(line);
    g.poly(inset(hull, 0.62, 0.82));
    g.fill({ color: VELLUM });
    g.stroke(thin);
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, beam * 0.42);
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.07);
      g.fill({ color: hex(art.campaign.grunt.tunic) });
      g.stroke(thin);
    }
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      const depth = tile * 0.28;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke(line);
      // The fold the wind makes, drawn through the cloth as an engraver would.
      g.moveTo(-width * 0.36, y - depth * 0.2);
      g.quadraticCurveTo(0, y - depth * 1.0, width * 0.36, y - depth * 0.2);
      g.stroke(thin);
      const torn = sailHits(hits, m);
      if (torn > 0) {
        for (const hole of holes(width * 0.5, torn, m)) {
          g.circle(hole.x, y - depth * 0.5 + hole.y, hole.r);
        }
        g.fill({ color: WASH });
        g.stroke(line);
      }
    }
    drawPennant(g, -0.24 * length - tile * 0.12, tile, sail);
    g.stroke(thin);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: SEPIA, width: Math.max(1, tile * 0.04) };
    drawGruntBody(g, tile, art, smashing, { outline: line, weapon: SEPIA, long: 1.3 });
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: VELLUM });
    g.stroke(line);
    // A morion's crest, front to back.
    g.moveTo(0, -tile * 0.13);
    g.lineTo(0, tile * 0.13);
    g.stroke(line);
  },
};

const CREW = [
  [-0.13, -0.02],
  [0.13, -0.02],
  [0, 0.13],
] as const;
