import type { Graphics } from 'pixi.js';

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

/** The Wiesn's colours: oak staves and their iron hoops, Bavaria's blue and white, a Loden hat. */
const OAK = 0x9a6634;
const OAK_DARK = 0x5e3a1a;
const PALE_OAK = 0xc89058;
const HOOP = 0x3a3a40;
const BLUE = 0x2a78c8;
const WHITE = 0xf4f4f4;
const INK = 0x2a1a10;
const LODEN = 0x3e5a32;
const LODEN_DARK = 0x2e4626;
const STONEWARE = 0xd8ccb0;
const FOAM = 0xfffaf0;

/** One barrel from above: a disc of oak, a hoop, its bung. */
function barrel(g: Graphics, x: number, y: number, r: number, tile: number): void {
  g.circle(x, y, r);
  g.fill({ color: OAK });
  g.stroke({ color: INK, width: Math.max(1, tile * 0.03) });
  g.circle(x, y, r * 0.72);
  g.stroke({ color: HOOP, width: Math.max(1, tile * 0.025) });
  g.circle(x, y, r * 0.18);
  g.fill({ color: OAK_DARK });
}

/**
 * The Oktoberfest's fleet: stout tubs of oak staves bound in iron hoops, Bavaria's blue and white
 * lozenges along the gunwale, a beer barrel on deck; the grunt in a Loden hat with a feather,
 * swinging a Maß.
 */
export const OKTOBERFEST_FLEET: FleetLook = {
  key: 'oktoberfest',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1, tile * 0.04), join: 'round' as const };
    const hull = hullPoints(length, beam * 1.05, HULLS.barge);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: OAK });
    g.stroke(line);
    g.poly(inset(hull, 0.7, 0.86));
    g.fill({ color: PALE_OAK });
    // The staves along it and the hoops across.
    for (const x of [-0.2, 0, 0.2]) {
      g.moveTo(x * beam, -half * 0.82);
      g.lineTo(x * beam, half * 0.82);
    }
    g.stroke({ color: OAK_DARK, width: Math.max(1, tile * 0.02), alpha: 0.6 });
    for (const y of [-0.62, 0.62]) {
      g.moveTo(-beam * 0.52, y * half);
      g.lineTo(beam * 0.52, y * half);
    }
    g.stroke({ color: HOOP, width: Math.max(1.5, tile * 0.05) });
    // The lozenges, blue and white by turns down each side.
    const n = 7;
    const step = (length * 0.62) / n;
    for (let k = 0; k < n; k++) {
      const y = -half * 0.62 + step * (k + 0.5);
      for (const side of [-1, 1]) {
        const x = side * beam * 0.44;
        g.poly([x, y - step / 2, x + tile * 0.05, y, x, y + step / 2, x - tile * 0.05, y]);
        g.fill({ color: (k + (side > 0 ? 1 : 0)) % 2 === 0 ? BLUE : WHITE });
      }
    }
    if (kind === 'frostship') drawFrostBow(g, -half * 0.75, beam * 0.45);
    barrel(g, 0, half * 0.62, tile * 0.17, tile);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, line);
    for (const [m, at] of [-0.26, 0.18].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.35 : 1.5);
      bellySail(g, y, width, tile * 0.24);
      g.fill({ color: sail });
      g.stroke(line);
      drawHoles(g, 0, y - tile * 0.1, width * 0.55, sailHits(hits, m), INK, m);
    }
    drawPennant(g, -0.26 * length - tile * 0.1, tile, sail);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.035) };
    const long = 0.75;
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: STONEWARE,
      weaponWidth: 0.05,
      long,
    });
    // The Maß at the end of the swing, its foam on top.
    const tip = weaponTip(tile, smashing, long);
    g.roundRect(tip.x - tile * 0.08, tip.y - tile * 0.08, tile * 0.16, tile * 0.16, tile * 0.03);
    g.fill({ color: STONEWARE });
    g.stroke(line);
    g.circle(tip.x, tip.y, tile * 0.055);
    g.fill({ color: FOAM });
    // The Loden hat, brim and crown, a feather tucked in its band.
    g.ellipse(0, 0, tile * 0.17, tile * 0.15);
    g.fill({ color: LODEN });
    g.stroke(line);
    g.ellipse(0, 0, tile * 0.1, tile * 0.09);
    g.fill({ color: LODEN_DARK });
    g.moveTo(tile * 0.06, tile * 0.04);
    g.quadraticCurveTo(tile * 0.2, tile * 0.08, tile * 0.22, tile * 0.24);
    g.stroke({ color: WHITE, width: Math.max(1.5, tile * 0.04), cap: 'round' });
  },
};
