import type { ServerMessage } from '@bollfort/protocol';
import type { MatchState } from '@bollfort/sim';

import { gameHost, type GameHost, type HostSteam, type LobbyKind } from '../host.js';
import { steamDial } from '../net/steamDial.js';
import type { Dial } from '../net/transport.js';
import { store, stored } from '../storage.js';
import { forgetMatch, keepMatch, keptMatch } from './backToMatch.js';
import { lobbyDataOf } from './lobbyData.js';
import { Presence, type Whereabouts } from './presence.js';
import { steamCodeOf } from './steamCode.js';
import { startAchievements } from './achievements.js';

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
  if (steam.achievements) startAchievements(host);
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
  /**
   * Each message the room's connection hears, after the lobby's own handling, with the match's
   * round as the page has it (null before a match), for the presence.
   */
  heard(
    message: ServerMessage,
    started: boolean,
    finished: boolean,
    round?: MatchRound | null,
  ): void;
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

/** A match's round as the page has it, and its cap. */
export interface MatchRound {
  round: number;
  rounds: number | null;
}

/** A match's round as the page has it, for the presence; null before one. */
export function roundOf(state: MatchState | null): MatchRound | null {
  return state === null ? null : { round: state.round, rounds: state.ruleset.scoring.maxRounds };
}

/**
 * Where a room's player is, for the presence: in its lobby, or in its match at a round — a
 * finished match's summary counts as the lobby, the next table being what comes. Null before
 * the room has said anything.
 */
function whereabouts(
  last: RoomMessage | null,
  finished: boolean,
  round: MatchRound | null,
  group: string,
  connect: string | null,
): Whereabouts | null {
  if (last === null) return null;
  const inMatch = last.started && !finished;
  return {
    place: inMatch ? 'match' : 'lobby',
    tournament: last.tournament !== null,
    round: round?.round ?? 0,
    rounds: round?.rounds ?? null,
    group,
    size: last.seats.filter((s) => !s.isBot).length,
    connect: inMatch ? null : connect,
  };
}

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
  let data = '';
  let last: RoomMessage | null = null;
  let round: MatchRound | null = null;
  const presence = new Presence((keys) => host.presence(keys));
  // Join in the friends list, for Friends and Public only; an Invite only lobby offers none.
  const join = lobby !== null && kind !== 'invite' ? `+connect_lobby ${lobby}` : null;
  return {
    code: steamCodeOf(p.steamId),
    invite: () => host.lobbyInvite(),
    inviteBack: (steamId) => host.lobbyInviteUser(steamId),
    heard(message, _started, finished, matchRound = null) {
      if (message.type === 'room') last = message;
      round = matchRound;
      if (last !== null) {
        const open = lobbyOpenness(last, finished).newcomers;
        presence.set(whereabouts(last, finished, round, p.steamId, open ? join : null));
      }
      if (message.type !== 'room') return;
      const { joinable: canJoin } = lobbyOpenness(message, finished);
      if (canJoin !== joinable) {
        joinable = canJoin;
        host.lobbyJoinable(canJoin);
      }
      running = message.started && !finished;
      const next = JSON.stringify(lobbyDataOf(listingOf(message, p.name), running));
      if (next !== data) {
        data = next;
        host.lobbyData(JSON.parse(next) as Record<string, string>);
      }
    },
    left() {
      host.lobbyRoom(null);
      host.lobbyLeave();
      presence.set(null);
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
  let last: RoomMessage | null = null;
  const presence = new Presence((keys) => p.host.presence(keys));
  return {
    code: steamCodeOf(hostSteamId),
    heard(message, started, finished, round = null) {
      if (message.type === 'room') last = message;
      presence.set(whereabouts(last, finished, round, hostSteamId, null));
      if (started && !finished && !kept) {
        kept = true;
        keepMatch(hostSteamId, room);
      } else if (kept && (finished || !started)) {
        kept = false;
        forgetMatch();
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
      presence.set(null);
    },
  };
}
