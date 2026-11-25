import { Container, type Graphics } from 'pixi.js';
import type { ArtConfig, ShipKind } from '@bollfort/config';
import { HEADINGS, SHIP_SIZE, shipPosition, type MatchState, type Ship } from '@bollfort/sim';

import { motionReduced } from '../motion.js';
import { Discs, StampBook, Stamps } from './stamps.js';
import { hex, tileX, tileY, type ViewTransform } from './theme.js';

/**
 * The campaign's enemy drawn plainly over every style (docs/CAMPAIGN.md §14.4), until a style
 * draws its own: the ships, one design told apart by size and sail colour, the same on every
 * board. Stamped — a ship is drawn once per kind and tile size, then only placed and turned — so
 * a fleet of twenty costs no triangulation a frame (CLAUDE.md, Drawing a style cheaply).
 */

/** A ship gone from the match, still fading where it was last seen. */
interface Leaving {
  ship: Ship;
  x: number;
  y: number;
  angle: number;
  /** Milliseconds left of its fade. */
  left: number;
}

/** Wake puffs behind a sailing ship, and how far apart, in tiles. */
const WAKE_PUFFS = 4;
const WAKE_STEP = 0.32;

export class CampaignMarks {
  readonly root = new Container({ label: 'campaign' });
  private readonly book = new StampBook();
  private readonly wake = new Discs();
  private readonly ships = new Stamps();
  /** Where each ship was drawn last frame, by id, so one gone fades out there. */
  private seen = new Map<number, { ship: Ship; x: number; y: number; angle: number }>();
  private leaving: Leaving[] = [];

  constructor() {
    this.root.addChild(this.wake.container, this.ships.container);
  }

  draw(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    tickFraction: number,
    deltaMs: number,
  ): void {
    const fleet = state.campaign;
    if (fleet === null && this.seen.size === 0 && this.leaving.length === 0) return;
    const tile = view.tile;
    const look = art.campaign;
    const fadeTicks = (look.fadeMs / 1000) * state.ruleset.tickRateHz;
    const now = state.tick + tickFraction;
    this.wake.begin(tile);
    this.ships.begin();

    const seen = new Map<number, { ship: Ship; x: number; y: number; angle: number }>();
    for (const ship of fleet?.ships ?? []) {
      // Between this tick's place and the next's, as shots are drawn between ticks.
      const a = shipPosition(ship, state.tick);
      const b = shipPosition(ship, state.tick + 1);
      const x = (a.x + (b.x - a.x) * tickFraction) / 256 + SHIP_SIZE / 2;
      const y = (a.y + (b.y - a.y) * tickFraction) / 256 + SHIP_SIZE / 2;
      const [hx, hy] =
        ship.run === null
          ? (HEADINGS[ship.heading] as readonly [number, number])
          : [ship.run.dx, ship.run.dy];
      const angle = Math.atan2(hx, -hy);
      const sailing = ship.run !== null && (b.x !== a.x || b.y !== a.y);
      if (sailing && !motionReduced()) this.drawWake(view, x, y, hx, hy, look.wake);
      const alpha = Math.min(1, (now - ship.arrivedTick) / Math.max(1, fadeTicks));
      this.place(view, art, ship.kind, x, y, angle, alpha);
      seen.set(ship.id, { ship, x, y, angle });
    }

    // Ships gone since the last frame fade where they were: recycled at the coast for now; sunk,
    // with its own picture, from CA4.
    for (const [id, last] of this.seen) {
      if (!seen.has(id)) this.leaving.push({ ...last, left: look.fadeMs });
    }
    this.seen = seen;
    this.leaving = this.leaving.filter((l) => (l.left -= deltaMs) > 0);
    for (const l of this.leaving) {
      this.place(view, art, l.ship.kind, l.x, l.y, l.angle, l.left / Math.max(1, look.fadeMs));
    }

    this.wake.end();
    this.ships.end();
  }

  /** Forgets every ship, for a match left: nothing fades into the next. */
  reset(): void {
    this.seen.clear();
    this.leaving = [];
  }

  private place(
    view: ViewTransform,
    art: ArtConfig,
    kind: ShipKind,
    x: number,
    y: number,
    angle: number,
    alpha: number,
  ): void {
    const tile = view.tile;
    const body = this.book.get(`ship:${kind}`, tile, (g) => drawShip(g, tile, art, kind));
    this.ships.place(body, tileX(view, x), tileY(view, y), { rotation: angle, alpha });
  }

  private drawWake(
    view: ViewTransform,
    x: number,
    y: number,
    dx: number,
    dy: number,
    colour: string,
  ): void {
    const tile = view.tile;
    const length = Math.hypot(dx, dy);
    for (let k = 1; k <= WAKE_PUFFS; k++) {
      const back = 0.6 + k * WAKE_STEP;
      this.wake.disc(
        tileX(view, x - (dx / length) * back),
        tileY(view, y - (dy / length) * back),
        tile * (0.12 + 0.05 * k),
        hex(colour),
        0.45 * (1 - k / (WAKE_PUFFS + 1)),
      );
    }
  }
}

/**
 * One ship seen from above, bow up, centred on the origin: a pointed hull, its deck, two masts
 * with their square sails across the beam and a pennant. The kinds differ in length and beam
 * and in the sails' colour; a fireship glows at its bow.
 */
function drawShip(g: Graphics, tile: number, art: ArtConfig, kind: ShipKind): void {
  const look = art.campaign;
  const length = 1.7 * tile * look.lengths[kind];
  const beam = (kind === 'transport' ? 0.82 : 0.7) * tile * (kind === 'raider' ? 1 : 1.05);
  const half = length / 2;
  const hull = [
    0,
    -half,
    beam / 2,
    -half * 0.35,
    beam / 2,
    half * 0.85,
    0,
    half,
    -beam / 2,
    half * 0.85,
    -beam / 2,
    -half * 0.35,
  ];
  g.poly(hull.map((v, i) => (i % 2 === 1 ? v + tile * 0.06 : v + tile * 0.04)));
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.poly(hull);
  g.fill({ color: hex(look.hull) });
  g.poly(hull.map((v) => v * 0.78));
  g.fill({ color: hex(look.deck) });
  if (kind === 'fireship') {
    g.circle(0, -half * 0.75, beam * 0.45);
    g.fill({ color: 0xff8a2a, alpha: 0.35 });
  }
  const sail = hex(look.sails[kind]);
  for (const at of [-0.28, 0.25]) {
    const y = at * length;
    const width = beam * (at < 0 ? 1.25 : 1.4);
    g.roundRect(-width / 2, y - tile * 0.09, width, tile * 0.18, tile * 0.05);
    g.fill({ color: sail });
    g.stroke({ color: 0x000000, alpha: 0.3, width: Math.max(1, tile * 0.03) });
    g.circle(0, y, tile * 0.06);
    g.fill({ color: hex(look.hull) });
  }
  g.poly([
    0,
    -0.28 * length,
    tile * 0.28,
    -0.28 * length - tile * 0.07,
    0,
    -0.28 * length - tile * 0.14,
  ]);
  g.fill({ color: sail });
  if (kind === 'transport') {
    // Soldiers on deck, waiting to land.
    for (const [px, py] of [
      [-0.15, 0.02],
      [0.15, 0.02],
      [0, -0.06],
    ] as const) {
      g.circle(px * tile, py * length, tile * 0.07);
      g.fill({ color: 0x7a1e1e });
    }
  }
}
