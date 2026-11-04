import { Bot } from '@bollfort/ai';
import { defaultConfigBundle, type ConfigBundle } from '@bollfort/config';
import type { RecordingLine, ServerMessage } from '@bollfort/protocol';
import { Gateway } from '@bollfort/server/gateway';
import { RoomManager } from '@bollfort/server/rooms';
import { Rng, hashMatchState, type Action } from '@bollfort/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerConnection, type RetryPolicy } from './connection.js';
import { FakeNetwork, type Faults } from './fakeNetwork.js';
import { NetworkMatch } from './networkMatch.js';

/**
 * Whole matches between pages and a server over a transport (STEAM.md §7.1, package T): the
 * page's `ServerConnection` and `NetworkMatch`, the server's `Gateway` and rooms, and between
 * them a fake network with the faults a carrier may have. A transport passes when the match
 * ends on every page as on the server, no hash ever mismatching, and each page's input log —
 * the commits it played since its last snapshot — is the server's.
 *
 * The people at the table are bots thinking on their own page's board and sending through
 * their connection, so their moves cross the network as a person's do.
 */

/** A whole match is 1–2 s alone, several times that under `npm run check`'s load. */
const MATCH_TIMEOUT_MS = 60_000;

const TICK_MS = 1000 / defaultConfigBundle.ruleset.tickRateHz;

/** Two rounds rather than ten, so a whole match is a few seconds of test. */
const bundle: ConfigBundle = {
  ...defaultConfigBundle,
  ruleset: {
    ...defaultConfigBundle.ruleset,
    scoring: { ...defaultConfigBundle.ruleset.scoring, maxRounds: 2 },
  },
  server: {
    ...defaultConfigBundle.server,
    lobbySettings: {
      ...defaultConfigBundle.server.lobbySettings,
      maxRounds: { ...defaultConfigBundle.server.lobbySettings.maxRounds, min: 1 },
    },
  },
};

const retry: RetryPolicy = { delaysMs: [200, 500, 1000], tries: 10 };

interface Page {
  name: string;
  connection: ServerConnection;
  match: NetworkMatch;
  bot: Bot | null;
  rng: Rng;
  /** Commits heard since the last snapshot, by tick, those with actions. */
  played: Map<number, Action[]>;
  /** The tick of the last snapshot, the start of `played`. */
  since: number;
  heard: ServerMessage[];
}

interface Table {
  network: FakeNetwork;
  pages: Page[];
  /** The server's recording of the match. */
  recorded: RecordingLine[];
  /** Lets time pass: the server's ticks, the network's deliveries, each page's frame. */
  pass(ms: number): void;
  /** Plays on until every page has the match over, or the limit. */
  playOut(limitMs?: number): void;
}

function page(name: string, network: FakeNetwork): Page {
  const connection = new ServerConnection('fake://server', retry, network.dial);
  const match = new NetworkMatch(connection);
  const p: Page = {
    name,
    connection,
    match,
    bot: null,
    rng: new Rng(name.length * 977 + name.charCodeAt(0)),
    played: new Map(),
    since: 0,
    heard: [],
  };
  connection.onMessage((message) => {
    p.heard.push(message);
    match.receive(message);
    if (message.type === 'snapshot') {
      p.played.clear();
      p.since = message.snapshot.tick;
    }
    if (message.type === 'commit' && message.actions.length > 0)
      p.played.set(message.tick, message.actions);
  });
  // In a match a dropped link is rejoined, as the match screen asks.
  connection.rejoinWhile(() => match.ready);
  void connection.connect().catch(() => undefined);
  return p;
}

/** A table of `people` pages and bots to `players`, started, over a network with `faults`. */
function table(people: number, players: number, faults: Faults, seed = 3): Table {
  const recorded: RecordingLine[] = [];
  const rooms = new RoomManager(bundle, seed, () => (line) => recorded.push(line));
  const gateway = new Gateway(bundle, rooms);
  const network = new FakeNetwork((peer) => gateway.accept(peer), faults, seed);

  const pass = (ms: number): void => {
    for (let left = ms; left > 0; left -= TICK_MS) {
      rooms.update(TICK_MS);
      vi.advanceTimersByTime(TICK_MS);
      for (const p of pages) {
        p.match.advance(TICK_MS);
        const state = p.match.state;
        if (p.bot === null && state !== null && p.match.humanPlayer >= 0)
          p.bot = new Bot(p.match.humanPlayer, undefined, bundle.ai, undefined, {
            plansAhead: false,
          });
        if (p.bot === null || state === null || p.match.finished) continue;
        const action = p.bot.think(state, p.rng);
        if (action !== null) p.match.submit(action);
      }
    }
  };

  const host = page('Ada', network);
  const pages = [host];
  host.connection.createRoom('Ada', players);
  pass(500);
  const welcome = host.heard.find((m) => m.type === 'welcome');
  if (welcome?.type !== 'welcome') throw new Error('the host was never welcomed');
  for (let i = 1; i < people; i++) {
    const guest = page(`Guest${i}`, network);
    pages.push(guest);
    guest.connection.joinRoom(guest.name, welcome.code);
  }
  pass(500);
  for (const guest of pages.slice(1)) guest.connection.send({ type: 'ready', ready: true });
  host.connection.send({ type: 'configure', settings: { maxRounds: 2 } });
  pass(500);
  host.connection.send({ type: 'start' });
  pass(500);

  return {
    network,
    pages,
    recorded,
    pass,
    playOut(limitMs = 30 * 60 * 1000) {
      for (let t = 0; t < limitMs && !pages.every((p) => p.match.finished); t += 1000) pass(1000);
    },
  };
}

/** The server's actions by tick from `since` on, the recording's ticks that had any. */
function serverLog(recorded: readonly RecordingLine[], since: number): Map<number, Action[]> {
  const log = new Map<number, Action[]>();
  for (const line of recorded)
    if (line.kind === 'tick' && line.t >= since && line.a.length > 0) log.set(line.t, line.a);
  return log;
}

function finalHash(recorded: readonly RecordingLine[]): string {
  const end = recorded.find((line) => line.kind === 'end');
  if (end?.kind !== 'end') throw new Error('the server never ended the match');
  return end.hash;
}

/** What every passing match shows, on every page. */
function expectFaithful(t: Table): void {
  const hash = finalHash(t.recorded);
  for (const p of t.pages) {
    expect({ page: p.name, finished: p.match.finished }).toEqual({ page: p.name, finished: true });
    expect({ page: p.name, resyncs: p.match.resyncCount }).toEqual({ page: p.name, resyncs: 0 });
    expect(hashMatchState(p.match.state!)).toBe(hash);
    expect(p.played).toEqual(serverLog(t.recorded, p.since));
  }
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
