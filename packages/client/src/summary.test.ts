import { defaultRuleset } from '@bollfort/config';
import type { MatchEvent, Shot } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { LocalMatch } from './localMatch.js';
import { MatchLog, mostCastlesOf, scoreChart } from './summary.js';

const shot = (id: number, owner: number): Shot => ({
  id,
  cannonId: id,
  kind: 'cannon',
  cost: 1,
  owner,
  fromX: 0,
  fromY: 0,
  toX: 5,
  toY: 5,
  launchTick: 0,
  impactTick: 10,
});

describe('the match log', () => {
  it('credits destroyed wall to whoever fired the shot that landed', () => {
    const log = new MatchLog();
    const players = { players: [{ score: 0 }, { score: 0 }] } as never;
    log.note(
      [
        { kind: 'shot_fired', tick: 1, shot: shot(7, 1) },
        { kind: 'shot_fired', tick: 1, shot: shot(8, 0) },
      ],
      players,
    );
    log.note(
      [
        { kind: 'shot_impact', tick: 11, shotId: 7, x: 5, y: 5, destroyed: [40] },
        // Into the sea: counted as nothing.
        { kind: 'shot_impact', tick: 11, shotId: 8, x: 5, y: 5, destroyed: [] },
      ],
      players,
    );
    expect(log.destroyed.get(1)).toBe(1);
    expect(log.destroyed.get(0)).toBeUndefined();
  });

  it('counts the walls of every tower, by whose island, and who broke one’s own', () => {
    const log = new MatchLog();
    // Islands by tile: 40 and 41 are player 1's (island 2), 50 player 2's (island 3).
    const islandId = new Uint8Array(60);
    islandId[40] = 2;
    islandId[41] = 2;
    islandId[50] = 3;
    const at = { players: [{ score: 0 }, { score: 0 }, { score: 0 }], islandId } as never;
    log.note(
      [
        { kind: 'shot_fired', tick: 1, shot: { ...shot(1, 0), kind: 'lightning' } },
        {
          kind: 'lightning_struck',
          tick: 1,
          shotId: 1,
          owner: 0,
          fromX: 0,
          fromY: 0,
          path: [],
          destroyed: [40, 41],
        },
        { kind: 'shot_fired', tick: 1, shot: { ...shot(2, 0), kind: 'subwoofer' } },
        {
          kind: 'wave_ended',
          tick: 3,
          waveId: 2,
          owner: 0,
          lane: 0,
          x: 0,
          y: 0,
          destroyed: 50,
        },
        { kind: 'wave_ended', tick: 3, waveId: 2, owner: 0, lane: 1, x: 0, y: 0, destroyed: 41 },
        { kind: 'shot_fired', tick: 1, shot: shot(3, 2) },
        { kind: 'shot_impact', tick: 11, shotId: 3, x: 5, y: 5, destroyed: [40] },
      ],
      at,
    );
    expect(log.destroyed.get(0)).toBe(4);
    expect([...log.brokeBy([0])]).toEqual([
      [1, 3],
      [2, 1],
    ]);
    expect([...log.lostTo([1])].sort()).toEqual([
      [0, 3],
      [2, 1],
    ]);
    // A team's own walls broken by a teammate are neither destroyed nor lost between them.
    expect([...log.brokeBy([0, 2])]).toEqual([[1, 4]]);
  });

  it('counts the aimed shots that hit, once each, never a Drone Tower’s missiles', () => {
    const log = new MatchLog();
    const islandId = new Uint8Array(60).fill(2);
    const at = { players: [{ score: 0 }, { score: 0 }], islandId } as never;
    log.note(
      [
        { kind: 'shot_fired', tick: 1, shot: shot(1, 0) },
        { kind: 'shot_fired', tick: 1, shot: shot(2, 0) },
        { kind: 'shot_fired', tick: 1, shot: { ...shot(3, 0), kind: 'drone' } },
        { kind: 'shot_fired', tick: 1, shot: { ...shot(4, 0), kind: 'subwoofer' } },
        { kind: 'shot_impact', tick: 11, shotId: 1, x: 5, y: 5, destroyed: [10] },
        { kind: 'shot_impact', tick: 11, shotId: 2, x: 5, y: 5, destroyed: [] },
        { kind: 'shot_impact', tick: 11, shotId: 3, x: 5, y: 5, destroyed: [11] },
        // A wave of two lanes, both clearing a wall: one shot, one hit.
        { kind: 'wave_ended', tick: 3, waveId: 4, owner: 0, lane: 0, x: 0, y: 0, destroyed: 12 },
        { kind: 'wave_ended', tick: 3, waveId: 4, owner: 0, lane: 1, x: 0, y: 0, destroyed: 13 },
      ],
      at,
    );
    expect(log.aimed.get(0)).toBe(3);
    expect(log.aimedHits.get(0)).toBe(2);
    // The drone's wall counts as destroyed all the same.
    expect(log.destroyed.get(0)).toBe(4);
  });

  it('sums each player’s points by where they came from, to the score', () => {
    const log = new MatchLog();
    const result = (player: number, ground: number, guns: number, walls: number) => ({
      player,
      enclosedCastles: 1,
      cannonsAwarded: 2,
      eliminated: false,
      territoryPoints: ground,
      gunPoints: guns,
      damagePoints: walls,
    });
    const players = { players: [{ score: 0 }] } as never;
    log.note(
      [{ kind: 'round_resolved', tick: 1, round: 1, results: [result(0, 50, 10, 5)] }],
      players,
    );
    log.note(
      [{ kind: 'round_resolved', tick: 2, round: 2, results: [result(0, 40, 20, 0)] }],
      players,
    );
    expect(log.pointsFrom.get(0)).toEqual({ ground: 90, guns: 30, walls: 5 });
  });

  it('keeps each round’s scores, the most castles held and the lives spent', () => {
    const log = new MatchLog();
    const resolved = (round: number, castles: number[]): MatchEvent => ({
      kind: 'round_resolved',
      tick: round * 100,
      round,
      results: castles.map((enclosedCastles, player) => ({
        player,
        enclosedCastles,
        cannonsAwarded: 2,
        eliminated: false,
        territoryPoints: 0,
        gunPoints: 0,
        damagePoints: 0,
      })),
    });
    log.note([resolved(1, [1, 2])], { players: [{ score: 30 }, { score: 60 }] } as never);
    log.note(
      [
        resolved(2, [0, 1]),
        { kind: 'player_continued', tick: 200, player: 0, round: 2, continuesRemaining: 1 },
      ],
      { players: [{ score: 30 }, { score: 95 }] } as never,
    );
    expect(log.scores.map(({ round, byPlayer }) => ({ round, byPlayer }))).toEqual([
      { round: 1, byPlayer: [30, 60] },
      { round: 2, byPlayer: [30, 95] },
    ]);
    expect(mostCastlesOf(log, [1])).toBe(2);
    // A team's best is its best round together — 3 in round one — not 1 + 2 + ... apart.
    expect(mostCastlesOf(log, [0, 1])).toBe(3);
  });

  it('agrees with a whole match played out, round by round and at the end', () => {
    const match = new LocalMatch({
      seed: 5,
      seats: [5, 5],
      ruleset: { ...defaultRuleset, scoring: { ...defaultRuleset.scoring, maxRounds: 3 } },
    });
    const log = new MatchLog();
    for (let frame = 0; frame < 60_000 && !match.finished; frame++) {
      log.note(match.advance(1000 / 30), match.state);
    }
    expect(match.state.phase).toBe('game_over');
    expect(log.scores.map((s) => s.round)).toEqual([1, 2, 3]);
    expect(log.scores.at(-1)?.byPlayer).toEqual(match.state.players.map((p) => p.score));
    expect([...log.destroyed.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const p of match.state.players) {
      const from = log.pointsFrom.get(p.id)!;
      expect(from.ground + from.guns + from.walls).toBe(p.score);
    }
  }, 60_000);
});

describe('the score chart', () => {
  it('runs every line from nought, and puts the best score at the top', () => {
    const [a, b] = scoreChart(
      [
        { key: 0, scores: [50, 100] },
        { key: 1, scores: [20, 40] },
      ],
      2,
      200,
      100,
    );
    expect(a?.points).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ]);
    expect(b?.points.at(-1)).toEqual({ x: 200, y: 60 });
  });
});
