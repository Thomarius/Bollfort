import type { ServerMessage } from '@bollfort/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameHost } from '../host.js';
import { keepMatch, keptMatch } from './backToMatch.js';
import { steamCodeOf } from './steamCode.js';
import {
  guestAt,
  guestSteamRoom,
  hostSteamRoom,
  lobbyOpenness,
  type SteamPlay,
} from './steamPlay.js';

const ME = '76561198005395758';
const HOST = '76561198000000001';
const LOBBY = '109775240000000001';

type Room = Extract<ServerMessage, { type: 'room' }>;

/** A room message with these people seated, the rest of the table bots. */
function room(people: number, started = false): Room {
  return {
    type: 'room',
    code: 'ABCDEF',
    seats: Array.from({ length: people }, (_, i) => ({
      playerId: i,
      name: `P${i}`,
      isBot: false,
      connected: true,
      ready: true,
      special: null,
    })),
    playerCount: 4,
    bots: [5, 5, 5, 5],
    botTowers: ['drawn', 'drawn', 'drawn', 'drawn'],
    settings: { maxRounds: 10, teamSize: 1, continues: 3, specials: false },
    settingBounds: {
      maxRounds: { min: 5, max: 15 },
      continues: { min: 1, max: 5 },
    },
    teams: [0, 1, 2, 3],
    seed: 1,
    hostBot: null,
    playerLimits: { min: 2, max: 8 },
    hostId: 0,
    started,
    internet: null,
    tournament: null,
  } as unknown as Room;
}

/** The app's side, recording what the page asked of it. */
function fakePlay() {
  const asked: string[] = [];
  const host = {
    lobbyCreate: (kind: string) => {
      asked.push(`create ${kind}`);
      return Promise.resolve(LOBBY);
    },
    lobbyRoom: (r: string | null) => asked.push(`room ${r}`),
    lobbyData: (data: Record<string, string>) => asked.push(`data people=${data.people}`),
    lobbyJoinable: (on: boolean) => asked.push(`joinable ${on}`),
    lobbyLeave: () => asked.push('leave'),
    lobbyInvite: () => asked.push('invite'),
    lobbyInviteUser: (id: string) => asked.push(`invite user ${id}`),
    presence: (values: Record<string, string | null>) =>
      asked.push(`presence ${values.steam_display} ${values.connect}`),
  } as unknown as GameHost;
  const play: SteamPlay = { host, steamId: ME, name: 'Arnoldex', dial: () => ({}) as never };
  return { play, asked };
}

describe('the host’s Steam lobby beside the room', () => {
  it('is made of the kind chosen, open while a seat is free, Join offered with it', async () => {
    const { play, asked } = fakePlay();
    const steam = await hostSteamRoom(play, 'ABCDEF', 'friends');
    expect(steam.code).toBe(steamCodeOf(ME));
    steam.heard(room(1), false, false);
    steam.heard(room(2), false, false);
    steam.heard(room(4), false, false); // full
    steam.heard(room(4, true), true, false); // the match
    steam.invite?.();
    steam.left();
    expect(asked).toEqual([
      'create friends',
      `room ABCDEF`,
      `presence #Lobby +connect_lobby ${LOBBY}`,
      'joinable true',
      'data people=1',
      // A second person at the table: the group's size, for the friends list.
      `presence #Lobby +connect_lobby ${LOBBY}`,
      'data people=2',
      // Full: no Join offered.
      'presence #Lobby null',
      'joinable false',
      'data people=4',
      'presence #MatchOpening null',
      'data people=4', // marked running, for Find a game to leave out (S3.6)
      'invite',
      'room null',
      'leave',
      'presence null null',
    ]);
  });

  it('stays joinable through a match while a person is away, Join and the list closed (S3.6)', async () => {
    const { play, asked } = fakePlay();
    const steam = await hostSteamRoom(play, 'ABCDEF', 'public');
    const away = room(2, true);
    away.seats[1] = { ...away.seats[1]!, connected: false };
    steam.heard(room(2, true), true, false);
    asked.length = 0;
    steam.heard(away, true, false);
    steam.heard(room(2, true), true, false); // back
    steam.heard(away, true, false);
    steam.heard(away, true, true); // the match over: nothing to come back to
    expect(asked.filter((a) => a.startsWith('joinable'))).toEqual([
      'joinable true',
      'joinable false',
      'joinable true',
      'joinable false',
    ]);
    // Never Join in the friends list during the match: friends would only be refused.
    expect(asked.filter((a) => a.startsWith('presence') && !a.endsWith('null'))).toEqual([]);
  });

  it('counts no bot as away, and no seat before the match', () => {
    const away = room(2);
    away.seats[1] = { ...away.seats[1]!, connected: false };
    expect(lobbyOpenness(away, false)).toEqual({ joinable: true, newcomers: true });
    const bots = room(2, true);
    bots.seats[1] = { ...bots.seats[1]!, connected: false, isBot: true };
    expect(lobbyOpenness(bots, false)).toEqual({ joinable: false, newcomers: false });
  });

  it('sends Invite back straight to the player', async () => {
    const { play, asked } = fakePlay();
    const steam = await hostSteamRoom(play, 'ABCDEF', 'friends');
    steam.inviteBack?.(HOST);
    expect(asked.at(-1)).toBe(`invite user ${HOST}`);
  });

  it('offers no Join in the friends list when it is Invite only', async () => {
    const { play, asked } = fakePlay();
    const steam = await hostSteamRoom(play, 'ABCDEF', 'invite');
    steam.heard(room(1), false, false);
    expect(asked.filter((a) => a.startsWith('presence'))).toEqual(['presence #Lobby null']);
  });
});

describe('a guest’s Steam side', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the match for Back to the match while it runs, and forgets it after', () => {
    const { play } = fakePlay();
    const steam = guestSteamRoom(play, HOST, 'ABCDEF');
    expect(steam.code).toBe(steamCodeOf(HOST));
    expect(steam.invite).toBeUndefined();
    steam.heard(room(2), false, false);
    expect(keptMatch()).toBeNull();
    steam.heard(room(2, true), true, false);
    expect(keptMatch()).toMatchObject({ host: HOST, room: 'ABCDEF' });
    steam.heard(room(2, true), true, true);
    expect(keptMatch()).toBeNull();
  });

  it('forgets it when the room is left', () => {
    const { play } = fakePlay();
    const steam = guestSteamRoom(play, HOST, 'ABCDEF');
    steam.heard(room(2, true), true, false);
    steam.left();
    expect(keptMatch()).toBeNull();
  });

  it('forgets a match left, back at its host’s table between matches', () => {
    const { play } = fakePlay();
    keepMatch(HOST, 'ABCDEF');
    const steam = guestSteamRoom(play, HOST, 'ABCDEF');
    steam.heard(room(2), false, false);
    expect(keptMatch()).toBeNull();
  });

  it('says whose table the page is at, and whether its link holds', () => {
    const { play } = fakePlay();
    let linked = true;
    const steam = guestSteamRoom(play, HOST, 'ABCDEF', () => linked);
    expect(guestAt()).toEqual({ host: HOST, linked: true });
    linked = false;
    expect(guestAt()).toEqual({ host: HOST, linked: false });
    steam.left();
    expect(guestAt()).toBeNull();
  });
});
