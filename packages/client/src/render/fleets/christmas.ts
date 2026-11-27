import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawFrostBow,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';
import { hex } from '../theme.js';

const SLEIGH = 0xb8202a;
const SLEIGH_DARK = 0x7a1018;
const GOLD = 0xe0b040;
const SNOW = 0xf4f8ff;
const CANE_RED = 0xd8303a;
const SHAKO = 0x14141a;

/** A transport's nutcrackers, in tiles from its middle. */
const CREW = [
  [-0.15, -0.02],
  [0.15, -0.02],
  [0, 0.12],
  [0, -0.16],
] as const;

/**
 * Christmas's fleet: a red sleigh of a hull trimmed in gold, its runners curling up past the
 * bow, snow on its deck and a candy cane for a bowsprit; the grunt a nutcracker soldier from
 * above, its black shako ringed in gold and plumed red, gold on its shoulders, a sabre drawn.
 */
export const CHRISTMAS_FLEET: FleetLook = {
  key: 'christmas',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const hull = hullPoints(length * 0.9, beam, HULLS.barge);
    const gold = { color: GOLD, width: Math.max(1, tile * 0.045), join: 'round' as const };
    // The candy cane bowsprit, red and white by turns, its crook at the end.
    const cane = Math.max(2, tile * 0.07);
    const from = -half * 0.85;
    const to = -half - tile * 0.1;
    const bands = 4;
    for (let k = 0; k < bands; k++) {
      g.moveTo(0, from + ((to - from) * k) / bands);
      g.lineTo(0, from + ((to - from) * (k + 1)) / bands);
      g.stroke({ color: k % 2 === 0 ? 0xffffff : CANE_RED, width: cane });
    }
    g.arc(tile * 0.07, to, tile * 0.07, Math.PI, Math.PI * 2);
    g.stroke({ color: CANE_RED, width: cane, cap: 'round' });
    hullShadow(g, hull, tile, 0.22);
    // The runners, gold, curling up past the bow.
    for (const side of [-1, 1]) {
      g.moveTo(side * beam * 0.53, half * 0.88);
      g.lineTo(side * beam * 0.53, -half * 0.55);
      g.quadraticCurveTo(side * beam * 0.56, -half * 1.0, side * beam * 0.22, -half * 0.92);
    }
    g.stroke({ ...gold, cap: 'round' });
    g.poly(hull);
    g.fill({ color: SLEIGH });
    g.stroke(gold);
    g.poly(inset(hull, 0.72, 0.86));
    g.fill({ color: SLEIGH_DARK });
    // Snow drifted on the deck.
    for (const [x, y, r] of [
      [-0.12, -0.36, 0.1],
      [0.1, 0.36, 0.12],
      [0.18, -0.02, 0.07],
    ] as const) {
      g.circle(x * beam, y * length, r * tile);
    }
    g.fill({ color: SNOW });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, beam * 0.45);
    if (kind === 'transport') {
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.075);
      g.fill({ color: hex(art.campaign.grunt.tunic) });
      for (const [x, y] of CREW) g.circle(x * tile, y * tile, tile * 0.045);
      g.fill({ color: SHAKO });
    }
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      bellySail(g, y, width, tile * 0.25);
      g.fill({ color: sail });
      g.stroke({ color: GOLD, width: Math.max(1, tile * 0.03) });
      drawHoles(g, 0, y - tile * 0.1, width * 0.55, sailHits(hits, m), SLEIGH_DARK, m);
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: SHAKO, alpha: 0.7, width: Math.max(1, tile * 0.035) };
    const hx = smashing ? tile * 0.04 : tile * 0.26;
    const hy = smashing ? -tile * 0.12 : -tile * 0.05;
    const tx = smashing ? tile * 0.06 : hx + tile * 0.05;
    const ty = hy - (smashing ? 0.5 : 0.38) * tile;
    // A sabre, steel edged in black so it shows on snow, curving a little.
    g.moveTo(hx, hy);
    g.quadraticCurveTo(hx + tile * 0.08, hy - tile * 0.2, tx, ty);
    g.stroke({ color: SHAKO, width: Math.max(3, tile * 0.09), cap: 'round' });
    g.moveTo(hx, hy);
    g.quadraticCurveTo(hx + tile * 0.08, hy - tile * 0.2, tx, ty);
    g.stroke({ color: 0xb8bec8, width: Math.max(2, tile * 0.05), cap: 'round' });
    g.ellipse(0, tile * 0.02, tile * 0.3, tile * 0.17);
    g.fill({ color: hex(art.campaign.grunt.tunic) });
    g.stroke(line);
    for (const side of [-1, 1]) g.circle(side * tile * 0.22, tile * 0.01, tile * 0.06);
    g.fill({ color: GOLD });
    g.circle(hx, hy, tile * 0.05);
    g.fill({ color: 0xffffff });
    // The shako from above: black crown, gold band, a red plume at its front.
    g.circle(0, 0, tile * 0.15);
    g.fill({ color: SHAKO });
    g.stroke({ color: GOLD, width: Math.max(1, tile * 0.035) });
    g.circle(0, -tile * 0.07, tile * 0.045);
    g.fill({ color: CANE_RED });
  },
};
