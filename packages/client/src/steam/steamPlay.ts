import type { ServerMessage } from '@bollfort/protocol';

import { gameHost, type GameHost, type HostSteam, type LobbyKind } from '../host.js';
import { steamDial } from '../net/steamDial.js';
import type { Dial } from '../net/transport.js';
import { store, stored } from '../storage.js';
import { forgetMatch, keepMatch } from './backToMatch.js';
import { lobbyDataOf } from './lobbyData.js';
import { steamCodeOf } from './steamCode.js';

/**
 * The page's side of Steam play (STEAM.md §7.3, S3.3): whether this is the Steam build with
 * Steam up, the lobby's type as chosen under Play, and what a room does beside its Steam
 * lobby. Outside the Steam build, or without Steam, `steamPlay()` is null and nothing here is
 * reached: the game is the browser's.
 */
export interface SteamPlay {
  host: GameHost;
  /** This player: their Steam ID and name. */
  steamId: string;
  name: string;
  /** Links to other players' games, by their Steam IDs: one for the page (`steamDial`). */
  dial: Dial;
}

let play: SteamPlay | null = null;

/** Asked of the app once, as the page starts. */
export async function startSteamPlay(): Promise<SteamPlay | null> {
  const host = gameHost();
  if (host === null) return null;
  const steam: HostSteam = await host.steam();
  if (!steam.ready || steam.steamId === null) return null;
  play = {
    host,
    steamId: steam.steamId,
    name: (steam.name ?? '').trim().slice(0, 24) || 'Player',
    dial: steamDial(host),
  };
  return play;
}

/** Steam play, once started, or null. */
export function steamPlay(): SteamPlay | null {
  return play;
}

const KIND_KEY = 'bollfort.lobbyKind';
export const LOBBY_KINDS: readonly LobbyKind[] = ['friends', 'public', 'invite'];

/** The lobby type chosen under Play, Friends unless another was (S3.3). */
export function lobbyKind(): LobbyKind {
  const kept = stored(KIND_KEY);
  return LOBBY_KINDS.includes(kept as LobbyKind) ? (kept as LobbyKind) : 'friends';
}

export function setLobbyKind(kind: LobbyKind): void {
  store(KIND_KEY, kind);
}

/** What a room screen tells its Steam side, and asks of it. */
export interface SteamRoom {
  /** The code the lobby shows: the host's Steam code. */
  readonly code: string | null;
  /** Each message the room's connection hears, after the lobby's own handling. */
  heard(message: ServerMessage, started: boolean, finished: boolean): void;
  /** The room left, whichever way: the lobby left, the presence cleared. */
  left(): void;
  /** Steam's friend picker, for the lobby's Invite button; absent for a guest. */
  invite?: () => void;
}

type RoomMessage = Extract<ServerMessage, { type: 'room' }>;

/**
 * The host's Steam side: the lobby made with the room, of the kind chosen under Play (a
 * public one from Find a game's Host), its data the room's listing, open to joins only while
 * the table is being set and has a free seat; rich presence's Join with it.
 */
export async function hostSteamRoom(
  p: SteamPlay,
  room: string,
  kind: LobbyKind,
): Promise<SteamRoom> {
  const { host } = p;
  const lobby = await host.lobbyCreate(kind);
  host.lobbyRoom(room);
  let joinable: boolean | null = null;
  let said = '';
  let data = '';
  const presence = (open: boolean, status: string | null): void => {
    host.presence({
      status,
      // Join in the friends list, for Friends and Public only; an Invite only lobby offers none.
      connect: open && lobby !== null && kind !== 'invite' ? `+connect_lobby ${lobby}` : null,
    });
  };
  presence(true, 'lobby');
  return {
    code: steamCodeOf(p.steamId),
    invite: () => host.lobbyInvite(),
    heard(message, _started, finished) {
      if (message.type !== 'room') return;
      const open = !message.started && message.seats.length < message.playerCount;
      if (open !== joinable) {
        joinable = open;
        host.lobbyJoinable(open);
      }
      const status = message.started && !finished ? 'match' : 'lobby';
      if (`${open} ${status}` !== said) {
        said = `${open} ${status}`;
        presence(open, status);
      }
      const next = JSON.stringify(lobbyDataOf(listingOf(message, p.name)));
      if (next !== data) {
        data = next;
        host.lobbyData(JSON.parse(next) as Record<string, string>);
      }
    },
    left() {
      host.lobbyRoom(null);
      host.lobbyLeave();
      host.presence({ status: null, connect: null });
    },
  };
}

/** The room as Find a game lists it, the host named as Steam names them. */
function listingOf(message: RoomMessage, hostName: string) {
  const tournament = message.tournament;
  return {
    host: hostName,
    people: message.seats.filter((s) => !s.isBot).length,
    playerCount: message.playerCount,
    teamSize: message.settings.teamSize,
    towers: message.settings.specials,
    tournament:
      tournament === null
        ? null
        : (tournament.teamNames[tournament.seats[message.hostId]?.team ?? 0] ?? null),
  };
}

/**
 * A guest's Steam side: the match kept for Back to the match while it runs, forgotten as it
 * ends or the room is left; the presence saying where they are.
 */
export function guestSteamRoom(p: SteamPlay, hostSteamId: string, room: string): SteamRoom {
  let kept = false;
  p.host.presence({ status: 'lobby', connect: null });
  return {
    code: steamCodeOf(hostSteamId),
    heard(_message, started, finished) {
      if (started && !finished && !kept) {
        kept = true;
        keepMatch(hostSteamId, room);
        p.host.presence({ status: 'match', connect: null });
      } else if (kept && (finished || !started)) {
        kept = false;
        forgetMatch();
        p.host.presence({ status: 'lobby', connect: null });
      }
    },
    left() {
      forgetMatch();
      p.host.lobbyLeave();
      p.host.presence({ status: null, connect: null });
    },
  };
}
