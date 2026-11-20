import type { ArtConfig } from '@bollfort/config';
import { barrelsOf, isAwake, type Cannon, type MatchState, type Shot } from '@bollfort/sim';
import { Container, Graphics } from 'pixi.js';

import { motionReduced } from '../motion.js';
import { clearDrawn } from './clearDrawn.js';
import { Discs, StampBook, Stamps } from './stamps.js';
import { drawShotTarget, playerColour, tileX, tileY, type ViewTransform } from './theme.js';

/**
 * The Drone Towers' drones and missiles (docs/SPECIAL_TOWERS.md §2.10, DR3; the user's,
 * 2026-11-20), over every style in the towers' layer, as the emblems are. Where they fly, when
 * they park and the missiles are shared; what a drone looks like is the style's (`DroneLook`, the
 * user's, 2026-11-20: a modern quadcopter looked wrong in most styles), the look in front's.
 *
 * - **A drone per barrel**, 2 or 3, circling its tower in its owner's colour while it may fire —
 *   in combat, active and awake — and parked on the tower's corners otherwise, asleep, inert or
 *   between barrages.
 * - **A missile** for every drone shot in the air, the same in every style for now (the user's),
 *   from where its drone was as it launched to the tile, on a low arc, a smoke trail behind and a
 *   flame at its tail. The styles never draw these shots (`Scene`'s `withoutTowerShots`), so the
 *   ring where one will land is drawn here, for its owner only, as every style draws it for a shot
 *   of theirs (`drawShotTarget`).
 *
 * Everything moves with the match's clock, not the frame's, so a paused match holds still and a
 * missile leaves from exactly where its drone was. Stamped: each pose of a drone is drawn once a
 * tile size and only placed, the smoke and shadows are discs (CLAUDE.md, drawing a style cheaply).
 */

/** One turn of a drone round its tower, in seconds of the match. */
const ORBIT_S = 2.4;
/** How far from the tower's centre the drones circle, in tiles, across and (squashed) down. */
export const ORBIT_TILES = 1.2;
export const ORBIT_SQUASH = 0.8;
/**
 * A drone's span and a missile's length, in tiles: 0.42 and 0.5 at first, lost on the tower
 * menu's preview, whose tiles are small.
 */
export const DRONE_TILES = 0.66;
const MISSILE_TILES = 0.62;
/** Smoke puffs behind a missile, and how far apart along its flight. */
const PUFFS = 6;
const PUFF_STEP = 0.022;
const SMOKE = 0x9aa0a8;
const FLAME = 0xffb43a;
const INERT = 0x9a9aa4;
/** A flying drone's shadow on the ground below it, in tiles, down and to the right. */
const SHADOW_OFFSET = { x: 0.16, y: 0.3 };

/** The pose a drone's drawing is asked for while parked on its tower. */
export const PARKED = -1;

/**
 * How a style draws its drones. A drone is centred on the origin and, where it `faces`, points
 * along +x, its span about `DRONE_TILES` of a tile. It is drawn in up to three layers, each a
 * stamp: `body` in the style's own colours, `mark` in white to take its owner's colour as a tint
 * (stone grey while inert), and `ink` over both, again the style's own. The owner's colour has
 * to show on ground of that colour too, so a mark wants a dark edge in the body or the ink.
 *
 * Each pose — a frame of its beat, or `PARKED` — is drawn once a tile size.
 */
export interface DroneLook {
  /** Names its stamps in the book, unique among the looks. */
  readonly key: string;
  /** The frames of its beat — wings, rotors, a pulse — drawn as poses 0 to `frames - 1`. */
  readonly frames?: number;
  /** One beat through every frame, in milliseconds of the match. */
  readonly beatMs?: number;
  /** Turned along its flight, nose along +x; otherwise held upright. */
  readonly faces?: boolean;
  /** Its turning held to so many steps a full turn (Pixel's four, which keep its pixels square). */
  readonly turns?: number;
  /** Not turned but mirrored when flying leftward, for a drone drawn in profile. */
  readonly mirrors?: boolean;
  /** Turning on itself, radians a second, as a spinning mat does. */
  readonly spin?: number;
  /** Fluttering off its course by up to so many tiles, as a moth does. */
  readonly wobble?: number;
  /** Its place snapped to the style's pixel, `tileSizePx` of them a tile (Pixel's). */
  readonly pixels?: number;
  /** A shadow on the ground while it flies; true unless said otherwise. */
  readonly shadow?: boolean;
  /** How much smaller it sits parked; 0.8 unless said otherwise. */
  readonly parkedScale?: number;
  /** Its mark drawn under its body rather than over it, as a halo is. */
  readonly markUnder?: boolean;
  body?(g: Graphics, tile: number, pose: number): void;
  mark?(g: Graphics, tile: number, pose: number): void;
  ink?(g: Graphics, tile: number, pose: number): void;
  /**
   * Something drawn round each tower while its drones fly, centred on it, the orbit `rx` by
   * `ry` pixels across, such as a track the drones run on. `mark` is tinted as a drone's is.
   */
  readonly ring?: {
    body?(g: Graphics, rx: number, ry: number, tile: number): void;
    mark?(g: Graphics, rx: number, ry: number, tile: number): void;
  };
}

/**
 * The drone the towers had first, for a style that brings none: a quadcopter from above, four
 * rotors on crossed arms. The rotors take the owner's colour; the arms and body are dark, which
 * a tint leaves dark — so it reads on a ground of its owner's colour too, where a drone all in
 * that colour was lost.
 */
export const QUADCOPTER: DroneLook = {
  key: 'quadcopter',
  body(g, tile) {
    const s = (DRONE_TILES * tile) / 2;
    const dark = 0x22242c;
    g.moveTo(-s * 0.68, -s * 0.68).lineTo(s * 0.68, s * 0.68);
    g.moveTo(s * 0.68, -s * 0.68).lineTo(-s * 0.68, s * 0.68);
    g.stroke({ width: Math.max(2, tile / 7), color: dark });
  },
  mark(g, tile) {
    const s = (DRONE_TILES * tile) / 2;
    for (const [x, y] of CORNERS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.36);
    g.fill({ color: 0xffffff });
  },
  ink(g, tile) {
    const s = (DRONE_TILES * tile) / 2;
    for (const [x, y] of CORNERS) g.circle(x * s * 0.68, y * s * 0.68, s * 0.36);
    g.stroke({ width: Math.max(1, tile / 14), color: 0x101116 });
    g.roundRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.14);
    g.fill({ color: 0x22242c });
    g.stroke({ width: Math.max(1, tile / 14), color: 0x101116 });
  },
};

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

type Layer = 'body' | 'mark' | 'ink';

export class DroneMarks {
  readonly root = new Container({ label: 'drones' });
  private readonly book = new StampBook();
  private readonly smoke = new Discs();
  private readonly rings = new Stamps();
  private readonly bodies = new Stamps();
  /** The rings where the player's own missiles will land; cleared once while there are none. */
  private readonly targets = new Graphics();
  private targetsShown = false;

  constructor() {
    this.root.addChild(
      this.smoke.container,
      this.rings.container,
      this.bodies.container,
      this.targets,
    );
  }

  draw(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    humanPlayer: number,
    tickFraction: number,
    look: DroneLook = QUADCOPTER,
  ): void {
    const tile = view.tile;
    const seconds = (state.tick + tickFraction) / state.ruleset.tickRateHz;
    this.smoke.begin(tile);
    this.rings.begin();
    this.bodies.begin();
    const missiles = state.shots.filter((s) => s.kind === 'drone');
    const towers = state.cannons.filter((c) => c.kind === 'drone');

    if (missiles.length > 0) {
      const missile = this.book.get('missile', tile, (g) => drawMissile(g, tile));
      for (const shot of missiles) {
        const tower = towers.find((c) => c.id === shot.cannonId);
        const from =
          tower === undefined
            ? { x: shot.fromX + 0.5, y: shot.fromY + 0.5 }
            : dronePlace(tower, launchIndex(shot, tower), shot.launchTick / rate(state));
        const span = Math.max(1, shot.impactTick - shot.launchTick);
        const p = Math.min(1, Math.max(0, (state.tick + tickFraction - shot.launchTick) / span));
        const to = { x: shot.toX + 0.5, y: shot.toY + 0.5 };
        for (let k = PUFFS; k >= 1; k--) {
          const q = p - k * PUFF_STEP;
          if (q <= 0) continue;
          const at = flightPoint(from, to, q);
          const fade = 1 - k / (PUFFS + 1);
          this.smoke.disc(
            tileX(view, at.x),
            tileY(view, at.y),
            tile * (0.07 + 0.05 * (k / PUFFS)),
            SMOKE,
            0.5 * fade,
          );
        }
        const at = flightPoint(from, to, p);
        const ahead = flightPoint(from, to, Math.min(1, p + 0.01));
        const angle = Math.atan2(ahead.y - at.y, ahead.x - at.x);
        const [x, y] = [tileX(view, at.x), tileY(view, at.y)];
        const tail = (MISSILE_TILES / 2) * tile;
        this.smoke.disc(
          x - Math.cos(angle) * tail,
          y - Math.sin(angle) * tail,
          tile * 0.09,
          FLAME,
          0.9,
        );
        this.bodies.place(missile, x, y, {
          rotation: angle,
          tint: playerColour(art, shot.owner, 'light'),
        });
      }
    }

    if (towers.length > 0) this.drawDrones(state, view, art, towers, seconds, look);
    this.smoke.end();
    this.rings.end();
    this.bodies.end();

    const own = missiles.filter((s) => s.owner === humanPlayer);
    if (own.length > 0 || this.targetsShown) {
      clearDrawn(this.targets);
      for (const shot of own) {
        const span = Math.max(1, shot.impactTick - shot.launchTick);
        const t = Math.min(1, (state.tick + tickFraction - shot.launchTick) / span);
        drawShotTarget(this.targets, view, shot, t, art, humanPlayer);
      }
      this.targetsShown = own.length > 0;
    }
  }

  private drawDrones(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    towers: readonly Cannon[],
    seconds: number,
    look: DroneLook,
  ): void {
    const tile = view.tile;
    const moving = !motionReduced();
    const frames = Math.max(1, look.frames ?? 1);
    const beatS = (look.beatMs ?? 400) / 1000;
    const layers: readonly Layer[] = look.markUnder ? ['mark', 'body', 'ink'] : LAYERS;
    // The style's pixel in screen pixels, as Pixel draws its own (`tileSizePx` a tile).
    const pixel = look.pixels === undefined ? 0 : Math.max(1, Math.round(tile / look.pixels));
    const snap = (v: number, origin: number): number =>
      pixel === 0 ? v : origin + Math.round((v - origin) / pixel) * pixel;
    const stamp = (layer: Layer, pose: number): ReturnType<StampBook['get']> | null => {
      const draw = look[layer];
      if (draw === undefined) return null;
      return this.book.get(`${look.key}:${layer}:${pose}`, tile, (g) =>
        draw.call(look, g, tile, pose),
      );
    };
    for (const tower of towers) {
      const flying = state.phase === 'combat' && tower.active && isAwake(state, tower);
      const tint = tower.active ? playerColour(art, tower.owner, 'light') : INERT;
      const n = barrelsOf(tower);
      const cx = tileX(view, tower.x + tower.w / 2);
      const cy = tileY(view, tower.y + tower.h / 2);
      if (flying && look.ring !== undefined) {
        const rx = ORBIT_TILES * tile;
        const ry = rx * ORBIT_SQUASH;
        for (const layer of ['body', 'mark'] as const) {
          const draw = look.ring[layer];
          if (draw === undefined) continue;
          const ring = this.book.get(`${look.key}:ring:${layer}`, tile, (g) =>
            draw.call(look.ring, g, rx, ry, tile),
          );
          this.rings.place(ring, cx, cy, layer === 'mark' ? { tint } : {});
        }
      }
      for (let k = 0; k < n; k++) {
        const time = flying && moving ? seconds : 0;
        let at: { x: number; y: number };
        let heading: number;
        if (flying) {
          at = dronePlace(tower, k, time);
          heading = droneHeading(tower, k, time);
          if (look.wobble !== undefined && moving) {
            // Off its course across it, on two beats that never fall in step.
            const off =
              look.wobble *
              (Math.sin(time * 7.3 + k * 2.1) * 0.6 + Math.sin(time * 11.9 + k) * 0.4);
            at = { x: at.x - Math.sin(heading) * off, y: at.y + Math.cos(heading) * off };
          }
        } else {
          at = parkedPlace(tower, k);
          // Parked facing out from the tower, as a bird on a battlement would.
          heading = Math.atan2(at.y - (tower.y + tower.h / 2), at.x - (tower.x + tower.w / 2));
        }
        let rotation = 0;
        let flip = 1;
        if (look.faces) {
          const step = look.turns === undefined ? 0 : (Math.PI * 2) / look.turns;
          rotation = step === 0 ? heading : Math.round(heading / step) * step;
        } else if (look.mirrors && Math.cos(heading) < 0) {
          flip = -1;
        }
        if (look.spin !== undefined) rotation += time * look.spin + k * 1.3 + tower.id;
        const pose = !flying
          ? PARKED
          : !moving
            ? 0
            : Math.floor((seconds / beatS + k * 0.37 + tower.id * 0.21) * frames) % frames;
        const scale = flying ? 1 : (look.parkedScale ?? 0.8);
        const x = snap(tileX(view, at.x), view.originX);
        const y = snap(tileY(view, at.y), view.originY);
        if (flying && look.shadow !== false) {
          this.smoke.disc(
            x + SHADOW_OFFSET.x * tile,
            y + SHADOW_OFFSET.y * tile,
            tile * DRONE_TILES * 0.36,
            0x000000,
            0.2,
          );
        }
        for (const layer of layers) {
          const context = stamp(layer, pose);
          if (context === null) continue;
          this.bodies.place(context, x, y, {
            rotation,
            scale: scale * flip,
            scaleY: scale,
            ...(layer === 'mark' ? { tint } : {}),
          });
        }
      }
    }
  }

  destroy(): void {
    this.smoke.destroy();
    this.rings.destroy();
    this.bodies.destroy();
    this.book.destroy();
    this.root.destroy({ children: false });
    this.targets.destroy();
  }
}

const LAYERS: readonly Layer[] = ['body', 'mark', 'ink'];

const rate = (state: MatchState): number => state.ruleset.tickRateHz;

/** Which of its tower's drones a missile left from: by its shot's id, so the drones take turns. */
function launchIndex(shot: Shot, tower: Cannon): number {
  return shot.id % barrelsOf(tower);
}

/** Drone `k`'s angle round its tower at this time of the match. */
function orbitAngle(tower: Cannon, k: number, seconds: number): number {
  const n = barrelsOf(tower);
  // Each tower's drones start at an angle of their own, so neighbours do not fly in step.
  return (seconds / ORBIT_S) * Math.PI * 2 + (k / n) * Math.PI * 2 + tower.id * 1.7;
}

/** Where drone `k` of a tower is at this time of the match, in tile coordinates. */
function dronePlace(tower: Cannon, k: number, seconds: number): { x: number; y: number } {
  const angle = orbitAngle(tower, k, seconds);
  return {
    x: tower.x + tower.w / 2 + Math.cos(angle) * ORBIT_TILES,
    y: tower.y + tower.h / 2 + Math.sin(angle) * ORBIT_TILES * ORBIT_SQUASH,
  };
}

/** The way drone `k` is flying, along its orbit: clockwise on the screen, y being down. */
function droneHeading(tower: Cannon, k: number, seconds: number): number {
  const angle = orbitAngle(tower, k, seconds);
  return Math.atan2(Math.cos(angle) * ORBIT_SQUASH, -Math.sin(angle));
}

/** Where drone `k` sits parked: on the tower's corners, clear of its emblem in the middle. */
function parkedPlace(tower: Cannon, k: number): { x: number; y: number } {
  const corners = [
    [0.3, 0.3],
    [tower.w - 0.3, 0.3],
    [0.3, tower.h - 0.3],
  ] as const;
  const [dx, dy] = corners[k % corners.length] as readonly [number, number];
  return { x: tower.x + dx, y: tower.y + dy };
}

/** A missile's place at progress `p` of its flight, on a low arc that rises with its length. */
function flightPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  p: number,
): { x: number; y: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(2, length * 0.12) * 4 * p * (1 - p);
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - lift };
}

/**
 * A missile pointing along +x, centred on the origin: its body white, to take the owner's colour,
 * its fins and nose dark, as the drone's frame is.
 */
function drawMissile(g: Graphics, tile: number): void {
  const l = (MISSILE_TILES * tile) / 2;
  const w = l * 0.24;
  const dark = 0x22242c;
  const edge = { width: Math.max(1, tile / 16), color: 0x101116 };
  // Fins at the tail, then the body, then its pointed nose.
  g.poly([-l, -w * 2.2, -l * 0.5, -w, -l * 0.5, w, -l, w * 2.2]);
  g.fill({ color: dark });
  g.stroke(edge);
  g.poly([-l * 0.85, -w, l * 0.5, -w, l * 0.5, w, -l * 0.85, w]);
  g.fill({ color: 0xffffff });
  g.stroke(edge);
  g.poly([l * 0.5, -w, l, 0, l * 0.5, w]);
  g.fill({ color: dark });
  g.stroke(edge);
}
