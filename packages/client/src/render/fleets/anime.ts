import type { Graphics } from 'pixi.js';

import type { FleetLook } from '../fleetLooks.js';
import {
  HULLS,
  bellySail,
  drawCrew,
  drawFrostBow,
  drawGruntBody,
  drawHoles,
  hullPoints,
  hullShadow,
  inset,
  sailHits,
  shipSize,
} from './kit.js';

/** The Anime's ink (its mascot's), cel shading's two tones, and a wooden sword. */
const INK = 0x2a2440;
const HULL = 0xf2f0fa;
const HULL_SHADE = 0xb4b8d8;
const DECK = 0xe2a86a;
const DECK_SHADE = 0xb47c48;
const BOKKEN = 0xd8b878;

/** A five-pointed star at (x, y): the emblem on the fore sail. */
function star(g: Graphics, x: number, y: number, r: number): void {
  const points: number[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const d = k % 2 === 0 ? r : r * 0.45;
    points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.poly(points);
}

/**
 * The Anime's fleet: a cel-shaded ship in a bold ink line — a white hull and a wooden deck, each
 * in two flat tones split down the keel — its fore sail carrying a star emblem in ink, a bright
 * sliver of highlight along each sail. Its grunt is a chibi: a big head of spiky ink hair, a
 * wooden sword raised high to smash.
 */
export const ANIME_FLEET: FleetLook = {
  key: 'anime',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const line = { color: INK, width: Math.max(1.5, tile * 0.055), join: 'round' as const };
    const hull = hullPoints(length, beam, HULLS.ship);
    const shade = (points: readonly number[]): number[] =>
      points.map((v, i) => (i % 2 === 0 ? Math.max(0, v) : v));
    hullShadow(g, hull, tile, 0.2);
    g.poly(hull);
    g.fill({ color: HULL });
    g.poly(shade(hull));
    g.fill({ color: HULL_SHADE });
    const deck = inset(hull, 0.72, 0.84);
    g.poly(deck);
    g.fill({ color: DECK });
    g.poly(shade(deck));
    g.fill({ color: DECK_SHADE });
    g.poly(hull);
    g.stroke(line);
    if (kind === 'frostship') drawFrostBow(g, -half * 0.7, beam * 0.45);
    if (kind === 'transport') drawCrew(g, tile, art, undefined, { color: INK, width: 1 });
    for (const [m, at] of [-0.24, 0.22].entries()) {
      const y = at * length;
      const width = beam * (m === 0 ? 1.3 : 1.45);
      const depth = tile * 0.26;
      bellySail(g, y, width, depth);
      g.fill({ color: sail });
      g.stroke(line);
      g.moveTo(-width * 0.3, y - depth * 0.55);
      g.quadraticCurveTo(0, y - depth * 0.95, width * 0.12, y - depth * 0.8);
      g.stroke({ color: 0xffffff, alpha: 0.85, width: Math.max(1, tile * 0.03), cap: 'round' });
      if (m === 0) {
        star(g, 0, y - depth * 0.42, depth * 0.32);
        g.fill({ color: INK });
      }
      drawHoles(g, width * 0.05, y - depth * 0.4, width * 0.55, sailHits(hits, m), INK, m + 1);
    }
  },
  grunt(g, tile, art, smashing) {
    const line = { color: INK, width: Math.max(1, tile * 0.04), join: 'round' as const };
    drawGruntBody(g, tile, art, smashing, {
      weapon: BOKKEN,
      weaponWidth: smashing ? 0.1 : 0.08,
      long: 1.15,
      outline: line,
    });
    // Spiky hair, the head big as a chibi's is.
    const points: number[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k * Math.PI) / 7;
      const r = tile * (k % 2 === 0 ? 0.21 : 0.14);
      points.push(Math.cos(a) * r, tile * 0.02 + Math.sin(a) * r);
    }
    g.poly(points);
    g.fill({ color: INK });
    g.circle(-tile * 0.05, -tile * 0.03, tile * 0.035);
    g.fill({ color: 0x5a5080 });
  },
};
