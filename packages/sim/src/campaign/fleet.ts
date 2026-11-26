import { SHIP_KINDS, type CampaignLevelRules, type ShipKind } from '@bollfort/config';

import { ticksFor } from '../match.js';
import { streamFor } from '../rng.js';
import { Terrain, type MatchState } from '../types.js';
import type { CampaignState, KindCounts, Run, Ship } from './state.js';
import { fireFleet, openFire } from './gunnery.js';
import { openGruntsBattle, openGruntsBuild } from './grunts.js';

/**
 * The enemy fleet (docs/CAMPAIGN.md §5): ships drawn from the level's pool into a wave each build
 * phase, arriving at the map's edge, and sailing in combat — one long straight run a battle,
 * towards the castle nearest them. Driven from `step()` as the special towers' controllers are,
 * from named streams only, every list in id order.
 *
 * Firing, hits and sinking come with CA4; grunts with CA5.
 */

/** A ship's footprint, in tiles. */
export const SHIP_SIZE = 2;

/** The eight headings as steps, clockwise from north. */
export const HEADINGS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/**
 * The three orders a ship tries directions in, relative to its heading in eighths of a turn, one
 * drawn at random for each run: ahead, then a little aside, then square aside — never back.
 */
const PREFERENCES: readonly (readonly number[])[] = [
  [0, -1, 1, -2, 2],
  [-1, 0, 1, 2, -2],
  [1, 0, -1, -2, 2],
];

function rulesOf(state: MatchState): CampaignLevelRules {
  return state.ruleset.campaign as CampaignLevelRules;
}

function fleetOf(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

/** Rounds finished in this level: a round counts once its walls have been resolved. */
export function roundsInLevel(state: MatchState): number {
  return state.phase === 'combat' || state.pendingPhase === 'build' || state.phase === 'build'
    ? Math.max(0, state.round - 1)
    : state.round;
}

/**
 * The rounds the fleet reckons played in the level: those played, and on every level but the
 * campaign's first a few more (`fleet.roundOffset`), so later levels press from their first round.
 * Never shown; `state.round` is.
 */
export function fleetRounds(state: MatchState): number {
  return roundsInLevel(state) + rulesOf(state).fleet.roundOffset;
}

/**
 * The heading from a ship to the castle nearest it, in eighths of a turn. Exact: the octant by
 * comparing the offset's sides against tan 22.5° ≈ 29/70, rather than by an arctangent.
 */
export function headingTowardsNearestCastle(state: MatchState, x: number, y: number): number {
  // Doubled, so a 2 × 2 ship's centre and a castle's are whole numbers.
  const sx = 2 * x + SHIP_SIZE;
  const sy = 2 * y + SHIP_SIZE;
  let best: { dx: number; dy: number } | null = null;
  let bestD2 = Infinity;
  for (const castle of state.castles) {
    const dx = 2 * castle.x + castle.w - sx;
    const dy = 2 * castle.y + castle.h - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { dx, dy };
    }
  }
  return best === null ? 0 : headingOf(best.dx, best.dy);
}

/** The eighth of a turn an offset points along, clockwise from north (y grows southwards). */
export function headingOf(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return 0;
  if (ay * 70 <= ax * 29) return dx > 0 ? 2 : 6;
  if (ax * 70 <= ay * 29) return dy > 0 ? 4 : 0;
  if (dx > 0) return dy < 0 ? 1 : 3;
  return dy > 0 ? 5 : 7;
}

/** The footprints a ship holds: where it stands, and every one its run will cross. */
function claims(ship: Ship): { x: number; y: number }[] {
  const run = ship.run;
  if (run === null) return [{ x: ship.x, y: ship.y }];
  const out = [];
  for (let t = 0; t <= run.tiles; t++) out.push({ x: ship.x + run.dx * t, y: ship.y + run.dy * t });
  return out;
}

/** Whether a 2 × 2 ship fits at (x, y): open sea, and no other ship there or sailing through. */
export function shipFits(state: MatchState, x: number, y: number, except: number | null): boolean {
  const { width: w, height: h } = state;
  if (x < 0 || y < 0 || x + SHIP_SIZE > w || y + SHIP_SIZE > h) return false;
  const sea = fleetOf(state).sea;
  for (let oy = 0; oy < SHIP_SIZE; oy++) {
    for (let ox = 0; ox < SHIP_SIZE; ox++) if (sea[(y + oy) * w + x + ox] !== 1) return false;
  }
  for (const other of fleetOf(state).ships) {
    if (other.id === except) continue;
    for (const c of claims(other)) {
      if (Math.abs(c.x - x) < SHIP_SIZE && Math.abs(c.y - y) < SHIP_SIZE) return false;
    }
  }
  return true;
}

/**
 * A ship's top-left corner at a tick, in 1/256 of a tile: interpolated along its run in integers,
 * so every client places it — and, from CA4, tests a hit on it — alike.
 */
export function shipPosition(ship: Ship, tick: number): { x: number; y: number } {
  const run = ship.run;
  if (run === null) return { x: ship.x * 256, y: ship.y * 256 };
  const span = run.tiles * run.ticksPerTile;
  const elapsed = Math.min(span, Math.max(0, tick - run.startTick));
  const along = Math.floor((elapsed * 256) / run.ticksPerTile);
  return { x: ship.x * 256 + run.dx * along, y: ship.y * 256 + run.dy * along };
}

/** Whether a ship touches land on a side: next to the coast, where raiders turn back. */
export function besideLand(state: MatchState, ship: Ship): boolean {
  const { width: w, height: h } = state;
  for (let i = 0; i < SHIP_SIZE; i++) {
    const sides: [number, number][] = [
      [ship.x + i, ship.y - 1],
      [ship.x + i, ship.y + SHIP_SIZE],
      [ship.x - 1, ship.y + i],
      [ship.x + SHIP_SIZE, ship.y + i],
    ];
    for (const [x, y] of sides) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (state.terrain[y * w + x] === Terrain.Land) return true;
    }
  }
  return false;
}

/**
 * Draws the round's wave from the pool (CAMPAIGN §5.2): the cannons the players were given, the
 * level's index and a bonus for the rounds played, capped by what is left, each ship drawn at
 * random weighted by the counts left of each kind.
 */
export function formWave(state: MatchState): void {
  const fleet = fleetOf(state);
  const rules = rulesOf(state);
  const inLevel = roundsInLevel(state);
  const inCampaign = rules.carry.roundsPlayed + inLevel;
  const bonus = Math.min(inCampaign, fleetRounds(state)) + Math.max(0, inCampaign - 2);
  const left = fleet.pool[0] + fleet.pool[1] + fleet.pool[2];
  let size = Math.min(left, fleet.cannonsGiven + rules.level + bonus);
  const rng = streamFor(state.seed, `campaign-wave:${state.round}`);
  const pool: KindCounts = [...fleet.pool];
  const wave: KindCounts = [...fleet.wave];
  while (size-- > 0) {
    const kind = rng.nextWeightedIndex(pool);
    pool[kind] = (pool[kind] as number) - 1;
    wave[kind] = (wave[kind] as number) + 1;
  }
  fleet.pool = pool;
  fleet.wave = wave;
  fleet.nextArrivalTick = state.tick;
}

/** Ships come only while a castle is chosen and while the walls are rebuilt (CAMPAIGN §4). */
function arriving(state: MatchState): boolean {
  return state.phase === 'castle_select' || state.phase === 'build';
}

/** One ship of each kind still in the wave, while there is room afloat (CAMPAIGN §5.2). */
function arrive(state: MatchState): void {
  const fleet = fleetOf(state);
  const rules = rulesOf(state);
  if (!arriving(state) || state.tick < fleet.nextArrivalTick) return;
  fleet.nextArrivalTick =
    state.tick + ticksFor(rules.fleet.timing.arrivalMs, state.ruleset.tickRateHz);
  const wave: KindCounts = [...fleet.wave];
  SHIP_KINDS.forEach((kind, k) => {
    if ((wave[k] as number) <= 0 || fleet.ships.length >= rules.fleet.maxAfloat) return;
    if (launch(state, kind)) wave[k] = (wave[k] as number) - 1;
  });
  fleet.wave = wave;
}

/**
 * As a castle choice or a build phase ends: every ship still waiting in the wave comes in at once,
 * one of each kind in turn, while there is room afloat and a free place at the edge. How long a
 * player took to choose — or how soon a build phase's overtime ended — must not change the fleet
 * they face: choosing at once had left level 1's first battle with one ship of three (the user's
 * playtest, 2026-11-25).
 */
export function flushArrivals(state: MatchState): void {
  if (state.campaign === null) return;
  const fleet = fleetOf(state);
  const rules = rulesOf(state);
  let launched = true;
  while (launched) {
    launched = false;
    const wave: KindCounts = [...fleet.wave];
    SHIP_KINDS.forEach((kind, k) => {
      if ((wave[k] as number) <= 0 || fleet.ships.length >= rules.fleet.maxAfloat) return;
      if (launch(state, kind)) {
        wave[k] = (wave[k] as number) - 1;
        launched = true;
      }
    });
    fleet.wave = wave;
  }
}

/**
 * A ship at the map's edge: the cursor steps on some way round the spawn points, and the first
 * free one from there takes it. False when none is free: it waits in the wave.
 */
function launch(state: MatchState, kind: ShipKind): boolean {
  const fleet = fleetOf(state);
  const points = fleet.spawnPoints;
  if (points.length === 0) return false;
  const { spawnStepMin, spawnStepRange } = rulesOf(state).fleet.timing;
  const rng = streamFor(state.seed, `campaign-spawn:${fleet.nextShipId}`);
  const step = Math.max(spawnStepMin, rng.nextInt(spawnStepRange));
  fleet.spawnCursor = (fleet.spawnCursor + step) % points.length;
  for (let k = 0; k < points.length; k++) {
    const point = points[(fleet.spawnCursor + k) % points.length] as { x: number; y: number };
    if (!shipFits(state, point.x, point.y, null)) continue;
    const ship: Ship = {
      id: fleet.nextShipId++,
      kind,
      x: point.x,
      y: point.y,
      hits: 0,
      heading: headingTowardsNearestCastle(state, point.x, point.y),
      run: null,
      runs: 0,
      arrivedTick: state.tick,
      shotId: null,
      nextLandTick: 0,
    };
    fleet.ships = [...fleet.ships, ship];
    state.events.push({ kind: 'ship_arrived', tick: state.tick, ship: { ...ship } });
    return true;
  }
  return false;
}

/**
 * A ship's next run (CAMPAIGN §5.3): re-aimed at the nearest castle, the first direction of a
 * preference order drawn at random whose next footprint is free, a speed that rises with the
 * level and the rounds, and as many tiles straight on as are free and fit the battle's time left
 * and a little more. No direction free: it waits out the battle.
 */
function planRun(state: MatchState, ship: Ship): void {
  const rules = rulesOf(state);
  const rate = state.ruleset.tickRateHz;
  const rng = streamFor(state.seed, `campaign-run:${ship.id}:${ship.runs}`);
  ship.runs++;
  ship.heading = headingTowardsNearestCastle(state, ship.x, ship.y);
  const order = PREFERENCES[rng.nextInt(PREFERENCES.length)] as readonly number[];
  let step: readonly [number, number] | null = null;
  for (const turn of order) {
    const [dx, dy] = HEADINGS[(ship.heading + turn + 8) % 8] as readonly [number, number];
    if (shipFits(state, ship.x + dx, ship.y + dy, ship.id)) {
      step = [dx, dy];
      break;
    }
  }
  if (step === null) return;
  const [dx, dy] = step;
  const speeds = rules.fleet.timing.tileMs;
  const speed = Math.min(rng.nextInt(rules.level + fleetRounds(state) + 1), speeds.length - 1);
  const ticksPerTile = ticksFor(speeds[speed] as number, rate);
  const budget = state.phaseEndTick - state.tick + ticksFor(rules.fleet.timing.runSlackMs, rate);
  let tiles = 1;
  while (
    (tiles + 1) * ticksPerTile <= budget &&
    shipFits(state, ship.x + dx * (tiles + 1), ship.y + dy * (tiles + 1), ship.id)
  ) {
    tiles++;
  }
  const run: Run = { dx, dy, tiles, startTick: state.tick, ticksPerTile };
  ship.run = run;
}

/** Ships whose runs are over stand where they ended; in a battle, they set off again at once. */
function sail(state: MatchState): void {
  const fleet = fleetOf(state);
  const ended = (s: Ship): boolean =>
    s.run !== null && state.tick >= s.run.startTick + s.run.tiles * s.run.ticksPerTile;
  if (!fleet.ships.some(ended)) return;
  // Replaced, not changed in place, as every list a rollout might share.
  fleet.ships = fleet.ships.map((s) => ({ ...s }));
  for (const ship of fleet.ships) {
    if (!ended(ship)) continue;
    const run = ship.run as Run;
    ship.x += run.dx * run.tiles;
    ship.y += run.dy * run.tiles;
    ship.run = null;
    if (state.phase === 'combat' && state.tick < state.phaseEndTick) planRun(state, ship);
  }
}

/** Every ship without a run plans one as a battle opens, in id order, and the guns get ready. */
export function openBattle(state: MatchState): void {
  openFire(state);
  openGruntsBattle(state);
  const fleet = fleetOf(state);
  fleet.ships = fleet.ships.map((s) => ({ ...s }));
  for (const ship of fleet.ships) if (ship.run === null) planRun(state, ship);
}

/**
 * As the walls are rebuilt: raiders and frost ships standing at the coast go back into the wave,
 * to come again from the edge (CAMPAIGN §5.3) — transports stay, to land their grunts — and the
 * round's wave is drawn.
 */
export function openBuild(state: MatchState): void {
  const fleet = fleetOf(state);
  const wave: KindCounts = [...fleet.wave];
  const kept: Ship[] = [];
  for (const ship of fleet.ships) {
    if (ship.kind !== 'transport' && ship.run === null && besideLand(state, ship)) {
      const k = SHIP_KINDS.indexOf(ship.kind);
      wave[k] = (wave[k] as number) + 1;
      state.events.push({ kind: 'ship_recycled', tick: state.tick, shipId: ship.id });
      continue;
    }
    kept.push(ship);
  }
  fleet.ships = kept;
  fleet.wave = wave;
  // A frost ship on top of the pool every so many rounds, whatever it holds (CAMPAIGN §8.2):
  // rarely early, every round late.
  const every = rulesOf(state).fleet.frostshipEvery;
  if (fleet.frostshipCountdown !== null && every !== null) {
    fleet.frostshipCountdown--;
    if (fleet.frostshipCountdown <= 0) {
      fleet.pool = [fleet.pool[0], fleet.pool[1], fleet.pool[2] + 1];
      fleet.frostshipCountdown = every;
    }
  }
  formWave(state);
  openGruntsBuild(state, rulesOf(state).carry.roundsPlayed + roundsInLevel(state));
}

/** The fleet's part of a tick: arrivals, runs ending, and its guns. */
export function advanceFleet(state: MatchState): void {
  if (state.campaign === null) return;
  sail(state);
  arrive(state);
  fireFleet(state);
}
