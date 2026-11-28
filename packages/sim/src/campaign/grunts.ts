import type { CampaignLevelRules } from '@bollfort/config';

import { ticksFor } from '../match.js';
import { streamFor } from '../rng.js';
import {
  Structure,
  Terrain,
  type Castle,
  type MatchState,
  type PlayerState,
  type Shot,
} from '../types.js';
import { SHIP_SIZE } from './fleet.js';
import { iced } from './ice.js';
import type { CampaignState, Grunt, Ship } from './state.js';

/**
 * The enemy ashore (docs/CAMPAIGN.md §6.2–§6.4): grunts that transports land while the round's
 * allowance lasts and that bring more beside them; that walk towards the nearest castle while the
 * walls are rebuilt, blocking pieces and guns where they stand; and that strike once in a battle,
 * smashing the wall they face or taking the castle they face if nobody held it. A shot landing on
 * one kills it. Driven from `step()` as the fleet is, from named
 * streams only, every list in id order.
 */

/** The four ways a grunt faces, clockwise from north. */
export const FACINGS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function rulesOf(state: MatchState): CampaignLevelRules {
  return state.ruleset.campaign as CampaignLevelRules;
}

function fleetOf(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

function ticks(state: MatchState, ms: number): number {
  return ticksFor(ms, state.ruleset.tickRateHz);
}

/** The grunt on a tile, if any. */
export function gruntAt(state: MatchState, i: number): Grunt | null {
  if (state.campaign === null) return null;
  const x = i % state.width;
  const y = (i - x) / state.width;
  return state.campaign.grunts.find((g) => g.x === x && g.y === y) ?? null;
}

/**
 * Whether a grunt may stand on a tile: open land, no structure, no other grunt there, and not
 * sealed ground, which walling in clears of them. (No grunt reaches sealed ground by a step or
 * a birth anyway: the escape flood is 8-connected, so it never touches open ground even at a
 * corner. Only a breach lets them in, and the ground is no longer sealed once the barrage ends.)
 */
function freeForGrunt(state: MatchState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  const i = y * state.width + x;
  return (
    state.terrain[i] === Terrain.Land &&
    state.structure[i] === Structure.Empty &&
    state.territory[i] === 0 &&
    !iced(state, i) &&
    gruntAt(state, i) === null
  );
}

/**
 * The round's allowance (CAMPAIGN §6.2): by the rounds played in the level, the table's last
 * entry for every round after, times the level's factor for the difficulty and the players.
 */
export function gruntAllowance(state: MatchState, roundsInLevel: number): number {
  const { allowance, factor } = rulesOf(state).grunts;
  const base = allowance[Math.min(roundsInLevel, allowance.length - 1)] as number;
  return Math.round(base * factor);
}

/** A new grunt on (x, y), facing `facing`, its clocks started now. */
function spawn(state: MatchState, x: number, y: number, facing: number): Grunt {
  const fleet = fleetOf(state);
  const timing = rulesOf(state).grunts.timing;
  const grunt: Grunt = {
    id: fleet.nextGruntId++,
    x,
    y,
    facing,
    nextStepTick: state.tick + ticks(state, timing.stepMs),
    // Its blow is timed as a battle opens (`openGruntsBattle`).
    nextActTick: -1,
    nextBreedTick: state.tick + ticks(state, timing.breedMs),
  };
  fleet.grunts = [...fleet.grunts, grunt];
  fleet.gruntsLeft--;
  state.events.push({ kind: 'grunt_landed', tick: state.tick, grunt: { ...grunt } });
  return grunt;
}

/**
 * The tiles round a ship's footprint, clockwise from the corner above its top left: where its
 * grunts come ashore, the first free one first.
 */
function shoreOf(ship: Ship): [number, number][] {
  const out: [number, number][] = [];
  for (let x = ship.x - 1; x <= ship.x + SHIP_SIZE; x++) out.push([x, ship.y - 1]);
  for (let y = ship.y; y <= ship.y + SHIP_SIZE; y++) out.push([ship.x + SHIP_SIZE, y]);
  for (let x = ship.x + SHIP_SIZE - 1; x >= ship.x - 1; x--) out.push([x, ship.y + SHIP_SIZE]);
  for (let y = ship.y + SHIP_SIZE - 1; y >= ship.y; y--) out.push([ship.x - 1, y]);
  return out;
}

/** The facing from (x, y) towards a point, the axis it is farther along: ties go across. */
function facingTowards(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

/** The nearest castle by Manhattan distance, held or not, as an offset to its middle, doubled. */
function towardsCastle(state: MatchState, grunt: Grunt): { dx: number; dy: number } | null {
  let best: { dx: number; dy: number } | null = null;
  let bestD = Infinity;
  for (const castle of state.castles) {
    const dx = 2 * castle.x + castle.w - (2 * grunt.x + 1);
    const dy = 2 * castle.y + castle.h - (2 * grunt.y + 1);
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestD) {
      bestD = d;
      best = { dx, dy };
    }
  }
  return best;
}

/** Transports at the shore put grunts on it, each on its own clock (CAMPAIGN §6.2). */
function land(state: MatchState): void {
  const fleet = fleetOf(state);
  const every = ticks(state, rulesOf(state).grunts.timing.landMs);
  for (const ship of fleet.ships) {
    if (ship.kind !== 'transport' || ship.run !== null || state.tick < ship.nextLandTick) continue;
    if (fleet.gruntsLeft <= 0) return;
    const spot = shoreOf(ship).find(([x, y]) => freeForGrunt(state, x, y));
    if (spot === undefined) continue;
    fleet.ships = fleet.ships.map((s) =>
      s.id === ship.id ? { ...s, nextLandTick: state.tick + every } : s,
    );
    const [x, y] = spot;
    // Facing inland, away from the ship.
    spawn(
      state,
      x,
      y,
      facingTowards(2 * x + 1 - (2 * ship.x + SHIP_SIZE), 2 * y + 1 - (2 * ship.y + SHIP_SIZE)),
    );
  }
}

/** Each grunt on land brings another beside it now and then, from the same allowance. */
function breed(state: MatchState): void {
  const fleet = fleetOf(state);
  const every = ticks(state, rulesOf(state).grunts.timing.breedMs);
  for (const grunt of [...fleet.grunts]) {
    if (state.tick < grunt.nextBreedTick) continue;
    grunt.nextBreedTick = state.tick + every;
    if (fleet.gruntsLeft <= 0) continue;
    const free: [number, number][] = [];
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if ((ox !== 0 || oy !== 0) && freeForGrunt(state, grunt.x + ox, grunt.y + oy)) {
          free.push([grunt.x + ox, grunt.y + oy]);
        }
      }
    }
    if (free.length === 0) continue;
    const rng = streamFor(state.seed, `campaign-breed:${grunt.id}:${state.tick}`);
    const [x, y] = free[rng.nextInt(free.length)] as [number, number];
    spawn(state, x, y, grunt.facing);
  }
}

/**
 * A step towards the nearest castle (CAMPAIGN §6.3): straight on where it is free; blocked, a
 * quarter turn one way, then the other — so against a wall it slides along it — never back; all
 * three blocked, it faces the castle and waits. A castle tile ahead: it has arrived, and faces it.
 */
function walk(state: MatchState): void {
  const every = ticks(state, rulesOf(state).grunts.timing.stepMs);
  for (const grunt of fleetOf(state).grunts) {
    if (state.tick < grunt.nextStepTick) continue;
    grunt.nextStepTick = state.tick + every;
    const goal = towardsCastle(state, grunt);
    if (goal === null) continue;
    const ahead = facingTowards(goal.dx, goal.dy);
    const [ax, ay] = FACINGS[ahead] as readonly [number, number];
    const at = (grunt.y + ay) * state.width + grunt.x + ax;
    if (state.structure[at] === Structure.Castle) {
      grunt.facing = ahead;
      continue;
    }
    grunt.facing = ahead;
    for (const turn of [0, 3, 1]) {
      const facing = (ahead + turn) % 4;
      const [dx, dy] = FACINGS[facing] as readonly [number, number];
      if (!freeForGrunt(state, grunt.x + dx, grunt.y + dy)) continue;
      grunt.x += dx;
      grunt.y += dy;
      grunt.facing = facing;
      break;
    }
  }
}

/**
 * In a battle each grunt strikes once, at the time drawn for it as the battle opened (CAMPAIGN
 * §6.4): the tile it faces, if it is team wall, is smashed; if it is a castle nobody held at the
 * resolution before, the castle is taken (§6.5). Facing anything else, its blow falls on nothing.
 */
function smash(state: MatchState): void {
  const fleet = fleetOf(state);
  for (const grunt of fleet.grunts) {
    if (grunt.nextActTick < 0 || state.tick < grunt.nextActTick) continue;
    grunt.nextActTick = -1;
    const [dx, dy] = FACINGS[grunt.facing] as readonly [number, number];
    const x = grunt.x + dx;
    const y = grunt.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    const i = y * state.width + x;
    if (state.structure[i] === Structure.Castle) {
      takeCastle(state, grunt.id, x, y);
      continue;
    }
    if (state.structure[i] !== Structure.Wall || state.owner[i] === 0) continue;
    state.structure[i] = Structure.Empty;
    state.owner[i] = 0;
    fleet.struck = [...fleet.struck, i];
    state.events.push({ kind: 'wall_smashed', tick: state.tick, gruntId: grunt.id, tile: i });
  }
}

/**
 * A castle struck by a grunt (CAMPAIGN §6.5): taken if nobody held it — not sealed at the
 * resolution before this battle, which `enclosed` still says, shots not refreshing it. Gone from
 * the map for the rest of the level: its tiles plain land, out of the castles every rule reads, so
 * it seals nothing, earns nothing and is chosen by nobody, and a main castle among them stays lost
 * to its player. The grunts make for the next castle.
 */
function takeCastle(state: MatchState, gruntId: number, x: number, y: number): void {
  const castle = state.castles.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  if (castle === undefined || castle.enclosed) return;
  for (let oy = 0; oy < castle.h; oy++) {
    for (let ox = 0; ox < castle.w; ox++) {
      const i = (castle.y + oy) * state.width + castle.x + ox;
      state.structure[i] = Structure.Empty;
      state.owner[i] = 0;
    }
  }
  state.castles = state.castles.filter((c) => c !== castle);
  fleetOf(state).castlesTaken++;
  const taken: Castle = { ...castle };
  state.events.push({ kind: 'castle_taken', tick: state.tick, gruntId, castle: taken });
}

/**
 * The grunts' part of a tick: in a build phase landing, multiplying and walking; in a battle,
 * smashing. Their list is replaced, not changed in place, as every list a copy might share.
 */
export function advanceGrunts(state: MatchState): void {
  const fleet = state.campaign;
  if (fleet === null) return;
  const building = state.phase === 'build';
  const fighting = state.phase === 'combat' && state.tick < state.phaseEndTick;
  if (!building && !fighting) return;
  fleet.grunts = fleet.grunts.map((g) => ({ ...g }));
  if (building) {
    land(state);
    breed(state);
    walk(state);
  } else {
    smash(state);
  }
}

/** As the walls are rebuilt: the round's allowance, and every clock of the phase started. */
export function openGruntsBuild(state: MatchState, roundsInLevel: number): void {
  const fleet = fleetOf(state);
  const timing = rulesOf(state).grunts.timing;
  fleet.gruntsLeft = gruntAllowance(state, roundsInLevel);
  fleet.grunts = fleet.grunts.map((g) => ({
    ...g,
    nextStepTick: state.tick + ticks(state, timing.stepMs),
    nextBreedTick: state.tick + ticks(state, timing.breedMs),
  }));
  fleet.ships = fleet.ships.map((s) => ({ ...s, nextLandTick: state.tick }));
}

/**
 * As a battle opens: each grunt's one blow timed, at a moment drawn for it within the window, so
 * the grunts strike one by one rather than together, and never twice (CAMPAIGN §6.4). It strikes
 * whatever it faces then, as its last step left it: a grunt that slid along a wall faces along it.
 * (Turning every grunt to its castle as the battle opened made them far too strong: the users'
 * playtest, 2026-11-26.)
 */
export function openGruntsBattle(state: MatchState): void {
  const fleet = fleetOf(state);
  const [from, to] = rulesOf(state).grunts.timing.smashWindowMs;
  const first = ticks(state, from);
  const last = Math.max(first, ticks(state, to));
  fleet.grunts = fleet.grunts.map((g) => {
    const rng = streamFor(state.seed, `campaign-smash:${g.id}:${state.round}`);
    return { ...g, nextActTick: state.tick + first + rng.nextInt(last - first + 1) };
  });
}

/** A player's shot kills every grunt on the tiles it lands on, and scores them for the shooter. */
export function hitGrunts(state: MatchState, shot: Shot, tiles: readonly number[]): void {
  const hit = new Set(tiles);
  kill(state, shot.owner, 'shot', (g) => hit.has(g.y * state.width + g.x));
}

/**
 * Grunts on sealed ground, pockets too, are cleared as the wall closes round them, and score for
 * the player whose piece closed it (the user's, 2026-11-25): walling them in is a way to fight
 * them, which rewards building cleverly round a landing.
 */
export function clearWalledIn(state: MatchState, builder: number): void {
  kill(state, builder, 'walled', (g) => state.territory[g.y * state.width + g.x] !== 0);
}

/** Removes the grunts `doomed` picks, crediting each to `by`, and tells the client how they went. */
function kill(
  state: MatchState,
  by: number,
  how: 'shot' | 'walled',
  doomed: (grunt: Grunt) => boolean,
): void {
  const fleet = fleetOf(state);
  const player: PlayerState | undefined = state.players[by];
  const killed = fleet.grunts.filter(doomed);
  if (killed.length === 0) return;
  fleet.grunts = fleet.grunts.filter((g) => !killed.includes(g));
  fleet.gruntsKilled += killed.length;
  const { gruntPoints, multiplier } = rulesOf(state).scoring;
  for (const grunt of killed) {
    const points = player === undefined ? 0 : Math.round(gruntPoints * multiplier);
    if (player !== undefined) player.score += points;
    state.events.push({
      kind: 'grunt_killed',
      tick: state.tick,
      gruntId: grunt.id,
      x: grunt.x,
      y: grunt.y,
      player: by,
      points,
      how,
    });
  }
}

/**
 * A campaign's ring about to be raised gets clear ground (CAMPAIGN §6.2, §9): the grunts, the ice
 * and the walls in its square, from (x0, y0) to (x1, y1), are gone, so a continue's fresh start is
 * neither walled in with the enemy nor built round the wreck of the last one.
 */
export function clearRing(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  const fleet = state.campaign;
  if (fleet === null) return;
  const inside = (x: number, y: number): boolean => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  fleet.grunts = fleet.grunts.filter((g) => !inside(g.x, g.y));
  state.frozen = state.frozen.filter(
    (f) => !inside(f.tile % state.width, Math.floor(f.tile / state.width)),
  );
  for (let y = Math.max(0, y0); y <= Math.min(state.height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(state.width - 1, x1); x++) {
      const i = y * state.width + x;
      if (state.structure[i] !== Structure.Wall) continue;
      state.structure[i] = Structure.Empty;
      state.owner[i] = 0;
    }
  }
}
