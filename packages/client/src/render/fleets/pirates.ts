import type { Graphics } from 'pixi.js';

import type { FleetLook } from '../fleetLooks.js';
import { hex } from '../theme.js';
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

/** The Pirates' woods, as its stockades and galleon are drawn, and its dark outline. */
const WOOD = 0x8a5a30;
const WOOD_DARK = 0x5a3a1e;
const DECK = 0xb88a56;
const INK = 0x2a1a0e;
const STEEL = 0xd0d4dc;
const BANDANA = 0x1c1c2c;

/** A small skull on a sail at (x, y), `r` its skull's radius: the Jolly Roger's, in ink. */
function skull(g: Graphics, x: number, y: number, r: number): void {
  g.circle(x, y, r);
  g.rect(x - r * 0.55, y + r * 0.6, r * 1.1, r * 0.6);
  g.fill({ color: INK });
  for (const side of [-1, 1]) g.circle(x + side * r * 0.4, y - r * 0.05, r * 0.28);
  g.fill({ color: 0xf4f1e8 });
}

/**
 * The Pirates' fleet: galleons of three masts, a raised stern castle and a bowsprit, a skull on
 * the mainsail; the grunt a buccaneer in a dark bandana with a cutlass.
 */
export const PIRATES_FLEET: FleetLook = {
  key: 'pirates',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1, tile * 0.035), join: 'round' as const };
    // The bowsprit, out over the water ahead.
    g.moveTo(0, -half + tile * 0.1);
    g.lineTo(0, -half - tile * 0.18);
    g.stroke({ color: WOOD_DARK, width: Math.max(1.5, tile * 0.05), cap: 'round' });
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: WOOD });
    g.stroke(line);
    g.poly(inset(hull, 0.74, 0.86));
    g.fill({ color: DECK });
    // Planks along the deck.
    for (const x of [-0.16, 0, 0.16]) {
      g.moveTo(x * beam, -half * 0.55);
      g.lineTo(x * beam, half * 0.8);
    }
    g.stroke({ color: WOOD, width: Math.max(1, tile * 0.02), alpha: 0.7 });
    // The stern castle, raised over the deck.
    g.rect(-beam * 0.4, half * 0.66, beam * 0.8, half * 0.28);
    g.fill({ color: WOOD_DARK });
    g.stroke(line);
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, line);
    // Fore, main and mizzen; the main the widest, with the skull.
    const masts = [
      { at: -0.3, width: 1.25, depth: 0.2 },
      { at: -0.02, width: 1.6, depth: 0.26 },
      { at: 0.24, width: 1.2, depth: 0.18 },
    ];
    for (const [m, mast] of masts.entries()) {
      const y = mast.at * length;
      const width = beam * mast.width;
      bellySail(g, y, width, tile * mast.depth);
      g.fill({ color: sail });
      g.stroke(line);
      if (m === 1) skull(g, 0, y - tile * 0.12, tile * 0.07);
      drawHoles(g, 0, y - tile * 0.08, width * 0.55, sailHits(hits, m, 3), INK, m);
    }
    drawPennant(g, -0.02 * length - tile * 0.12, tile, sail);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.035) };
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: STEEL,
      weaponWidth: 0.07,
      long: 1.1,
    });
    // The cutlass's guard at the hand.
    const hand = smashing
      ? { x: tile * 0.04, y: -tile * 0.12 }
      : { x: tile * 0.255, y: -tile * 0.05 };
    g.circle(hand.x, hand.y - tile * 0.06, tile * 0.045);
    g.fill({ color: 0xd4a838 });
    // A head with a dark bandana over its back, its knot trailing.
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: hex(art.campaign.grunt.skin) });
    g.stroke(line);
    g.arc(0, 0, tile * 0.13, Math.PI * 0.05, Math.PI * 0.95);
    g.lineTo(0, -tile * 0.02);
    g.closePath();
    g.fill({ color: BANDANA });
    g.poly([0, tile * 0.12, -tile * 0.07, tile * 0.24, tile * 0.03, tile * 0.22]);
    g.fill({ color: BANDANA });
  },
};
