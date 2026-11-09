import { createRequire } from 'node:module';

import type * as Koffi from 'koffi';

import { steamApiPath } from './steamAvatars.js';

/**
 * A Steam invite to the lobby sent straight to one player, for the host's Invite back in the
 * pause menu (STEAM.md §7.3, S3.6): `steamworks.js` offers only the overlay's friend picker,
 * which draws nothing on the Linux desktop and makes the host find the player again. One call of
 * Steam's flat C API through `koffi`, on the library `steamworks.js` has initialised, as the
 * avatars are (`steamAvatars.ts`).
 */
export type InviteUser = (lobby: string, steamId: string) => boolean;

/** Steam's own call; to be opened only once Steam is initialised (`steamworks.init`). */
export function steamInviteUser(libraryPath = steamApiPath()): InviteUser {
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof Koffi;
  const lib = koffi.load(libraryPath);
  const matchmakingOf = lib.func('void *SteamAPI_SteamMatchmaking_v009()');
  const invite = lib.func(
    'bool SteamAPI_ISteamMatchmaking_InviteUserToLobby(void *self, uint64_t lobby, uint64_t invitee)',
  );
  const matchmaking: unknown = matchmakingOf();
  if (matchmaking === null) throw new Error('Steam’s matchmaking is not there');
  return (lobby, steamId) => invite(matchmaking, BigInt(lobby), BigInt(steamId)) as boolean;
}
