// S3's Steam build as the app under test (STEAM.md §7.3, S3.5), in the spike's shape (`App`),
// so the scenarios run on it unchanged. It has no control window: it is driven through its game
// page — `window.bollfortHost` and the page's own buttons — and read from its `start.log`.
import { chromium, type Browser, type Page } from 'playwright';

import { within, type AppState, type AppUnderTest } from './app.js';
import { sleep, type Machine } from './machines.js';

/** The build's log, rewritten at each start: in the app's data folder on Linux. */
const LOG = '~/.config/Bollfort/start.log';

/** What `bollfortHost.steamStats()` gives, with the lobby. */
interface Stats {
  sentPackets: number;
  sendFailures: number;
  largestPacket: number;
  guestLinksDialled: number;
  rtt: number | null;
  rttMax: number | null;
  rttSum: number;
  rttCount: number;
  lobby: string | null;
}

/**
 * A function passed to the page goes as text: tsx's `__name` helper is not there (2026-11-09).
 * Steam's state, the traffic, the room's code shown and whether a match is on screen.
 */
const READ = `(async () => {
  const host = window.bollfortHost;
  if (host === undefined) return null;
  const [steam, stats] = await Promise.all([host.steam(), host.steamStats()]);
  const code = document.querySelector('#room-code');
  return {
    steam,
    stats,
    room: code === null ? null : code.textContent.trim(),
    inMatch: document.querySelector('canvas') !== null && document.querySelector('.menu') === null,
  };
})()`;

interface Reading {
  steam: { ready: boolean; name: string | null; steamId: string | null; error: string | null };
  stats: Stats | null;
  room: string | null;
  inMatch: boolean;
}

export class SteamApp implements AppUnderTest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  /** Links dialled when a match was first seen: past it, each is a rejoin. */
  private dialledAtMatch: number | null = null;

  constructor(
    readonly machine: Machine,
    readonly label: string,
  ) {}

  async start(args: readonly string[]): Promise<void> {
    await this.machine.stop();
    this.dialledAtMatch = null;
    this.machine.start(args);
    for (let i = 0; i < 60 && this.browser === null; i++) {
      try {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.machine.cdpPort}`);
      } catch {
        await sleep(1000);
      }
    }
    if (this.browser === null) throw new Error(`${this.label}: DevTools never answered`);
    const page = await this.game(60_000);
    if (page === null) throw new Error(`${this.label}: no game page`);
    await page.waitForFunction('window.bollfortHost !== undefined', null, { timeout: 30_000 });
    // Steam up, and its P2P: asked of the bridge, not the menu, which an invite leaves at once.
    const st = await this.state(30_000);
    if (st === null || st.name === null)
      throw new Error(`${this.label}: Steam not initialised: ${st?.initError ?? 'no answer'}`);
  }

  private pages(): Page[] {
    return this.browser?.contexts().flatMap((c) => c.pages()) ?? [];
  }

  private async read(): Promise<Reading | null> {
    const page = this.page;
    if (page === null) return null;
    return within(page.evaluate(READ) as Promise<Reading | null>, 3000, null);
  }

  async state(ms = 10_000): Promise<AppState | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const r = await this.read();
      if (r !== null && r.stats !== null) {
        const s = r.stats;
        if (r.inMatch && this.dialledAtMatch === null) this.dialledAtMatch = s.guestLinksDialled;
        return {
          name: r.steam.name,
          steamId: r.steam.steamId,
          role: 'none',
          lobby: s.lobby,
          room: r.room,
          rtt: s.rtt,
          rttMax: s.rttMax,
          rttMean: s.rttCount === 0 ? null : Math.round(s.rttSum / s.rttCount),
          rttSum: s.rttSum,
          rttCount: s.rttCount,
          // Silences are logged ("the host answers again"), not counted.
          stalls: 0,
          longestStallMs: 0,
          sentPackets: s.sentPackets,
          sendFailures: s.sendFailures,
          largestPacket: s.largestPacket,
          socketsOpened: s.guestLinksDialled,
          socketsOpenedInMatch:
            this.dialledAtMatch === null ? 0 : s.guestLinksDialled - this.dialledAtMatch,
          logFile: LOG,
          initError: r.steam.error,
        };
      }
      await sleep(250);
    }
    return null;
  }

  async call(name: string, ...args: unknown[]): Promise<unknown> {
    const page = this.page;
    if (page === null) throw new Error(`${this.label}: no game page`);
    if (name === 'list') {
      const lobbies = (await page.evaluate('window.bollfortHost.lobbyList()')) as {
        lobby: string;
      }[];
      return lobbies.map((l) => ({ id: l.lobby }));
    }
    if (name === 'join') {
      // As an invite while the game runs on the menu: the page joins the lobby's owner's game.
      const url = new URL(page.url());
      url.searchParams.set('steamLobby', String(args[0]));
      await page.goto(url.toString());
      return null;
    }
    throw new Error(`${this.label}: the Steam build has no ${name}`);
  }

  /** Play, with the lobby's type chosen under it; the lobby's ID once it is made. */
  async host(type: 'friends' | 'public' | 'private'): Promise<string> {
    const page = this.page;
    if (page === null) throw new Error(`${this.label}: no game page`);
    const kind = type === 'private' ? 'invite' : type;
    await page.waitForSelector('#lobby-kind', { state: 'attached', timeout: 30_000 });
    await page.evaluate(`(() => {
      const select = document.querySelector('#lobby-kind');
      select.value = '${kind}';
      select.dispatchEvent(new Event('change'));
    })()`);
    await page.click('#play');
    await page.waitForSelector('#begin', { timeout: 60_000 });
    for (let i = 0; i < 120; i++) {
      const st = await this.state();
      if (st !== null && st.lobby !== null && st.room !== null) return st.lobby;
      await sleep(500);
    }
    throw new Error(`${this.label}: no Steam lobby made`);
  }

  /** The host's Steam code, as its room shows it. */
  async code(): Promise<string | null> {
    return (await this.state())?.room ?? null;
  }

  /** Joins by a code typed into the menu, as a player does. */
  async joinByCode(code: string): Promise<void> {
    const page = this.page;
    if (page === null) throw new Error(`${this.label}: no game page`);
    await page.fill('#code', code);
    await page.click('#join');
  }

  /** The menu's Back to the match, once it shows; false if it never does. */
  async backToMatch(ms = 30_000): Promise<boolean> {
    const page = this.page;
    if (page === null) return false;
    const shown = await within(
      page.waitForSelector('#back-to-match', { timeout: ms }).then(() => true),
      ms + 5000,
      false,
    );
    if (shown) await page.click('#back-to-match');
    return shown;
  }

  async game(ms = 60_000): Promise<Page | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const page = this.pages().find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
      if (page !== undefined) {
        this.page = page;
        return page;
      }
      await sleep(250);
    }
    return null;
  }

  lines(): string[] {
    try {
      return (
        this.machine
          .sh(`cat ${LOG} 2>/dev/null || true`)
          .split('\n')
          // The newline ending the file is no line: counted, it made the next line written skipped
          // by a `from` taken before it (the outage's "answers again", 2026-11-09).
          .filter((l) => l !== '')
      );
    } catch {
      return [];
    }
  }

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
    this.page = null;
    await this.machine.stop();
  }
}
