import type { DroneLook } from '../../render/drones.js';
import { droneHalf, droneLine, drawBird, scaled, type BirdShape } from '../../render/droneLooks.js';

/*
 * The Wild West's drones (the user's choice, 2026-11-20): vultures, circling the tower as
 * vultures circle — which is what a drone's orbit already is. Soaring more than flapping, their
 * fingered wings dip only a little; a bandana in the owner's colour knotted round each bare neck.
 */

const VULTURE: BirdShape = { wing: 'fingered', tail: 'fan', girth: 0.2 };
const FEATHER = 0x2a2220;
const OUTLINE = 0x140e0c;

export const VULTURE_DRONE: DroneLook = {
  key: 'vulture',
  frames: 2,
  beatMs: 1600,
  faces: true,
  body(g, tile, pose) {
    const s = droneHalf(tile);
    drawBird(
      g,
      tile,
      pose,
      2,
      VULTURE,
      { wing: FEATHER, body: 0x3a302a, tail: FEATHER, outline: OUTLINE },
      0.12,
    );
    // The white ruff at the root of its neck.
    g.circle(s * 0.32, 0, s * 0.15);
    g.fill({ color: 0xe8e0d0 });
    g.stroke({ width: droneLine(tile, 18), color: OUTLINE });
  },
  mark(g, tile) {
    const s = droneHalf(tile);
    g.poly(scaled(s, [0.4, -0.15, 0.4, 0.15, 0.06, 0.02, 0.02, 0.1, -0.02, -0.06]));
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = droneHalf(tile);
    const edge = { width: droneLine(tile, 18), color: OUTLINE, join: 'round' as const };
    g.poly(scaled(s, [0.4, -0.15, 0.4, 0.15, 0.06, 0.02, 0.02, 0.1, -0.02, -0.06]));
    g.stroke(edge);
    g.circle(s * 0.5, 0, s * 0.11);
    g.fill({ color: 0xc8806a });
    g.stroke(edge);
    g.poly(scaled(s, [0.58, -0.05, 0.76, -0.02, 0.72, 0.05, 0.58, 0.05]));
    g.fill({ color: 0xd8c8a0 });
    g.stroke(edge);
  },
};
