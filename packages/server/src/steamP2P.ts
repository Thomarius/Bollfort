import type { Peer, Session } from './gateway.js';

/**
 * Links over Steam's peer-to-peer channel (STEAM.md §7.3, S3.1): the transport of §7.1 with
 * Steam's old P2P, reliable sends, beneath it. The host's end hands each link to the server's
 * `Gateway` as a `Peer`, with the Steam ID Steam stamped on its packets; the guest's end is a
 * dial whose address is the host's Steam ID. Both live in the desktop app's main process,
 * which owns `steamworks.js`; the page reaches the guest's end through its preload.
 *
 * Written without Node or Steam, so the client's transport suite plays whole matches over it
 * with a fake Steam in between (`fakeSteam.ts`). Steam IDs are decimal strings here, as the
 * protocol carries them; the main process turns them into the binding's bigints.
 *
 * Many links may share one pair of machines — a page's rejoin opens another while the server
 * may not yet have heard the last go — so every packet names its link: `[kind u8][link u32
 * LE][text as UTF-8]`. A message is always one packet: a reliable send takes up to 1 MB, the
 * largest message (`maxTournamentBytes`, 256 K characters, three bytes at most each) less.
 */

/** Sends one packet to a Steam ID, reliably and in order; false if Steam would not take it. */
export type P2PSend = (to: string, packet: Uint8Array) => boolean;

/**
 * What each packet is. The two directions have kinds of their own, so one app — every Steam
 * build runs a server, and may be a guest elsewhere — tells whose end a packet is for.
 */
export const FRAME = {
  /** Guest to host: open this link. */
  open: 1,
  /** Guest to host: a message. */
  toHost: 2,
  /** Guest to host: the guest has closed this link. */
  closedByGuest: 3,
  /** Guest to host: where is your game? Its number in place of a link's. */
  ask: 4,
  /** Guest to host: a ping, its text the guest's to read back. */
  ping: 5,
  /** Host to guest: the link is open, the server holds it. */
  opened: 11,
  /** Host to guest: a message. */
  toGuest: 12,
  /** Host to guest: the host has closed this link, or never knew it. */
  closedByHost: 13,
  /** Host to guest: the answer to an ask, of the same number — the host's `here`, or empty. */
  here: 14,
  /** Host to guest: a ping's answer, its text the ping's. */
  pong: 15,
} as const;
export type FrameKind = (typeof FRAME)[keyof typeof FRAME];

const KINDS = new Set<number>(Object.values(FRAME));

/** What one reliable send takes, Steam's limit (`steamworks.js`, `SendType.Reliable`). */
export const MAX_PACKET_BYTES = 1024 * 1024;

const HEAD = 5;
const encoder = new TextEncoder();

export function encodeFrame(kind: FrameKind, link: number, text = ''): Uint8Array {
  const body = encoder.encode(text);
  const packet = new Uint8Array(HEAD + body.length);
  const view = new DataView(packet.buffer);
  view.setUint8(0, kind);
  view.setUint32(1, link >>> 0, true);
  packet.set(body, HEAD);
  return packet;
}

export interface Frame {
  kind: FrameKind;
  link: number;
  text: string;
}

/** A packet as sent by `encodeFrame`, or null for anything else: another app's, or garbage. */
export function decodeFrame(packet: Uint8Array): Frame | null {
  if (packet.length < HEAD) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const kind = view.getUint8(0);
  if (!KINDS.has(kind)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(packet.subarray(HEAD));
  } catch {
    return null;
  }
  return { kind: kind as FrameKind, link: view.getUint32(1, true), text };
}

/** Sends a frame, refusing one over Steam's limit rather than handing it to Steam. */
function sendFrame(send: P2PSend, to: string, kind: FrameKind, link: number, text = ''): boolean {
  const packet = encodeFrame(kind, link, text);
  if (packet.length > MAX_PACKET_BYTES) return false;
  return send(to, packet);
}

interface HostLink {
  session: Session | null;
  open: boolean;
}

/**
 * The host's end: every guest's links, each a `Peer` of the server's, its Steam ID with it.
 * Who may sit at the table is the server's to decide (the gateway and the room), never this.
 */
export class SteamHost {
  private readonly links = new Map<string, HostLink>();

  constructor(
    private readonly send: P2PSend,
    private readonly accept: (peer: Peer, steamId: string) => Session,
    /**
     * What the host answers a guest asking where its game is (S3.3): the room's code and the
     * lobby's ID, as the page set them, or null while it hosts none.
     */
    private readonly here: () => string | null = () => null,
  ) {}

  /** Links open now, for the bench's counters. */
  get size(): number {
    return this.links.size;
  }

  /** A packet from `from`; anything not for the host's end is ignored. */
  receive(from: string, packet: Uint8Array): void {
    const frame = decodeFrame(packet);
    if (frame === null) return;
    const key = `${from}:${frame.link}`;
    switch (frame.kind) {
      case FRAME.open: {
        // The same link again: the guest restarted and counts from the start, and the old
        // one is dead whether or not Steam has said so.
        this.drop(key);
        const entry: HostLink = { session: null, open: true };
        this.links.set(key, entry);
        const peer: Peer = {
          send: (text) => {
            if (!entry.open) return;
            if (!sendFrame(this.send, from, FRAME.toGuest, frame.link, text)) this.end(key, entry);
          },
          close: () => this.end(key, entry),
        };
        entry.session = this.accept(peer, from);
        if (entry.open) sendFrame(this.send, from, FRAME.opened, frame.link);
        return;
      }
      case FRAME.toHost: {
        const entry = this.links.get(key);
        if (entry === undefined) {
          // A link the host does not know — its app started again since — is told so, and
          // the page's rejoin opens a new one.
          sendFrame(this.send, from, FRAME.closedByHost, frame.link);
          return;
        }
        entry.session?.receive(frame.text);
        return;
      }
      case FRAME.closedByGuest:
        this.drop(key);
        return;
      case FRAME.ask:
        sendFrame(this.send, from, FRAME.here, frame.link, this.here() ?? '');
        return;
      case FRAME.ping:
        sendFrame(this.send, from, FRAME.pong, frame.link, frame.text);
        return;
      default:
        return;
    }
  }

  /** Steam gave up on the session with `from`: every link of theirs is gone. */
  sessionFailed(from: string): void {
    for (const key of [...this.links.keys()]) if (key.startsWith(`${from}:`)) this.drop(key);
  }

  /** Every link closed, as the app quits. */
  closeAll(): void {
    for (const [key, entry] of [...this.links]) this.end(key, entry);
  }

  /** Closed from the host's side: the guest told, the server too. */
  private end(key: string, entry: HostLink): void {
    if (!entry.open) return;
    const [from, link] = key.split(':') as [string, string];
    sendFrame(this.send, from, FRAME.closedByHost, Number(link));
    this.drop(key);
  }

  /** Gone, without a word to the guest. */
  private drop(key: string): void {
    const entry = this.links.get(key);
    if (entry === undefined) return;
    this.links.delete(key);
    entry.open = false;
    entry.session?.closed();
  }
}

/** What a link says, as the page's `LinkEvents` (`client/src/net/transport.ts`). */
export interface GuestLinkEvents {
  open(): void;
  message(text: string): void;
  close(): void;
  error(): void;
}

export interface GuestLink {
  send(text: string): void;
  close(): void;
}

export interface Timers {
  setTimeout(then: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (then, ms) => setTimeout(then, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

interface Asking {
  host: string;
  answer: (text: string | null) => void;
  timer: unknown;
}

interface GuestEntry {
  host: string;
  events: GuestLinkEvents;
  state: 'opening' | 'open' | 'closed';
  /** Messages the page sent before the host answered, in order. */
  queue: string[];
  timer: unknown;
}

/**
 * The guest's end: links to hosts, by their Steam IDs. A link opens only once the host has
 * answered: Steam takes 3.8–4.1 s to set up a session between two machines (STEAM.md §3.3),
 * and the page's own wait for the server's welcome must not run out before it. A host that
 * does not answer within `openWaitMs` fails the link, as a socket that cannot connect does.
 */
export class SteamGuest {
  private readonly links = new Map<number, GuestEntry>();
  private readonly asking = new Map<number, Asking>();
  private next: number;

  constructor(
    private readonly send: P2PSend,
    private readonly openWaitMs: number,
    private readonly timers: Timers = realTimers,
    /**
     * The first link's number. The app starts from a random one, so a restarted app's links are
     * not taken for its last life's, whose packets may still be on their way.
     */
    first = 1,
  ) {
    this.next = first;
  }

  /** Links open or opening, for the bench's counters. */
  get size(): number {
    return this.links.size;
  }

  /** Links ever dialled, for the bench: past the first, each is a rejoin. */
  dialled = 0;

  /** Told of each pong: the host, and the round trip in milliseconds. */
  onPong: ((host: string, ms: number) => void) | null = null;

  /** Pings every host this end has a link open to, timed by `now`. */
  ping(now: number): void {
    const hosts = new Set<string>();
    for (const entry of this.links.values()) if (entry.state === 'open') hosts.add(entry.host);
    for (const host of hosts) sendFrame(this.send, host, FRAME.ping, 0, String(now));
  }

  /** Opens a link to the host with this Steam ID: a `Dial` of the page's, in shape. */
  dial(host: string, events: GuestLinkEvents): GuestLink {
    const link = this.next++ >>> 0;
    this.dialled++;
    const entry: GuestEntry = { host, events, state: 'opening', queue: [], timer: null };
    this.links.set(link, entry);
    entry.timer = this.timers.setTimeout(() => {
      if (entry.state !== 'opening') return;
      sendFrame(this.send, host, FRAME.closedByGuest, link);
      this.fail(link, entry);
    }, this.openWaitMs);
    if (!sendFrame(this.send, host, FRAME.open, link)) {
      // Never from inside `dial`: the caller holds the link before hearing anything on it.
      this.timers.clearTimeout(entry.timer);
      entry.timer = this.timers.setTimeout(() => this.fail(link, entry), 0);
    }
    return {
      send: (text) => {
        if (entry.state === 'opening') entry.queue.push(text);
        else if (entry.state === 'open' && !sendFrame(this.send, host, FRAME.toHost, link, text)) {
          sendFrame(this.send, host, FRAME.closedByGuest, link);
          this.closed(link, entry);
        }
      },
      close: () => {
        if (entry.state === 'closed') return;
        sendFrame(this.send, host, FRAME.closedByGuest, link);
        this.forget(link, entry);
      },
    };
  }

  /**
   * Asks a host where its game is (S3.3): the host's `here`, or null if it hosts none, or does
   * not answer within `openWaitMs` — no app of ours there, or no way through.
   */
  ask(host: string): Promise<string | null> {
    return new Promise((resolve) => {
      const number = this.next++ >>> 0;
      const asking: Asking = {
        host,
        answer: (text) => {
          this.timers.clearTimeout(asking.timer);
          this.asking.delete(number);
          resolve(text);
        },
        timer: null,
      };
      asking.timer = this.timers.setTimeout(() => asking.answer(null), this.openWaitMs);
      this.asking.set(number, asking);
      if (!sendFrame(this.send, host, FRAME.ask, number)) asking.answer(null);
    });
  }

  /** A packet from `from`; anything not for a guest's end, or from another host, is ignored. */
  receive(from: string, packet: Uint8Array): void {
    const frame = decodeFrame(packet);
    if (frame === null) return;
    if (frame.kind === FRAME.pong) {
      const sent = Number(frame.text);
      if (Number.isFinite(sent)) this.onPong?.(from, Date.now() - sent);
      return;
    }
    if (frame.kind === FRAME.here) {
      const asking = this.asking.get(frame.link);
      if (asking !== undefined && asking.host === from) asking.answer(frame.text || null);
      return;
    }
    const entry = this.links.get(frame.link);
    if (entry === undefined) {
      // A link this end has given up on — its open answered after the wait ran out, held by
      // an outage — or an app before this one opened: the host is told, and lets it go.
      if (frame.kind === FRAME.opened || frame.kind === FRAME.toGuest)
        sendFrame(this.send, from, FRAME.closedByGuest, frame.link);
      return;
    }
    if (entry.host !== from) return;
    switch (frame.kind) {
      case FRAME.opened: {
        if (entry.state !== 'opening') return;
        entry.state = 'open';
        this.timers.clearTimeout(entry.timer);
        entry.events.open();
        for (const text of entry.queue.splice(0)) {
          if (entry.state !== 'open') return;
          if (!sendFrame(this.send, from, FRAME.toHost, frame.link, text)) {
            this.closed(frame.link, entry);
            return;
          }
        }
        return;
      }
      case FRAME.toGuest:
        if (entry.state === 'open') entry.events.message(frame.text);
        return;
      case FRAME.closedByHost:
        if (entry.state === 'opening') this.fail(frame.link, entry);
        else this.closed(frame.link, entry);
        return;
      default:
        return;
    }
  }

  /** Steam gave up on the session with `host`: every link to it is gone. */
  sessionFailed(host: string): void {
    for (const [link, entry] of [...this.links]) {
      if (entry.host !== host) continue;
      if (entry.state === 'opening') this.fail(link, entry);
      else this.closed(link, entry);
    }
  }

  /** Every link closed, as the app quits. */
  closeAll(): void {
    for (const [link, entry] of [...this.links]) {
      sendFrame(this.send, entry.host, FRAME.closedByGuest, link);
      this.forget(link, entry);
    }
  }

  private fail(link: number, entry: GuestEntry): void {
    if (entry.state === 'closed') return;
    this.forget(link, entry);
    entry.events.error();
    entry.events.close();
  }

  private closed(link: number, entry: GuestEntry): void {
    if (entry.state === 'closed') return;
    this.forget(link, entry);
    entry.events.close();
  }

  private forget(link: number, entry: GuestEntry): void {
    entry.state = 'closed';
    entry.queue = [];
    this.timers.clearTimeout(entry.timer);
    this.links.delete(link);
  }
}
