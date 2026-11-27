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
  weaponTip,
} from './kit.js';

/** The opera house's colours: black lacquer, gilt, the stage's dark wood, a mask's white. */
const LACQUER = 0x1e1418;
const GILT = 0xd4a838;
const GILT_DARK = 0x8a6a1e;
const DECK = 0x6a4430;
const MASK = 0xf4ecdc;
const HAT = 0x18141a;
const RAPIER = 0xdfe3ea;

/**
 * The Opera's fleet: gilded baroque ships — a black lacquered hull edged in gold, scrolls down its
 * sides, a gilt figure at the bow and a gilded stern gallery; sails hung as drapery, a tassel at
 * each corner. The grunt a Venetian masker in a bicorne, its long white beak ahead, with a rapier.
 */
export const OPERA_FLEET: FleetLook = {
  key: 'opera',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const ink = { color: LACQUER, width: Math.max(1, tile * 0.035), join: 'round' as const };
    const gilt = { color: GILT, width: Math.max(1, tile * 0.045), join: 'round' as const };
    const hull = hullPoints(length, beam, HULLS.ship);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: LACQUER });
    g.stroke(gilt);
    g.poly(inset(hull, 0.74, 0.86));
    g.fill({ color: DECK });
    g.stroke({ color: GILT_DARK, width: Math.max(1, tile * 0.02) });
    // Scrolls of gilt down each side.
    for (const y of [-0.3, -0.05, 0.2, 0.45]) {
      for (const side of [-1, 1]) {
        g.circle(side * beam * 0.43, y * half, tile * 0.04);
      }
    }
    g.stroke({ color: GILT, width: Math.max(1, tile * 0.022) });
    // The figurehead and the stern gallery, gilt.
    g.circle(0, -half + tile * 0.12, tile * 0.06);
    g.fill({ color: GILT });
    g.roundRect(-beam * 0.42, half * 0.72, beam * 0.84, half * 0.22, tile * 0.05);
    g.fill({ color: GILT });
    g.stroke(ink);
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, ink);
    // Draped sails, a gilt tassel at each yardarm.
    for (const [m, at] of [-0.26, 0.2].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      bellySail(g, y, width, tile * 0.24);
      g.fill({ color: sail });
      g.stroke(ink);
      // The drape's folds.
      for (const x of [-0.18, 0.18]) {
        g.moveTo(x * width, y - tile * 0.02);
        g.lineTo(x * width * 0.9, y - tile * 0.15);
      }
      g.stroke({ color: LACQUER, width: Math.max(1, tile * 0.018), alpha: 0.45 });
      for (const side of [-1, 1]) g.circle((side * width) / 2, y, tile * 0.045);
      g.fill({ color: GILT });
      drawHoles(g, 0, y - tile * 0.1, width * 0.55, sailHits(hits, m), LACQUER, m);
    }
    drawPennant(g, -0.26 * length - tile * 0.1, tile, sail);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: LACQUER, width: Math.max(1, tile * 0.035) };
    const long = 1.4;
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: RAPIER,
      weaponWidth: 0.04,
      long,
    });
    // The rapier's gilt guard at the hand.
    const tip = weaponTip(tile, smashing, long);
    const hand = smashing ? tile * 0.04 : tile * 0.255;
    const handY = smashing ? -tile * 0.12 : -tile * 0.05;
    g.circle(hand + (tip.x - hand) * 0.12, handY + (tip.y - handY) * 0.12, tile * 0.05);
    g.fill({ color: GILT });
    // The mask's beak ahead, under a bicorne across the head, edged in gilt.
    g.poly([-tile * 0.05, -tile * 0.06, 0, -tile * 0.27, tile * 0.05, -tile * 0.06]);
    g.fill({ color: MASK });
    g.stroke({ color: LACQUER, width: Math.max(1, tile * 0.02) });
    g.ellipse(0, tile * 0.01, tile * 0.22, tile * 0.1);
    g.fill({ color: HAT });
    g.stroke({ color: GILT, width: Math.max(1, tile * 0.03) });
    g.circle(0, -tile * 0.02, tile * 0.03);
    g.fill({ color: GILT });
  },
};
