import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  drawFrostBow,
  drawGruntBody,
  holes,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';
import { hex } from '../theme.js';

const COCOA = 0x24100a;
const MILK = 0x45220f;
const WAFER = 0xd9a860;
const WAFER_LINE = 0xb07e3a;
const GINGER = 0xb8743a;
const ICING = 0xfff6ea;

/** A transport's gingerbread crew, in tiles from its middle. */
const CREW = [
  [-0.14, 0],
  [0.14, 0],
  [0, 0.14],
  [0, -0.14],
] as const;

/**
 * Chocolate's fleet: a hull of milk chocolate scored along its sides, a wafer deck, and its sails
 * sweets in their wrappers, twisted at both ends; a hit takes a bite out of one. The grunt is a
 * gingerbread man in a red tunic with a rolling pin.
 */
export const CHOCOLATE_FLEET: FleetLook = {
  key: 'chocolate',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length, beam, HULLS.barge);
    hullShadow(g, hull, tile, 0.25);
    g.poly(hull);
    g.fill({ color: MILK });
    g.stroke({ color: COCOA, width: Math.max(1, tile * 0.04), join: 'round' });
    g.poly(inset(hull, 0.7, 0.88));
    g.fill({ color: WAFER });
    // The wafer's grid, and the bar's scoring round it.
    const w = beam * 0.35;
    for (let k = -2; k <= 2; k++) {
      g.moveTo(-w, (k * half) / 3);
      g.lineTo(w, (k * half) / 3);
    }
    g.moveTo(0, -half * 0.8);
    g.lineTo(0, half * 0.8);
    g.stroke({ color: WAFER_LINE, width: Math.max(1, tile * 0.02) });
    for (const side of [-1, 1]) {
      for (let k = -3; k <= 3; k++) {
        g.moveTo(side * beam * 0.36, (k * half) / 4);
        g.lineTo(side * beam * 0.5, (k * half) / 4);
      }
    }
    g.stroke({ color: COCOA, width: Math.max(1, tile * 0.025) });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.75, beam * 0.45);
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.075);
      g.fill({ color: GINGER });
      g.stroke({ color: hex(art.campaign.grunt.tunic), width: Math.max(1, tile * 0.035) });
    }
    for (const [m, at] of [-0.25, 0.25].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.05 : 1.2);
      const depth = tile * 0.24;
      const flare = tile * 0.17;
      // A wrapper: the sweet's body, its twisted ends flaring out either side.
      for (const side of [-1, 1]) {
        const x = (side * width) / 2;
        g.poly([
          x - side * flare * 0.3,
          y,
          x + side * flare,
          y - depth * 0.6,
          x + side * flare,
          y + depth * 0.6,
        ]);
      }
      g.roundRect(-width / 2, y - depth / 2, width, depth, depth / 2);
      g.fill({ color: sail });
      g.stroke({ color: COCOA, alpha: 0.6, width: Math.max(1, tile * 0.025) });
      g.moveTo(-width * 0.33, y - depth * 0.18);
      g.lineTo(width * 0.33, y - depth * 0.18);
      g.stroke({ color: 0xffffff, alpha: 0.55, width: Math.max(1, tile * 0.035), cap: 'round' });
      // A bite out of the wrapper's front edge where a hit took it.
      const bites = sailHits(hits, m);
      if (bites > 0) {
        for (const hole of holes(width * 0.7, bites, m)) {
          g.circle(hole.x, y - depth * 0.5, Math.max(hole.r, tile * 0.08));
        }
        g.fill({ color: COCOA });
      }
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: COCOA, width: Math.max(1, tile * 0.035) };
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: WAFER,
      weaponWidth: smashing ? 0.14 : 0.12,
      hands: GINGER,
    });
    g.circle(0, 0, tile * 0.14);
    g.fill({ color: GINGER });
    g.stroke(line);
    // Iced eyes looking ahead, and a squiggle of icing behind them.
    for (const side of [-1, 1]) g.circle(side * tile * 0.05, -tile * 0.06, tile * 0.025);
    g.fill({ color: ICING });
    g.moveTo(-tile * 0.09, tile * 0.04);
    g.quadraticCurveTo(0, tile * 0.1, tile * 0.09, tile * 0.04);
    g.stroke({ color: ICING, width: Math.max(1, tile * 0.025) });
  },
};
