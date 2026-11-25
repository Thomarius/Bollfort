import { describe, expect, it } from 'vitest';
import type { CampaignLevelRules, Ruleset } from '@bollfort/config';

import { isFrozen, startFreezes } from '../frost.js';
import { canPlaceCannon } from '../placement.js';
import { campaignLevelRuleset, stateFromAscii } from '../testing.js';
import { Structure, type MatchState } from '../types.js';
import { advanceGrunts } from './grunts.js';
import { landFleetShots } from './gunnery.js';
import { ageIce, freezeFromFleet, iced } from './ice.js';
import type { CampaignState, FleetShot } from './state.js';

function rules(change: (c: CampaignLevelRules) => CampaignLevelRules = (c) => c): Ruleset {
  const ruleset = campaignLevelRuleset();
  return { ...ruleset, campaign: change(ruleset.campaign as CampaignLevelRules) };
}

function fleet(state: MatchState): CampaignState {
  return state.campaign as CampaignState;
}

function shotAt(x: number, y: number, kind: FleetShot['kind'] = 'frostship'): FleetShot {
  return {
    id: 0,
    shipId: 0,
    kind,
    fromX: 0,
    fromY: 0,
    toX: x,
    toY: y,
    launchTick: 0,
    impactTick: 0,
  };
}

const BOARD = `
  .........
  .,######,
  .,#,,,,#,
  .,#,@@,#,
  .,#,@@,#,
  .,######,
`;

describe("a frost ship's ice", () => {
  it('freezes the wall it clears, and bare ground, never the sea', () => {
    const state = stateFromAscii(BOARD, rules());
    fleet(state).shots = [shotAt(2, 2), shotAt(1, 3), shotAt(0, 3), shotAt(4, 1, 'raider')];
    landFleetShots(state);
    const wall = 2 * state.width + 2;
    expect(state.structure[wall]).toBe(Structure.Empty);
    expect(state.frozen.map((f) => [f.tile, f.buildsLeft])).toEqual([
      [wall, 2],
      [3 * state.width + 1, 2],
    ]);
    // A raider's shot clears its wall and freezes nothing.
    expect(iced(state, 1 * state.width + 4)).toBe(false);
    expect(state.events).toContainEqual({
      kind: 'tile_frozen',
      tick: 0,
      shotId: 0,
      owner: -1,
      tile: wall,
    });
  });

  it('lasts three build phases from the eighth round of the campaign', () => {
    const state = stateFromAscii(
      BOARD,
      rules((c) => ({ ...c, carry: { ...c.carry, roundsPlayed: 8 } })),
    );
    freezeFromFleet(state, shotAt(1, 2));
    expect(state.frozen[0]?.buildsLeft).toBe(3);
  });

  it('blocks pieces through its build phases, aged as each battle opens', () => {
    const state = stateFromAscii(BOARD, rules());
    freezeFromFleet(state, shotAt(1, 2));
    const tile = 2 * state.width + 1;
    // The first build phase: frozen to its end, overtime and all.
    state.phase = 'build';
    startFreezes(state);
    expect(isFrozen(state, tile)).toBe(true);
    // The next battle ages it: one build phase left, frozen through that too.
    state.phase = 'combat';
    ageIce(state);
    expect(state.frozen[0]?.buildsLeft).toBe(1);
    state.phase = 'build';
    startFreezes(state);
    expect(isFrozen(state, tile)).toBe(true);
    // And the battle after melts it.
    state.phase = 'combat';
    ageIce(state);
    expect(state.frozen).toEqual([]);
  });

  it('takes no gun and lets no grunt onto it', () => {
    const state = stateFromAscii(
      `
      ,,,,,,,,,
      ,m,,,,@@,
      ,,,,,,@@,
      `,
      rules(),
    );
    freezeFromFleet(state, shotAt(2, 1));
    state.phase = 'build';
    state.phaseEndTick = 1000;
    for (let t = 0; t < 48; t++) {
      state.tick++;
      advanceGrunts(state);
    }
    // Its way east frozen, it turned aside rather than step onto the ice.
    expect(fleet(state).grunts.map((g) => [g.x, g.y])).toEqual([[1, 0]]);

    state.phase = 'cannon_place';
    const player = state.players[0];
    if (player !== undefined) player.cannonsToPlace = 1;
    state.territory.fill(1);
    expect(canPlaceCannon(state, 0, 2, 1)).toBe('frozen');
    expect(canPlaceCannon(state, 0, 3, 1)).toBeNull();
  });
});
