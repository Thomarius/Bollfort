import { Bot } from '@bollfort/ai';
import { defaultConfigBundle, type ConfigBundle } from '@bollfort/config';
import type { RecordingLine, ServerMessage } from '@bollfort/protocol';
import { Gateway, type Peer, type Session } from '@bollfort/server/gateway';
import { RoomManager } from '@bollfort/server/rooms';
import { Rng, hashMatchState, type Action } from '@bollfort/sim';
import { expect, vi } from 'vitest';

import { ServerConnection, type RetryPolicy } from './connection.js';
import { NetworkMatch } from './networkMatch.js';
import type { Dial } from './transport.js';

/**
 * Whole matches between pages and a server over a transport (STEAM.md §7.1, package T): the
 * page's `ServerConnection` and `NetworkMatch`, the server's `Gateway` and rooms, and between
 * them whatever carrier a suite gives — the fake network (`transport.test.ts`), or Steam's P2P
 * over a fake Steam (`steamTransport.test.ts`). A transport passes when the match ends on
 * every page as on the server, no hash ever mismatching, and each page's input log — the
 * commits it played since its last snapshot — is the server's.
 *
 * The people at the table are bots thinking on their own page's board and sending through
 * their connection, so their moves cross the network as a person's do. Run under fake timers.
 */

/** A whole match is 1–2 s alone, several times that under `npm run check`'s load. */
export const MATCH_TIMEOUT_MS = 60_000;

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

const defaultRetry: RetryPolicy = { delaysMs: [200, 500, 1000], tries: 10 };

export interface Page {
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

export interface Table {
  pages: Page[];
  /** The server's recording of the match. */
  recorded: RecordingLine[];
  /** The room's code. */
  code: string;
  /** Lets time pass: the server's ticks, the carrier's deliveries, each page's frame. */
  pass(ms: number): void;
  /** Plays on until every page has the match over, or the limit. */
  playOut(limitMs?: number): void;
  /**
   * Page `index` gone without a word, as an app killed is, and a new one in its place joining
   * the room by its code alone — no token — over `dial`.
   */
  restart(index: number, dial: Dial): Page;
}

export interface TableOptions {
  /** People at the table, the host first; the rest of `players` are bots. */
  people: number;
  players: number;
  seed?: number;
  retry?: RetryPolicy;
  /**
   * The carrier, given the server's door: a dial for each person's page, by their place at
   * the table, the host's first.
   */
  carrier(accept: (peer: Peer, steamId?: string) => Session): Dial[];
  /** Rooms end as their host leaves, as the Steam build's server does (STEAM.md §7.3). */
  endsWithHost?: boolean;
}

function page(name: string, dial: Dial, retry: RetryPolicy): Page {
  const connection = new ServerConnection('fake://server', retry, dial);
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

/** A table of people's pages and bots, started, over the carrier. */
export function table(options: TableOptions): Table {
  const { people, players, seed = 3 } = options;
  const retry = options.retry ?? defaultRetry;
  const recorded: RecordingLine[] = [];
  const rooms = new RoomManager(
    bundle,
    seed,
    () => (line) => recorded.push(line),
    undefined,
    options.endsWithHost === true,
  );
  const gateway = new Gateway(bundle, rooms);
  const dials = options.carrier((peer, steamId) => gateway.accept(peer, steamId));

  const pages: Page[] = [];
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

  const host = page('Ada', dials[0]!, retry);
  pages.push(host);
  host.connection.createRoom('Ada', players);
  pass(500);
  const welcome = host.heard.find((m) => m.type === 'welcome');
  if (welcome?.type !== 'welcome') throw new Error('the host was never welcomed');
  for (let i = 1; i < people; i++) {
    const guest = page(`Guest${i}`, dials[i]!, retry);
    pages.push(guest);
    guest.connection.joinRoom(guest.name, welcome.code);
  }
  // Long enough for Steam's first contact, some 4 s between machines.
  pass(6000);
  for (const guest of pages.slice(1)) guest.connection.send({ type: 'ready', ready: true });
  host.connection.send({ type: 'configure', settings: { maxRounds: 2 } });
  pass(500);
  host.connection.send({ type: 'start' });
  pass(500);

  return {
    pages,
    recorded,
    code: welcome.code,
    pass,
    playOut(limitMs = 30 * 60 * 1000) {
      for (let t = 0; t < limitMs && !pages.every((p) => p.match.finished); t += 1000) pass(1000);
    },
    restart(index, dial) {
      const old = pages[index]!;
      const again = page(old.name, dial, retry);
      pages[index] = again;
      again.connection.joinRoom(again.name, welcome.code);
      return again;
    },
  };
}

/** The server's actions by tick from `since` on, the recording's ticks that had any. */
export function serverLog(
  recorded: readonly RecordingLine[],
  since: number,
): Map<number, Action[]> {
  const log = new Map<number, Action[]>();
  for (const line of recorded)
    if (line.kind === 'tick' && line.t >= since && line.a.length > 0) log.set(line.t, line.a);
  return log;
}

export function finalHash(recorded: readonly RecordingLine[]): string {
  const end = recorded.find((line) => line.kind === 'end');
  if (end?.kind !== 'end') throw new Error('the server never ended the match');
  return end.hash;
}

/** What every passing match shows, on every page. */
export function expectFaithful(t: Table): void {
  const hash = finalHash(t.recorded);
  for (const p of t.pages) {
    expect({ page: p.name, finished: p.match.finished }).toEqual({ page: p.name, finished: true });
    expect({ page: p.name, resyncs: p.match.resyncCount }).toEqual({ page: p.name, resyncs: 0 });
    expect(hashMatchState(p.match.state!)).toBe(hash);
    expect(p.played).toEqual(serverLog(t.recorded, p.since));
  }
}
