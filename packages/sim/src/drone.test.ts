import { defaultRuleset, type Ruleset } from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import { droneTargets, launchDrones } from './drone.js';
import { singLullaby } from './lullaby.js';
import { hashMatchState, step } from './match.js';
import { fire, flightTicks, resolveImpacts } from './shots.js';
import { stateFromAscii, withSpecials } from './testing.js';
import type { Cannon, MatchState, Shot } from './types.js';

/** The tower's levers for a test, the rest of the ruleset as it is. */
function rules(radius = 2.5, launchGapMs = 250): Ruleset {
  const ruleset = withSpecials(defaultRuleset);
  const variant = { footprint: [2, 2] as [number, number], flightFactor: 1, radius, launchGapMs };
  return {
    ...ruleset,
    specials: { ...ruleset.specials, drone: { '2': variant, '3': variant } },
  };
}

/**
 * Player 0's Drone Tower (cost 3) at (2, 1) and a cannon at (2, 3); player 1's ring across the
 * channel, its west wall the column x = 10, rows 1 to 7.
 */
const ART = `
  ........................
  .,DD,,,..,#############.
  .,DD,,,..,#,,,,,,,,,,,#.
  .,**,,,..,#,,,,,,,,,,,#.
  .,**,,,..,#,,,,,,,,,,,#.
  .,,,,,,..,#,,,,,,,,,,,#.
  .,,,,,,..,#,,,,,,,,,,,#.
  .,,,,,,..,#############.
  ........................
`;
const ISLANDS = `
  ........................
  .........22222222222222.
  .........22222222222222.
  .........22222222222222.
  .........22222222222222.
  .........22222222222222.
  .........22222222222222.
  .........22222222222222.
  ........................
`;

/** Within 2.5 of (10, 4): the west wall from row 2 to row 6, and nothing else a wall. */
const NEAR_WEST = [2, 3, 4, 5, 6].map((y) => `10,${y}`);

function battery(ruleset: Ruleset = rules()): MatchState {
  const state = stateFromAscii(ART, ruleset, ISLANDS);
  state.phase = 'combat';
  state.phaseEndTick = 100_000;
  (state.players[0] as MatchState['players'][number]).special = 'drone3';
  return state;
}

const drone = (s: MatchState): Cannon => s.cannons.find((c) => c.kind === 'drone')!;
const cannon = (s: MatchState): Cannon => s.cannons.find((c) => c.kind === 'cannon')!;
const anchorAt = (s: MatchState, x: number, y: number) => {
  s.players[0]!.droneAnchor = y * s.width + x;
};
const droneShots = (s: MatchState): Shot[] => s.shots.filter((x) => x.kind === 'drone');
const tile = (shot: Shot) => `${shot.toX},${shot.toY}`;

/** Steps until the drone has this many missiles in the air, or the ticks run out. */
function stepUntil(state: MatchState, inAir: number, ticks = 200): void {
  for (let i = 0; i < ticks && droneShots(state).length < inAir; i++) step(state);
}

describe('the Drone Tower', () => {
  it('is never the gun a click fires', () => {
    const state = battery();
    const first = fire(state, 0, 10, 4);
    expect('shot' in first && first.shot.cannonId).toBe(cannon(state).id);
    // The cannon reloading, a click finds no gun though all three of the drone's barrels are free.
    expect(fire(state, 0, 10, 5)).toEqual({ rejection: 'no_ready_cannon' });
    expect(droneShots(state)).toHaveLength(0);
  });

  it("takes its anchor from its owner's shots, and only for a player who brings it", () => {
    const state = battery();
    fire(state, 0, 10, 4);
    expect(state.players[0]!.droneAnchor).toBe(4 * state.width + 10);

    const other = battery();
    other.players[0]!.special = 'rapid3';
    fire(other, 0, 10, 4);
    expect(other.players[0]!.droneAnchor).toBeUndefined();
  });

  it('holds fire until its owner has shot', () => {
    const state = battery();
    for (let i = 0; i < 60; i++) step(state);
    expect(droneShots(state)).toHaveLength(0);
  });

  it("launches its barrels by itself at walls near the anchor, never where its owner's shots fly", () => {
    const state = battery();
    fire(state, 0, 10, 4);
    stepUntil(state, 3);
    const shots = droneShots(state);
    expect(shots).toHaveLength(3);
    const tiles = shots.map(tile);
    expect(new Set(tiles).size).toBe(3);
    for (const t of tiles) expect(NEAR_WEST).toContain(t);
    // The cannon's shot is flying to (10, 4): the drone leaves that wall to it.
    expect(tiles).not.toContain('10,4');
    // And no fourth: every barrel is in the air.
    for (let i = 0; i < 20; i++) step(state);
    expect(droneShots(state)).toHaveLength(3);
  });

  it('draws only from the circle round the anchor', () => {
    const targets = (radius: number): string[] => {
      const state = battery(rules(radius));
      anchorAt(state, 10, 4);
      return droneTargets(state, drone(state))
        .map((i) => `${i % state.width},${Math.floor(i / state.width)}`)
        .sort();
    };
    expect(targets(1)).toEqual(['10,3', '10,4', '10,5']);
    expect(targets(2.5)).toEqual([...NEAR_WEST].sort());
  });

  it('launches a barrel at a time, the gap apart', () => {
    const state = battery(rules(2.5, 250));
    anchorAt(state, 10, 4);
    stepUntil(state, 3);
    const ticks = droneShots(state).map((s) => s.launchTick);
    const gap = Math.ceil((250 * state.ruleset.tickRateHz) / 1000);
    expect(ticks[1]! - ticks[0]!).toBe(gap);
    expect(ticks[2]! - ticks[1]!).toBe(gap);
  });

  it('flies as a cannon shot from the tower, and lands as one', () => {
    const state = battery();
    anchorAt(state, 10, 4);
    stepUntil(state, 1);
    const shot = droneShots(state)[0]!;
    expect(shot.impactTick - shot.launchTick).toBe(
      flightTicks(state, shot.fromX, shot.fromY, shot.toX, shot.toY, 1),
    );
    state.tick = shot.impactTick;
    resolveImpacts(state);
    expect(state.structure[shot.toY * state.width + shot.toX]).toBe(0);
    expect(state.players[0]!.wallsDestroyed).toBe(1);
  });

  it('holds fire with no wall in reach: open ground, a teammate, rubble', () => {
    const open = battery();
    anchorAt(open, 16, 4);
    for (let i = 0; i < 30; i++) step(open);
    expect(droneShots(open)).toHaveLength(0);

    const team = battery();
    team.players[1]!.team = 0;
    anchorAt(team, 10, 4);
    for (let i = 0; i < 30; i++) step(team);
    expect(droneShots(team)).toHaveLength(0);

    const rubble = battery();
    for (let i = 0; i < rubble.owner.length; i++) if (rubble.islandId[i] === 2) rubble.owner[i] = 0;
    anchorAt(rubble, 10, 4);
    for (let i = 0; i < 30; i++) step(rubble);
    expect(droneShots(rubble)).toHaveLength(0);
  });

  it('is silent while inert', () => {
    const state = battery();
    drone(state).active = false;
    anchorAt(state, 10, 4);
    for (let i = 0; i < 30; i++) step(state);
    expect(droneShots(state)).toHaveLength(0);
  });

  it("is shut down by a Lullaby's sleep for its whole length, then fires again", () => {
    const state = battery();
    anchorAt(state, 10, 4);
    // Two lullabies from player 1 landing beside it: a tower falls asleep at the second.
    const lullaby = (id: number): Shot => ({
      id,
      cannonId: 999,
      owner: 1,
      kind: 'lullaby',
      cost: 3,
      fromX: 12,
      fromY: 4,
      toX: 2,
      toY: 1,
      launchTick: state.tick,
      impactTick: state.tick,
    });
    state.nextShotId = 10;
    singLullaby(state, lullaby(1));
    singLullaby(state, lullaby(2));
    const until = drone(state).asleepUntil;
    expect(until).toBeGreaterThan(state.tick);
    while (state.tick < (until as number) - 1) step(state);
    expect(droneShots(state)).toHaveLength(0);
    stepUntil(state, 1, 5);
    expect(droneShots(state)).toHaveLength(1);
    expect(droneShots(state)[0]!.launchTick).toBe(until);
  });

  it('keeps its anchor past the barrage, and fires neither on its last tick nor after', () => {
    const state = battery();
    anchorAt(state, 10, 4);
    state.phaseEndTick = state.tick + 1;
    state.pendingPhase = null;
    step(state);
    expect(state.phase).toBe('intermission');
    expect(droneShots(state)).toHaveLength(0);
    for (let i = 0; i < 30; i++) step(state);
    expect(droneShots(state)).toHaveLength(0);
    expect(state.players[0]!.droneAnchor).toBe(4 * state.width + 10);
  });

  it('draws the same everywhere, and its anchor is in the fingerprint', () => {
    const a = battery();
    const b = battery();
    const before = hashMatchState(a);
    anchorAt(a, 10, 4);
    anchorAt(b, 10, 4);
    expect(hashMatchState(a)).not.toBe(before);
    for (let i = 0; i < 40; i++) {
      step(a);
      step(b);
    }
    expect(droneShots(a).map(tile)).toEqual(droneShots(b).map(tile));
    expect(hashMatchState(a)).toBe(hashMatchState(b));
  });

  it('is launched by the step alone, in combat', () => {
    const state = battery();
    anchorAt(state, 10, 4);
    state.phase = 'build';
    launchDrones(state);
    expect(droneShots(state)).toHaveLength(0);
  });
});
