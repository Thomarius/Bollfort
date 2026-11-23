import { defaultConfigBundle } from '@bollfort/config';
import {
  HOST_TEAM,
  Progress,
  createTournament,
  recordMatch,
  type Save,
} from '@bollfort/tournament';
import { describe, expect, it } from 'vitest';

import { setLanguage } from './i18n.js';
import { bracketSvg } from './tournamentBracketView.js';
import { resumeMarkup } from './tournamentResume.js';
import { rankMoves, roadOf, stakesOf } from './tournamentRoad.js';
import { TOURNAMENT_LIMITS } from './tournamentSetup.js';
import { playedWhen } from './tournamentText.js';
import { afterMatchLine } from './tournamentView.js';

const config = defaultConfigBundle.tournament;

function tournament(over: Partial<Save['settings']> = {}): Save {
  return createTournament(
    {
      seed: 3,
      teamSize: 1,
      hostName: 'Ada',
      teamName: 'Ada',
      teamBots: [],
      levels: { min: 4, max: 6 },
      archnemesis: null,
      length: 'medium',
      league: false,
      knockout: 'single',
      matchTeams: { min: 2, max: 2 },
      maxRounds: 10,
      ...over,
    },
    config,
    TOURNAMENT_LIMITS,
    { id: 't', now: '2026-11-23T12:00:00Z' },
  );
}

/** The host's next match played: won, or lost with the host last. */
function play(save: Save, win: boolean): Progress {
  const progress = new Progress(save);
  const teams = progress.next?.matches[progress.hostMatch] ?? [];
  const others = teams.filter((t) => t !== HOST_TEAM);
  const order = win ? [HOST_TEAM, ...others] : [...others, HOST_TEAM];
  return recordMatch(
    save,
    config,
    order.map((team, i) => ({ team, score: 100 - i })),
    'later',
  );
}

describe("the host's road through a tournament", () => {
  it('runs from the next match through every stage a winner plays, then marks the win', () => {
    const save = tournament({ length: 'short' });
    let progress = new Progress(save);
    let road = roadOf(save, progress);
    expect(road.league).toEqual([]);
    expect(road.knockout.map((s) => s.state)).toEqual(['next', 'later']);
    progress = play(save, true);
    road = roadOf(save, progress);
    expect(road.knockout.map((s) => [s.state, s.place])).toEqual([
      ['played', 1],
      ['next', null],
    ]);
    progress = play(save, true);
    expect(roadOf(save, progress).won).toBe(true);
  });

  it('ends where the team went out, with nothing ahead', () => {
    const save = tournament();
    const progress = play(save, false);
    const road = roadOf(save, progress);
    expect(road.knockout.map((s) => s.state)).toEqual(['out']);
    expect(stakesOf(save, progress)).toBeNull();
  });

  it('reads the league, then the knockout, as one road', () => {
    const save = tournament({ league: true });
    const road = roadOf(save, new Progress(save));
    expect(road.league.map((s) => s.state)).toEqual(['next', 'later', 'later']);
    expect(road.knockout.length).toBe(save.plan.rounds.length);
  });
});

describe('what the next match decides', () => {
  it('names the stage a win leads to, and out for a defeat in single elimination', () => {
    const save = tournament();
    const stakes = stakesOf(save, new Progress(save));
    expect(stakes).toMatchObject({ kind: 'knockout', size: 2, win: 1, lose: 'out' });
  });

  it("sends a defeat in double elimination's winners' bracket to the losers'", () => {
    const save = tournament({ knockout: 'double' });
    expect(stakesOf(save, new Progress(save))).toMatchObject({ lose: 'losers' });
  });

  it('plays for the title in the last match', () => {
    const save = tournament({ length: 'short' });
    const progress = play(save, true);
    expect(stakesOf(save, progress)).toMatchObject({ kind: 'knockout', win: null });
  });

  it("gives the league's cut, and the team's place once a matchday is played", () => {
    const save = tournament({ league: true });
    expect(stakesOf(save, new Progress(save))).toMatchObject({
      kind: 'league',
      day: 0,
      rank: null,
    });
    const after = play(save, true);
    const stakes = stakesOf(save, after);
    expect(stakes).toMatchObject({ kind: 'league', day: 1, advance: save.plan.advance });
    expect(stakes?.kind === 'league' && stakes.rank).toBeGreaterThan(0);
  });
});

describe("the league's moves", () => {
  it('are none before the second matchday, then balance out', () => {
    const save = tournament({ league: true });
    expect(rankMoves(save, play(save, true)).size).toBe(0);
    const moves = rankMoves(save, play(save, true));
    expect(moves.size).toBeGreaterThan(0);
    expect([...moves.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("a tournament match's line on its summary", () => {
  it('says where the league stands, where the knockout goes on, and where it ended', () => {
    setLanguage('en');
    const league = tournament({ league: true });
    expect(afterMatchLine(league, play(league, true))).toMatch(
      /^Now \d+(st|nd|rd|th) in the league · Next: League, matchday 2 of 3$/,
    );
    const knockout = tournament();
    expect(afterMatchLine(knockout, play(knockout, true))).toBe('Next: Semi-final');
    const out = tournament();
    expect(afterMatchLine(out, play(out, false))).toBe('Knocked out: Quarter-final.');
    const double = tournament({ knockout: 'double' });
    expect(afterMatchLine(double, play(double, false))).toMatch(
      /^Into the losers' bracket · Next: /,
    );
  });
});

describe('when a tournament was played', () => {
  it('says today and yesterday by the time, and leaves out this year', () => {
    setLanguage('en');
    const now = new Date(2026, 10, 23, 18, 0);
    expect(playedWhen(new Date(2026, 10, 23, 14, 59).toISOString(), now)).toBe('today, 14:59');
    expect(playedWhen(new Date(2026, 10, 22, 9, 5).toISOString(), now)).toBe('yesterday, 09:05');
    expect(playedWhen(new Date(2026, 8, 3, 9, 5).toISOString(), now)).toBe('3 Sept, 09:05');
    expect(playedWhen(new Date(2025, 8, 3, 9, 5).toISOString(), now)).toBe('3 Sept 2025, 09:05');
  });
});

describe('the resume list and the bracket', () => {
  it('offers a new tournament when none is saved, and shows how far a saved one is', () => {
    setLanguage('en');
    expect(resumeMarkup([], null, null)).toContain('id="create"');
    const save = tournament();
    play(save, true);
    const markup = resumeMarkup([{ id: 't', kind: 'ok', save }], null, null);
    expect(markup).toMatch(/class="saved-progress"[^>]*><i style="width:(\d+)%">/);
  });

  it('lists the teams in their boxes, and a champion at the end', () => {
    setLanguage('en');
    const save = tournament({ length: 'short' });
    let progress = play(save, true);
    let svg = bracketSvg(save, progress);
    expect(svg).toContain('class="team you first"');
    expect(svg).toContain('class="champion open"');
    progress = play(save, true);
    svg = bracketSvg(save, progress);
    expect(svg).toMatch(/class="champion you"[^]*>Ada<\/text>/);
  });
});
