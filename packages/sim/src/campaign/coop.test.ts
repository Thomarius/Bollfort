import { describe, expect, it } from 'vitest';
import { defaultTerrainConfig } from '@bollfort/config';

import { applyEnclosure } from '../enclosure.js';
import { applyAction, createMatch } from '../match.js';
import { canPlaceCannon } from '../placement.js';
import { holdingsOf } from '../scoring.js';
import { campaignLevelRuleset, fastRuleset, stateFromAscii } from '../testing.js';
import type { MatchState, PlayerState } from '../types.js';
import { castleHolders, fallbackCastle, freeCastles } from './coop.js';

/** The picture's one player and `count - 1` more, every one on the team's island. */
function team(state: MatchState, count: number): MatchState {
  const first = state.players[0] as PlayerState;
  first.team = 0;
  for (let id = 1; id < count; id++) {
    state.players.push({ ...first, id, name: `p${id}`, isBot: false });
  }
  return state;
}

/** Each player's main castle, by castle id; null for none. */
function mains(state: MatchState, ids: (number | null)[]): MatchState {
  ids.forEach((id, p) => ((state.players[p] as PlayerState).startingCastleId = id));
  return state;
}

// Three castles, 0 to 2 from the left, each in a ring; the middle one's ring is open at its
// top, mid-edge.
const THREE = `
  ......................
  .######.###.##.######.
  .#,,,,#.#,,,,#.#,,,,#.
  .#,@@,#.#,@@,#.#,@@,#.
  .#,@@,#.#,@@,#.#,@@,#.
  .#,,,,#.#,,,,#.#,,,,#.
  .######.######.######.
  ......................
`;

describe('co-op castles (CAMPAIGN §6.1)', () => {
  it('gives each player their main castle when it is sealed', () => {
    const state = mains(team(stateFromAscii(THREE, campaignLevelRuleset()), 2), [0, 2]);
    const { castleEnclosed } = applyEnclosure(state);
    expect(castleEnclosed).toEqual([true, false, true]);
    expect(castleHolders(state, castleEnclosed)).toEqual([0, -1, 1]);
    expect(state.players.map((p) => p.enclosedCastles)).toEqual([1, 1]);
  });

  it('deals a sealed castle nobody chose in turn, a breached main castle earning nothing', () => {
    // Player 1's main castle is the open middle one; castle 0 is player 0's. Castle 2 is
    // nobody's main: dealt to the first in turn, both without guns, so to player 0 by seat.
    const state = mains(team(stateFromAscii(THREE, campaignLevelRuleset()), 2), [0, 1]);
    const { castleEnclosed } = applyEnclosure(state);
    expect(castleHolders(state, castleEnclosed)).toEqual([0, -1, 0]);
    expect(state.players.map((p) => p.enclosedCastles)).toEqual([2, 0]);
  });

  it('deals the sealed castles nobody holds to the player with the fewest guns first', () => {
    const closed = THREE.replace('.######.###.##.######.', '.######.######.######.');
    const state = mains(team(stateFromAscii(closed, campaignLevelRuleset()), 2), [0, 2]);
    // Player 0 has a gun, player 1 none: the spare castle is player 1's.
    state.cannons.push({
      id: 0,
      owner: 0,
      kind: 'cannon',
      cost: 1,
      x: 2,
      y: 2,
      w: 1,
      h: 1,
      active: true,
      shotIds: [],
    });
    const { castleEnclosed } = applyEnclosure(state);
    expect(castleHolders(state, castleEnclosed)).toEqual([0, 1, 1]);
    expect(state.players.map((p) => p.enclosedCastles)).toEqual([1, 2]);
  });

  it('leaves a player with nothing when every sealed castle is held, to play on with the team', () => {
    // Player 1's main castle is the open one, and the two sealed are players 0's and 2's.
    const state = mains(team(stateFromAscii(THREE, campaignLevelRuleset()), 3), [0, 1, 2]);
    applyEnclosure(state);
    expect(state.players.map((p) => p.enclosedCastles)).toEqual([1, 0, 1]);
  });

  it('gives one player every sealed castle, as before co-op', () => {
    const closed = THREE.replace('.######.###.##.######.', '.######.######.######.');
    const state = mains(stateFromAscii(closed, campaignLevelRuleset()), [1]);
    applyEnclosure(state);
    expect(state.players[0]?.enclosedCastles).toBe(3);
  });
});

describe('co-op ground and guns', () => {
  it("fires a teammate's gun on the team's sealed ground, and lets them place one there", () => {
    const wide = `
      .........
      .#######.
      .#,,,,,#.
      .#,@@,,#.
      .#,@@,,#.
      .#,,,,,#.
      .#######.
      .........
    `;
    const state = mains(team(stateFromAscii(wide, campaignLevelRuleset()), 2), [0, null]);
    state.cannons.push({
      id: 0,
      owner: 1,
      kind: 'cannon',
      cost: 1,
      x: 2,
      y: 2,
      w: 1,
      h: 1,
      active: false,
      shotIds: [],
    });
    applyEnclosure(state);
    expect(state.cannons[0]?.active).toBe(true);
    state.phase = 'cannon_place';
    (state.players[1] as PlayerState).cannonsToPlace = 1;
    expect(canPlaceCannon(state, 1, 5, 3)).toBeNull();
  });

  it('shares the ground equally among every player while the team holds a castle', () => {
    const state = mains(team(stateFromAscii(THREE, campaignLevelRuleset()), 3), [0, 1, 2]);
    applyEnclosure(state);
    // Two sealed rings of 16 tiles each, held by players 0 and 2; player 1 holds no castle but
    // shares the team's ground, rounded down.
    expect(holdingsOf(state).map((h) => h.tiles)).toEqual([10, 10, 10]);
  });

  it('counts a pocket while anyone on the team holds a sealed castle', () => {
    const pocket = `
      ...............
      .######.####...
      .#,,,,#.#,,#...
      .#,@@,#.#,,#...
      .#,@@,#.####...
      .#,,,,#........
      .######..,@@,..
      .........,@@,..
      ...............
    `;
    const state = mains(team(stateFromAscii(pocket, campaignLevelRuleset()), 2), [0, 1]);
    applyEnclosure(state);
    expect(state.players.map((p) => p.enclosedCastles)).toEqual([1, 0]);
    // The 2 × 2 pocket is the team's: the island's mark.
    expect(state.territory[3 * state.width + 9]).toBe(1);
  });
});

describe('choosing castles in co-op', () => {
  function level(): MatchState {
    const ruleset = campaignLevelRuleset(fastRuleset());
    const campaign = ruleset.campaign!;
    const state = createMatch({
      seed: 11,
      ruleset: {
        ...ruleset,
        campaign: { ...campaign, carry: { ...campaign.carry, scores: [0, 0] } },
      },
      terrainConfig: defaultTerrainConfig,
      players: [
        { name: 'A', isBot: false, team: 0 },
        { name: 'B', isBot: false, team: 0 },
      ],
    });
    state.phase = 'castle_select';
    return state;
  }

  it('puts every player on the one island', () => {
    expect(level().players.map((p) => p.islandId)).toEqual([1, 1]);
  });

  it("refuses a castle a teammate holds, and offers only the others'", () => {
    const state = level();
    expect(applyAction(state, { kind: 'select_castle', player: 0, castleId: 2 })).toBeNull();
    expect(applyAction(state, { kind: 'select_castle', player: 1, castleId: 2 })).toBe(
      'castle_taken',
    );
    const free = freeCastles(state, state.players[1] as PlayerState).map((c) => c.id);
    expect(free).not.toContain(2);
    expect(free.length).toBe(state.castles.length - 1);
  });

  it('chooses for a player who did not the free castle nearest the middle of the land', () => {
    const state = level();
    const first = fallbackCastle(state, state.players[0] as PlayerState);
    expect(first).not.toBeNull();
    (state.players[0] as PlayerState).startingCastleId = first!.id;
    const second = fallbackCastle(state, state.players[1] as PlayerState);
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
  });
});
