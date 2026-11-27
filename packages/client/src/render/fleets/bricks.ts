import type { Graphics } from 'pixi.js';

import type { FleetLook } from '../fleetLooks.js';
import { drawFrostBow, hullShadow, sailHits, shipSize } from './kit.js';
import { hex } from '../theme.js';

/** The toy bricks' plastic: a hull of brown plates, a tan deck, the figures' yellow heads. */
const PLATE = 0x8a5a32;
const PLATE_DARK = 0x5e3c20;
const DECK = 0xc8b48a;
const EDGE = 0x000000;
const HEAD = 0xe8c060;
const BAR = 0x6a6e78;
const SOCKET = 0x2a2018;

/** A row of `n` studs across at `y`, `pitch` apart, in `colour` with a highlight; `skip` none. */
function studs(
  g: Graphics,
  n: number,
  y: number,
  pitch: number,
  colour: number,
  skip: (k: number) => boolean = () => false,
): void {
  const r = pitch * 0.3;
  const xs: number[] = [];
  for (let k = 0; k < n; k++) if (!skip(k)) xs.push((k - (n - 1) / 2) * pitch);
  if (xs.length === 0) return;
  for (const x of xs) g.circle(x, y, r);
  g.fill({ color: colour });
  g.stroke({ color: EDGE, alpha: 0.3, width: Math.max(1, pitch * 0.07) });
  for (const x of xs) g.circle(x - r * 0.3, y - r * 0.3, r * 0.35);
  g.fill({ color: 0xffffff, alpha: 0.45 });
}

/**
 * Bricks' fleet: a boat built of plates — a bow stepped a stud at a time, studs on its deck —
 * its sails two bricks across the beam with their studs up, each hit knocking one off to leave
 * its socket dark; the grunt a toy figure from above, square shoulders and a round head with a
 * stud on top, a grey bar for a club.
 */
export const BRICKS_FLEET: FleetLook = {
  key: 'bricks',
  ship(g, tile, art, kind, hits) {
    const { length, beam, half, sail } = shipSize(tile, art, kind);
    const pitch = beam / 4;
    const edge = { color: EDGE, alpha: 0.5, width: Math.max(1, tile * 0.03) };
    // A stepped bow: each step a stud narrower, then the square body.
    const steps = 2;
    const right: number[] = [];
    for (let k = 0; k < steps; k++) {
      const w = ((k + 2) / (steps + 2)) * beam;
      const y = -half + k * pitch;
      right.push(w / 2, y, w / 2, y + pitch);
    }
    right.push(beam / 2, -half + steps * pitch, beam / 2, half);
    const left: number[] = [];
    for (let k = right.length - 2; k >= 0; k -= 2) {
      left.push(-(right[k] as number), right[k + 1] as number);
    }
    const outline = [...right, ...left];
    hullShadow(g, outline, tile, 0.22);
    g.poly(outline);
    g.fill({ color: PLATE });
    g.stroke(edge);
    const top = -half + steps * pitch;
    g.rect(-beam / 2 + pitch * 0.5, top, beam - pitch, half - top - pitch * 0.5);
    g.fill({ color: DECK });
    g.stroke({ color: PLATE_DARK, width: Math.max(1, tile * 0.02) });
    if (kind === 'frostship') drawFrostBow(g, -half + pitch, beam * 0.42);
    // Studs on the deck fore and aft, the crew's heads amidships on a transport.
    studs(g, 3, top + pitch * 0.7, pitch, DECK);
    studs(g, 3, half - pitch * 1.1, pitch, DECK);
    if (kind === 'transport') studs(g, 3, 0, pitch * 1.1, hex(art.campaign.grunt.tunic));
    for (const [m, at] of [-0.2, 0.17].entries()) {
      const y = at * length;
      const n = 4 + m + (kind === 'transport' ? 1 : 0);
      const width = n * pitch;
      g.rect(-width / 2, y - pitch * 0.55, width, pitch * 1.1);
      g.fill({ color: sail });
      g.stroke(edge);
      // A hit knocks studs off, leaving their sockets dark.
      const lost = Array.from({ length: sailHits(hits, m) }, (_, h) => (h * 3 + m + 1) % n);
      const gone = (k: number): boolean => lost.includes(k);
      studs(g, n, y, pitch, sail, gone);
      if (lost.length > 0) {
        for (const k of lost) g.circle((k - (n - 1) / 2) * pitch, y, pitch * 0.3);
        g.fill({ color: SOCKET });
      }
    }
  },
  grunt(g, tile, art, smashing) {
    const edge = { color: EDGE, alpha: 0.6, width: Math.max(1, tile * 0.035) };
    // The bar held at its side, or brought up ahead to smash.
    if (smashing) g.rect(-tile * 0.06, -tile * 0.58, tile * 0.12, tile * 0.4);
    else g.rect(tile * 0.2, -tile * 0.42, tile * 0.1, tile * 0.36);
    g.fill({ color: BAR });
    g.stroke(edge);
    g.roundRect(-tile * 0.3, -tile * 0.12, tile * 0.6, tile * 0.26, tile * 0.05);
    g.fill({ color: hex(art.campaign.grunt.tunic) });
    g.stroke(edge);
    g.circle(0, 0, tile * 0.14);
    g.fill({ color: HEAD });
    g.stroke(edge);
    g.circle(0, 0, tile * 0.07);
    g.fill({ color: HEAD });
    g.stroke({ color: EDGE, alpha: 0.35, width: Math.max(1, tile * 0.025) });
  },
};
