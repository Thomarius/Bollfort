import type { FleetLook } from '../fleetLooks.js';
import {
  FROST,
  HULLS,
  bellySail,
  drawCrew,
  drawGruntBody,
  drawHoles,
  hullPoints,
  sailHits,
  shipSize,
} from './kit.js';

/** The drawing's white line and the paper's blue, which shows through a hole. */
const LINE = 0xffffff;
const PAPER = 0x1f4f9a;

/**
 * Blueprint's fleet: a ship as its drawing — the hull's outline in white with no fill, the keel's
 * centre line dashed, frame stations across the deck, a dimension line with its ticks along the
 * starboard side — its sails the only filled shapes, in the kind's colour outlined in white, and
 * a hit leaving the paper's blue. Its grunt is drafted too: outlined, a cross-hair on its head.
 */
export const BLUEPRINT_FLEET: FleetLook = {
  key: 'blueprint',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: LINE, width: Math.max(1, tile * 0.035), join: 'round' as const };
    const fine = { color: LINE, alpha: 0.6, width: Math.max(1, tile * 0.02) };
    const hull = hullPoints(length, beam, HULLS.ship);
    g.poly(hull);
    g.fill({ color: PAPER, alpha: 0.5 });
    g.stroke(line);
    // The centre line, dashed, and the frame stations across the deck.
    for (let y = -half * 0.9; y < half; y += tile * 0.16) {
      g.moveTo(0, y).lineTo(0, Math.min(half, y + tile * 0.09));
    }
    for (const t of [0.35, 0.55, 0.75]) {
      const y = -half + t * length;
      g.moveTo(-beam * 0.4, y).lineTo(beam * 0.4, y);
    }
    // The dimension line, off the starboard side, with its ticks.
    const dx = beam / 2 + tile * 0.14;
    g.moveTo(dx, -half).lineTo(dx, half);
    for (const y of [-half, half]) g.moveTo(dx - tile * 0.06, y).lineTo(dx + tile * 0.06, y);
    g.stroke(fine);
    if (kind === 'frostship') {
      g.circle(0, -half * 0.72, beam * 0.3);
      g.fill({ color: FROST, alpha: 0.5 });
      g.stroke({ color: FROST, width: Math.max(1, tile * 0.03) });
    }
    if (kind === 'transport') drawCrew(g, tile, art, undefined, { color: LINE, width: 1 });
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      const depth = tile * 0.24;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke(line);
      drawHoles(g, 0, y - depth * 0.45, width * 0.55, sailHits(hits, m), PAPER, m);
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: LINE, width: Math.max(1, tile * 0.035) };
    drawGruntBody(g, tile, art, smashing, { outline: line, weapon: LINE, hands: LINE });
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: PAPER });
    g.stroke(line);
    g.moveTo(-tile * 0.18, 0).lineTo(tile * 0.18, 0);
    g.moveTo(0, -tile * 0.18).lineTo(0, tile * 0.18);
    g.stroke({ color: LINE, alpha: 0.7, width: Math.max(1, tile * 0.02) });
  },
};
