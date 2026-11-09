import { PROTOCOL_VERSION, type RoomListing } from '@bollfort/protocol';

import { steamCodeOf } from './steamCode.js';

/**
 * The Steam lobby's data (STEAM.md §4, §7.3): the games browser's row, as the host's room
 * lists itself, in the strings Steam keeps. One shape whatever the source, so Find a game and
 * its filters do not know whether a row came from a server or from Steam.
 *
 * `bollfort` tags our lobbies, since every developer shares App ID 480 until ours is bought;
 * it carries the protocol, and a lobby on another is hidden (§7.2).
 */
export const LOBBY_TAG = 'bollfort';

export function lobbyDataOf(
  listing: Omit<RoomListing, 'code'>,
  running = false,
): Record<string, string> {
  return {
    [LOBBY_TAG]: String(PROTOCOL_VERSION),
    host: listing.host,
    people: String(listing.people),
    players: String(listing.playerCount),
    teamSize: String(listing.teamSize),
    towers: listing.towers ? '1' : '0',
    tournament: listing.tournament ?? '',
    // A match under way keeps its lobby joinable while a player is away, for them to come
    // back by (S3.6); Find a game must not list it.
    running: running ? '1' : '0',
  };
}

const count = (text: string | undefined, min: number, max: number): number | null => {
  if (text === undefined || !/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
};

/**
 * A listed lobby as Find a game's row, its code its owner's; null for one not ours, on
 * another protocol, or garbled — anyone may write a lobby's data on 480.
 */
export function listingOfLobby(owner: string, data: Record<string, string>): RoomListing | null {
  if (data[LOBBY_TAG] !== String(PROTOCOL_VERSION) || data.running === '1') return null;
  const code = steamCodeOf(owner);
  const playerCount = count(data.players, 2, 8);
  const people = count(data.people, 1, 8);
  const teamSize = count(data.teamSize, 1, 4);
  const host = (data.host ?? '').slice(0, 24);
  if (code === null || playerCount === null || people === null || teamSize === null) return null;
  if (host === '' || (data.towers !== '0' && data.towers !== '1')) return null;
  return {
    code,
    host,
    people,
    playerCount,
    teamSize,
    towers: data.towers === '1',
    tournament:
      data.tournament === undefined || data.tournament === '' ? null : data.tournament.slice(0, 32),
  };
}
