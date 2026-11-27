import type { FleetLook } from '../fleetLooks.js';
import { FROST, drawCrew, drawGruntBody, hullShadow, holes, sailHits, shipSize } from './kit.js';

/** Copier paper, its folds, a punched hole, a tie and newsprint. */
const PAPER = 0xf7f7f2;
const FOLD = 0xc8c8c0;
const PUNCH = 0x2a2c30;
const TIE = 0x2a4a8a;
const HAIR = 0x5a3b22;
const NEWS = 0xe0ddd2;

/**
 * Office's fleet: a paper boat folded from a sheet of copier paper, seen from above — pointed at
 * both ends, its creases drawn, the tent of its middle fold raised — with sticky notes stuck on
 * for sails, in the kind's colour, a darker strip where each sticks; a hit punches a hole through
 * a note, as a hole punch would. The frost ship's bow is iced. Its grunt is an office worker with
 * brown hair and a blue tie, swatting with a rolled-up newspaper.
 */
export const OFFICE_FLEET: FleetLook = {
  key: 'office',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const w = beam / 2;
    // The boat: a long hexagon, its gunwales the folded sheet's edges.
    const hull = [
      0,
      -half,
      w,
      -half * 0.45,
      w,
      half * 0.45,
      0,
      half,
      -w,
      half * 0.45,
      -w,
      -half * 0.45,
    ];
    hullShadow(g, hull, tile, 0.22);
    g.poly(hull);
    g.fill({ color: PAPER });
    g.stroke({ color: FOLD, width: Math.max(1, tile * 0.03), join: 'round' });
    // The middle tent, a diamond raised along the keel, its far side in shade.
    g.poly([0, -half * 0.55, w * 0.55, 0, 0, half * 0.55]);
    g.fill({ color: FOLD });
    g.moveTo(0, -half).lineTo(0, half);
    g.moveTo(-w, -half * 0.45).lineTo(0, -half * 0.55);
    g.moveTo(w, -half * 0.45).lineTo(0, -half * 0.55);
    g.moveTo(-w, half * 0.45).lineTo(0, half * 0.55);
    g.moveTo(w, half * 0.45).lineTo(0, half * 0.55);
    g.stroke({ color: FOLD, width: Math.max(1, tile * 0.02) });
    if (kind === 'frostship') {
      g.poly([0, -half, w * 0.6, -half * 0.6, -w * 0.6, -half * 0.6]);
      g.fill({ color: FROST, alpha: 0.85 });
    }
    if (kind === 'transport') {
      drawCrew(g, tile, art, [
        [-0.15, 0],
        [0.15, 0],
        [0, -0.7],
      ]);
    }
    // The sticky notes, each a little askew, stuck on along the boat.
    const size = tile * (kind === 'transport' ? 0.5 : 0.44);
    for (const [m, at] of [-0.2, 0.2].entries()) {
      const y = at * length;
      const tilt = m === 0 ? -0.12 : 0.1;
      const c = Math.cos(tilt);
      const s = Math.sin(tilt);
      const corner = (x: number, yy: number): [number, number] => [
        x * c - yy * s,
        y + x * s + yy * c,
      ];
      const square = (top: number, bottom: number): number[] =>
        [
          corner(-size / 2, top),
          corner(size / 2, top),
          corner(size / 2, bottom),
          corner(-size / 2, bottom),
        ].flat();
      g.poly(square(-size / 2, size / 2).map((v, i) => v + (i % 2 === 0 ? 1 : 1.5) * tile * 0.03));
      g.fill({ color: 0x000000, alpha: 0.2 });
      g.poly(square(-size / 2, size / 2));
      g.fill({ color: sail });
      g.stroke({ color: 0x000000, alpha: 0.35, width: Math.max(1, tile * 0.02), join: 'round' });
      g.poly(square(-size / 2, -size / 2 + size * 0.22));
      g.fill({ color: 0x000000, alpha: 0.1 });
      for (const hole of holes(size * 0.7, sailHits(hits, m), m)) {
        const [hx, hy] = corner(hole.x, hole.y * 4 + size * 0.1);
        g.circle(hx, hy, tile * 0.045);
      }
      if (sailHits(hits, m) > 0) g.fill({ color: PUNCH });
    }
  },
  grunt(g, tile, art, smashing) {
    drawGruntBody(g, tile, art, smashing, {
      weapon: NEWS,
      weaponWidth: smashing ? 0.14 : 0.11,
      outline: { color: 0x000000, alpha: 0.5, width: Math.max(1, tile * 0.03) },
    });
    g.circle(0, tile * 0.03, tile * 0.115);
    g.fill({ color: HAIR });
    g.stroke({ color: 0x000000, alpha: 0.4, width: Math.max(1, tile * 0.025) });
    g.moveTo(-tile * 0.02, -tile * 0.08).quadraticCurveTo(
      tile * 0.02,
      0,
      -tile * 0.01,
      tile * 0.14,
    );
    g.stroke({ color: 0x3a2412, width: Math.max(1, tile * 0.02) });
    // The tie, down the front of the shirt, under the chin.
    g.poly([-tile * 0.04, -tile * 0.16, tile * 0.04, -tile * 0.16, 0, -tile * 0.075]);
    g.fill({ color: TIE });
  },
};
