import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
  weaponTip,
} from './kit.js';

/** Sakura's woodblock colours: sumi ink, red lacquer, pale cedar, a hat's straw. */
const INK = 0x2a1e1a;
const LACQUER = 0xa8322a;
const CEDAR = 0xd8b888;
const ROOF = 0x3a2e2a;
const HAT = 0x3a302a;
const HAT_RIM = 0xb89858;

/**
 * Sakura's fleet: junks after the woodblock prints — a lacquered hull, a cedar deck, a roofed
 * house at the stern, two batten sails across the beam with their ribs inked; the grunt an
 * ashigaru under a conical jingasa, a spear held out.
 */
export const SAKURA_FLEET: FleetLook = {
  key: 'sakura',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1, tile * 0.04), join: 'round' as const };
    const hull = hullPoints(length, beam, HULLS.junk);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: LACQUER });
    g.stroke(line);
    g.poly(inset(hull, 0.74, 0.88));
    g.fill({ color: CEDAR });
    // The house at the stern, its roof's ridge across.
    const houseY = half * 0.55;
    g.rect(-beam * 0.36, houseY, beam * 0.72, half * 0.34);
    g.fill({ color: ROOF });
    g.stroke(line);
    g.moveTo(-beam * 0.36, houseY + half * 0.17);
    g.lineTo(beam * 0.36, houseY + half * 0.17);
    g.stroke({ color: CEDAR, width: Math.max(1, tile * 0.025) });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.75, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, line);
    // Batten sails: flat panels across the beam, ribbed.
    for (const [m, at] of [-0.26, 0.12].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.55);
      const depth = tile * 0.2;
      g.roundRect(-width / 2, y - depth / 2, width, depth, tile * 0.04);
      g.fill({ color: sail });
      g.stroke(line);
      const ribs = 5;
      for (let r = 1; r < ribs; r++) {
        const x = -width / 2 + (width * r) / ribs;
        g.moveTo(x, y - depth / 2);
        g.lineTo(x, y + depth / 2);
      }
      g.stroke({ color: INK, width: Math.max(1, tile * 0.022), alpha: 0.8 });
      drawHoles(g, 0, y, width * 0.7, sailHits(hits, m), INK, m);
      g.circle(0, y, tile * 0.045);
      g.fill({ color: INK });
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.035) };
    const long = 1.7;
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: 0x4a3424,
      weaponWidth: 0.05,
      long,
    });
    const tip = weaponTip(tile, smashing, long);
    g.poly([tip.x, tip.y - tile * 0.12, tip.x + tile * 0.04, tip.y, tip.x - tile * 0.04, tip.y]);
    g.fill({ color: 0xd8dce0 });
    g.stroke({ color: INK, width: Math.max(1, tile * 0.02) });
    // The jingasa: a wide shallow cone, its rim lacquered, its peak a point.
    g.circle(0, 0, tile * 0.2);
    g.fill({ color: HAT });
    g.stroke(line);
    g.circle(0, 0, tile * 0.15);
    g.stroke({ color: HAT_RIM, width: Math.max(1, tile * 0.025) });
    g.circle(0, 0, tile * 0.035);
    g.fill({ color: HAT_RIM });
  },
};
