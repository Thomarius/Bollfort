import { hex } from '../theme.js';
import type { FleetLook } from '../fleetLooks.js';
import {
  FROST,
  HULLS,
  drawCrew,
  drawGruntBody,
  holes,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';

/** The lead between panes, clear glass and its shine. */
const LEAD = 0x24262e;
const CLEAR = 0xd8eef8;
const SHINE = 0xffffff;

/**
 * Glass's fleet: a hull of clear glass, the sea showing through it, its rim and a long highlight
 * down one side catching the light; its sails stained-glass windows, each three panes of the
 * kind's colour in lead, a hit cracking a pane dark. The frost ship's bow is a block of ice. Its
 * grunt is a glass figurine: a red-glass body, a clear head, each with its shine.
 */
export const GLASS_FLEET: FleetLook = {
  key: 'glass',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile, 0.18);
    g.poly(hull);
    g.fill({ color: CLEAR, alpha: 0.45 });
    g.stroke({ color: SHINE, alpha: 0.9, width: Math.max(1, tile * 0.04), join: 'round' });
    g.poly(inset(hull, 0.7, 0.84));
    g.fill({ color: CLEAR, alpha: 0.35 });
    // The shine down its port side.
    g.moveTo(-beam * 0.3, -half * 0.45).lineTo(-beam * 0.3, half * 0.65);
    g.stroke({ color: SHINE, alpha: 0.8, width: Math.max(1, tile * 0.05), cap: 'round' });
    if (kind === 'frostship') {
      g.poly([0, -half, beam * 0.3, -half * 0.55, 0, -half * 0.4, -beam * 0.3, -half * 0.55]);
      g.fill({ color: FROST, alpha: 0.85 });
      g.stroke({ color: SHINE, width: Math.max(1, tile * 0.03) });
    }
    if (kind === 'transport') drawCrew(g, tile, art, undefined, { color: LEAD, width: 1 });
    for (const [m, at] of [-0.24, 0.24].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      const depth = tile * 0.2;
      const top = y - depth / 2;
      g.roundRect(-width / 2, top, width, depth, depth * 0.25);
      g.fill({ color: sail, alpha: 0.92 });
      // Cracked panes, darkened where the hits went in.
      const pane = width / 3;
      for (const hole of holes(width * 0.75, sailHits(hits, m), m)) {
        const k = Math.max(0, Math.min(2, Math.floor((hole.x + width / 2) / pane)));
        g.rect(-width / 2 + k * pane, top, pane, depth);
      }
      if (sailHits(hits, m) > 0) g.fill({ color: LEAD, alpha: 0.6 });
      g.rect(-width / 2 + pane * 0.2, top + depth * 0.2, pane * 0.5, depth * 0.2);
      g.fill({ color: SHINE, alpha: 0.55 });
      g.roundRect(-width / 2, top, width, depth, depth * 0.25);
      for (const k of [1, 2])
        g.moveTo(-width / 2 + k * pane, top).lineTo(-width / 2 + k * pane, top + depth);
      g.stroke({ color: LEAD, width: Math.max(1, tile * 0.04), join: 'round' });
    }
  },
  grunt(g, tile, art, smashing) {
    drawGruntBody(g, tile, art, smashing, {
      weapon: CLEAR,
      outline: { color: SHINE, alpha: 0.85, width: Math.max(1, tile * 0.03) },
      hands: CLEAR,
    });
    g.ellipse(-tile * 0.15, -tile * 0.02, tile * 0.07, tile * 0.04);
    g.fill({ color: SHINE, alpha: 0.5 });
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: hex(art.campaign.grunt.tunic), alpha: 0.5 });
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: CLEAR, alpha: 0.7 });
    g.stroke({ color: SHINE, width: Math.max(1, tile * 0.03) });
    g.circle(-tile * 0.045, -tile * 0.045, tile * 0.035);
    g.fill({ color: SHINE });
  },
};
