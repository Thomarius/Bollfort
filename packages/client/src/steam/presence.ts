import type { PresenceToken } from '@bollfort/config';

/**
 * Steam's rich presence for this player (STEAM.md §7.3, S3.4): the token Steam shows in the
 * friends list (`steam_display`, localised by the file `tools/steamworks` writes from
 * `PRESENCE_TOKENS`), the round filled into it, the table as a group, so friends at one table
 * show together (`steam_player_group`), and Join while the lobby takes newcomers (`connect`).
 */

/** Where the player is, or null for nowhere: the menu. */
export interface Whereabouts {
  place: 'lobby' | 'match';
  tournament: boolean;
  /** The match's round, 0 for the opening; ignored in the lobby. */
  round: number;
  rounds: number | null;
  /** The table, the host's Steam ID, and the people at it. */
  group: string;
  size: number;
  /** Join in the friends list, or null for none. */
  connect: string | null;
}

/** Every key this sets, so each is cleared when not wanted — `status` too, set once raw. */
export const PRESENCE_KEYS = [
  'steam_display',
  'round',
  'rounds',
  'steam_player_group',
  'steam_player_group_size',
  'connect',
  'status',
] as const;

function tokenOf(w: Whereabouts): PresenceToken {
  const t = w.tournament;
  if (w.place === 'lobby') return t ? '#TournamentLobby' : '#Lobby';
  if (w.round === 0) return t ? '#TournamentOpening' : '#MatchOpening';
  if (w.rounds === null) return t ? '#TournamentRound' : '#MatchRound';
  return t ? '#TournamentMatch' : '#Match';
}

/** The keys to set, each a value or null to clear it. */
export function presenceOf(w: Whereabouts | null): Record<string, string | null> {
  const keys: Record<string, string | null> = Object.fromEntries(
    PRESENCE_KEYS.map((k) => [k, null]),
  );
  if (w === null) return keys;
  keys.steam_display = tokenOf(w);
  if (w.place === 'match') {
    keys.round = String(w.round);
    if (w.rounds !== null) keys.rounds = String(w.rounds);
  }
  keys.steam_player_group = w.group;
  keys.steam_player_group_size = String(Math.max(1, w.size));
  keys.connect = w.connect;
  return keys;
}

/** Sends the presence only when it changes: it is worked out at every message a room hears. */
export class Presence {
  private said = '';

  constructor(private readonly send: (keys: Record<string, string | null>) => void) {}

  set(w: Whereabouts | null): void {
    const keys = presenceOf(w);
    const text = JSON.stringify(keys);
    if (text === this.said) return;
    this.said = text;
    this.send(keys);
  }
}
