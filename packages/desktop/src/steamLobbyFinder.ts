import { createRequire } from 'node:module';

import type * as Koffi from 'koffi';

import { steamApiPath } from './steamAvatars.js';

/**
 * Finding our lobbies for Find a game (STEAM.md §4, §7.3), in the calls `steamworks.js` lacks,
 * through `koffi` on the library it has initialised, as the avatars and Invite back are.
 *
 * Its `getLobbies()` asks Steam with no filter, and Steam answers with at most 50 lobbies of
 * the App ID, nearest first. On 480, which every developer's tests share, ours were almost
 * never among them: the two-person test of 2026-11-11 saw Find a game list nothing at all.
 * Steam's filters apply to the next request only, so they are set right before it. And Steam's
 * search returns Public lobbies alone: a friend's Friends lobby is found through the friend,
 * by which lobby Steam says they are in, its data asked for separately.
 */
export interface LobbyFinder {
  /** Steam's filters for the next search: these keys equal to these values, worldwide. */
  filterNext(equal: Record<string, string>): void;
  /** The lobbies Steam says friends are in, playing this App ID. */
  friendsLobbies(appId: number): string[];
  /** Asks Steam for a lobby's data, which a lobby not joined has only once it arrives. */
  requestData(lobby: string): void;
  /** A lobby's data as Steam has it; empty until it has arrived. */
  data(lobby: string): Record<string, string>;
}

/** `ELobbyComparison`'s Equal, `ELobbyDistanceFilter`'s Worldwide, `EFriendFlags`' Immediate. */
const EQUAL = 0;
const WORLDWIDE = 3;
const IMMEDIATE_FRIENDS = 4;
/** As many as Steam gives (its own cap); ours only, once filtered. */
const RESULT_COUNT = 50;
/** `k_nMaxLobbyKeyLength` and `k_cubChatMetadataMax`, with room for the terminating zero. */
const KEY_BYTES = 256;
const VALUE_BYTES = 8193;

/** Steam's own calls; to be opened only once Steam is initialised (`steamworks.init`). */
export function steamLobbyFinder(libraryPath = steamApiPath()): LobbyFinder {
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof Koffi;
  const lib = koffi.load(libraryPath);
  const matchmakingOf = lib.func('void *SteamAPI_SteamMatchmaking_v009()');
  const friendsOf = lib.func('void *SteamAPI_SteamFriends_v017()');
  const stringFilter = lib.func(
    'void SteamAPI_ISteamMatchmaking_AddRequestLobbyListStringFilter(void *self, const char *key, const char *value, int comparison)',
  );
  const distanceFilter = lib.func(
    'void SteamAPI_ISteamMatchmaking_AddRequestLobbyListDistanceFilter(void *self, int filter)',
  );
  const countFilter = lib.func(
    'void SteamAPI_ISteamMatchmaking_AddRequestLobbyListResultCountFilter(void *self, int count)',
  );
  const requestData = lib.func(
    'bool SteamAPI_ISteamMatchmaking_RequestLobbyData(void *self, uint64_t lobby)',
  );
  const dataCount = lib.func(
    'int SteamAPI_ISteamMatchmaking_GetLobbyDataCount(void *self, uint64_t lobby)',
  );
  const dataByIndex = lib.func(
    'bool SteamAPI_ISteamMatchmaking_GetLobbyDataByIndex(void *self, uint64_t lobby, int index, _Out_ uint8_t *key, int keySize, _Out_ uint8_t *value, int valueSize)',
  );
  const friendCount = lib.func('int SteamAPI_ISteamFriends_GetFriendCount(void *self, int flags)');
  const friendByIndex = lib.func(
    'uint64_t SteamAPI_ISteamFriends_GetFriendByIndex(void *self, int index, int flags)',
  );
  // `FriendGameInfo_t`: every field at its natural offset, so Steam's packing of 4 or 8 agrees.
  const GameInfo = koffi.struct('BollfortFriendGameInfo', {
    gameId: 'uint64_t',
    ip: 'uint32_t',
    port: 'uint16_t',
    queryPort: 'uint16_t',
    lobby: 'uint64_t',
  });
  const gamePlayed = lib.func('SteamAPI_ISteamFriends_GetFriendGamePlayed', 'bool', [
    'void *',
    'uint64_t',
    koffi.out(koffi.pointer(GameInfo)),
  ]);
  const matchmaking: unknown = matchmakingOf();
  const friends: unknown = friendsOf();
  if (matchmaking === null || friends === null) throw new Error('Steam’s interfaces are not there');

  const text = (buffer: Buffer): string => {
    const end = buffer.indexOf(0);
    return buffer.toString('utf8', 0, end < 0 ? buffer.length : end);
  };

  return {
    filterNext(equal) {
      for (const [key, value] of Object.entries(equal))
        stringFilter(matchmaking, key, value, EQUAL);
      distanceFilter(matchmaking, WORLDWIDE);
      countFilter(matchmaking, RESULT_COUNT);
    },
    friendsLobbies(appId) {
      const lobbies: string[] = [];
      const count = friendCount(friends, IMMEDIATE_FRIENDS) as number;
      for (let i = 0; i < count; i++) {
        const friend = friendByIndex(friends, i, IMMEDIATE_FRIENDS) as bigint | number;
        const info: { gameId?: bigint | number; lobby?: bigint | number } = {};
        if (!(gamePlayed(friends, friend, info) as boolean)) continue;
        // A Steam game's ID is its App ID, the higher bits of a mod's or shortcut's set.
        if (BigInt(info.gameId ?? 0) !== BigInt(appId)) continue;
        const lobby = BigInt(info.lobby ?? 0);
        if (lobby !== 0n) lobbies.push(lobby.toString());
      }
      return lobbies;
    },
    requestData(lobby) {
      requestData(matchmaking, BigInt(lobby));
    },
    data(lobby) {
      const id = BigInt(lobby);
      const data: Record<string, string> = {};
      const count = dataCount(matchmaking, id) as number;
      const key = Buffer.alloc(KEY_BYTES);
      const value = Buffer.alloc(VALUE_BYTES);
      for (let i = 0; i < count; i++) {
        key.fill(0);
        value.fill(0);
        if (dataByIndex(matchmaking, id, i, key, KEY_BYTES, value, VALUE_BYTES) as boolean)
          data[text(key)] = text(value);
      }
      return data;
    },
  };
}
