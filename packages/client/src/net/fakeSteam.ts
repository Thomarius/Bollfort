import type { Peer, Session } from '@bollfort/server/gateway';
import { SteamGuest, SteamHost } from '@bollfort/server/steamP2P';
import { Rng } from '@bollfort/sim';

import type { Dial } from './transport.js';

/**
 * Steam between machines, in memory, for the transport suite (STEAM.md §7.3, S3.1): each
 * machine a Steam ID with the desktop app's two ends of `steamP2P.ts`, the packets between
 * them carried as Steam's old P2P carries reliable sends — in order, after a latency, the
 * first contact between two machines slow — and as it was measured to fail (§3.3): a machine
 * cut off has its packets held, and delivered if it is back soon enough; after `failAfterMs`
 * of silence Steam gives the session up at both ends, and what was held is lost.
 *
 * Timed by `setTimeout`, for fake timers; jitter from a seeded stream.
 */
export interface SteamFaults {
  latencyMs: number;
  jitterMs: number;
  /** Extra for the first packet between two machines: 3.8–4.1 s measured. */
  firstContactMs: number;
  /** Silence before Steam gives a session up: some 20 s measured. */
  failAfterMs: number;
  /** The guest's wait for the host's answer before its link fails. */
  openWaitMs: number;
}

export const STEAM_AS_MEASURED: SteamFaults = {
  latencyMs: 20,
  jitterMs: 10,
  firstContactMs: 4000,
  failAfterMs: 20_000,
  openWaitMs: 10_000,
};

interface Machine {
  steamId: string;
  online: boolean;
  /** A restarted app's ends replace the old ones, whose packets are then nobody's. */
  life: number;
  host: SteamHost | null;
  guest: SteamGuest;
}

/** Packets between two machines, one way: in order, held while either is off the network. */
interface Lane {
  from: Machine;
  to: Machine;
  /** Whether Steam has a session for the pair; the first packet without one waits longer. */
  session: boolean;
  /** The latest a packet is due, so none overtakes another. */
  dueAt: number;
  held: Uint8Array[];
  /** Steam giving the session up, while packets are held. */
  failTimer: ReturnType<typeof setTimeout> | null;
}

export class FakeSteam {
  private readonly machines = new Map<string, Machine>();
  private readonly lanes = new Map<string, Lane>();
  private readonly rng: Rng;
  /** Sessions Steam gave up, for the tests to see an outage really broke one. */
  failures = 0;

  constructor(
    private readonly faults: SteamFaults = STEAM_AS_MEASURED,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
  }

  /** A machine running the Steam build, its server's door `accept` if it hosts. */
  machine(steamId: string, accept?: (peer: Peer, steamId: string) => Session): void {
    const m: Machine = {
      steamId,
      online: true,
      life: 0,
      host: null,
      guest: null as unknown as SteamGuest,
    };
    this.machines.set(steamId, m);
    this.ends(m, accept);
  }

  /** A guest's dial, its address ignored for the host's Steam ID: the page's `dialSteam`. */
  dialFrom(steamId: string, host: string): Dial {
    return (_address, events) => this.at(steamId).guest.dial(host, events);
  }

  /** The machine off the network, or back on it. */
  setOnline(steamId: string, online: boolean): void {
    const m = this.at(steamId);
    if (m.online === online) return;
    m.online = online;
    if (online) for (const lane of this.lanes.values()) this.flush(lane);
  }

  /**
   * The app killed and started again: its old ends gone without a word, new ones counting
   * their links from the start. The host does not hear of it until Steam gives up on the
   * session, or the new app opens a link of the same number.
   */
  restart(steamId: string): void {
    const m = this.at(steamId);
    m.life++;
    this.ends(m, undefined);
  }

  private ends(m: Machine, accept?: (peer: Peer, steamId: string) => Session): void {
    const life = m.life;
    const send = (to: string, packet: Uint8Array): boolean => {
      if (m.life !== life) return true;
      this.send(m, this.at(to), packet);
      return true;
    };
    if (accept !== undefined) m.host = new SteamHost(send, accept);
    // A new app counts its links from somewhere else, as the desktop app's random start does.
    m.guest = new SteamGuest(send, this.faults.openWaitMs, undefined, life * 1_000_000 + 1);
  }

  private at(steamId: string): Machine {
    const m = this.machines.get(steamId);
    if (m === undefined) throw new Error(`no machine ${steamId}`);
    return m;
  }

  private lane(from: Machine, to: Machine): Lane {
    const key = `${from.steamId}>${to.steamId}`;
    let lane = this.lanes.get(key);
    if (lane === undefined) {
      lane = { from, to, session: false, dueAt: 0, held: [], failTimer: null };
      this.lanes.set(key, lane);
    }
    return lane;
  }

  private send(from: Machine, to: Machine, packet: Uint8Array): void {
    const lane = this.lane(from, to);
    lane.held.push(packet.slice());
    this.flush(lane);
  }

  /** Sends what is held, if both machines are on the network; else Steam's clock runs. */
  private flush(lane: Lane): void {
    if (lane.held.length === 0) return;
    if (!lane.from.online || !lane.to.online) {
      lane.failTimer ??= setTimeout(() => this.fail(lane), this.faults.failAfterMs);
      return;
    }
    if (lane.failTimer !== null) {
      clearTimeout(lane.failTimer);
      lane.failTimer = null;
    }
    const { latencyMs, jitterMs, firstContactMs } = this.faults;
    for (const packet of lane.held.splice(0)) {
      const wait =
        latencyMs + this.rng.nextFloat() * jitterMs + (lane.session ? 0 : firstContactMs);
      // A session is the pair's, both ways: the answer does not wait as long again.
      lane.session = true;
      this.lane(lane.to, lane.from).session = true;
      lane.dueAt = Math.max(Date.now() + wait, lane.dueAt);
      const life = lane.to.life;
      setTimeout(() => {
        // Gone on the way: the receiving app was started again, or Steam lost the session.
        if (lane.to.life !== life || !lane.session) return;
        if (!lane.to.online || !lane.from.online) {
          lane.held.unshift(packet);
          this.flush(lane);
          return;
        }
        lane.to.host?.receive(lane.from.steamId, packet);
        lane.to.guest.receive(lane.from.steamId, packet);
      }, lane.dueAt - Date.now());
    }
  }

  /** Steam gives the session up: both ways' packets lost, both ends told. */
  private fail(lane: Lane): void {
    lane.failTimer = null;
    if (lane.held.length === 0) return;
    this.failures++;
    const back = this.lane(lane.to, lane.from);
    for (const l of [lane, back]) {
      l.held = [];
      l.session = false;
      if (l.failTimer !== null) clearTimeout(l.failTimer);
      l.failTimer = null;
    }
    for (const [m, other] of [
      [lane.from, lane.to],
      [lane.to, lane.from],
    ] as const) {
      m.host?.sessionFailed(other.steamId);
      m.guest.sessionFailed(other.steamId);
    }
  }
}
