import type { Peer, Session } from '@bollfort/server/gateway';
import { Rng } from '@bollfort/sim';

import type { Dial, LinkEvents } from './transport.js';

/**
 * How the fake network treats what it carries (STEAM.md §7.1). Latency and jitter keep the
 * transport's contract — every message arrives, in order — and model a slow or uneven
 * carrier. `drop` and `reorder` break it, for the tests that the page notices a broken one by
 * the state hash and mends it by rejoining, rather than playing on wrongly.
 */
export interface Faults {
  /** One way, in milliseconds. */
  latencyMs: number;
  /** Up to this much more, drawn per message; order is still kept. */
  jitterMs: number;
  /** Whether this message, the nth the server has sent on this link, is lost. */
  drop?: (text: string, n: number) => boolean;
  /** Whether it is held back `HOLD_MS`, the messages after it overtaking it. */
  reorder?: (text: string, n: number) => boolean;
}

/** How long a reordered message is held back: several ticks, so the page plays past it. */
export const HOLD_MS = 200;

/** One link through the fake network, both ends of it. */
export interface FakeLink {
  readonly index: number;
  /** Still carrying: neither end has closed it, nor has the network cut it. */
  readonly up: boolean;
  /** Messages the server has sent on it so far. */
  readonly fromServer: number;
}

/**
 * An in-memory network between pages' `ServerConnection`s and a server's `Gateway`, timed by
 * `setTimeout` so that a test under fake timers runs a whole match in moments, exactly the
 * same each time: the jitter is drawn from a seeded stream.
 */
export class FakeNetwork {
  readonly links: FakeLink[] = [];
  private readonly cutters: (() => void)[] = [];
  private readonly rng: Rng;

  constructor(
    private readonly accept: (peer: Peer) => Session,
    private readonly faults: Faults,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
  }

  private delay(): number {
    const { latencyMs, jitterMs } = this.faults;
    return latencyMs + (jitterMs > 0 ? this.rng.nextFloat() * jitterMs : 0);
  }

  /** Opens a link: the server accepts it, and the page hears it open, a latency later. */
  readonly dial: Dial = (_address, events: LinkEvents) => {
    const faults = this.faults;
    const index = this.links.length;
    let up = true;
    let session: Session | null = null;
    let fromServer = 0;
    // The latest a message is due each way, so a later one never lands before it.
    let toServerAt = 0;
    let toPageAt = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (at: number, then: () => void): void => {
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          then();
        },
        Math.max(0, at - Date.now()),
      );
      timers.add(timer);
    };
    const due = (last: number): number => Math.max(Date.now() + this.delay(), last);

    /** Gone at both ends at once, whatever was still on its way lost. */
    const cut = (): void => {
      if (!up) return;
      up = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      session?.closed();
      events.close();
    };
    this.cutters.push(cut);

    const peer: Peer = {
      send: (text) => {
        if (!up) return;
        const n = fromServer++;
        if (faults.drop?.(text, n) === true) return;
        if (faults.reorder?.(text, n) === true) {
          later(due(toPageAt) + HOLD_MS, () => events.message(text));
          return;
        }
        toPageAt = due(toPageAt);
        later(toPageAt, () => events.message(text));
      },
      // The server's close reaches the page after what it sent before it, as on a socket.
      close: () => {
        if (!up) return;
        up = false;
        session?.closed();
        toPageAt = due(toPageAt);
        later(toPageAt, () => events.close());
      },
    };

    const opensAt = due(0);
    toServerAt = opensAt;
    toPageAt = opensAt;
    later(opensAt, () => {
      session = this.accept(peer);
      if (up) events.open();
    });

    this.links.push({
      index,
      get up() {
        return up;
      },
      get fromServer() {
        return fromServer;
      },
    });

    return {
      send: (text) => {
        if (!up) return;
        toServerAt = due(toServerAt);
        later(toServerAt, () => session?.receive(text));
      },
      // The page's close: the server hears of it after what the page sent before it.
      close: () => {
        if (!up) return;
        up = false;
        toServerAt = due(toServerAt);
        later(toServerAt, () => session?.closed());
      },
    };
  };

  /** Cuts a link as a network failing would: both ends told at once, nothing more delivered. */
  cut(index: number): void {
    this.cutters[index]?.();
  }
}
