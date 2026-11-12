import {
  SPECIAL_KINDS,
  defaultAchievements,
  defaultRuleset,
  type AchievementsConfig,
} from '@bollfort/config';
import {
  Structure,
  applyEnclosure,
  stateFromAscii,
  type MatchEvent,
  type MatchState,
  type Phase,
  type Shot,
} from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import {
  AchievementWatcher,
  statAchievements,
  towersBoughtCount,
  tournamentAchievements,
} from './achievements.js';

/** Two islands, each a castle in a sealed ring: player 0's on the left, player 1's on the right. */
const RINGS = `
  .................
  .#####...#####...
  .#,,,#...#,,,#...
  .#,@,#...#,@,#...
  .#,,,#...#,,,#...
  .#####...#####...
  .................
`;
const RING_ISLANDS = `
  .................
  .........22222...
  .........22222...
  .........22222...
  .........22222...
  .........22222...
  .................
`;

/** Three islands in a row, for what needs only whose tile is whose. */
const THREE = '1111.2222.3333';

function rings(): MatchState {
  const state = stateFromAscii(RINGS, defaultRuleset, RING_ISLANDS);
  applyEnclosure(state);
  return state;
}

const at = (state: MatchState, x: number, y: number): number => y * state.width + x;

function phase(name: Phase, phaseEndTick = 1000): MatchEvent {
  return {
    kind: 'phase_changed',
    tick: 0,
    phase: name,
    round: 1,
    phaseEndTick,
    pendingPhase: null,
  };
}

let nextShot = 1;
function shot(owner: number, kind: Shot['kind'] = 'cannon', cannonId = 0): Shot {
  return {
    id: nextShot++,
    cannonId,
    owner,
    kind,
    cost: 3,
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    launchTick: 0,
    impactTick: 10,
  };
}

/** A shot fired and landed, clearing these tiles from the board as it does. */
function hit(
  watcher: AchievementWatcher,
  state: MatchState,
  fired: Shot,
  destroyed: number[],
): void {
  watcher.observe(state, [{ kind: 'shot_fired', tick: 0, shot: fired }]);
  for (const tile of destroyed) state.structure[tile] = Structure.Empty;
  watcher.observe(state, [
    { kind: 'shot_impact', tick: 10, shotId: fired.id, x: 0, y: 0, destroyed },
  ]);
}

function resolved(player: number, enclosedCastles: number): MatchEvent {
  return {
    kind: 'round_resolved',
    tick: 0,
    round: 1,
    results: [
      {
        player,
        enclosedCastles,
        cannonsAwarded: 0,
        eliminated: false,
        territoryPoints: 0,
        gunPoints: 0,
        damagePoints: 0,
      },
    ],
  };
}

function gameOver(
  state: MatchState,
  winners: number[],
  endedBy: 'round_cap' | 'elimination' = 'round_cap',
): MatchEvent {
  state.winners = winners;
  state.draw = false;
  state.endedBy = endedBy;
  return { kind: 'game_over', tick: 0, winners, draw: false, endedBy };
}

const config = (changes: Partial<AchievementsConfig>): AchievementsConfig => ({
  ...defaultAchievements,
  ...changes,
});

describe('a castle broken open', () => {
  it('is the seat’s when its own shot opens a rival’s sealed castle', () => {
    const state = rings();
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5] });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [at(state, 11, 1)]);
    expect(watcher.drain()).toEqual(['FIRST_BREACH']);
  });

  it('is not earned by a shot at a castle already open', () => {
    const state = rings();
    state.structure[at(state, 11, 5)] = Structure.Empty;
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5] });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [at(state, 11, 1)]);
    expect(watcher.unlocked).toEqual([]);
  });
});

describe('the seat’s resolution', () => {
  it('counts its ground, its castles, and a pocket', () => {
    const state = stateFromAscii(
      `
        ...........
        .#########.
        .#,,,#,,,#.
        .#,@,#,,,#.
        .#,,,#,,,#.
        .#########.
        ...........
      `,
      defaultRuleset,
    );
    applyEnclosure(state);
    const watcher = new AchievementWatcher(
      config({ LAND_GRAB: { tiles: 18 }, EMPIRE: { tiles: 19 } }),
      {
        seat: 0,
        levels: [null],
      },
    );
    watcher.observe(state, [resolved(0, 1)]);
    expect(watcher.unlocked).toEqual(['POCKET', 'FULL_ESTATE', 'LAND_GRAB']);
    expect(watcher.stats.castles_sealed).toBe(1);
  });

  it('holds the whole estate only with every castle of its island sealed', () => {
    const state = stateFromAscii(
      `
        ..............
        .#####...,,,,.
        .#,,,#...,,@,.
        .#,@,#...,,,,.
        .#,,,#........
        .#####........
        ..............
      `,
      defaultRuleset,
    );
    applyEnclosure(state);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null] });
    watcher.observe(state, [resolved(0, 1)]);
    expect(watcher.unlocked).not.toContain('FULL_ESTATE');
  });
});

describe('the overtime', () => {
  it('saves the round when its piece seals the seat’s first castle after the clock', () => {
    const state = rings();
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5] });
    state.players[0]!.enclosedCastles = 0;
    watcher.observe(state, [phase('build', 100)]);
    state.players[0]!.enclosedCastles = 1;
    watcher.observe(state, [
      { kind: 'piece_placed', tick: 101, player: 0, pieceId: 0, rotation: 0, cells: [] },
    ]);
    expect(watcher.unlocked).toEqual(['JUST_IN_TIME']);
  });

  it('does not count a piece laid while the clock ran', () => {
    const state = rings();
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5] });
    state.players[0]!.enclosedCastles = 0;
    watcher.observe(state, [phase('build', 100)]);
    state.players[0]!.enclosedCastles = 1;
    watcher.observe(state, [
      { kind: 'piece_placed', tick: 99, player: 0, pieceId: 0, rotation: 0, cells: [] },
    ]);
    expect(watcher.unlocked).toEqual([]);
  });
});

describe('a rival’s life', () => {
  const continued = (player: number): MatchEvent => ({
    kind: 'player_continued',
    tick: 0,
    player,
    round: 1,
    continuesRemaining: 1,
  });

  it('goes out by the seat’s hand when it took more of their wall than anyone', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [5, 6]);
    hit(watcher, state, shot(2), [7]);
    watcher.observe(state, [phase('build')]);
    watcher.observe(state, [continued(1)]);
    expect(watcher.unlocked).toEqual(['LIGHTS_OUT']);
    expect(watcher.stats.walls_destroyed).toBe(2);
  });

  it('is not the seat’s when another took as much', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [5]);
    hit(watcher, state, shot(2), [6]);
    watcher.observe(state, [phase('build')]);
    watcher.observe(state, [continued(1)]);
    expect(watcher.unlocked).toEqual([]);
  });

  it('is lost with a tile the seat froze in the barrage before the build phase', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    const frozen: MatchEvent = { kind: 'tile_frozen', tick: 0, shotId: 0, owner: 0, tile: 6 };
    watcher.observe(state, [phase('combat'), frozen, phase('build')]);
    watcher.observe(state, [continued(2)]);
    expect(watcher.unlocked).toEqual([]);
    watcher.observe(state, [continued(1)]);
    expect(watcher.unlocked).toEqual(['COLD_SHOULDER']);
  });

  it('is not the frost’s from a barrage before that', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    const frozen: MatchEvent = { kind: 'tile_frozen', tick: 0, shotId: 0, owner: 0, tile: 6 };
    watcher.observe(state, [
      phase('combat'),
      frozen,
      phase('build'),
      phase('combat'),
      phase('build'),
    ]);
    watcher.observe(state, [continued(1)]);
    expect(watcher.unlocked).toEqual([]);
  });
});

describe('a barrage', () => {
  it('counts every wall the seat’s shots clear until the build phase, late landings too', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(config({ BIG_BARRAGE: { walls: 3 } }), {
      seat: 0,
      levels: [null, 5, 5],
    });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [5, 6]);
    watcher.observe(state, [phase('intermission')]);
    expect(watcher.unlocked).toEqual([]);
    hit(watcher, state, shot(0), [10]);
    expect(watcher.unlocked).toEqual(['BIG_BARRAGE']);
  });

  it('starts afresh with every combat phase', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(config({ BIG_BARRAGE: { walls: 3 } }), {
      seat: 0,
      levels: [null, 5, 5],
    });
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0), [5, 6]);
    watcher.observe(state, [phase('build'), phase('combat')]);
    hit(watcher, state, shot(0), [10]);
    expect(watcher.unlocked).toEqual([]);
  });
});

describe('the special towers', () => {
  const seat = { seat: 0, levels: [null, 5, 5] };

  it('count one shot’s walls for the Berthas, a strike’s and a beam’s', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(
      config({ BIG_BANG: { walls: 2 }, HEAVYWEIGHT: { walls: 3 } }),
      seat,
    );
    watcher.observe(state, [phase('combat')]);
    hit(watcher, state, shot(0, 'bertha'), [5]);
    hit(watcher, state, shot(0, 'biggest'), [10, 11]);
    expect(watcher.unlocked).toEqual([]);
    hit(watcher, state, shot(0, 'bertha'), [6, 7]);
    hit(watcher, state, shot(0, 'biggest'), [12, 13, 8]);
    watcher.observe(state, [
      {
        kind: 'lightning_struck',
        tick: 0,
        shotId: 0,
        owner: 0,
        fromX: 0,
        fromY: 0,
        path: [],
        destroyed: [5, 6, 7],
      },
      {
        kind: 'laser_fired',
        tick: 0,
        shotId: 0,
        owner: 0,
        fromX: 0,
        fromY: 0,
        endX: 0,
        endY: 0,
        destroyed: [10, 11],
      },
    ]);
    expect(watcher.unlocked).toEqual(['BIG_BANG', 'HEAVYWEIGHT', 'CHAIN_REACTION']);
  });

  it('count a wave’s lanes and a lullaby’s sleepers by the one shot', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, seat);
    const lane = (waveId: number, destroyed: number | null): MatchEvent => ({
      kind: 'wave_ended',
      tick: 0,
      waveId,
      owner: 0,
      lane: 0,
      x: 0,
      y: 0,
      destroyed,
    });
    const slept = (shotId: number): MatchEvent => ({
      kind: 'gun_slept',
      tick: 0,
      shotId,
      owner: 0,
      cannonId: 0,
      until: 0,
      ms: 3000,
    });
    watcher.observe(state, [lane(1, 5), lane(1, null), lane(2, 6), lane(1, 7)]);
    watcher.observe(state, [slept(1), slept(1), slept(2)]);
    expect(watcher.unlocked).toEqual([]);
    watcher.observe(state, [lane(1, 8), slept(1)]);
    expect(watcher.unlocked).toEqual(['BASS_DROP', 'SWEET_DREAMS']);
  });

  it('count a Rapid Cannon’s shots in one combat phase, by the cannon', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(config({ RAPID_FIRE: { shots: 3 } }), seat);
    const fire = (cannonId: number): MatchEvent => ({
      kind: 'shot_fired',
      tick: 0,
      shot: shot(0, 'rapid', cannonId),
    });
    watcher.observe(state, [phase('combat'), fire(1), fire(1), fire(2)]);
    watcher.observe(state, [phase('build'), phase('combat'), fire(1)]);
    expect(watcher.unlocked).toEqual([]);
    watcher.observe(state, [fire(1), fire(1)]);
    expect(watcher.unlocked).toEqual(['RAPID_FIRE']);
  });

  it('mark each kind bought, once, and a win with three bought', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, seat);
    const bought = (cannonKind: Shot['kind']): MatchEvent => ({
      kind: 'cannon_placed',
      tick: 0,
      player: 0,
      cannonId: 0,
      x: 0,
      y: 0,
      cannonKind,
      cannonCost: 2,
    });
    watcher.observe(state, [bought('cannon'), bought('laser'), bought('laser'), bought('frost')]);
    watcher.observe(state, [gameOver(state, [0])]);
    expect(watcher.unlocked).toContain('SPECIAL_DELIVERY');
    expect(watcher.unlocked).toContain('TOWERING_VICTORY');
    expect(towersBoughtCount(watcher.stats.towers_bought)).toBe(2);
  });

  it('zone three Architects whose reaches share no tile', () => {
    const architects = (gap: string): MatchState =>
      stateFromAscii(`AA${gap}AA${gap}AA\nAA${gap}AA${gap}AA`);
    const placed: MatchEvent = {
      kind: 'cannon_placed',
      tick: 0,
      player: 0,
      cannonId: 2,
      x: 0,
      y: 0,
      cannonKind: 'architect',
      cannonCost: 3,
    };
    const near = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null] });
    near.observe(architects(',,'), [placed]);
    expect(near.unlocked).not.toContain('ARCHITECT_ZONING');
    const apart = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null] });
    apart.observe(architects(',,,,,,'), [placed]);
    expect(apart.unlocked).toContain('ARCHITECT_ZONING');
  });
});

describe('a teammate', () => {
  it('sealed with the seat’s block in their wall is Good neighbour', () => {
    const state = rings();
    state.players[1]!.team = 0;
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, null] });
    const laid = (cell: number): MatchEvent => ({
      kind: 'piece_placed',
      tick: 0,
      player: 0,
      pieceId: 0,
      rotation: 0,
      cells: [cell],
    });
    watcher.observe(state, [laid(at(state, 9, 1)), resolved(1, 1)]);
    expect(watcher.unlocked).toEqual(['GOOD_NEIGHBOUR']);
  });

  it('is not helped by a block that borders none of their sealed ground', () => {
    const state = rings();
    state.players[1]!.team = 0;
    state.structure[at(state, 14, 6)] = Structure.Wall;
    state.islandId[at(state, 14, 6)] = 2;
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, null] });
    watcher.observe(state, [
      {
        kind: 'piece_placed',
        tick: 0,
        player: 0,
        pieceId: 0,
        rotation: 0,
        cells: [at(state, 14, 6)],
      },
      resolved(1, 1),
    ]);
    expect(watcher.unlocked).toEqual([]);
  });
});

describe('the match’s end', () => {
  it('is a win at the levels the opponents were', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 8] });
    watcher.observe(state, [gameOver(state, [0], 'elimination')]);
    expect(watcher.unlocked).toEqual([
      'FIRST_MATCH',
      'UNTOUCHABLE',
      'FIRST_WIN',
      'SEASONED',
      'SOLE_SURVIVOR',
    ]);
  });

  it('passes every floor against people, and is among friends with one at the table', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(defaultAchievements, {
      seat: 0,
      levels: [null, null, 9],
    });
    watcher.observe(state, [gameOver(state, [0])]);
    expect(watcher.unlocked).toContain('WARLORD');
    expect(watcher.unlocked).toContain('AMONG_FRIENDS');
  });

  it('is a team’s win for every member, and no win when shared with another team', () => {
    const state = stateFromAscii(THREE);
    state.players[1]!.team = 0;
    const team = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    team.observe(state, [gameOver(state, [1])]);
    expect(team.unlocked).toContain('IN_GOOD_COMPANY');
    const shared = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    shared.observe(state, [gameOver(state, [0, 2])]);
    expect(shared.unlocked).not.toContain('FIRST_WIN');
  });

  it('is not untouchable after a life spent, nor after a bot played the seat', () => {
    const state = stateFromAscii(THREE);
    const spent = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    spent.observe(state, [
      { kind: 'player_continued', tick: 0, player: 0, round: 1, continuesRemaining: 1 },
    ]);
    spent.observe(state, [gameOver(state, [1])]);
    expect(spent.unlocked).toEqual(['FIRST_MATCH']);
    const away = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    away.observe(state, [], false);
    away.observe(state, [gameOver(state, [1])]);
    expect(away.unlocked).toEqual(['FIRST_MATCH']);
  });

  it('counts nothing for a person not seated at the end, nor what was held', () => {
    const state = stateFromAscii(THREE);
    const gone = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] });
    gone.observe(state, [gameOver(state, [0])], false);
    expect(gone.unlocked).toEqual([]);
    const held = new AchievementWatcher(defaultAchievements, { seat: 0, levels: [null, 5, 5] }, [
      'FIRST_MATCH',
      'FIRST_WIN',
    ]);
    held.observe(state, [gameOver(state, [0])]);
    expect(held.drain()).toEqual(['UNTOUCHABLE', 'SEASONED']);
    expect(held.drain()).toEqual([]);
  });

  it('credits nothing a bot did in the seat’s place', () => {
    const state = stateFromAscii(THREE);
    const watcher = new AchievementWatcher(config({ BIG_BARRAGE: { walls: 1 } }), {
      seat: 0,
      levels: [null, 5, 5],
    });
    watcher.observe(state, [phase('combat')]);
    const fired = shot(0);
    watcher.observe(state, [{ kind: 'shot_fired', tick: 0, shot: fired }], false);
    watcher.observe(
      state,
      [{ kind: 'shot_impact', tick: 10, shotId: fired.id, x: 0, y: 0, destroyed: [5] }],
      false,
    );
    expect(watcher.unlocked).toEqual([]);
    expect(watcher.stats.walls_destroyed).toBe(0);
  });
});

describe('across matches', () => {
  it('reads the stats’ achievements from Steam’s totals', () => {
    const all = (1 << SPECIAL_KINDS.length) - 1;
    expect(
      statAchievements(defaultAchievements, {
        castles_sealed: 199,
        walls_destroyed: 2500,
        towers_bought: all,
      }),
    ).toEqual(['DEMOLITION_CREW', 'ALL_TOWERS']);
    expect(
      statAchievements(defaultAchievements, {
        castles_sealed: 200,
        walls_destroyed: 0,
        towers_bought: all >> 1,
      }),
    ).toEqual(['SEAL_OF_APPROVAL']);
  });

  it('reads a tournament’s three from its result', () => {
    expect(tournamentAchievements({ champion: false, matches: 6, won: 3 })).toEqual([
      'SEASON_TICKET',
    ]);
    expect(tournamentAchievements({ champion: true, matches: 6, won: 5 })).toEqual([
      'SEASON_TICKET',
      'CHAMPION',
    ]);
    expect(tournamentAchievements({ champion: true, matches: 6, won: 6 })).toEqual([
      'SEASON_TICKET',
      'CHAMPION',
      'INVINCIBLE',
    ]);
  });
});
