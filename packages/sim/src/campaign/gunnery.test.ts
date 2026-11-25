import { describe, expect, it } from 'vitest';
import type { CampaignLevelRules, Ruleset } from '@bollfort/config';

import { fire, resolveImpacts } from '../shots.js';
import { inFlight } from '../subwoofer.js';
import { campaignLevelRuleset, stateFromAscii } from '../testing.js';
import { Structure, type MatchState } from '../types.js';
import { fireFleet, fleetTarget, landFleetShots, openFire, shipStruck } from './gunnery.js';
import type { CampaignState, Ship } from './state.js';

function rules(change: (c: CampaignLevelRules) => CampaignLevelRules = (c) => c): Ruleset {
  const ruleset = campaignLevelRuleset();
  return { ...ruleset, campaign: change(ruleset.campaign as CampaignLevelRules) };
}

function fleet(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

function xy(state: MatchState, i: number | null): [number, number] | null {
  return i === null ? null : [i % state.width, Math.floor(i / state.width)];
}

// A ring round a castle, a gun inside it, and the sea to the west with ships in it.
const BOARD = `
  ..........,,,,,,,,,
  SS........,######,,
  SS........,#,,,,#,,
  ..........,#,@@,#,,
  ..SS......,#,@@,#,,
  ..SS......,#**,,#,,
  ..........,#**,,#,,
  ..........,######,,
  ..........,,,,,,,,,
`;

describe("the fleet's guns", () => {
  it('aims at the middle of a run, beside what it guards, away from what it struck', () => {
    const state = stateFromAscii(BOARD, rules());
    // Every tile of the ring has two wall neighbours; those beside the gun score its 5 more,
    // the first of them in columns left to right, each top to bottom.
    expect(xy(state, fleetTarget(state))).toEqual([11, 5]);
    // The last aimed at are skipped: the next beside the gun is below it.
    fleet(state).aimed = [5 * state.width + 11, 6 * state.width + 11];
    expect(xy(state, fleetTarget(state))).toEqual([12, 7]);
    // A tile struck this battle takes 12 off each of its neighbours: the fire spreads.
    fleet(state).aimed = [];
    fleet(state).struck = [4 * state.width + 11];
    expect(xy(state, fleetTarget(state))).toEqual([11, 6]);
    // No wall left: nothing to aim at.
    state.structure.fill(Structure.Empty);
    expect(fleetTarget(state)).toBeNull();
  });

  it('hands a target to one ship at a time, in turn, which fires at once and hits exactly', () => {
    const state = stateFromAscii(BOARD, rules());
    state.phaseEndTick = 300;
    openFire(state);
    // 733 ms is 22 ticks.
    expect(fleet(state).nextFireTick).toBe(22);
    for (let t = 1; t <= 22; t++) {
      state.tick = t;
      fireFleet(state);
    }
    expect(fleet(state).shots).toHaveLength(1);
    const shot = fleet(state).shots[0];
    expect(shot).toMatchObject({ shipId: 0, toX: 11, toY: 5, launchTick: 22 });
    // From the ship's middle, in 1/256 of a tile.
    expect([shot?.fromX, shot?.fromY]).toEqual([256, 2 * 256]);
    // The next turn goes to the other ship, the first having its shot in the air.
    state.tick = 44;
    fireFleet(state);
    expect(fleet(state).shots.map((s) => s.shipId)).toEqual([0, 1]);
    expect(inFlight(state)).toBe(true);

    // It lands where it was aimed and clears the wall; the ship may fire again.
    state.tick = shot?.impactTick as number;
    landFleetShots(state);
    expect(state.structure[5 * state.width + 11]).toBe(Structure.Empty);
    expect(fleet(state).struck).toEqual([5 * state.width + 11]);
    expect(fleet(state).ships[0]?.shotId).toBeNull();
    expect(state.events.map((e) => e.kind)).toEqual(['fleet_fired', 'fleet_fired', 'fleet_landed']);
  });

  it('holds its fire outside a battle', () => {
    const state = stateFromAscii(BOARD, rules());
    state.phase = 'build';
    state.tick = 100;
    fireFleet(state);
    expect(fleet(state).shots).toHaveLength(0);
  });

  it('is hit by a shot landing within half a tile of it, at the lowest id', () => {
    const state = stateFromAscii(BOARD, rules());
    // The first ship stands on (0..1, 1..2): the tiles under it are hit, not those beside them.
    expect(shipStruck(state, 1, 2)?.id).toBe(0);
    expect(shipStruck(state, 2, 2)).toBeNull();
    // Sailing east, a quarter of the way into its next tile: the tile it is entering is hit.
    fleet(state).ships = fleet(state).ships.map((s) =>
      s.id === 0 ? { ...s, run: { dx: 1, dy: 0, tiles: 3, startTick: 0, ticksPerTile: 64 } } : s,
    );
    state.tick = 16;
    expect(shipStruck(state, 2, 2)?.id).toBe(0);
    expect(shipStruck(state, 3, 2)).toBeNull();
  });

  it('takes its hits, sinks at its count, and scores them for its sinker', () => {
    const state = stateFromAscii(
      BOARD,
      rules((c) => ({ ...c, scoring: { ...c.scoring, multiplier: 1.5 } })),
    );
    const shootAt = (x: number, y: number): void => {
      const result = fire(state, 0, x, y);
      expect('shot' in result).toBe(true);
      if ('shot' in result) state.tick = result.shot.impactTick;
      resolveImpacts(state);
    };
    // A raider takes two hits: 10 points each, 20 more for sinking it, all half again on Veteran.
    shootAt(2, 4);
    expect(fleet(state).ships.find((s) => s.id === 1)?.hits).toBe(1);
    expect(state.players[0]?.score).toBe(15);
    shootAt(3, 5);
    expect(fleet(state).ships.map((s: Ship) => s.id)).toEqual([0]);
    expect(state.players[0]?.score).toBe(15 + 15 + 30);
    const sunk = state.events.find((e) => e.kind === 'ship_sunk');
    expect(sunk).toMatchObject({ player: 0, points: 45, x: 2 * 256, y: 4 * 256 });
  });

  it("lets a campaign's guns fire anywhere, and never at the team's own wall", () => {
    const state = stateFromAscii(BOARD, rules());
    // The team's own wall and the open sea: versus play would refuse the first.
    const own = fire(state, 0, 16, 3);
    expect('shot' in own).toBe(true);
    if ('shot' in own) state.tick = own.shot.impactTick;
    resolveImpacts(state);
    expect(state.structure[3 * state.width + 16]).toBe(Structure.Wall);
    expect('shot' in fire(state, 0, 6, 8)).toBe(true);
  });
});
