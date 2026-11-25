import { Container, type Graphics } from 'pixi.js';
import type { ArtConfig, ShipKind } from '@bollfort/config';
import {
  HEADINGS,
  SHIP_SIZE,
  shipPosition,
  type FleetShot,
  type Grunt,
  type MatchState,
  type Ship,
  type Shot,
} from '@bollfort/sim';

import { motionReduced } from '../motion.js';
import { Discs, StampBook, Stamps } from './stamps.js';
import type { FleetLook } from './fleetLooks.js';
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
  heading: number;
  /** Milliseconds left of its fade. */
  left: number;
}

/** A ship going down where it was sunk, in tiles, its centre. */
interface Sinking {
  ship: Ship;
  x: number;
  y: number;
  heading: number;
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

/** A grunt's step drawn over this long, its club raised this long after a smash. */
const STEP_MS = 280;
const SMASH_MS = 450;
/** A killed grunt's puff, and a landed one's fade in. */
const POOF_MS = 500;
const LAND_MS = 400;

/** A grunt where it was last drawn, to slide it from there to its new tile. */
interface GruntTrack {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  /** Milliseconds since it last stepped, or since it landed. */
  since: number;
  landed: boolean;
}

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
  private seen = new Map<number, { ship: Ship; x: number; y: number; heading: number }>();
  private leaving: Leaving[] = [];
  private sinking: Sinking[] = [];
  /** Ships just hit, by id, and how long ago. */
  private hits = new Map<number, number>();
  /** The grunts, by id, where they were drawn. */
  private tracks = new Map<number, GruntTrack>();
  /** Grunts that just smashed a wall, by id, and how long ago. */
  private smashes = new Map<number, number>();
  /** Grunts just killed, where, and how long ago. */
  private poofs: { x: number; y: number; age: number }[] = [];

  constructor() {
    this.root.addChild(this.water.container, this.ships.container, this.air.container);
  }

  /** A ship hit: splinters fly from it a moment. */
  noteHit(shipId: number): void {
    this.hits.set(shipId, 0);
  }

  /** A grunt smashed the wall it faces: its club comes down. */
  noteSmash(gruntId: number): void {
    this.smashes.set(gruntId, 0);
  }

  /** A grunt killed on its tile: a puff where it stood. */
  noteGruntKilled(x: number, y: number): void {
    this.poofs.push({ x: x + 0.5, y: y + 0.5, age: 0 });
  }

  /** A ship sunk at (x, y), its corner in 1/256 of a tile: it goes down there, not fading. */
  noteSunk(ship: Ship, x: number, y: number): void {
    const last = this.seen.get(ship.id);
    this.seen.delete(ship.id);
    this.sinking.push({
      ship,
      x: x / 256 + SHIP_SIZE / 2,
      y: y / 256 + SHIP_SIZE / 2,
      heading: last?.heading ?? 0,
      age: 0,
    });
  }

  draw(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    tickFraction: number,
    deltaMs: number,
    /** The front look's own drawing of the enemy, where it has one; the shared one otherwise. */
    style: FleetLook | undefined = undefined,
  ): void {
    const fleet = state.campaign;
    const idle =
      this.seen.size === 0 &&
      this.leaving.length === 0 &&
      this.sinking.length === 0 &&
      this.tracks.size === 0 &&
      this.poofs.length === 0;
    if (fleet === null && idle) return;
    const tile = view.tile;
    const look = art.campaign;
    const fadeTicks = (look.fadeMs / 1000) * state.ruleset.tickRateHz;
    const now = state.tick + tickFraction;
    const moving = !motionReduced();
    this.water.begin(tile);
    this.ships.begin();
    this.air.begin(tile);

    const seen = new Map<number, { ship: Ship; x: number; y: number; heading: number }>();
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
      const heading = HEADINGS.findIndex(([dx, dy]) => dx === hx && dy === hy);
      const sailing = ship.run !== null && (b.x !== a.x || b.y !== a.y);
      if (sailing && moving) this.drawWake(view, x, y, hx, hy, look.wake);
      const alpha = Math.min(1, (now - ship.arrivedTick) / Math.max(1, fadeTicks));
      this.place(view, art, style, ship, x, y, heading, { alpha });
      seen.set(ship.id, { ship, x, y, heading });
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
      this.place(view, art, style, l.ship, l.x, l.y, l.heading, { alpha });
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
      this.place(view, art, style, s.ship, s.x, s.y, s.heading, {
        alpha: 1 - p,
        scale: 1 - 0.45 * p,
        list: moving ? p * 0.5 : 0,
      });
      if (p < 0.4) this.drawHit(view, s.x, s.y, p / 0.4, look.hull);
    }

    this.drawGrunts(view, art, style, fleet?.grunts ?? [], deltaMs, moving);

    // A style with cannonballs of its own draws the fleet's shots with them (`fleetShotsAsShots`).
    if (style?.drawsShots !== true) {
      for (const shot of fleet?.shots ?? []) this.drawBall(view, shot, now);
    }

    this.water.end();
    this.ships.end();
    this.air.end();
  }

  /**
   * The grunts: each slid from its last tile to its new one as it steps, bobbing, faded in as it
   * lands, its club brought down as it smashes; a puff where one was killed.
   */
  private drawGrunts(
    view: ViewTransform,
    art: ArtConfig,
    style: FleetLook | undefined,
    grunts: readonly Grunt[],
    deltaMs: number,
    moving: boolean,
  ): void {
    const tile = view.tile;
    const tracks = new Map<number, GruntTrack>();
    for (const grunt of grunts) {
      const old = this.tracks.get(grunt.id);
      const track: GruntTrack =
        old === undefined
          ? { x: grunt.x, y: grunt.y, fromX: grunt.x, fromY: grunt.y, since: 0, landed: true }
          : old.x !== grunt.x || old.y !== grunt.y
            ? { x: grunt.x, y: grunt.y, fromX: old.x, fromY: old.y, since: 0, landed: false }
            : { ...old, since: old.since + deltaMs };
      tracks.set(grunt.id, track);
      const p = moving ? Math.min(1, track.since / STEP_MS) : 1;
      const x = track.fromX + (track.x - track.fromX) * p + 0.5;
      const bob = !track.landed && p < 1 ? Math.sin(p * Math.PI) * 0.12 : 0;
      const y = track.fromY + (track.y - track.fromY) * p + 0.5 - bob;
      const smashing = this.smashes.has(grunt.id);
      const pose = smashing ? 'smash' : 'stand';
      // A style's grunt is drawn facing up and turned; the shared one is drawn for each facing.
      const body =
        style === undefined
          ? this.book.get(`grunt:${pose}:${grunt.facing}`, tile, (g) =>
              drawGrunt(g, tile, art, grunt.facing, smashing),
            )
          : this.book.get(`grunt:${style.key}:${pose}`, tile, (g) =>
              style.grunt(g, tile, art, smashing),
            );
      const alpha = track.landed ? Math.min(1, track.since / LAND_MS) : 1;
      this.water.disc(tileX(view, x), tileY(view, y + 0.3 + bob), tile * 0.22, SHADOW, 0.2 * alpha);
      this.ships.place(
        body,
        this.snap(view, style, tileX(view, x), view.originX),
        this.snap(view, style, tileY(view, y), view.originY),
        {
          alpha,
          rotation: style === undefined ? 0 : (grunt.facing * Math.PI) / 2,
          ...(style?.tint === undefined ? {} : { tint: style.tint }),
        },
      );
    }
    this.tracks = tracks;
    for (const [id, age] of this.smashes) {
      if (age + deltaMs >= SMASH_MS || !tracks.has(id)) this.smashes.delete(id);
      else this.smashes.set(id, age + deltaMs);
    }
    this.poofs = this.poofs.filter((p) => (p.age += deltaMs) < POOF_MS);
    for (const poof of this.poofs) {
      const p = poof.age / POOF_MS;
      const radius = tile * (0.2 + p * 0.45);
      this.air.disc(tileX(view, poof.x), tileY(view, poof.y), radius, 0xb8b0a8, 0.6 * (1 - p));
    }
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

  /**
   * A ship at its centre (x, y), heading one of the eight ways. The shared drawing is turned to
   * the heading; a style's in pixels is its straight or its diagonal sprite turned by quarter
   * turns, its sails marked by the hits taken, on the style's pixel grid, tinted as its board is.
   */
  private place(
    view: ViewTransform,
    art: ArtConfig,
    style: FleetLook | undefined,
    ship: Ship,
    x: number,
    y: number,
    heading: number,
    options: { alpha: number; scale?: number; list?: number },
  ): void {
    const tile = view.tile;
    const { kind } = ship;
    const list = options.list ?? 0;
    const placed = {
      alpha: options.alpha,
      ...(options.scale === undefined ? {} : { scale: options.scale }),
    };
    if (style === undefined) {
      const body = this.book.get(`ship:${kind}`, tile, (g) => drawShip(g, tile, art, kind));
      const rotation = (heading * Math.PI) / 4 + list;
      this.ships.place(body, tileX(view, x), tileY(view, y), { rotation, ...placed });
      return;
    }
    const diagonal = heading % 2 === 1;
    const hits = Math.min(ship.hits, 4);
    const body = this.book.get(
      `ship:${style.key}:${kind}:${hits}:${diagonal ? 'd' : 's'}`,
      tile,
      (g) => style.ship(g, tile, art, kind, hits, diagonal),
    );
    const rotation = Math.floor(heading / 2) * (Math.PI / 2) + list;
    const sx = this.snap(view, style, tileX(view, x), view.originX);
    const sy = this.snap(view, style, tileY(view, y), view.originY);
    this.ships.place(body, sx, sy, {
      rotation,
      ...placed,
      ...(style.tint === undefined ? {} : { tint: style.tint }),
    });
    // By night a lantern burns at the stern.
    if (style.lantern !== undefined) {
      const [hx, hy] = HEADINGS[heading] as readonly [number, number];
      const back = 0.55 / Math.hypot(hx, hy);
      const lx = tileX(view, x - hx * back);
      const ly = tileY(view, y - hy * back);
      this.air.disc(lx, ly, tile * 0.4, style.lantern, 0.22 * options.alpha);
      this.air.disc(lx, ly, tile * 0.1, style.lantern, 0.9 * options.alpha);
    }
  }

  /** A position on the style's pixel grid, from the board's origin, where its look is in pixels. */
  private snap(
    view: ViewTransform,
    style: FleetLook | undefined,
    v: number,
    origin: number,
  ): number {
    if (style?.pixels === undefined) return v;
    const pixel = view.tile / style.pixels;
    return origin + Math.round((v - origin) / pixel) * pixel;
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
 * and in the sails' colour; a frost ship glows cold at its bow.
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
  if (kind === 'frostship') {
    g.circle(0, -half * 0.75, beam * 0.45);
    g.fill({ color: 0xbfeaff, alpha: 0.45 });
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

/**
 * A grunt from above, centred on its tile: a dark red tunic, a head, and a club held out the way
 * it faces — swung up ahead of it as it smashes. The same in every style, so it reads as the enemy.
 */
function drawGrunt(
  g: Graphics,
  tile: number,
  art: ArtConfig,
  facing: number,
  smashing: boolean,
): void {
  const colours = art.campaign.grunt;
  const [fx, fy] = FACING_STEPS[facing] as readonly [number, number];
  g.circle(0, 0, tile * 0.3);
  g.fill({ color: hex(colours.tunic) });
  g.stroke({ color: 0x000000, alpha: 0.45, width: Math.max(1, tile * 0.04) });
  g.circle(fx * tile * 0.08, fy * tile * 0.08, tile * 0.14);
  g.fill({ color: hex(colours.skin) });
  const reach = smashing ? 0.5 : 0.38;
  const side = smashing ? 0 : 0.16;
  const sx = -fy * side;
  const sy = fx * side;
  g.moveTo((fx * 0.15 + sx) * tile, (fy * 0.15 + sy) * tile);
  g.lineTo((fx * reach + sx) * tile, (fy * reach + sy) * tile);
  g.stroke({
    color: hex(colours.club),
    width: Math.max(2, tile * (smashing ? 0.13 : 0.09)),
    cap: 'round',
  });
}

/** A grunt's facings as steps, clockwise from north (the sim's `FACINGS`). */
const FACING_STEPS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * A campaign's fleet shots as the players' shots are, for a style that draws them with its own
 * cannonballs: tiles where the fleet's are in 1/256, the ship's middle read as a gun's is (half a
 * tile in from its footprint's corner), and no owner — no player's target ring is drawn for one.
 */
export function fleetShotsAsShots(state: MatchState): Shot[] {
  const fleet = state.campaign;
  if (fleet === null || fleet.shots.length === 0) return [];
  return fleet.shots.map((s) => ({
    id: -1 - s.id,
    cannonId: -1,
    owner: -1,
    kind: 'cannon',
    cost: 1,
    fromX: s.fromX / 256 - 0.5,
    fromY: s.fromY / 256 - 0.5,
    toX: s.toX,
    toY: s.toY,
    launchTick: s.launchTick,
    impactTick: s.impactTick,
  }));
}
