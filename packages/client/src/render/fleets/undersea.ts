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

/** The deep's colours: a riveted steel hull, brass fittings, portholes' glass, the dark. */
const STEEL = 0x3e5a64;
const STEEL_LIGHT = 0x5e7e88;
const BRASS = 0xc89a40;
const BRASS_DARK = 0x7a5a1e;
const GLASS = 0x9fe0e8;
const INK = 0x14222a;
const WRENCH = 0x8a8e96;

/**
 * Undersea's fleet: submarines running awash — a riveted steel hull pointed at both ends, a
 * conning tower amidships with its dive planes and the tail's fins all in the sail's colour,
 * brass portholes down the deck, the transport's soldiers in open hatches. The grunt a diver in a
 * brass helmet, its faceplate ahead and its air hose behind, with a great wrench.
 */
export const UNDERSEA_FLEET: FleetLook = {
  key: 'undersea',
  ship(g, tile, art, kind, hits) {
    const { length, beam: full, half, sail } = shipSize(tile, art, kind);
    const beam = full * 0.82;
    const line = { color: INK, width: Math.max(1, tile * 0.035), join: 'round' as const };
    // The tail's fins, a cross at the stern, and the screw.
    g.poly([0, half * 0.6, beam * 0.75, half * 0.98, 0, half * 0.9, -beam * 0.75, half * 0.98]);
    g.fill({ color: sail });
    g.stroke(line);
    const hull = hullPoints(length, beam, HULLS.canoe, 14);
    hullShadow(g, hull, tile);
    g.poly(hull);
    g.fill({ color: STEEL });
    g.stroke(line);
    g.poly(inset(hull, 0.45, 0.9));
    g.fill({ color: STEEL_LIGHT });
    // Rivets down each side.
    for (let k = 0; k < 7; k++) {
      const y = -half * 0.6 + (k * half * 1.2) / 6;
      for (const side of [-1, 1]) g.circle(side * beam * 0.34, y, tile * 0.018);
    }
    g.fill({ color: INK });
    if (kind === 'frostship') drawFrostBow(g, -half * 0.72, full * 0.45);
    // Portholes ahead and astern of the tower, or open hatches with soldiers in them.
    const ports = kind === 'transport' ? [-0.48, 0.2, 0.42, 0.64] : [-0.5, 0.3, 0.55];
    for (const y of ports) g.circle(0, y * half, tile * 0.065);
    g.fill({ color: BRASS });
    g.stroke({ color: BRASS_DARK, width: Math.max(1, tile * 0.02) });
    for (const y of ports) g.circle(0, y * half, tile * 0.04);
    g.fill({ color: kind === 'transport' ? hex(art.campaign.grunt.tunic) : GLASS });
    // The conning tower and its planes, in the sail's colour.
    const ty = -half * 0.12;
    g.roundRect(-beam * 0.95, ty - tile * 0.05, beam * 1.9, tile * 0.1, tile * 0.05);
    g.fill({ color: sail });
    g.stroke(line);
    g.ellipse(0, ty, beam * 0.3, tile * 0.3);
    g.fill({ color: sail });
    g.stroke(line);
    g.circle(0, ty - tile * 0.12, tile * 0.04);
    g.fill({ color: INK });
    drawHoles(g, 0, ty + tile * 0.06, beam * 0.45, hits, INK, 0);
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.035) };
    const long = 0.95;
    // The air hose, trailing behind.
    g.moveTo(0, tile * 0.12);
    g.bezierCurveTo(tile * 0.12, tile * 0.3, -tile * 0.12, tile * 0.36, 0, tile * 0.48);
    g.stroke({ color: 0x2a2a2a, width: Math.max(1.5, tile * 0.045), cap: 'round' });
    drawGruntBody(g, tile, art, smashing, {
      outline: line,
      weapon: WRENCH,
      weaponWidth: 0.07,
      long,
    });
    // The wrench's jaw.
    const tip = weaponTip(tile, smashing, long);
    for (const side of [-1, 1]) {
      g.moveTo(tip.x + side * tile * 0.03, tip.y + tile * 0.02);
      g.lineTo(tip.x + side * tile * 0.06, tip.y - tile * 0.08);
    }
    g.stroke({ color: WRENCH, width: Math.max(1.5, tile * 0.05), cap: 'round' });
    // The brass helmet, its faceplate ahead.
    g.circle(0, 0, tile * 0.17);
    g.fill({ color: BRASS });
    g.stroke(line);
    g.circle(0, -tile * 0.07, tile * 0.075);
    g.fill({ color: GLASS });
    g.stroke({ color: BRASS_DARK, width: Math.max(1, tile * 0.03) });
    for (const side of [-1, 1]) g.circle(side * tile * 0.12, tile * 0.03, tile * 0.03);
    g.fill({ color: BRASS_DARK });
  },
};
