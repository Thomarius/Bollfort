import { Container, type Graphics } from 'pixi.js';
import type { ArtConfig, ShipKind } from '@bollfort/config';
import {
  HEADINGS,
  SHIP_SIZE,
  shipPosition,
  type FleetShot,
  type MatchState,
  type Ship,
} from '@bollfort/sim';

import { motionReduced } from '../motion.js';
import { Discs, StampBook, Stamps } from './stamps.js';
import { hex, tileX, tileY, type ViewTransform } from './theme.js';

/**
 * The campaign's enemy drawn plainly over every style (docs/CAMPAIGN.md §14.4), until a style
 * draws its own: the ships, one design told apart by size and sail colour, the same on every
 * board. Stamped — a ship is drawn once per kind and tile size, then only placed and turned — so
 * a fleet of twenty costs no triangulation a frame (CLAUDE.md, Drawing a style cheaply).
 */

/** A ship gone from the match, still fading where it was last seen: recycled at the coast. */
interface Leaving {
  ship: Ship;
  x: number;
  y: number;
  angle: number;
  /** Milliseconds left of its fade. */
  left: number;
}

/** A ship going down where it was sunk, in tiles, its centre. */
interface Sinking {
  ship: Ship;
  x: number;
  y: number;
  angle: number;
  /** Milliseconds since it was sunk. */
  age: number;
}

/** Wake puffs behind a sailing ship, and how far apart, in tiles. */
const WAKE_PUFFS = 4;
const WAKE_STEP = 0.32;

/** How long a hit's splinters fly, and a sinking lasts, in milliseconds. */
const HIT_MS = 500;
const SINK_MS = 1600;

/** Splinters and smoke a hit throws, as fractions of a turn round the ship. */
const SPLINTERS = [0.05, 0.21, 0.38, 0.55, 0.71, 0.88];

/** A fleet shot's ball, its shadow and the arc it rises in, against its range. */
const BALL = 0x23201d;
const SHADOW = 0x000000;
const ARC = 0.22;

export class CampaignMarks {
  readonly root = new Container({ label: 'campaign' });
  private readonly book = new StampBook();
  /** Foam, wakes and shadows on the water, under the ships. */
  private readonly water = new Discs();
  private readonly ships = new Stamps();
  /** Splinters, smoke and the fleet's balls in the air, over the ships. */
  private readonly air = new Discs();
  /** Where each ship was drawn last frame, by id, so one gone fades out there. */
  private seen = new Map<number, { ship: Ship; x: number; y: number; angle: number }>();
  private leaving: Leaving[] = [];
  private sinking: Sinking[] = [];
  /** Ships just hit, by id, and how long ago. */
  private hits = new Map<number, number>();

  constructor() {
    this.root.addChild(this.water.container, this.ships.container, this.air.container);
  }

  /** A ship hit: splinters fly from it a moment. */
  noteHit(shipId: number): void {
    this.hits.set(shipId, 0);
  }

  /** A ship sunk at (x, y), its corner in 1/256 of a tile: it goes down there, not fading. */
  noteSunk(ship: Ship, x: number, y: number): void {
    const last = this.seen.get(ship.id);
    this.seen.delete(ship.id);
    this.sinking.push({
      ship,
      x: x / 256 + SHIP_SIZE / 2,
      y: y / 256 + SHIP_SIZE / 2,
      angle: last?.angle ?? 0,
      age: 0,
    });
  }

  draw(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    tickFraction: number,
    deltaMs: number,
  ): void {
    const fleet = state.campaign;
    const idle = this.seen.size === 0 && this.leaving.length === 0 && this.sinking.length === 0;
    if (fleet === null && idle) return;
    const tile = view.tile;
    const look = art.campaign;
    const fadeTicks = (look.fadeMs / 1000) * state.ruleset.tickRateHz;
    const now = state.tick + tickFraction;
    const moving = !motionReduced();
    this.water.begin(tile);
    this.ships.begin();
    this.air.begin(tile);

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
      if (sailing && moving) this.drawWake(view, x, y, hx, hy, look.wake);
      const alpha = Math.min(1, (now - ship.arrivedTick) / Math.max(1, fadeTicks));
      this.place(view, art, ship.kind, x, y, angle, { alpha });
      seen.set(ship.id, { ship, x, y, angle });
      const hit = this.hits.get(ship.id);
      if (hit !== undefined) this.drawHit(view, x, y, hit / HIT_MS, look.hull);
    }
    for (const [id, age] of this.hits) {
      if (age + deltaMs >= HIT_MS || !seen.has(id)) this.hits.delete(id);
      else this.hits.set(id, age + deltaMs);
    }

    // Ships gone since the last frame and not sunk fade where they were: recycled at the coast.
    for (const [id, last] of this.seen) {
      if (!seen.has(id)) this.leaving.push({ ...last, left: look.fadeMs });
    }
    this.seen = seen;
    this.leaving = this.leaving.filter((l) => (l.left -= deltaMs) > 0);
    for (const l of this.leaving) {
      const alpha = l.left / Math.max(1, look.fadeMs);
      this.place(view, art, l.ship.kind, l.x, l.y, l.angle, { alpha });
    }

    // Sinking: it lists, settles and goes under, a ring of foam spreading where it was.
    this.sinking = this.sinking.filter((s) => (s.age += deltaMs) < SINK_MS);
    for (const s of this.sinking) {
      const p = s.age / SINK_MS;
      const ring = moving ? 0.6 + p * 1.4 : 1.2;
      this.water.disc(
        tileX(view, s.x),
        tileY(view, s.y),
        tile * ring,
        hex(look.wake),
        0.5 * (1 - p),
      );
      this.place(view, art, s.ship.kind, s.x, s.y, s.angle + (moving ? p * 0.5 : 0), {
        alpha: 1 - p,
        scale: 1 - 0.45 * p,
      });
      if (p < 0.4) this.drawHit(view, s.x, s.y, p / 0.4, look.hull);
    }

    for (const shot of fleet?.shots ?? []) this.drawBall(view, shot, now);

    this.water.end();
    this.ships.end();
    this.air.end();
  }

  /** A fleet shot in flight: its ball rising and falling over the line it flies, its shadow under. */
  private drawBall(view: ViewTransform, shot: FleetShot, now: number): void {
    const tile = view.tile;
    const span = Math.max(1, shot.impactTick - shot.launchTick);
    const p = Math.min(1, Math.max(0, (now - shot.launchTick) / span));
    const fromX = shot.fromX / 256;
    const fromY = shot.fromY / 256;
    const toX = shot.toX + 0.5;
    const toY = shot.toY + 0.5;
    const x = fromX + (toX - fromX) * p;
    const y = fromY + (toY - fromY) * p;
    const range = Math.hypot(toX - fromX, toY - fromY);
    const lift = Math.sin(Math.PI * p) * range * ARC;
    this.water.disc(tileX(view, x), tileY(view, y), tile * 0.16, SHADOW, 0.25);
    this.air.disc(tileX(view, x), tileY(view, y - lift), tile * 0.2, BALL, 1);
  }

  /** Splinters and a puff of smoke thrown out from a ship, `p` of the way through. */
  private drawHit(view: ViewTransform, x: number, y: number, p: number, hull: string): void {
    const tile = view.tile;
    const reach = 0.3 + p * 0.9;
    this.air.disc(
      tileX(view, x),
      tileY(view, y),
      tile * (0.35 + p * 0.5),
      0x9a9a9a,
      0.45 * (1 - p),
    );
    for (const turn of SPLINTERS) {
      const a = turn * Math.PI * 2;
      this.air.disc(
        tileX(view, x + Math.cos(a) * reach),
        tileY(view, y + Math.sin(a) * reach),
        tile * 0.07,
        hex(hull),
        1 - p,
      );
    }
  }

  private place(
    view: ViewTransform,
    art: ArtConfig,
    kind: ShipKind,
    x: number,
    y: number,
    angle: number,
    options: { alpha: number; scale?: number },
  ): void {
    const tile = view.tile;
    const body = this.book.get(`ship:${kind}`, tile, (g) => drawShip(g, tile, art, kind));
    this.ships.place(body, tileX(view, x), tileY(view, y), { rotation: angle, ...options });
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
      this.water.disc(
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
