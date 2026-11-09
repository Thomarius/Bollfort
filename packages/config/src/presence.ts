import type { Language } from './languages.js';

/**
 * Steam's rich presence (STEAM.md §7.2, §7.3 S3.4): what a friend's list says of a player, a
 * token set in `steam_display` and localised by a file uploaded in Steamworks (Community → Rich
 * Presence). Each token's text is one of the game's own texts (`config/locale/`), its `{round}`
 * and `{rounds}` written as Steam's `%round%` and `%rounds%`, filled from the keys of those names;
 * `tools/steamworks` writes the files from them, and a test fails when they are stale.
 */
export const PRESENCE_TOKENS = {
  '#Lobby': 'steam.presence.lobby',
  '#Match': 'steam.presence.match',
  '#MatchRound': 'steam.presence.matchRound',
  '#MatchOpening': 'steam.presence.matchOpening',
  '#TournamentLobby': 'steam.presence.tournamentLobby',
  '#TournamentMatch': 'steam.presence.tournamentMatch',
  '#TournamentRound': 'steam.presence.tournamentRound',
  '#TournamentOpening': 'steam.presence.tournamentOpening',
} as const;
export type PresenceToken = keyof typeof PRESENCE_TOKENS;

/**
 * Steam's names of the languages the store lists (STEAM.md §1): English and German. Hessian is
 * an in-game joke, never Steam's.
 */
export const STEAM_LANGUAGES: Partial<Record<Language, string>> = {
  en: 'english',
  de: 'german',
};
