import type { KeptMatch } from './backToMatch.js';

/**
 * Coming back to a match over Steam (STEAM.md §7.3, S3.6): which way an invite or Join is
 * taken, and what the host's answer says of the asker's seat. Pure, for the tests; `menu.ts`
 * and `lobbyFlow.ts` act on it.
 */

/** Where the asker stands in the host's room, as the host's app tells it (`Room.standing`). */
export interface Standing {
  seated: boolean;
  started: boolean;
  finished: boolean;
  round: number;
  maxRounds: number | null;
}

/** The host's answer to "where is your game?", read defensively: it comes over the network. */
export interface HostAnswer {
  room: string | null;
  lobby: string | null;
  /** The host's Steam name, for the prompt. */
  host: string | null;
  you: Standing | null;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

export function readHostAnswer(answer: unknown): HostAnswer | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const a = answer as Record<string, unknown>;
  const y = (typeof a.you === 'object' && a.you !== null ? a.you : null) as Record<
    string,
    unknown
  > | null;
  const you: Standing | null =
    y === null ||
    typeof y.seated !== 'boolean' ||
    typeof y.started !== 'boolean' ||
    typeof y.finished !== 'boolean' ||
    typeof y.round !== 'number' ||
    !(y.maxRounds === null || typeof y.maxRounds === 'number')
      ? null
      : {
          seated: y.seated,
          started: y.started,
          finished: y.finished,
          round: y.round,
          maxRounds: y.maxRounds,
        };
  return {
    room: text(a.room, 12),
    lobby: text(a.lobby, 20),
    host: text(a.host, 64)?.slice(0, 24) ?? null,
    you,
  };
}

/** Whether the answer offers the asker a match of theirs still being played. */
export function stillPlaying(answer: HostAnswer | null): answer is HostAnswer & {
  room: string;
  you: Standing;
} {
  return (
    answer !== null &&
    answer.room !== null &&
    answer.you !== null &&
    answer.you.seated &&
    answer.you.started &&
    !answer.you.finished
  );
}

/** How an invite or Join from Steam is taken. */
export type JoinRoute =
  /** Already at that host's table: the page's own rejoin is at work, nothing to do. */
  | { kind: 'here' }
  /** From the host of the match this player left: straight back, no lobby on the way. */
  | { kind: 'back'; host: string }
  /** Anything else: the lobby joined, its owner's game then. */
  | { kind: 'lobby'; lobby: string };

/**
 * `from` is who invited, where Steam says (a running game hears it; a game started by the
 * invite does not); `kept` the match kept for Back to the match; `atTableOf` the host whose
 * room this page is in as a guest, or null.
 */
export function joinRoute(
  asked: { lobby: string; from: string | null },
  kept: KeptMatch | null,
  atTableOf: string | null,
): JoinRoute {
  if (asked.from !== null && asked.from === atTableOf) return { kind: 'here' };
  if (asked.from !== null && kept !== null && asked.from === kept.host)
    return { kind: 'back', host: kept.host };
  return { kind: 'lobby', lobby: asked.lobby };
}
