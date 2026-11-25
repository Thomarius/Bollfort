import type { ShipKind } from '@bollfort/config';

import type { Hasher } from '../hash.js';
import type { SpawnPoint } from './terrain.js';

/**
 * A campaign level's own state (docs/CAMPAIGN.md §15.2): the enemy fleet, and the counters that
 * drive it. Present only in a campaign match (`state.campaign`), and hashed only then, so versus
 * play's fingerprints are as they were. Never transmitted as such: every client steps it from the
 * seed and the actions, as it steps everything else.
 */

/** Counts by kind, in `SHIP_KINDS` order: raider, transport, fireship. */
export type KindCounts = [number, number, number];

/** A straight run across the sea, one per battle in practice (CAMPAIGN §5.3). */
export interface Run {
  /** The step a tile, each -1, 0 or 1: one of the eight headings. */
  dx: number;
  dy: number;
  tiles: number;
  startTick: number;
  ticksPerTile: number;
}

export interface Ship {
  id: number;
  kind: ShipKind;
  /** The top-left tile of its 2 × 2 footprint where it last stood: a run's start while it sails. */
  x: number;
  y: number;
  hits: number;
  /** Eighths of a turn clockwise from north, towards the castle nearest it. */
  heading: number;
  run: Run | null;
  /** Runs it has planned, which names each run's draw. */
  runs: number;
  arrivedTick: number;
  /** Its one shot in flight, if any (CAMPAIGN §5.4). */
  shotId: number | null;
}

/**
 * A ship's shot. Apart from the players' (`state.shots`), which every style draws in its
 * owner's colour and versus play's rules judge by its shooter: a fleet shot has neither.
 */
export interface FleetShot {
  id: number;
  shipId: number;
  kind: ShipKind;
  /** Where it was fired from, the ship's centre, in 1/256 of a tile. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  launchTick: number;
  impactTick: number;
}

export interface CampaignState {
  /** Ships still to come, not yet drawn into a wave (CAMPAIGN §5.2). */
  pool: KindCounts;
  /** Ships drawn into the current wave, waiting to arrive. */
  wave: KindCounts;
  ships: Ship[];
  nextShipId: number;
  /** Where the next arrival starts looking along `spawnPoints`. */
  spawnCursor: number;
  /** The next tick a ship of each kind still in the wave may arrive. */
  nextArrivalTick: number;
  /** The cannons the players were given this round, which the next wave grows by. */
  cannonsGiven: number;
  /** The fleet's shots in flight. */
  shots: FleetShot[];
  nextShotId: number;
  /** The next tick a target is handed to a ship, in a battle. */
  nextFireTick: number;
  /** The ship that fired last, by id: the next to fire is the next after it. */
  fireCursor: number;
  /** The tiles aimed at last, newest last, which the aim skips (CAMPAIGN §5.5). */
  aimed: number[];
  /** Team wall tiles cleared this battle, which the aim spreads its fire away from. */
  struck: number[];
  /** Open sea, by tile: from the terrain, never changed, so not hashed. */
  sea: Uint8Array;
  /** Around the map's edge, clockwise: from the terrain too. */
  spawnPoints: SpawnPoint[];
}

const KIND_CODES: readonly ShipKind[] = ['raider', 'transport', 'fireship'];

/** The campaign's part of the fingerprint, after everything versus play hashes. */
export function hashCampaign(h: Hasher, campaign: CampaignState): void {
  for (const n of campaign.pool) h.i32(n);
  for (const n of campaign.wave) h.i32(n);
  h.i32(campaign.nextShipId)
    .i32(campaign.spawnCursor)
    .i32(campaign.nextArrivalTick)
    .i32(campaign.cannonsGiven);
  h.u32(campaign.ships.length);
  for (const s of campaign.ships) {
    h.i32(s.id)
      .u32(KIND_CODES.indexOf(s.kind))
      .i32(s.x)
      .i32(s.y)
      .i32(s.hits)
      .i32(s.heading)
      .i32(s.runs)
      .i32(s.arrivedTick)
      .nullable(s.shotId);
    if (s.run === null) {
      h.bool(false);
    } else {
      const r = s.run;
      h.bool(true).i32(r.dx).i32(r.dy).i32(r.tiles).i32(r.startTick).i32(r.ticksPerTile);
    }
  }
  h.i32(campaign.nextShotId).i32(campaign.nextFireTick).i32(campaign.fireCursor);
  h.u32(campaign.shots.length);
  for (const s of campaign.shots) {
    h.i32(s.id).i32(s.shipId).i32(s.fromX).i32(s.fromY).i32(s.toX).i32(s.toY);
    h.i32(s.launchTick).i32(s.impactTick);
  }
  h.u32(campaign.aimed.length);
  for (const i of campaign.aimed) h.i32(i);
  h.u32(campaign.struck.length);
  for (const i of campaign.struck) h.i32(i);
}
