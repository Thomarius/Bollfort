// The app under test on one machine, behind one shape (STEAM.md 3.4): start, host, join, the
// control and game pages, the log, the counters, stop. First the S1 spike — its control window's
// `window.spike` and its log file; S3's Steam build gets an adapter of the same shape.
import { chromium, type Browser, type Page } from 'playwright';

import { sleep, type Machine } from './machines.js';

/** The spike's State, as its control window receives it every half second. */
export interface AppState {
  name: string | null;
  steamId: string | null;
  role: 'none' | 'host' | 'guest';
  lobby: string | null;
  room: string | null;
  rtt: number | null;
  rttMax: number | null;
  rttMean: number | null;
  rttSum: number;
  rttCount: number;
  stalls: number;
  longestStallMs: number;
  sentPackets: number;
  sendFailures: number;
  largestPacket: number;
  socketsOpened: number;
  socketsOpenedInMatch: number;
  logFile: string | null;
  initError: string | null;
}

/** The app under test as the scenarios drive it: the spike's `App`, or the build's `SteamApp`. */
export interface AppUnderTest {
  readonly machine: Machine;
  readonly label: string;
  start(args: readonly string[]): Promise<void>;
  state(ms?: number): Promise<AppState | null>;
  /** `list` (the public lobbies, `{ id }`) and `join` (a lobby by its ID), as the spike names them. */
  call(name: string, ...args: unknown[]): Promise<unknown>;
  host(type: 'friends' | 'public' | 'private'): Promise<string>;
  game(ms?: number): Promise<Page | null>;
  lines(): string[];
  waitLog(re: RegExp, ms: number, from?: number): Promise<RegExpMatchArray | null>;
  stop(): Promise<void>;
}

/** A promise given up after `ms`: a page across a cut network never answers. */
export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), sleep(ms).then(() => fallback)]);
}

export class App implements AppUnderTest {
  private browser: Browser | null = null;
  private control: Page | null = null;

  constructor(
    readonly machine: Machine,
    readonly label: string,
  ) {}

  /** Starts the app with these arguments and waits for its control window. */
  async start(args: readonly string[]): Promise<void> {
    await this.machine.stop();
    this.machine.start(args);
    for (let i = 0; i < 60 && this.browser === null; i++) {
      try {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.machine.cdpPort}`);
      } catch {
        await sleep(1000);
      }
    }
    if (this.browser === null) throw new Error(`${this.label}: DevTools never answered`);
    for (let i = 0; i < 60 && this.control === null; i++) {
      this.control = this.pages().find((p) => p.url().endsWith('control.html')) ?? null;
      if (this.control === null) await sleep(500);
    }
    if (this.control === null) throw new Error(`${this.label}: no control window`);
    await this.control.waitForLoadState('domcontentloaded');
    await this.control.evaluate(() => {
      const w = window as unknown as {
        spike: { onState: (fn: (s: unknown) => void) => void };
        __state?: unknown;
      };
      w.spike.onState((s) => (w.__state = s));
    });
    const st = await this.state();
    if (st === null || st.name === null)
      throw new Error(`${this.label}: Steam not initialised: ${st?.initError}`);
  }

  private pages(): Page[] {
    return this.browser?.contexts().flatMap((c) => c.pages()) ?? [];
  }

  async state(ms = 10_000): Promise<AppState | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const st = await within(
        this.control!.evaluate(() => (window as unknown as { __state?: unknown }).__state ?? null),
        3000,
        null,
      );
      if (st !== null) return st as AppState;
      await sleep(250);
    }
    return null;
  }

  /** One of the control window's buttons, by the preload's name. */
  call(name: string, ...args: unknown[]): Promise<unknown> {
    return this.control!.evaluate(
      ([n, a]) =>
        (window as unknown as { spike: Record<string, (...x: unknown[]) => unknown> }).spike[
          n as string
        ]!(...(a as unknown[])),
      [name, args] as const,
    );
  }

  /** Hosts a lobby of this type; its ID once the game's room is published in it. */
  async host(type: 'friends' | 'public' | 'private'): Promise<string> {
    await this.call('host', type);
    for (let i = 0; i < 120; i++) {
      const st = await this.state();
      if (st !== null && st.lobby !== null && st.room !== null) return st.lobby;
      await sleep(500);
    }
    throw new Error(`${this.label}: no room published in the lobby`);
  }

  /** The game's window, once open. */
  async game(ms = 60_000): Promise<Page | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const page = this.pages().find((p) => /127\.0\.0\.1:809[01]\//.test(p.url()));
      if (page !== undefined) return page;
      await sleep(250);
    }
    return null;
  }

  /** The app's log, from its file on its machine. */
  lines(): string[] {
    try {
      return this.machine
        .sh(`cat '${this.machine.appDir}'/logs/*.log 2>/dev/null || true`)
        .split('\n');
    } catch {
      return [];
    }
  }

  /** The first line from line `from` on that matches, waiting up to `ms`. */
  async waitLog(re: RegExp, ms: number, from = 0): Promise<RegExpMatchArray | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      for (const line of this.lines().slice(from)) {
        const m = line.match(re);
        if (m !== null) return m;
      }
      await sleep(500);
    }
    return null;
  }

  async stop(): Promise<void> {
    await within(this.browser?.close() ?? Promise.resolve(), 5000, undefined);
    this.browser = null;
    this.control = null;
    await this.machine.stop();
  }
}
