import { describe, expect, it } from 'vitest';
import type { CampaignLevelRules, Ruleset } from '@bollfort/config';

import { canPlaceCannon, cellsRefusal } from '../placement.js';
import { fire, resolveImpacts } from '../shots.js';
import { campaignLevelRuleset, stateFromAscii } from '../testing.js';
import { Structure, type MatchState, type PlayerState } from '../types.js';
import { applyEnclosure } from '../enclosure.js';
import {
  advanceGrunts,
  clearRing,
  clearWalledIn,
  gruntAllowance,
  openGruntsBattle,
  openGruntsBuild,
} from './grunts.js';
import { copyCampaign, type CampaignState, type Grunt } from './state.js';

function rules(change: (c: CampaignLevelRules) => CampaignLevelRules = (c) => c): Ruleset {
  const ruleset = campaignLevelRuleset();
  return { ...ruleset, campaign: change(ruleset.campaign as CampaignLevelRules) };
}

function fleet(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

function grunts(state: MatchState): [number, number, number][] {
  return fleet(state).grunts.map((g: Grunt) => [g.x, g.y, g.facing]);
}

/** Runs the grunts' part of each tick for `n` ticks. */
function run(state: MatchState, n: number): void {
  for (let t = 0; t < n; t++) {
    state.tick++;
    advanceGrunts(state);
  }
}

function building(state: MatchState): MatchState {
  state.phase = 'build';
  state.phaseEndTick = 10_000;
  return state;
}

// The step is 1600 ms: 48 ticks.
const STEP = 48;

describe('the grunts', () => {
  it('come ashore from a transport at the coast, one at a time, while the allowance lasts', () => {
    const state = building(
      stateFromAscii(
        `
        ............
        .SS.........
        .SS.........
        ,,,,,,,,,,,,
        ,,,,,,,,,@@,
        ,,,,,,,,,@@,
        `,
        rules(),
      ),
    );
    fleet(state).ships = fleet(state).ships.map((s) => ({ ...s, kind: 'transport' }));
    openGruntsBuild(state, 0);
    expect(fleet(state).gruntsLeft).toBe(5);
    fleet(state).gruntsLeft = 2;
    run(state, 1);
    // The first free tile round it, clockwise from above its top left: the shore at its far
    // corner, facing away from it.
    expect(grunts(state)).toEqual([[3, 3, 1]]);
    // 1866 ms later (56 ticks), the next, beside the first.
    run(state, 55);
    expect(grunts(state)).toHaveLength(1);
    run(state, 1);
    // The first has walked on towards the castle meanwhile, so the next lands where it did.
    expect(grunts(state).map(([x, y]) => [x, y])).toEqual([
      [4, 3],
      [3, 3],
    ]);
    // The allowance spent, no more come.
    run(state, 200);
    expect(fleet(state).gruntsLeft).toBe(0);
    expect(fleet(state).grunts.length).toBeGreaterThanOrEqual(2);
    expect(state.events.filter((e) => e.kind === 'grunt_landed')).toHaveLength(2);
  });

  it('walk towards the nearest castle and stop facing it', () => {
    const state = building(
      stateFromAscii(
        `
        ,,,,,,,,,,
        ,m,,,,,@@,
        ,,,,,,,@@,
        ,,,,,,,,,,
        `,
        rules(),
      ),
    );
    run(state, STEP * 4);
    // East along its row, a tile a step: four steps, then the castle ahead stops it.
    expect(grunts(state)).toEqual([[5, 1, 1]]);
    run(state, STEP * 3);
    expect(grunts(state)).toEqual([[6, 1, 1]]);
  });

  it('slide along a wall, the counter-clockwise way first, and never back', () => {
    const state = building(
      stateFromAscii(
        `
        ,,,,,,,,,,
        ,,,#,,,,,,
        ,m,#,,,@@,
        ,,,#,,,@@,
        ,,,,,,,,,,
        `,
        rules(),
      ),
    );
    run(state, STEP);
    expect(grunts(state)).toEqual([[2, 2, 1]]);
    // The wall ahead: a quarter turn counter-clockwise, north, along it.
    run(state, STEP);
    expect(grunts(state)).toEqual([[2, 1, 0]]);
    // Hemmed in by the wall, the edge and nothing behind it: it faces the castle and waits.
    const boxed = building(
      stateFromAscii(
        `
        ###,,,,,
        #m#,,@@,
        ###,,@@,
        `,
        rules(),
      ),
    );
    run(boxed, STEP * 2);
    expect(grunts(boxed)).toEqual([[1, 1, 1]]);
  });

  it('smash the wall they face, in a battle only', () => {
    const state = stateFromAscii(
      `
      ,,,,,,,,,
      ,m#,,@@,,
      ,,#,,@@,,
      `,
      rules(),
    );
    fleet(state).grunts = fleet(state).grunts.map((g) => ({ ...g, facing: 1 }));
    const wall = 1 * state.width + 2;
    // Between phases nothing moves or smashes.
    state.phase = 'cannon_place';
    run(state, 300);
    expect(state.structure[wall]).toBe(Structure.Wall);
    state.phase = 'combat';
    state.phaseEndTick = state.tick + 600;
    openGruntsBattle(state);
    // 6933 ms: 208 ticks.
    run(state, 207);
    expect(state.structure[wall]).toBe(Structure.Wall);
    run(state, 1);
    expect(state.structure[wall]).toBe(Structure.Empty);
    expect(fleet(state).struck).toEqual([wall]);
    expect(state.events).toContainEqual({
      kind: 'wall_smashed',
      tick: state.tick,
      gruntId: 0,
      tile: wall,
    });
  });

  it('bring more beside them from the allowance', () => {
    const state = building(stateFromAscii(',,,,,\n,,m,,\n,,,,,', rules()));
    openGruntsBuild(state, 7);
    // The table's last entry from the eighth round on.
    expect(fleet(state).gruntsLeft).toBe(13);
    run(state, 351);
    expect(fleet(state).grunts).toHaveLength(1);
    run(state, 1);
    expect(fleet(state).grunts).toHaveLength(2);
    expect(fleet(state).gruntsLeft).toBe(12);
  });

  it('block pieces and guns where they stand', () => {
    const state = stateFromAscii(
      `
      ##########
      #,,,,,,,,#
      #,m,,,,,,#
      #,,,@@,,,#
      #,,,@@,,,#
      ##########
      `,
      rules(),
    );
    const player = state.players[0] as PlayerState;
    expect(cellsRefusal(state, player, [[0, 0]], 2, 2)).toBe('grunt');
    expect(cellsRefusal(state, player, [[0, 0]], 3, 2)).toBeNull();
    state.phase = 'cannon_place';
    player.cannonsToPlace = 1;
    state.territory.fill(player.islandId);
    expect(canPlaceCannon(state, 0, 1, 1)).toBe('grunt');
    expect(canPlaceCannon(state, 0, 6, 1)).toBeNull();
  });

  it('die where a shot lands, for points', () => {
    const state = stateFromAscii(
      `
      ,,,,,,,,,,,
      ,**,,,,,m,,
      ,**,,,,,,,,
      `,
      rules(),
    );
    const result = fire(state, 0, 8, 1);
    if ('shot' in result) state.tick = result.shot.impactTick;
    resolveImpacts(state);
    expect(fleet(state).grunts).toHaveLength(0);
    expect(state.players[0]?.score).toBe(10);
  });

  it('are cleared from a ring about to be raised', () => {
    const state = stateFromAscii(',m,,,,m\n,,,,,,,', rules());
    clearRing(state, 0, 0, 3, 1);
    expect(grunts(state)).toEqual([[6, 0, 0]]);
  });

  it('come more for more players, by the factor', () => {
    const state = stateFromAscii(
      ',,,',
      rules((c) => ({ ...c, grunts: { ...c.grunts, factor: 1.5 } })),
    );
    expect([0, 3, 20].map((r) => gruntAllowance(state, r))).toEqual([8, 12, 20]);
  });

  it("are a copy's own when the match is copied to be stepped ahead", () => {
    // A bot's rollout plays build phases out ahead: sharing the campaign, it landed and walked
    // grunts in the match itself.
    const state = building(stateFromAscii(',,,,,\n,,m,,\n,,,,,', rules()));
    const ahead: MatchState = { ...state, campaign: copyCampaign(fleet(state)) };
    fleet(ahead).gruntsLeft = 3;
    run(ahead, 400);
    expect(fleet(ahead).grunts.length).toBeGreaterThan(1);
    expect(grunts(state)).toEqual([[2, 1, 0]]);
    expect(fleet(state).gruntsLeft).toBe(0);
  });

  it('are cleared when a wall closes round them, pockets too, for the builder', () => {
    const state = stateFromAscii(
      `
      ,,,,,,,,,,,,,,,,
      ,######,,####,m,
      ,#,,,,#,,#,,#,,,
      ,#,@@m#,,#m,#,,,
      ,#,@@,#,,####,,,
      ,######,,,,,,,,,
      `,
      rules(),
    );
    applyEnclosure(state);
    clearWalledIn(state, 0);
    // The one by the castle and the one in the pocket beside it; the one outside stands.
    expect(grunts(state)).toEqual([[14, 1, 0]]);
    expect(state.players[0]?.score).toBe(20);
    expect(state.events.filter((e) => e.kind === 'grunt_killed')).toEqual([
      {
        kind: 'grunt_killed',
        tick: 0,
        gruntId: 1,
        x: 5,
        y: 3,
        player: 0,
        points: 10,
        how: 'walled',
      },
      {
        kind: 'grunt_killed',
        tick: 0,
        gruntId: 2,
        x: 10,
        y: 3,
        player: 0,
        points: 10,
        how: 'walled',
      },
    ]);
  });

  it('turn to their castle as a battle opens, and smash the wall in its way', () => {
    // It slid along the wall and faces north, along it: in the battle it turns east, at the wall.
    const state = stateFromAscii(
      `
      ,,,,,,,,,,
      ,,,#######
      ,,m#,,,,,,
      ,,,#,@@,,,
      ,,,#,@@,,,
      `,
      rules(),
    );
    state.phase = 'combat';
    state.phaseEndTick = state.tick + 600;
    openGruntsBattle(state);
    expect(grunts(state)).toEqual([[2, 2, 1]]);
    run(state, 208);
    expect(state.structure[2 * state.width + 3]).toBe(Structure.Empty);
  });

  it("clear a ring's square of walls and ice as well as grunts", () => {
    const state = stateFromAscii(',##,,m\n,#m,,,\n,,,,,,', rules());
    state.frozen = [
      { tile: 2 * state.width + 1, share: 1, throughOvertime: true, thawTick: 0, buildsLeft: 2 },
      { tile: 2 * state.width + 5, share: 1, throughOvertime: true, thawTick: 0, buildsLeft: 2 },
    ];
    clearRing(state, 0, 0, 3, 2);
    expect(state.structure.filter((t) => t === Structure.Wall)).toHaveLength(0);
    expect(grunts(state)).toEqual([[5, 0, 0]]);
    expect(state.frozen.map((f) => f.tile)).toEqual([2 * state.width + 5]);
  });
});
