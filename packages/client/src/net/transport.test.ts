import type { ServerMessage } from '@bollfort/protocol';
import { hashMatchState } from '@bollfort/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeNetwork, type Faults } from './fakeNetwork.js';
import {
  MATCH_TIMEOUT_MS,
  expectFaithful,
  finalHash,
  serverLog,
  table as matchTable,
  type Table,
} from './matchTable.testing.js';

/**
 * Whole matches over the fake network (STEAM.md §7.1, package T), its faults those a carrier
 * may have; the table and what a passing match shows are `matchTable.testing.ts`'s.
 */

/** A table of `people` pages and bots to `players`, started, over a network with `faults`. */
function table(
  people: number,
  players: number,
  faults: Faults,
  seed = 3,
): Table & { network: FakeNetwork } {
  let network: FakeNetwork | null = null;
  const t = matchTable({
    people,
    players,
    seed,
    carrier: (accept) => {
      network = new FakeNetwork((peer) => accept(peer), faults, seed);
      return new Array(people).fill(network.dial);
    },
  });
  return { ...t, network: network! };
}

describe('a match over a transport keeping its contract', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it(
    'ends alike on every page over a quick link',
    () => {
      const t = table(2, 4, { latencyMs: 5, jitterMs: 0 });
      t.playOut();
      expectFaithful(t);
      // People really played through it: their moves crossed the network and landed.
      const players = t.pages.map((p) => p.match.humanPlayer);
      const theirs = [...serverLog(t.recorded, 0).values()]
        .flat()
        .filter((a) => players.includes(a.player));
      expect(theirs.length).toBeGreaterThan(20);
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'ends alike over a slow, uneven link',
    () => {
      // 120 ms one way and up to 150 more, drawn per message: commits arrive in bunches, and a
      // page's moves land several ticks after they were made.
      const t = table(3, 4, { latencyMs: 120, jitterMs: 150 }, 5);
      t.playOut();
      expectFaithful(t);
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'ends alike when links fail mid-match and pages rejoin their seats',
    () => {
      const t = table(2, 3, { latencyMs: 30, jitterMs: 20 }, 7);
      // Into the match, then cut the guest's link, then later the host's; each page opens a
      // new one by itself and rejoins with its token, the server's snapshot its board.
      t.pass(20_000);
      t.network.cut(1);
      t.pass(15_000);
      t.network.cut(0);
      t.playOut();

      expectFaithful(t);
      expect(t.network.links.length).toBeGreaterThanOrEqual(4);
      for (const p of t.pages) {
        expect(p.connection.lost).toBe(false);
        expect(p.since).toBeGreaterThan(0);
      }
    },
    MATCH_TIMEOUT_MS,
  );
});

describe('a carrier breaking the contract', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const commitWithActions = (text: string): boolean => {
    const message = JSON.parse(text) as ServerMessage;
    return message.type === 'commit' && message.actions.length > 0 && message.tick > 600;
  };

  it(
    'is caught by the hash when a commit is lost, and mended by rejoining',
    () => {
      let lost = 0;
      const t = table(1, 3, {
        latencyMs: 20,
        jitterMs: 0,
        // One commit with moves in it lost, once the match is under way.
        drop: (text) => lost === 0 && commitWithActions(text) && ++lost === 1,
      });
      t.playOut();
      const [p] = t.pages;
      expect(lost).toBe(1);
      expect(p!.match.resyncCount).toBe(1);
      expect(p!.match.desynced).toBe(false);
      expect(p!.match.finished).toBe(true);
      expect(hashMatchState(p!.match.state!)).toBe(finalHash(t.recorded));
    },
    MATCH_TIMEOUT_MS,
  );

  it(
    'is caught by the hash when a commit overtakes another, and mended by rejoining',
    () => {
      let overtaken = 0;
      const t = table(1, 3, {
        latencyMs: 20,
        jitterMs: 40,
        // A commit with moves let through ahead of the one before it, so the page plays the
        // earlier tick without them.
        reorder: (text) => overtaken === 0 && commitWithActions(text) && ++overtaken === 1,
      });
      t.playOut();
      const [p] = t.pages;
      expect(overtaken).toBe(1);
      expect(p!.match.resyncCount).toBe(1);
      expect(p!.match.finished).toBe(true);
      expect(hashMatchState(p!.match.state!)).toBe(finalHash(t.recorded));
    },
    MATCH_TIMEOUT_MS,
  );
});
