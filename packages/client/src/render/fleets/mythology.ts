import type { FleetLook } from '../fleetLooks.js';
import { hex } from '../theme.js';
import {
  HULLS,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  shipSize,
  weaponTip,
} from './kit.js';

/**
 * The vase's black figure and the lines incised through it to the clay. Its sea is the vase's
 * black, so a ship there is the clay, drawn round in black, as a red figure would be.
 */
const BLACK = 0x1a1410;
const INCISED = 0xd07a48;
const CLAY = 0xc87a48;
const CLAY_DARK = 0x9a5430;

/**
 * The Mythos' fleet: triremes off a vase — a long narrow hull of the clay drawn round in black,
 * its ram, a row of oars a side, eyes at the bow, one square sail amidships; the grunt a hoplite,
 * crested helmet, a round shield on the left arm and a spear.
 */
export const MYTHOLOGY_FLEET: FleetLook = {
  key: 'mythology',
  ship(g, tile, art, kind, hits) {
    const { length, beam: full, half, sail } = shipSize(tile, art, kind);
    const beam = full * 0.78;
    const line = { color: BLACK, width: Math.max(1, tile * 0.04), join: 'round' as const };
    // Oars, a row a side, out over the water.
    const oars = kind === 'raider' ? 5 : 6;
    for (let k = 0; k < oars; k++) {
      const y = -half * 0.45 + (k * half * 1.15) / (oars - 1);
      for (const side of [-1, 1]) {
        g.moveTo(side * beam * 0.4, y);
        g.lineTo(side * (beam / 2 + tile * 0.2), y + tile * 0.08);
      }
    }
    g.stroke({ color: CLAY_DARK, width: Math.max(1, tile * 0.035), cap: 'round' });
    const hull = hullPoints(length, beam, HULLS.canoe);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: CLAY });
    g.stroke(line);
    // The ram, ahead of the bow.
    g.poly([
      0,
      -half - tile * 0.14,
      tile * 0.05,
      -half + tile * 0.04,
      -tile * 0.05,
      -half + tile * 0.04,
    ]);
    g.fill({ color: CLAY });
    g.stroke(line);
    // The deck's line, and the eyes at the bow, painted in black.
    g.poly(inset(hull, 0.62, 0.8));
    g.stroke({ color: BLACK, width: Math.max(1, tile * 0.025) });
    for (const side of [-1, 1]) {
      g.circle(side * beam * 0.2, -half * 0.66, tile * 0.055);
      g.stroke({ color: BLACK, width: Math.max(1, tile * 0.022) });
      g.circle(side * beam * 0.2, -half * 0.66, tile * 0.022);
      g.fill({ color: BLACK });
    }
    if (kind === 'frostship') drawFrostBow(g, -half * 0.8, full * 0.4);
    if (kind === 'transport') {
      // Hoplites on the deck: helmets in the grunts' red.
      for (const y of [-0.1, 0.12, 0.34]) {
        g.circle(0, y * tile, tile * 0.075);
        g.fill({ color: hex(art.campaign.grunt.tunic) });
        g.stroke({ color: BLACK, width: Math.max(1, tile * 0.02) });
      }
    }
    // One square sail amidships, its yard across.
    const y = -0.12 * length;
    const width = full * 1.55;
    const depth = tile * 0.24;
    g.rect(-width / 2, y - depth / 2, width, depth);
    g.fill({ color: sail });
    g.stroke(line);
    g.moveTo(-width / 2 - tile * 0.05, y + depth / 2);
    g.lineTo(width / 2 + tile * 0.05, y + depth / 2);
    g.stroke({ color: BLACK, width: Math.max(1.5, tile * 0.05), cap: 'round' });
    drawHoles(g, 0, y - tile * 0.02, width * 0.7, hits, BLACK, 0);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: BLACK, width: Math.max(1, tile * 0.035) };
    const long = 1.7;
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: BLACK,
      weaponWidth: 0.05,
      long,
    });
    const tip = weaponTip(tile, smashing, long);
    g.poly([tip.x, tip.y - tile * 0.12, tip.x + tile * 0.045, tip.y, tip.x - tile * 0.045, tip.y]);
    g.fill({ color: BLACK });
    // The round shield on the left arm, black with its rim incised.
    g.circle(-tile * 0.27, -tile * 0.04, tile * 0.17);
    g.fill({ color: BLACK });
    g.circle(-tile * 0.27, -tile * 0.04, tile * 0.13);
    g.stroke({ color: INCISED, width: Math.max(1, tile * 0.025) });
    // The helmet, its crest running front to back.
    g.circle(0, 0, tile * 0.13);
    g.fill({ color: BLACK });
    g.roundRect(-tile * 0.035, -tile * 0.17, tile * 0.07, tile * 0.36, tile * 0.03);
    g.fill({ color: INCISED });
  },
};
