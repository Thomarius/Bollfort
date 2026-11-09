import type { ServerMessage } from '@bollfort/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameHost } from '../host.js';
import { keptMatch } from './backToMatch.js';
import { steamCodeOf } from './steamCode.js';
import { guestSteamRoom, hostSteamRoom, type SteamPlay } from './steamPlay.js';

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
    presence: (values: Record<string, string | null>) =>
      asked.push(`presence ${values.status} ${values.connect}`),
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
      `presence lobby +connect_lobby ${LOBBY}`,
      'joinable true',
      `presence lobby +connect_lobby ${LOBBY}`,
      'data people=1',
      'data people=2',
      'joinable false',
      'presence lobby null',
      'data people=4',
      'presence match null',
      'invite',
      'room null',
      'leave',
      'presence null null',
    ]);
  });

  it('offers no Join in the friends list when it is Invite only', async () => {
    const { play, asked } = fakePlay();
    const steam = await hostSteamRoom(play, 'ABCDEF', 'invite');
    steam.heard(room(1), false, false);
    expect(asked.filter((a) => a.startsWith('presence'))).toEqual([
      'presence lobby null',
      'presence lobby null',
    ]);
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
});
