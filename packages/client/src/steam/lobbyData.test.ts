import { PROTOCOL_VERSION } from '@bollfort/protocol';
import { describe, expect, it } from 'vitest';

import { LOBBY_TAG, listingOfLobby, lobbyDataOf, lobbyFilter } from './lobbyData.js';
import { steamCodeOf } from './steamCode.js';

const HOST = '76561198005395758';

describe('a Steam lobby’s data', () => {
  it('is the room’s listing, read back as a row under its host’s code', () => {
    const listing = {
      host: 'Arnoldex',
      people: 2,
      playerCount: 6,
      teamSize: 2,
      towers: true,
      tournament: 'The Ravens',
    };
    expect(listingOfLobby(HOST, lobbyDataOf(listing))).toEqual({
      ...listing,
      code: steamCodeOf(HOST),
    });
    expect(listingOfLobby(HOST, lobbyDataOf({ ...listing, tournament: null }))?.tournament).toBe(
      null,
    );
  });

  it('is no row of ours on another protocol, untagged, or garbled', () => {
    const good = lobbyDataOf({
      host: 'Bo',
      people: 1,
      playerCount: 4,
      teamSize: 1,
      towers: false,
      tournament: null,
    });
    expect(listingOfLobby(HOST, { ...good, [LOBBY_TAG]: String(PROTOCOL_VERSION - 1) })).toBeNull();
    expect(listingOfLobby(HOST, { name: 'Spacewar lobby' })).toBeNull();
    expect(listingOfLobby(HOST, { ...good, players: '99' })).toBeNull();
    expect(listingOfLobby(HOST, { ...good, host: '' })).toBeNull();
    expect(listingOfLobby('109775240000000000', good)).toBeNull();
    // A match under way, its lobby joinable for a player away (S3.6): never listed.
    expect(listingOfLobby(HOST, { ...good, running: '1' })).toBeNull();
    const running = lobbyDataOf(
      { host: 'Bo', people: 1, playerCount: 4, teamSize: 1, towers: false, tournament: null },
      true,
    );
    expect(listingOfLobby(HOST, running)).toBeNull();
  });

  it('is matched by Steam’s search filter while open, and not once its match runs', () => {
    const listing = { host: 'Bo', people: 1, playerCount: 4, teamSize: 1, towers: false };
    const matches = (data: Record<string, string>): boolean =>
      Object.entries(lobbyFilter()).every(([key, value]) => data[key] === value);
    expect(matches(lobbyDataOf({ ...listing, tournament: null }))).toBe(true);
    expect(matches(lobbyDataOf({ ...listing, tournament: null }, true))).toBe(false);
    expect(lobbyFilter()[LOBBY_TAG]).toBe(String(PROTOCOL_VERSION));
  });
});
