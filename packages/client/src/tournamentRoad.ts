import {
  HOST_TEAM,
  Progress,
  hostHistory,
  stepsOf,
  type Save,
  type Step,
} from '@bollfort/tournament';

/**
 * Where the host's team stands on its way through a tournament, as data (the menus' polish,
 * 2026-11-23): the stops of its road, played and to come, what the next match decides, and how
 * the league's last matchday moved the table. Pure, so the screens' words are tested without one.
 */

/** A stop on the road: a step the host's team has played, plays next, or would play on winning. */
export interface RoadStop {
  step: number;
  /** played: placed there; next: the coming match; later: still ahead; out: knocked out there. */
  state: 'played' | 'next' | 'later' | 'out';
  /** The team's place there, 1 first, once played. */
  place: number | null;
  /** Teams in its match, once played. */
  of: number | null;
}

/** The road in its two parts, the league's matchdays and the knockout's stages. */
export interface Road {
  league: RoadStop[];
  knockout: RoadStop[];
  /** The tournament is the host's team's. */
  won: boolean;
}

/** The steps after `step` that the winner of a match there goes on through, to the end. */
function onward(steps: readonly Step[], step: number): number[] {
  const at = steps[step];
  if (at === undefined) return [];
  const later = steps.map((s, i) => ({ s, i })).filter(({ i }) => i > step);
  switch (at.kind) {
    case 'league': {
      const days = later.filter(({ s }) => s.kind === 'league').map(({ i }) => i);
      // After the league, the knockout's winners' road.
      const first = later.find(({ s }) => s.kind === 'knockout');
      return first === undefined ? days : [...days, first.i, ...onward(steps, first.i)];
    }
    case 'knockout':
      return later.filter(({ s }) => s.kind === 'knockout' || s.kind === 'final').map(({ i }) => i);
    case 'losers':
      return later.filter(({ s }) => s.kind === 'losers' || s.kind === 'final').map(({ i }) => i);
    case 'final':
      return [];
  }
}

/** The host's team's road: every step it played, the next, and the ones a winner goes on to. */
export function roadOf(save: Save, progress: Progress): Road {
  const steps = stepsOf(save);
  const stops: RoadStop[] = hostHistory(save).map(({ step, match }) => {
    const place = match.order.indexOf(HOST_TEAM) + 1;
    const out = progress.status.kind === 'out' && progress.status.step === step;
    return { step, state: out ? 'out' : 'played', place, of: match.teams.length };
  });
  if (progress.status.kind === 'playing') {
    stops.push({ step: progress.done, state: 'next', place: null, of: null });
    for (const step of onward(steps, progress.done)) {
      stops.push({ step, state: 'later', place: null, of: null });
    }
  }
  // Out at the league's end is out at its last matchday, which the team played: marked above.
  const league = stops.filter((s) => steps[s.step]?.kind === 'league');
  const knockout = stops.filter((s) => steps[s.step]?.kind !== 'league');
  return { league, knockout, won: progress.status.kind === 'won' };
}

/** What the next match decides. */
export type Stakes =
  | {
      kind: 'league';
      /** Matchdays in all, and which of them is next, 0 first. */
      days: number;
      day: number;
      advance: number;
      teams: number;
      /** The host's team's place in the table, 1 first, once a matchday has been played. */
      rank: number | null;
    }
  | {
      kind: 'knockout';
      /** Two teams a match, or more: a win, or only the first place, goes on. */
      size: number;
      /** Where the winner goes: the next step, or null for the title. */
      win: number | null;
      /** Where the rest go: out, or into the losers' bracket. */
      lose: 'out' | 'losers';
    };

export function stakesOf(save: Save, progress: Progress): Stakes | null {
  if (progress.status.kind !== 'playing') return null;
  const steps = stepsOf(save);
  const at = steps[progress.done];
  if (at === undefined) return null;
  if (at.kind === 'league') {
    const rank =
      progress.done === 0 ? null : progress.table().findIndex((r) => r.team === HOST_TEAM) + 1;
    return {
      kind: 'league',
      days: save.plan.matchdays.length,
      day: at.matchday,
      advance: save.plan.advance,
      teams: save.teams.length,
      rank,
    };
  }
  const size = progress.next?.matches[progress.hostMatch]?.length ?? 2;
  const next = onward(steps, progress.done)[0] ?? null;
  return {
    kind: 'knockout',
    size,
    win: next,
    lose: at.kind === 'knockout' && save.settings.knockout === 'double' ? 'losers' : 'out',
  };
}

/**
 * How the last league matchday moved each team in the table: places climbed, positive, or
 * dropped, negative, by team. Empty before the second matchday, which is the first a table
 * stood before, and once the knockout has begun.
 */
export function rankMoves(save: Save, progress: Progress): Map<number, number> {
  const moves = new Map<number, number>();
  const days = save.plan.matchdays.length;
  const played = save.steps.length;
  if (played < 2 || played > days) return moves;
  const before = new Progress({ ...save, steps: save.steps.slice(0, played - 1) }).table();
  const was = new Map(before.map((row, i) => [row.team, i]));
  progress.table().forEach((row, i) => {
    const from = was.get(row.team);
    if (from !== undefined && from !== i) moves.set(row.team, from - i);
  });
  return moves;
}
