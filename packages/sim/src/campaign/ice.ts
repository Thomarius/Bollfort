import type { CampaignLevelRules } from '@bollfort/config';

import { FREEZE_PENDING } from '../frost.js';
import { Structure, Terrain, type Freeze, type MatchState } from '../types.js';
import { roundsInLevel } from './fleet.js';
import type { FleetShot } from './state.js';

/**
 * A frost ship's ice (docs/CAMPAIGN.md §7): the Frost Cannon's freeze, drawn and refused as it is,
 * made to last. Where a frost ship's shot lands on land — the wall it cleared or bare ground — the
 * tile freezes for the build phases to come: two in the campaign's first rounds, three later. The
 * count goes down as each battle opens, so a player knows at a build phase's start what will still
 * be frozen at its end. Frozen ground takes no piece, no gun and no grunt, but is not wall: a ring
 * with ice in it is open until it is rebuilt round the ice.
 */

/** Whether a freeze is a campaign's, lasting build phases, rather than a Frost Cannon's. */
export function lasting(freeze: Freeze): boolean {
  return freeze.buildsLeft !== undefined;
}

/** Whether a frost ship's ice lies on a tile, whatever the phase: no gun nor grunt goes there. */
export function iced(state: MatchState, tile: number): boolean {
  return state.frozen.some((f) => f.tile === tile && lasting(f));
}

/** A frost ship's shot has landed: its tile frozen, if it is land a piece could go on. */
export function freezeFromFleet(state: MatchState, shot: FleetShot): void {
  const tile = shot.toY * state.width + shot.toX;
  if (state.terrain[tile] !== Terrain.Land || state.structure[tile] !== Structure.Empty) return;
  const { early, late, lateFromRound } = (state.ruleset.campaign as CampaignLevelRules).ice;
  const builds = roundsInLevel(state) >= lateFromRound ? late : early;
  const fresh: Freeze = {
    tile,
    share: 1,
    throughOvertime: true,
    thawTick: FREEZE_PENDING,
    buildsLeft: builds,
  };
  const known = state.frozen.find((f) => f.tile === tile);
  // Replaced, never changed in place, as `freezeTile` does; frozen twice, the longer stays.
  if (known === undefined) state.frozen = [...state.frozen, fresh];
  else if ((known.buildsLeft ?? 0) < builds) {
    state.frozen = state.frozen.map((f) => (f === known ? fresh : f));
  }
  state.events.push({ kind: 'tile_frozen', tick: state.tick, shotId: shot.id, owner: -1, tile });
}

/** As a battle opens: a build phase fewer left on every patch of ice, and the spent ones gone. */
export function ageIce(state: MatchState): void {
  if (!state.frozen.some(lasting)) return;
  state.frozen = state.frozen
    .map((f) => (lasting(f) ? { ...f, buildsLeft: (f.buildsLeft as number) - 1 } : f))
    .filter((f) => !lasting(f) || (f.buildsLeft as number) > 0);
}
