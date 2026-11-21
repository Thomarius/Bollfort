import { defaultRuleset, type Ruleset } from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import { droneTargets } from './drone.js';
import { applyEnclosure } from './enclosure.js';
import { lullTargets } from './lullaby.js';
import { drainEvents } from './match.js';
import { placeCannon } from './placement.js';
import { holdingsOf } from './scoring.js';
import { traceLaser } from './laser.js';
import { isLoaded } from './specials.js';
import {
  cannonCentreX,
  cannonCentreY,
  findReadyCannon,
  fire,
  resolveImpacts,
  strikeCandidates,
  strikeWall,
} from './shots.js';
import { advanceWaves, waveRays, waveTargets } from './subwoofer.js';
import { sweepOrphanedWalls } from './sweep.js';
import { stateFromAscii, withSpecials } from './testing.js';
import { Structure, type MatchState } from './types.js';

/** Towers on, the Fortified Tower at both costs, firing or not; the rest as the default. */
function rules(fires = false): Ruleset {
  const ruleset = withSpecials(defaultRuleset);
  return {
    ...ruleset,
    specials: {
      ...ruleset.specials,
      fortified: {
        '2': { footprint: [2, 2], flightFactor: 1, fires },
        '3': { footprint: [3, 3], flightFactor: 1, fires },
      },
    },
  };
}

const tile = (state: MatchState, x: number, y: number) => y * state.width + x;
const stone = (state: MatchState) => state.cannons.find((c) => c.kind === 'fortified')!;

/** A ring round a castle whose north-east corner is a Fortified Tower: three of its tiles ring. */
const RING = `
  ..........
  .,,,,,,,,.
  .,####kk,.
  .,#,,,kk,.
  .,#,@@,#,.
  .,#,@@,#,.
  .,#,,,,#,.
  .,######,.
  .,,,,,,,,.
  ..........
`;

/** The same ring of wall alone, for placing one. */
const BARE = RING.replace('####kk', '######').replace('#,,,kk', '#,,,,#');

/** A wider ring, room for a 3x3 at its corners and inside. */
const WIDE = `
  ............
  .,,,,,,,,,,.
  .,########,.
  .,#,,,,,,#,.
  .,#,,,,,,#,.
  .,#,,,,,,#,.
  .,#,,,,@@#,.
  .,#,,,,@@#,.
  .,#,,,,,,#,.
  .,########,.
  .,,,,,,,,,,.
  ............
`;

describe('the Fortified Tower', () => {
  it('seals as wall, its tiles no ground, and is active touching sealed ground', () => {
    const state = stateFromAscii(RING, rules());
    applyEnclosure(state);
    expect(state.castles[0]!.enclosed).toBe(true);
    expect(state.territory[tile(state, 6, 3)]).toBe(0);
    expect(state.territory[tile(state, 5, 3)]).toBe(1);
    expect(stone(state).active).toBe(true);
  });

  it('goes inert once its ring is breached, as a gun outside sealed ground', () => {
    const state = stateFromAscii(RING, rules());
    state.structure[tile(state, 2, 5)] = Structure.Empty;
    applyEnclosure(state);
    expect(state.castles[0]!.enclosed).toBe(false);
    expect(stone(state).active).toBe(false);
  });

  it('scores as the cannons it cost while active, its tiles not as ground', () => {
    const state = stateFromAscii(RING, rules());
    applyEnclosure(state);
    // The interior's 16 tiles, the castle's among them, less the Fortified Tower's one inside.
    expect(holdingsOf(state)[0]).toEqual({ tiles: 15, castles: 1, guns: 2 });
  });

  it('holds the wall beside it against the sweep', () => {
    const state = stateFromAscii(RING, rules());
    expect(sweepOrphanedWalls(state)).toEqual([]);
  });

  it('takes no damage from a strike, even where its owner may clear their own wall', () => {
    const state = stateFromAscii(RING, rules());
    state.ruleset = {
      ...state.ruleset,
      shots: { ...state.ruleset.shots, damagesOwnWalls: true },
    };
    expect(strikeWall(state, 0, tile(state, 6, 2))).toBe(false);
    expect(state.structure[tile(state, 6, 2)]).toBe(Structure.Stone);
    expect(strikeWall(state, 0, tile(state, 4, 2))).toBe(true);
  });

  describe('placed', () => {
    function cannonPhase(
      fires = false,
      special: 'fortified2' | 'fortified3' = 'fortified2',
      art = BARE,
    ) {
      const state = stateFromAscii(art, rules(fires));
      applyEnclosure(state);
      state.phase = 'cannon_place';
      const player = state.players[0]!;
      player.special = special;
      player.cannonsToPlace = 3;
      return state;
    }

    it('over its own ring, replacing the wall, still sealed', () => {
      const state = cannonPhase();
      const placed = placeCannon(state, 0, 6, 2, true);
      expect('cannon' in placed).toBe(true);
      expect(state.structure[tile(state, 7, 2)]).toBe(Structure.Stone);
      expect(state.structure[tile(state, 6, 3)]).toBe(Structure.Stone);
      expect(state.castles[0]!.enclosed).toBe(true);
      expect(state.territory[tile(state, 6, 3)]).toBe(0);
      expect(state.players[0]!.cannonsToPlace).toBe(1);
    });

    it('across the middle of a side', () => {
      const state = cannonPhase();
      expect('cannon' in placeCannon(state, 0, 2, 5, true)).toBe(true);
      expect(state.castles[0]!.enclosed).toBe(true);
    });

    it('never with a tile beyond the ring', () => {
      const state = cannonPhase();
      expect(placeCannon(state, 0, 7, 2, true)).toEqual({ rejection: 'not_territory' });
      expect(placeCannon(state, 0, 1, 1, true)).toEqual({ rejection: 'not_territory' });
    });

    it('never over the castle', () => {
      const state = cannonPhase();
      expect(placeCannon(state, 0, 4, 4, true)).toEqual({ rejection: 'occupied' });
    });

    it('3x3 over a corner of the ring, and on sealed ground inside', () => {
      const state = cannonPhase(false, 'fortified3', WIDE);
      expect('cannon' in placeCannon(state, 0, 7, 2, true)).toBe(true);
      expect(state.castles[0]!.enclosed).toBe(true);
      // Its east column would stand one tile beyond the ring.
      const other = cannonPhase(false, 'fortified3', WIDE);
      expect(placeCannon(other, 0, 8, 2, true)).toEqual({ rejection: 'not_territory' });
      const inside = cannonPhase(false, 'fortified3', WIDE);
      expect('cannon' in placeCannon(inside, 0, 3, 3, true)).toBe(true);
    });

    it('with the barrels its variant sets, a barrel a shot in the air', () => {
      const state = cannonPhase(true, 'fortified3', WIDE);
      const cs = state.ruleset.specials.fortified!;
      state.ruleset = {
        ...state.ruleset,
        specials: {
          ...state.ruleset.specials,
          fortified: { ...cs, '3': { ...cs['3']!, barrels: 2 } },
        },
      };
      const placed = placeCannon(state, 0, 7, 2, true);
      if (!('cannon' in placed)) throw new Error('not placed');
      expect(placed.cannon.barrels).toBe(2);
      expect(isLoaded({ ...placed.cannon, shotIds: [1] })).toBe(true);
      expect(isLoaded({ ...placed.cannon, shotIds: [1, 2] })).toBe(false);
      // Unset, one barrel, and nothing on the gun.
      const plain = cannonPhase(true, 'fortified3', WIDE);
      const one = placeCannon(plain, 0, 7, 2, true);
      expect('cannon' in one && one.cannon.barrels).toBe(undefined);
    });
  });

  describe('firing', () => {
    function ring(fires: boolean): MatchState {
      const state = stateFromAscii(RING, rules(fires));
      applyEnclosure(state);
      state.phase = 'combat';
      state.phaseEndTick = 100_000;
      return state;
    }

    it('never chosen to fire unless its variant fires', () => {
      expect(findReadyCannon(ring(false), 0, 0, 0)).toBeNull();
      expect(findReadyCannon(ring(true), 0, 0, 0)?.kind).toBe('fortified');
    });
  });
});

/**
 * Player 0's tower at the west, player 1's Fortified Tower across the channel with a wall behind
 * it on the same row, player 2's walls further on.
 */
const FRONT = `
  ........................
  .,TT,..,,,,,,..,,,,,,,,.
  .,TT#..,kk#,,..#,,,,,,,.
  .,**,..,kk,,,..,,#,#,,,.
  .,**,..,,,,,,..,,,,,,,,.
  ........................
`;
/**
 * Player 0's Subwoofer, player 1's 3x3 Fortified Tower across the channel and a column of wall
 * behind it: three lanes aimed along row 3.
 */
const WAVE = `
  ..................
  .,,,..,,,,,,,,#,,.
  .,,,..,KKK,,,,#,,.
  .,WW..,KKK,,,,#,,.
  .,WW..,KKK,,,,#,,.
  .,,,..,,,,,,,,#,,.
  ..................
`;
const WAVE_ISLANDS = `
  ..................
  ......22222222222.
  ......22222222222.
  ......22222222222.
  ......22222222222.
  ......22222222222.
  ..................
`;
const ISLANDS = `
  ........................
  .......222222..33333333.
  .......222222..33333333.
  .......222222..33333333.
  .......222222..33333333.
  ........................
`;

function front(glyph: string, fires = false): MatchState {
  const state = stateFromAscii(FRONT.replaceAll('T', glyph), rules(fires), ISLANDS);
  state.phase = 'combat';
  state.phaseEndTick = 100_000;
  for (const cannon of state.cannons) cannon.active = true;
  return state;
}

describe("an opponent's Fortified Tower", () => {
  it("takes one of a Laser beam's hits, whatever its size, and the beam goes on", () => {
    const state = front('X');
    // Two hits exactly, no chance of a third.
    const laser = { footprint: [2, 2] as [number, number], flightFactor: 1, pierce: 2 };
    state.ruleset = {
      ...state.ruleset,
      specials: { ...state.ruleset.specials, laser: { '2': laser, '3': laser } },
    };
    const beam = traceLaser(state, 0, 2.5, 1.5, 9, 2, 2);
    // Its first tile met takes a hit; its second on the line is passed free.
    expect(beam.absorbed).toEqual([tile(state, 8, 2)]);
    expect(beam.cleared).toEqual([tile(state, 10, 2)]);
    expect(beam.hits).toEqual([tile(state, 8, 2), tile(state, 10, 2)]);
    expect('shot' in fire(state, 0, 9, 2)).toBe(true);
    expect(state.structure[tile(state, 8, 2)]).toBe(Structure.Stone);
    expect(state.structure[tile(state, 10, 2)]).toBe(Structure.Empty);
    expect(state.structure[tile(state, 15, 2)]).toBe(Structure.Wall);
  });

  it("takes one lane of a Subwoofer's wave; the other lanes pass through it", () => {
    const state = stateFromAscii(WAVE, rules(), WAVE_ISLANDS);
    state.phase = 'combat';
    state.phaseEndTick = 100_000;
    for (const cannon of state.cannons) cannon.active = true;
    const tower = state.cannons.find((c) => c.kind === 'subwoofer')!;
    const rays = waveRays(cannonCentreX(tower), cannonCentreY(tower), 14, 3, 3)!;
    const predicted = waveTargets(state, 0, rays);
    expect('shot' in fire(state, 0, 14, 3)).toBe(true);
    const ended: { destroyed: number | null; x: number; y: number }[] = [];
    for (let t = 0; t < 400 && state.waves.length > 0; t++) {
      state.tick++;
      advanceWaves(state);
      for (const e of drainEvents(state)) if (e.kind === 'wave_ended') ended.push(e);
    }
    const taken = ended.filter((e) => e.destroyed === null);
    expect(taken.length).toBe(1);
    // Where it ended is a point along the lane, inside the Fortified Tower's tiles.
    const at = tile(state, Math.round(taken[0]!.x), Math.round(taken[0]!.y));
    expect(state.structure[at]).toBe(Structure.Stone);
    // The other two lanes passed it and each cleared a wall of the column behind.
    const cleared = ended.flatMap((e) => (e.destroyed === null ? [] : [e.destroyed]));
    expect(cleared.length).toBe(2);
    for (const i of cleared) expect(i % state.width).toBe(14);
    // The bots' preview of the wave says the same.
    expect([...predicted.walls].filter((w) => w !== null).sort()).toEqual([...cleared].sort());
  });

  it("is one of a drone's targets, whatever its size, and not while a missile flies to it", () => {
    const state = front('D');
    state.players[0]!.droneAnchor = tile(state, 9, 2);
    const drone = state.cannons.find((c) => c.kind === 'drone')!;
    const stones = (targets: number[]) =>
      targets.filter((i) => state.structure[i] === Structure.Stone);
    const targets = droneTargets(state, drone);
    expect(stones(targets).length).toBe(1);
    expect(targets).toContain(tile(state, 10, 2));
    // A missile flying to any of its tiles takes it out of the draw.
    state.shots.push({
      id: 99,
      cannonId: drone.id,
      owner: 0,
      kind: 'drone',
      cost: 3,
      fromX: 2,
      fromY: 2,
      toX: 9,
      toY: 3,
      launchTick: 0,
      impactTick: state.tick,
    });
    expect(stones(droneTargets(state, drone))).toEqual([]);
    // It lands, and clears nothing.
    resolveImpacts(state);
    expect(state.structure[tile(state, 9, 3)]).toBe(Structure.Stone);
  });

  it('is drawn once among the candidates for a strike, and not at all once struck', () => {
    const state = front('X');
    const all = Array.from({ length: state.width * state.height }, (_, i) => i);
    const stones = strikeCandidates(state, 0, all).filter(
      (i) => state.structure[i] === Structure.Stone,
    );
    expect(stones).toEqual([tile(state, 8, 2)]);
    const id = state.cannons.find((c) => c.kind === 'fortified')!.id;
    expect(
      strikeCandidates(state, 0, all, new Set([id])).filter(
        (i) => state.structure[i] === Structure.Stone,
      ),
    ).toEqual([]);
  });

  it('is passed over by a lullaby unless it fires', () => {
    const variant = defaultRuleset.specials.lullaby!['2']!;
    const wide = { ...variant, sleepRadius: null, targets: 10 };
    const kinds = (state: MatchState) => lullTargets(state, 0, 8, 2, wide).map((c) => c.kind);
    expect(kinds(front('Z'))).not.toContain('fortified');
    expect(kinds(front('Z', true))).toContain('fortified');
  });
});
