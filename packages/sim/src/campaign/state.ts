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
      .i32(s.arrivedTick);
    if (s.run === null) {
      h.bool(false);
    } else {
      const r = s.run;
      h.bool(true).i32(r.dx).i32(r.dy).i32(r.tiles).i32(r.startTick).i32(r.ticksPerTile);
    }
  }
}
