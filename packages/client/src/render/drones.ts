import type { ArtConfig } from '@bollfort/config';
import { barrelsOf, isAwake, type Cannon, type MatchState, type Shot } from '@bollfort/sim';
import { Container, Graphics } from 'pixi.js';

import { motionReduced } from '../motion.js';
import { clearDrawn } from './clearDrawn.js';
import { Discs, StampBook, Stamps } from './stamps.js';
import { drawShotTarget, playerColour, tileX, tileY, type ViewTransform } from './theme.js';

/**
 * The Drone Towers' drones and missiles (docs/SPECIAL_TOWERS.md §2.10, DR3; the user's,
 * 2026-11-20): one shape for every style, over them all in the towers' layer, as the emblems are.
 *
 * - **A drone per barrel**, 2 or 3, circling its tower in its owner's colour while it may fire —
 *   in combat, active and awake — and parked on the tower's corners otherwise, asleep, inert or
 *   between barrages.
 * - **A missile** for every drone shot in the air, from where its drone was as it launched to the
 *   tile, on a low arc, a smoke trail behind and a flame at its tail. The styles never draw these
 *   shots (`Scene`'s `withoutTowerShots`), so the ring where one will land is drawn here, for its
 *   owner only, as every style draws it for a shot of theirs (`drawShotTarget`).
 *
 * Everything moves with the match's clock, not the frame's, so a paused match holds still and a
 * missile leaves from exactly where its drone was. Stamped: the drones and missiles are drawn once
 * a tile size and only placed, the smoke is discs (CLAUDE.md, drawing a style cheaply).
 */

/** One turn of a drone round its tower, in seconds of the match. */
const ORBIT_S = 2.4;
/** How far from the tower's centre the drones circle, in tiles. */
const ORBIT_TILES = 1.2;
/**
 * A drone's span and a missile's length, in tiles: 0.42 and 0.5 at first, lost on the tower
 * menu's preview, whose tiles are small.
 */
const DRONE_TILES = 0.66;
const MISSILE_TILES = 0.62;
/** Smoke puffs behind a missile, and how far apart along its flight. */
const PUFFS = 6;
const PUFF_STEP = 0.022;
const SMOKE = 0x9aa0a8;
const FLAME = 0xffb43a;
const INERT = 0x9a9aa4;

export class DroneMarks {
  readonly root = new Container({ label: 'drones' });
  private readonly book = new StampBook();
  private readonly smoke = new Discs();
  private readonly bodies = new Stamps();
  /** The rings where the player's own missiles will land; cleared once while there are none. */
  private readonly targets = new Graphics();
  private targetsShown = false;

  constructor() {
    this.root.addChild(this.smoke.container, this.bodies.container, this.targets);
  }

  draw(
    state: MatchState,
    view: ViewTransform,
    art: ArtConfig,
    humanPlayer: number,
    tickFraction: number,
  ): void {
    const tile = view.tile;
    const seconds = (state.tick + tickFraction) / state.ruleset.tickRateHz;
    this.smoke.begin(tile);
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

    if (towers.length > 0) {
      const drone = this.book.get('drone', tile, (g) => drawDrone(g, tile));
      const moving = !motionReduced();
      for (const tower of towers) {
        const flying = state.phase === 'combat' && tower.active && isAwake(state, tower);
        const tint = tower.active ? playerColour(art, tower.owner, 'light') : INERT;
        const n = barrelsOf(tower);
        for (let k = 0; k < n; k++) {
          const at = flying ? dronePlace(tower, k, moving ? seconds : 0) : parkedPlace(tower, k);
          this.bodies.place(drone, tileX(view, at.x), tileY(view, at.y), {
            tint,
            scale: flying ? 1 : 0.8,
          });
        }
      }
    }
    this.smoke.end();
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

  destroy(): void {
    this.smoke.destroy();
    this.bodies.destroy();
    this.book.destroy();
    this.root.destroy({ children: false });
    this.targets.destroy();
  }
}

const rate = (state: MatchState): number => state.ruleset.tickRateHz;

/** Which of its tower's drones a missile left from: by its shot's id, so the drones take turns. */
function launchIndex(shot: Shot, tower: Cannon): number {
  return shot.id % barrelsOf(tower);
}

/** Where drone `k` of a tower is at this time of the match, in tile coordinates. */
function dronePlace(tower: Cannon, k: number, seconds: number): { x: number; y: number } {
  const n = barrelsOf(tower);
  // Each tower's drones start at an angle of their own, so neighbours do not fly in step.
  const angle = (seconds / ORBIT_S) * Math.PI * 2 + (k / n) * Math.PI * 2 + tower.id * 1.7;
  return {
    x: tower.x + tower.w / 2 + Math.cos(angle) * ORBIT_TILES,
    y: tower.y + tower.h / 2 + Math.sin(angle) * ORBIT_TILES * 0.8,
  };
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
 * A drone from above, centred on the origin: four rotors on crossed arms. The rotors are white,
 * to take the owner's colour as a tint; the arms and body dark, which a tint leaves dark — so it
 * reads on a ground of its owner's colour too, where a drone all in that colour was lost.
 */
function drawDrone(g: Graphics, tile: number): void {
  const s = (DRONE_TILES * tile) / 2;
  const dark = 0x22242c;
  const edge = { width: Math.max(1, tile / 14), color: 0x101116 };
  g.moveTo(-s * 0.68, -s * 0.68).lineTo(s * 0.68, s * 0.68);
  g.moveTo(s * 0.68, -s * 0.68).lineTo(-s * 0.68, s * 0.68);
  g.stroke({ width: Math.max(2, tile / 7), color: dark });
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.circle(x * s * 0.68, y * s * 0.68, s * 0.36);
  }
  g.fill({ color: 0xffffff });
  g.stroke(edge);
  g.roundRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.14);
  g.fill({ color: dark });
  g.stroke(edge);
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
