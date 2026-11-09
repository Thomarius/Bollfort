import type { ServerMessage } from '@bollfort/protocol';

import { gameHost, type GameHost, type HostSteam, type LobbyKind } from '../host.js';
import { steamDial } from '../net/steamDial.js';
import type { Dial } from '../net/transport.js';
import { store, stored } from '../storage.js';
import { forgetMatch, keepMatch, keptMatch } from './backToMatch.js';
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

/**
 * The host whose room this page is in as a guest, and whether its link still holds (or is
 * being got back) — an invite from them is then no news — or null.
 */
let guestOf: { host: string; linked: () => boolean } | null = null;

export function guestAt(): { host: string; linked: boolean } | null {
  return guestOf === null ? null : { host: guestOf.host, linked: guestOf.linked() };
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
  /** A Steam invite straight to a player whose seat is away, by Steam ID (S3.6); the host's. */
  inviteBack?: (steamId: string) => void;
}

/**
 * Who the host's Steam lobby lets in (S3.6). `newcomers` while the table is being set and has a
 * free seat, as before; `joinable` also while a match runs with a person's seat away — the
 * returning player's invite and Join go through the lobby, and Steam's joinability is one
 * switch for everyone, so the room, which knows Steam IDs, refuses whoever holds no seat.
 * Rich presence's Join and Find a game follow `newcomers` alone, so nobody is offered a
 * running match.
 */
export function lobbyOpenness(
  message: RoomMessage,
  finished: boolean,
): { joinable: boolean; newcomers: boolean } {
  const newcomers = !message.started && message.seats.length < message.playerCount;
  const away = message.started && !finished && message.seats.some((s) => !s.isBot && !s.connected);
  return { joinable: newcomers || away, newcomers };
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
  let running = false;
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
    inviteBack: (steamId) => host.lobbyInviteUser(steamId),
    heard(message, _started, finished) {
      if (message.type !== 'room') return;
      const { joinable: canJoin, newcomers: open } = lobbyOpenness(message, finished);
      if (canJoin !== joinable) {
        joinable = canJoin;
        host.lobbyJoinable(canJoin);
      }
      running = message.started && !finished;
      const status = message.started && !finished ? 'match' : 'lobby';
      if (`${open} ${status}` !== said) {
        said = `${open} ${status}`;
        presence(open, status);
      }
      const next = JSON.stringify(lobbyDataOf(listingOf(message, p.name), running));
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
export function guestSteamRoom(
  p: SteamPlay,
  hostSteamId: string,
  room: string,
  linked: () => boolean = () => true,
): SteamRoom {
  let kept = false;
  const self = { host: hostSteamId, linked };
  guestOf = self;
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
      } else if (!kept && !started && keptMatch()?.host === hostSteamId) {
        // Back at this host's table between matches — the match left ended meanwhile, and
        // this is its lobby again: nothing to go back to.
        forgetMatch();
      }
    },
    left() {
      if (guestOf === self) guestOf = null;
      forgetMatch();
      p.host.lobbyLeave();
      p.host.presence({ status: null, connect: null });
    },
  };
}
