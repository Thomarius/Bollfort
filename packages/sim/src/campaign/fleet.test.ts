import { describe, expect, it } from 'vitest';
import type { CampaignLevelRules, Ruleset } from '@bollfort/config';

import { campaignLevelRuleset, stateFromAscii } from '../testing.js';
import type { MatchState } from '../types.js';
import {
  advanceFleet,
  formWave,
  headingOf,
  openBattle,
  openBuild,
  shipFits,
  shipPosition,
} from './fleet.js';
import type { CampaignState, Ship } from './state.js';

function rules(change: (c: CampaignLevelRules) => CampaignLevelRules = (c) => c): Ruleset {
  const ruleset = campaignLevelRuleset();
  return { ...ruleset, campaign: change(ruleset.campaign as CampaignLevelRules) };
}

function fleet(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

function ship(state: MatchState, id: number): Ship {
  return fleet(state).ships.find((s) => s.id === id) as Ship;
}

/** A battle `ticks` long from now. */
function battle(state: MatchState, ticks: number): MatchState {
  state.phase = 'combat';
  state.phaseEndTick = state.tick + ticks;
  return state;
}

// A channel two tiles high, open to the west, with a castle beyond its end: a ship in it can
// only go east, whatever its heading's neighbours would prefer.
const CHANNEL = `
  ,,,,,,,,,,,,,,,,,,
  SS..........,,,,,,
  SS..........,,@@,,
  ,,,,,,,,,,,,,,@@,,
`;

describe('the fleet', () => {
  it('reads a heading in eighths of a turn, clockwise from north', () => {
    expect(
      [
        [0, -5],
        [5, -5],
        [5, 0],
        [5, 5],
        [0, 5],
        [-5, 5],
        [-5, 0],
        [-5, -5],
        [10, -3],
        [3, 10],
      ].map(([dx, dy]) => headingOf(dx as number, dy as number)),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 2, 4]);
  });

  it('sails one straight run towards the castle, as far as the water goes', () => {
    const state = battle(stateFromAscii(CHANNEL, rules()), 1000);
    openBattle(state);
    const run = ship(state, 0).run;
    // Level 1's first battle: the slowest speed, 63 ticks a tile.
    expect(run).toMatchObject({ dx: 1, dy: 0, tiles: 10, ticksPerTile: 63, startTick: 0 });
    expect(ship(state, 0).heading).toBe(2);
  });

  it('runs only as long as the battle has left, and a little more', () => {
    // 300 ticks and the slack's 72 fit five tiles of 63.
    const state = battle(stateFromAscii(CHANNEL, rules()), 300);
    openBattle(state);
    expect(ship(state, 0).run?.tiles).toBe(5);
  });

  it("stops short of another ship's run, and is placed between tiles as it sails", () => {
    const state = battle(
      stateFromAscii(
        `
        ,,,,,,,,,,,,,,,,,,
        SS..SS......,,,,,,
        SS..SS......,,@@,,
        ,,,,,,,,,,,,,,@@,,
        `,
        rules(),
      ),
      1000,
    );
    openBattle(state);
    // The ship behind plans first and stops before the one ahead; that one sails to the shore.
    expect(ship(state, 0).run?.tiles).toBe(2);
    expect(ship(state, 1).run?.tiles).toBe(6);
    expect(shipFits(state, 7, 1, null)).toBe(false);
    // Halfway through its second tile, in 1/256 of a tile, rounded down.
    const sailing = ship(state, 1);
    expect(shipPosition(sailing, 63 + 31)).toEqual({
      x: 4 * 256 + Math.floor((94 * 256) / 63),
      y: 256,
    });
    // At its run's end it stands there, and plans again while the battle lasts.
    for (let t = 0; t < 6 * 63; t++) {
      state.tick++;
      advanceFleet(state);
    }
    expect(ship(state, 1)).toMatchObject({ x: 10, y: 1, runs: 2 });
  });

  it('never turns back: with only the way it came open, it waits out the battle', () => {
    const state = battle(
      stateFromAscii(
        `
        ,,,,,,,,,,,,
        ,,,,,,,,..SS
        ,,@@,,,,..SS
        ,,@@,,,,,,,,
        `,
        rules(),
      ),
      1000,
    );
    // Headed west, at the end of its channel: east is behind it.
    openBattle(state);
    expect(ship(state, 0).run).toMatchObject({ dx: -1, tiles: 2 });
    state.tick = 2 * 63;
    advanceFleet(state);
    expect(ship(state, 0)).toMatchObject({ x: 8, run: null, runs: 2 });
  });

  it('draws a wave of the guns given, the level and the rounds played, capped by the pool', () => {
    const state = stateFromAscii(CHANNEL, rules());
    state.phase = 'castle_select';
    state.round = 0;
    fleet(state).cannonsGiven = 3;
    formWave(state);
    expect(fleet(state).wave).toEqual([3, 0, 0]);
    expect(fleet(state).pool).toEqual([7, 0, 0]);

    // Level 3 (index 2), the fourth round's build phase, five rounds played before the level:
    // 2 guns + 2 + min(8, 3) + (8 − 2) = 13, of a pool of 7 left.
    const later = stateFromAscii(
      CHANNEL,
      rules((c) => ({ ...c, level: 2, carry: { ...c.carry, roundsPlayed: 5 } })),
    );
    later.phase = 'build';
    later.round = 4;
    fleet(later).pool = [5, 2, 0];
    fleet(later).cannonsGiven = 2;
    formWave(later);
    expect(fleet(later).wave).toEqual([5, 2, 0]);
    expect(fleet(later).pool).toEqual([0, 0, 0]);
  });

  it('reckons a later level four rounds in from its first round: a bigger first wave', () => {
    // Level 2's first build phase, two rounds played before it and none in it: 0 guns + 1 (the
    // level's index) + min(2, r) + (2 − 2).
    const wave = (roundOffset: number): number => {
      const state = stateFromAscii(
        CHANNEL,
        rules((c) => ({
          ...c,
          level: 1,
          fleet: { ...c.fleet, roundOffset },
          carry: { ...c.carry, roundsPlayed: 2 },
        })),
      );
      state.phase = 'build';
      state.round = 1;
      fleet(state).pool = [20, 0, 0];
      fleet(state).cannonsGiven = 0;
      formWave(state);
      return fleet(state).wave[0];
    };
    // Reckoned from 0: min(2, 0) = 0, so 1; from 4: min(2, 4) = 2, so 3.
    expect(wave(0)).toBe(1);
    expect(wave(4)).toBe(3);
  });

  it('brings one ship of each kind a second, at the edge, while there is room', () => {
    const state = stateFromAscii(
      `
      ........................
      ........................
      ........,,,,,,,,........
      ........,,,,@@,,........
      ........,,,,@@,,........
      ........,,,,,,,,........
      ........................
      ........................
      `,
      rules((c) => ({ ...c, fleet: { ...c.fleet, maxAfloat: 3 } })),
    );
    state.phase = 'castle_select';
    fleet(state).wave = [3, 1, 0];
    advanceFleet(state);
    expect(fleet(state).ships.map((s) => s.kind)).toEqual(['raider', 'transport']);
    expect(fleet(state).wave).toEqual([2, 0, 0]);
    for (const s of fleet(state).ships) {
      expect(s.x === 0 || s.y === 0 || s.x === state.width - 2 || s.y === state.height - 2).toBe(
        true,
      );
    }
    // A second later the next raider; then the fleet is full, and the last waits in the wave.
    state.tick += 29;
    advanceFleet(state);
    expect(fleet(state).ships).toHaveLength(2);
    state.tick += 1;
    advanceFleet(state);
    expect(fleet(state).ships).toHaveLength(3);
    state.tick += 30;
    advanceFleet(state);
    expect(fleet(state).ships).toHaveLength(3);
    expect(fleet(state).wave).toEqual([1, 0, 0]);
    // Ships come only while castles are chosen and walls rebuilt.
    battle(state, 300);
    fleet(state).ships = [];
    state.tick += 30;
    advanceFleet(state);
    expect(fleet(state).ships).toHaveLength(0);
  });

  it('sends raiders at the coast back into the wave as the walls are rebuilt; transports stay', () => {
    const state = stateFromAscii(
      `
      ............
      .SS..SS.....
      .SS..SS.....
      ............
      ,,,,,,,,,,,,
      ,,,,,@@,,,,,
      ,,,,,@@,,,,,
      `,
      rules(),
    );
    // The first ship stands off the coast; the second is beside it, and a transport.
    fleet(state).ships = fleet(state).ships.map((s) =>
      s.id === 0 ? { ...s, y: 1 } : { ...s, y: 2, kind: 'transport' },
    );
    fleet(state).ships.push({ ...ship(state, 0), id: 2, x: 9, y: 2 });
    fleet(state).pool = [0, 0, 0];
    state.phase = 'build';
    openBuild(state);
    expect(fleet(state).ships.map((s) => s.id)).toEqual([0, 1]);
    expect(fleet(state).wave).toEqual([1, 0, 0]);
    expect(state.events).toContainEqual({ kind: 'ship_recycled', tick: 0, shipId: 2 });
  });
});
