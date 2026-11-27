import type { FleetLook } from '../../render/fleetLooks.js';
import {
  HULLS,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  drawPennant,
  hullPoints,
  hullShadow,
  inset,
  shipSize,
} from '../../render/fleets/kit.js';

/** The frontier's colours: weathered planks, the wheel's red, stovepipe iron, a felt hat. */
const PLANK = 0x8a6440;
const PLANK_DARK = 0x5a3e26;
const DECK = 0xc8a878;
const WHEEL = 0x9a3424;
const IRON = 0x2a2624;
const EMBER = 0xff9a3a;
const INK = 0x1e140e;
const HAT = 0x6a4a2a;
const HAT_DARK = 0x4a321c;
const BANDANA = 0x2e4a7a;
const RIFLE = 0x3a2a20;

/**
 * The Wild West's fleet: sternwheel riverboats — a long blunt hull of planks, a paddle wheel at
 * the stern, its texas deck's canopy in the sail's colour, two smokestacks ahead of it with embers
 * at their mouths and a pennant on the jack staff. The grunt a bandit in a wide-brimmed hat and a
 * bandana, swinging a rifle's butt.
 */
export const WILDWEST_FLEET: FleetLook = {
  key: 'wildwest',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1, tile * 0.035), join: 'round' as const };
    const body = length * 0.84;
    const shift = -length * 0.08;
    const hull = hullPoints(body, beam, HULLS.ship).map((v, i) => (i % 2 === 1 ? v + shift : v));
    const stern = shift + body / 2;
    // The paddle wheel astern, its paddles across.
    const wheelDepth = length - body;
    g.rect(-beam * 0.42, stern - tile * 0.02, beam * 0.84, wheelDepth);
    g.fill({ color: WHEEL });
    g.stroke(line);
    for (let k = 1; k < 4; k++) {
      const y = stern + (wheelDepth * k) / 4;
      g.moveTo(-beam * 0.42, y);
      g.lineTo(beam * 0.42, y);
    }
    g.stroke({ color: INK, width: Math.max(1, tile * 0.025) });
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: PLANK });
    g.stroke(line);
    g.poly(inset(hull, 0.8, 0.9));
    g.fill({ color: DECK });
    for (const x of [-0.2, 0.2]) {
      g.moveTo(x * beam, -half * 0.55);
      g.lineTo(x * beam, stern - tile * 0.08);
    }
    g.stroke({ color: PLANK_DARK, width: Math.max(1, tile * 0.02), alpha: 0.6 });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.8, beam * 0.45);
    // The texas deck's canopy, scalloped at its edges, over the after half.
    const top = -half * 0.12;
    const bottom = stern - tile * 0.12;
    const width = beam * 0.9;
    g.roundRect(-width / 2, top, width, bottom - top, tile * 0.06);
    g.fill({ color: sail });
    g.stroke(line);
    g.moveTo(0, top + tile * 0.04);
    g.lineTo(0, bottom - tile * 0.04);
    g.stroke({ color: INK, width: Math.max(1, tile * 0.02), alpha: 0.5 });
    if (kind === 'transport') {
      drawCrew(
        g,
        tile,
        art,
        [
          [-0.2, -0.4],
          [0.2, -0.4],
          [0, -0.56],
        ],
        line,
      );
    }
    drawHoles(g, 0, (top + bottom) / 2, width * 0.8, hits, INK);
    // Two smokestacks ahead of the canopy, embers at their mouths.
    for (const side of [-1, 1]) {
      g.circle(side * beam * 0.2, top - tile * 0.08, tile * 0.085);
      g.fill({ color: IRON });
      g.circle(side * beam * 0.2, top - tile * 0.08, tile * 0.04);
      g.fill({ color: EMBER });
    }
    drawPennant(g, -half * 0.78, tile, sail);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.035) };
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: RIFLE,
      weaponWidth: 0.065,
      long: 1.3,
    });
    // The bandana's knot behind the neck.
    g.poly([-tile * 0.04, tile * 0.1, tile * 0.04, tile * 0.1, 0, tile * 0.22]);
    g.fill({ color: BANDANA });
    // The hat: a wide brim, its crown dented down the middle.
    g.ellipse(0, 0, tile * 0.22, tile * 0.19);
    g.fill({ color: HAT });
    g.stroke(line);
    g.ellipse(0, 0, tile * 0.1, tile * 0.12);
    g.fill({ color: HAT_DARK });
    g.moveTo(0, -tile * 0.08);
    g.lineTo(0, tile * 0.08);
    g.stroke({ color: INK, width: Math.max(1, tile * 0.02), alpha: 0.6 });
  },
};
