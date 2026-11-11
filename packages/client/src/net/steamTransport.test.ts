import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerMessage } from '@bollfort/protocol';

import { ServerConnection, type RetryPolicy } from './connection.js';
import { FakeNetwork } from './fakeNetwork.js';
import { FakeSteam } from './fakeSteam.js';
import { MATCH_TIMEOUT_MS, expectFaithful, table, type Table } from './matchTable.testing.js';

/**
 * Whole matches over Steam's P2P (STEAM.md §7.3, S3.1 and S3.2): the desktop app's two ends
 * (`steamP2P.ts`) with a fake Steam between the machines, behaving as S1 measured — the slow
 * first contact, a session surviving a short outage and given up after a long one — and the
 * server knowing each guest by the Steam ID on their packets. The host's own page reaches its
 * server on the machine itself, as the Steam build's does over 127.0.0.1, with the host's ID.
 */

const HOST = '76561198000000001';
const guestId = (i: number): string => `7656119800000000${i + 1}`;

/** Rejoining under Steam runs for as long as the match does, not a minute (S3.2). */
const steamRetry: RetryPolicy = { delaysMs: [500, 1000, 2000, 4000, 5000], tries: 200 };

function steamTable(people: number, players: number, seed = 3): Table & { steam: FakeSteam } {
  const steam = new FakeSteam(undefined, seed);
  const t = table({
    people,
    players,
    seed,
    retry: steamRetry,
    endsWithHost: true,
    carrier: (accept) => {
      steam.machine(HOST, accept);
      const local = new FakeNetwork((peer) => accept(peer, HOST), { latencyMs: 0, jitterMs: 0 });
      const dials = [local.dial];
      for (let i = 1; i < people; i++) {
        steam.machine(guestId(i));
        dials.push(steam.dialFrom(guestId(i), HOST));
      }
      return dials;
    },
  });
  return { ...t, steam };
}

describe('a match over Steam’s P2P', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it(
    'ends alike on every page, the guests seated by their Steam IDs',
    () => {
      const t = steamTable(3, 4);
      const room = t.pages[0]!.heard.filter((m) => m.type === 'room').at(-1);
      expect(room?.type === 'room' && room.seats.map((s) => s.steamId)).toEqual(
        expect.arrayContaining([HOST, guestId(1), guestId(2)]),
      );
      t.playOut();
      expectFaithful(t);
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'lives through a short outage on the links already open',
    () => {
      const t = steamTable(2, 3, 5);
      t.pass(20_000);
      const welcomes = t.pages[1]!.heard.filter((m) => m.type === 'welcome').length;
      t.steam.setOnline(guestId(1), false);
      t.pass(10_000);
      t.steam.setOnline(guestId(1), true);
      t.playOut();
      expectFaithful(t);
      expect(t.steam.failures).toBe(0);
      expect(t.pages[1]!.heard.filter((m) => m.type === 'welcome')).toHaveLength(welcomes);
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'takes a guest back by Steam ID after an outage Steam gave the session up on',
    () => {
      const t = steamTable(2, 3, 7);
      t.pass(15_000);
      t.steam.setOnline(guestId(1), false);
      t.pass(90_000);
      expect(t.steam.failures).toBeGreaterThan(0);
      t.steam.setOnline(guestId(1), true);
      t.playOut();
      expectFaithful(t);
      const guest = t.pages[1]!;
      expect(guest.connection.lost).toBe(false);
      expect(guest.since).toBeGreaterThan(0);
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'takes a guest back by Steam ID after their app is started again, without its token',
    () => {
      const t = steamTable(2, 3, 9);
      t.pass(20_000);
      const before = t.pages[1]!.match.humanPlayer;
      t.steam.restart(guestId(1));
      t.pass(3_000);
      const again = t.restart(1, t.steam.dialFrom(guestId(1), HOST));
      t.playOut();
      expectFaithful(t);
      expect(again.match.humanPlayer).toBe(before);
    },
    MATCH_TIMEOUT_MS,
  );

  it('ends for every guest at once as the host leaves it, nothing left to rejoin', () => {
    const t = steamTable(3, 4, 13);
    t.pass(15_000);
    t.pages[0]!.connection.close();
    t.pass(2_000);
    for (const guest of t.pages.slice(1)) {
      expect(guest.connection.hostLeft).toBe(true);
      expect(guest.connection.state).toBe('closed');
    }
    // No refusal shown over the match on the way out.
    expect(t.pages[1]!.heard.filter((m) => m.type === 'error')).toEqual([]);
  });

  it(
    'refuses anyone not seated in a match under way, saying so, the match unharmed (S3.6)',
    () => {
      const t = steamTable(2, 3, 11);
      t.pass(15_000);
      // Its Steam lobby stays joinable while a player is away: someone else may reach it.
      const STRANGER = '76561198000000099';
      t.steam.machine(STRANGER);
      const stranger = new ServerConnection(HOST, steamRetry, t.steam.dialFrom(STRANGER, HOST));
      const heard: ServerMessage[] = [];
      stranger.onMessage((m) => heard.push(m));
      void stranger.connect();
      stranger.joinRoom('Cy', t.code);
      t.pass(10_000);
      expect(heard.find((m) => m.type === 'error')).toMatchObject({ code: 'match_running' });
      expect(heard.some((m) => m.type === 'welcome')).toBe(false);
      stranger.close();
      t.playOut();
      expectFaithful(t);
    },
    MATCH_TIMEOUT_MS,
  );
});
