import { SHIP_KINDS, type CampaignLevelRules } from '@bollfort/config';

import { NEIGHBOURS_4 } from '../grid.js';
import { flightTicks } from '../shots.js';
import { ticksFor } from '../match.js';
import { Structure, type MatchState, type PlayerState, type Shot } from '../types.js';
import { SHIP_SIZE, shipPosition } from './fleet.js';
import { freezeFromFleet } from './ice.js';
import type { CampaignState, FleetShot, Ship } from './state.js';

/**
 * The fleet's guns and the players' against the fleet (docs/CAMPAIGN.md §5.4–§5.6, §11): one
 * target handed to one ship at a time, its shot landing exactly where aimed and clearing a wall;
 * the players' shots hitting ships near where they land, sinking them, and scoring.
 */

function rulesOf(state: MatchState): CampaignLevelRules {
  return state.ruleset.campaign as CampaignLevelRules;
}

function fleetOf(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

/**
 * The tile the fleet would aim at now (CAMPAIGN §5.5), or null with no wall left: every team
 * wall tile scored by its wall neighbours — the middle of a run, where one hit breaches it, above
 * a stub or a thick wall's inside — and by the castles and guns beside it, less the neighbours
 * struck this battle, so the fire spreads rather than widening one hole. The tiles aimed at last
 * are skipped; ties go to the first in columns left to right, each top to bottom.
 */
export function fleetTarget(state: MatchState): number | null {
  const { base, perGuarded, perStruck, skipRecent } = rulesOf(state).fleet.aim;
  const fleet = fleetOf(state);
  const recent = new Set(fleet.aimed.slice(-skipRecent));
  const struck = new Set(fleet.struck);
  const { width: w, height: h } = state;
  let best: number | null = null;
  let bestScore = -Infinity;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (state.structure[i] !== Structure.Wall || state.owner[i] === 0 || recent.has(i)) continue;
      let walls = 0;
      let guarded = 0;
      let near = 0;
      for (const [ox, oy] of NEIGHBOURS_4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        const s = state.structure[n];
        if (s === Structure.Wall) walls++;
        else if (s === Structure.Castle || s === Structure.Cannon) guarded++;
        if (struck.has(n)) near++;
      }
      const score = (base[walls] as number) + perGuarded * guarded - perStruck * near;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  return best;
}

/** A ship's centre at a tick, in 1/256 of a tile. */
function centreOf(ship: Ship, tick: number): { x: number; y: number } {
  const at = shipPosition(ship, tick);
  return { x: at.x + (SHIP_SIZE * 256) / 2, y: at.y + (SHIP_SIZE * 256) / 2 };
}

/**
 * In a battle, every so often, the fleet's best target to the next ship in id order with no shot
 * in the air, which fires at once (CAMPAIGN §5.4: three ships fired eleven shots in a battle, seven
 * twenty). With no wall left the fleet holds its fire.
 */
export function fireFleet(state: MatchState): void {
  const fleet = fleetOf(state);
  if (state.phase !== 'combat' || state.tick >= state.phaseEndTick) return;
  if (state.tick < fleet.nextFireTick) return;
  const rules = rulesOf(state);
  fleet.nextFireTick = state.tick + ticksFor(rules.fleet.fire.everyMs, state.ruleset.tickRateHz);
  const ready = fleet.ships.filter((s) => s.shotId === null);
  if (ready.length === 0) return;
  const ship = ready.find((s) => s.id > fleet.fireCursor) ?? (ready[0] as Ship);
  const target = fleetTarget(state);
  if (target === null) return;
  const toX = target % state.width;
  const toY = (target - toX) / state.width;
  const from = centreOf(ship, state.tick);
  // The flight of a gun's shot from the ship's middle, which `flightTicks` reads in tiles as it
  // reads a gun's centre: half a tile in from the corner of its footprint's middle tile.
  const fromX = from.x / 256 - 0.5;
  const fromY = from.y / 256 - 0.5;
  const shot: FleetShot = {
    id: fleet.nextShotId++,
    shipId: ship.id,
    kind: ship.kind,
    fromX: from.x,
    fromY: from.y,
    toX,
    toY,
    launchTick: state.tick,
    impactTick:
      state.tick + flightTicks(state, fromX, fromY, toX, toY, rules.fleet.fire.flightFactor),
  };
  fleet.shots = [...fleet.shots, shot];
  fleet.ships = fleet.ships.map((s) => (s.id === ship.id ? { ...s, shotId: shot.id } : s));
  fleet.fireCursor = ship.id;
  fleet.aimed = [...fleet.aimed, target].slice(-Math.max(1, rules.fleet.aim.skipRecent));
  state.events.push({ kind: 'fleet_fired', tick: state.tick, shot });
}

/**
 * The fleet's shots due this tick land exactly where they were aimed: a team wall there is cleared,
 * as a cannon's shot clears one; a castle, a gun or open ground takes nothing; the sea, a splash.
 */
export function landFleetShots(state: MatchState): void {
  const fleet = fleetOf(state);
  if (!fleet.shots.some((s) => s.impactTick <= state.tick)) return;
  const remaining: FleetShot[] = [];
  const landed: FleetShot[] = [];
  for (const shot of fleet.shots) (shot.impactTick > state.tick ? remaining : landed).push(shot);
  fleet.shots = remaining;
  const freed = new Set(landed.map((s) => s.shipId));
  fleet.ships = fleet.ships.map((s) => (freed.has(s.id) ? { ...s, shotId: null } : s));
  for (const shot of landed) {
    const i = shot.toY * state.width + shot.toX;
    let destroyed: number | null = null;
    if (state.structure[i] === Structure.Wall && state.owner[i] !== 0) {
      state.structure[i] = Structure.Empty;
      state.owner[i] = 0;
      fleet.struck = [...fleet.struck, i];
      destroyed = i;
    }
    // A frost ship's shot freezes where it lands, the wall it cleared too (CAMPAIGN §7).
    if (shot.kind === 'frostship') freezeFromFleet(state, shot);
    state.events.push({
      kind: 'fleet_landed',
      tick: state.tick,
      shotId: shot.id,
      shipId: shot.shipId,
      x: shot.toX,
      y: shot.toY,
      destroyed,
    });
  }
}

/**
 * Whether a player's shot landing now hits a ship, and which (CAMPAIGN §5.6): the middle of the
 * tile it lands on inside the ship's footprint grown by half a tile on every side, the footprint
 * where it is on the impact tick, so a moving ship is hit near where it is seen. The lowest id
 * of two in reach.
 */
export function shipStruck(state: MatchState, x: number, y: number): Ship | null {
  const px = x * 256 + 128;
  const py = y * 256 + 128;
  const grow = 128;
  const span = SHIP_SIZE * 256;
  for (const ship of fleetOf(state).ships) {
    const at = shipPosition(ship, state.tick);
    if (px <= at.x - grow || px >= at.x + span + grow) continue;
    if (py <= at.y - grow || py >= at.y + span + grow) continue;
    return ship;
  }
  return null;
}

/** Campaign points, the difficulty's factor applied, rounded. */
function award(state: MatchState, player: PlayerState, points: number): number {
  const scored = Math.round(points * rulesOf(state).scoring.multiplier);
  player.score += scored;
  return scored;
}

/**
 * A player's shot landing on the sea, or anywhere: a ship in reach takes a hit, and its shooter
 * the hit's points; at its kind's count of hits it sinks, its run's water freed and its shot in
 * the air still landing, and its sinker the kind's points too (CAMPAIGN §5.6, §11).
 */
export function hitShips(state: MatchState, shot: Shot): void {
  const fleet = fleetOf(state);
  const ship = shipStruck(state, shot.toX, shot.toY);
  const player = state.players[shot.owner];
  if (ship === null || player === undefined) return;
  const rules = rulesOf(state);
  const kind = SHIP_KINDS.indexOf(ship.kind);
  const hits = ship.hits + 1;
  let points = award(state, player, rules.scoring.hitPoints);
  const sunk = hits >= (rules.fleet.hitsToSink[kind] as number);
  state.events.push({
    kind: 'ship_hit',
    tick: state.tick,
    shipId: ship.id,
    player: player.id,
    hits,
    sunk,
  });
  if (!sunk) {
    fleet.ships = fleet.ships.map((s) => (s.id === ship.id ? { ...s, hits } : s));
    return;
  }
  points += award(state, player, rules.scoring.sinkPoints[kind] as number);
  fleet.ships = fleet.ships.filter((s) => s.id !== ship.id);
  // Where it went down, for the picture of its sinking: the ship removed has no run to place it by.
  const at = shipPosition(ship, state.tick);
  state.events.push({
    kind: 'ship_sunk',
    tick: state.tick,
    ship: { ...ship, hits },
    x: at.x,
    y: at.y,
    player: player.id,
    points,
  });
}

/** As a battle opens: nothing struck yet, and the first target handed out after a beat. */
export function openFire(state: MatchState): void {
  const fleet = fleetOf(state);
  fleet.struck = [];
  fleet.nextFireTick =
    state.tick + ticksFor(rulesOf(state).fleet.fire.everyMs, state.ruleset.tickRateHz);
}
