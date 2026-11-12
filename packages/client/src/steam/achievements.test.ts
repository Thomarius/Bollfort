import { defaultAchievements } from '@bollfort/config';
import { stateFromAscii, type MatchEvent, type MatchState } from '@bollfort/sim';
import type { Progress, Save } from '@bollfort/tournament';
import { describe, expect, it } from 'vitest';

import {
  MatchAchievements,
  matchCounts,
  pagesSeen,
  settleStats,
  tournamentResultOf,
  type SteamStats,
} from './achievements.js';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

const NONE: SteamStats = {
  castles_sealed: 0,
  walls_destroyed: 0,
  towers_bought: 0,
  towers_bought_count: 0,
};

function gameOver(state: MatchState, winners: number[]): MatchEvent {
  state.phase = 'game_over';
  state.winners = winners;
  state.draw = false;
  state.endedBy = 'round_cap';
  return { kind: 'game_over', tick: 0, winners, draw: false, endedBy: 'round_cap' };
}

/** The app's side as far as a match goes: what it was asked, and Steam's totals. */
function fakeHost(totals: SteamStats | null = NONE) {
  const asked = {
    achieved: [] as string[],
    stats: [] as SteamStats[],
    progress: [] as [string, number, number][],
  };
  return {
    asked,
    host: {
      achieve: (id: string) => asked.achieved.push(id),
      stats: () => Promise.resolve(totals),
      setStats: (s: SteamStats) => {
        asked.stats.push(s);
        return Promise.resolve(true);
      },
      achievementProgress: (id: string, current: number, max: number) =>
        asked.progress.push([id, current, max]),
    },
  };
}

describe('which matches count', () => {
  it('counts a person’s match, not a watched one nor the demo', () => {
    expect(matchCounts(params(''), 0, false)).toBe(true);
    expect(matchCounts(params(''), -1, false)).toBe(false);
    expect(matchCounts(params(''), 0, true)).toBe(false);
  });

  it('counts nothing with the developer’s parameters in the address', () => {
    for (const query of ['snapshot=build', 'speed=10', 'autopilot=1', 'round=5', 'watch=1']) {
      expect(matchCounts(params(query), 0, false), query).toBe(false);
    }
    expect(matchCounts(params('lang=de&seed=3'), 0, false)).toBe(true);
  });
});

describe('a match’s achievements', () => {
  it('sends each as it is earned, then settles the stats at the end', async () => {
    const { host, asked } = fakeHost();
    const watch = new MatchAchievements(host, 0, [null, 5, 5], []);
    const state = stateFromAscii('1111.2222.3333');
    watch.step(state, [gameOver(state, [0])]);
    await Promise.resolve();
    await Promise.resolve();
    expect(asked.achieved).toEqual(
      expect.arrayContaining(['FIRST_MATCH', 'FIRST_WIN', 'SEASONED', 'UNTOUCHABLE']),
    );
    expect(asked.stats).toHaveLength(1);
  });

  it('skips what is already held', () => {
    const { host, asked } = fakeHost();
    const watch = new MatchAchievements(host, 0, [null, 2], ['FIRST_MATCH', 'FIRST_WIN']);
    const state = stateFromAscii('1111.2222');
    watch.step(state, [gameOver(state, [0])]);
    expect(asked.achieved).not.toContain('FIRST_MATCH');
    expect(asked.achieved).not.toContain('FIRST_WIN');
  });

  it('credits no whole match to a page that rejoined part-way', () => {
    const { host, asked } = fakeHost();
    const watch = new MatchAchievements(host, 0, [null, 2], []);
    const state = stateFromAscii('1111.2222');
    watch.rejoined(state);
    watch.step(state, [gameOver(state, [0])]);
    expect(asked.achieved).not.toContain('UNTOUCHABLE');
    expect(asked.achieved).toContain('FIRST_WIN');
  });

  it('leaves Steam’s stats alone while it has not loaded them', async () => {
    const { host, asked } = fakeHost(null);
    const watch = new MatchAchievements(host, 0, [null, 2], []);
    const state = stateFromAscii('1111.2222');
    watch.step(state, [gameOver(state, [0])]);
    await Promise.resolve();
    expect(asked.stats).toEqual([]);
  });
});

describe('Steam’s stats after a match', () => {
  it('adds the counts, ORs the towers and counts them', () => {
    const { totals } = settleStats(
      defaultAchievements,
      { castles_sealed: 10, walls_destroyed: 100, towers_bought: 0b101, towers_bought_count: 2 },
      { castles_sealed: 5, walls_destroyed: 30, towers_bought: 0b110 },
    );
    expect(totals).toEqual({
      castles_sealed: 15,
      walls_destroyed: 130,
      towers_bought: 0b111,
      towers_bought_count: 3,
    });
  });

  it('unlocks a stat’s achievement as its total arrives', () => {
    const { unlock } = settleStats(
      defaultAchievements,
      { ...NONE, castles_sealed: 195 },
      { castles_sealed: 10, walls_destroyed: 0, towers_bought: 0 },
    );
    expect(unlock).toEqual(['SEAL_OF_APPROVAL']);
  });

  it('shows progress at each quarter crossed, never at the goal', () => {
    const crossed = settleStats(
      defaultAchievements,
      { ...NONE, walls_destroyed: 600 },
      { castles_sealed: 0, walls_destroyed: 100, towers_bought: 0 },
    );
    expect(crossed.progress).toEqual([{ id: 'DEMOLITION_CREW', current: 700, max: 2500 }]);
    const within = settleStats(
      defaultAchievements,
      { ...NONE, walls_destroyed: 700 },
      { castles_sealed: 0, walls_destroyed: 100, towers_bought: 0 },
    );
    expect(within.progress).toEqual([]);
    const arrived = settleStats(
      defaultAchievements,
      { ...NONE, walls_destroyed: 2400 },
      { castles_sealed: 0, walls_destroyed: 200, towers_bought: 0 },
    );
    expect(arrived.progress).toEqual([]);
    expect(arrived.unlock).toEqual(['DEMOLITION_CREW']);
  });
});

describe('a tournament’s end', () => {
  const match = (teams: number[], order: number[]) => ({ teams, order, scores: null });
  const save = (matches: ReturnType<typeof match>[][]): Save =>
    ({ steps: matches.map((m) => ({ matches: m, byes: [] })) }) as unknown as Save;
  const status = (kind: 'won' | 'out'): Progress =>
    ({ status: kind === 'won' ? { kind } : { kind, step: 1 } }) as unknown as Progress;

  it('counts the host’s team’s matches, and those it won', () => {
    const played = save([
      [match([0, 1], [0, 1]), match([2, 3], [3, 2])],
      [match([0, 3], [3, 0])],
      [match([0, 2], [0, 2])],
    ]);
    expect(tournamentResultOf(played, status('won'))).toEqual({
      champion: true,
      matches: 3,
      won: 2,
    });
    expect(tournamentResultOf(played, status('out')).champion).toBe(false);
  });
});

describe('How to play’s pages', () => {
  it('reads the manual once every page has been shown', () => {
    const all = ['a', 'b', 'c'];
    let seen: string[] = [];
    for (const page of ['a', 'b', 'a']) {
      const after = pagesSeen(seen, page, all);
      seen = after.seen;
      expect(after.every).toBe(false);
    }
    expect(pagesSeen(seen, 'c', all)).toEqual({ seen: ['a', 'b', 'c'], every: true });
  });
});
