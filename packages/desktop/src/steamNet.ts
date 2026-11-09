import { randomInt } from 'node:crypto';

import type { Peer, Session } from '@bollfort/server';
import { SteamGuest, SteamHost } from '@bollfort/server/steamP2P';
import type * as Steamworks from 'steamworks.js';
import type { callback, networking } from 'steamworks.js/client.js';

/**
 * Steam's P2P under the Steam build (STEAM.md §7.3, S3.1): `steamworks.js`'s old P2P calls
 * and callbacks wired to the two ends of `steamP2P.ts` — the host's, handing guests' links to
 * this app's own server, and the guest's, which the page dials through its preload. Not
 * tested here: it needs Steam. The ends are tested on a fake Steam; this is run on the bench.
 */

type Client = ReturnType<typeof Steamworks.init>;

/** Reliable sends: in order, resent until Steam gives the session up (`SendType.Reliable`). */
const RELIABLE = 2;
/** `steamworks.js`'s callbacks by number (`client.callback.SteamCallback`), a const enum. */
const P2P_SESSION_REQUEST = 6 as callback.SteamCallback.P2PSessionRequest;
const P2P_SESSION_CONNECT_FAIL = 7 as callback.SteamCallback.P2PSessionConnectFail;
/** How often packets are read: a commit comes thirty times a second (the spike's 2 ms). */
const POLL_MS = 2;
/** The guest's wait for the host's answer, past Steam's 4 s first contact (§3.3). */
const OPEN_WAIT_MS = 10_000;

/** What the bench reads (§3.4): the traffic and its failures. */
export interface SteamNetStats {
  sentPackets: number;
  sentBytes: number;
  largestPacket: number;
  sendFailures: number;
  readPackets: number;
  readBytes: number;
  sessionFailures: number;
  hostLinks: number;
  guestLinks: number;
  /** Links this app's page has dialled: past the first in a match, each is a rejoin. */
  guestLinksDialled: number;
  /** Round trips to the host, from pings every `PING_MS`: the last, the highest, the sum. */
  rtt: number | null;
  rttMax: number | null;
  rttSum: number;
  rttCount: number;
}

/** How often a guest pings the hosts it has links to, for the round trip and silences. */
const PING_MS = 2000;
/** A host silent longer than this, then answering, is logged as back (the bench's outage). */
const SILENCE_MS = 5000;

export interface SteamNet {
  readonly guest: SteamGuest;
  stats(): SteamNetStats;
  stop(): void;
}

export function startSteamNet(
  client: Client,
  accept: (peer: Peer, steamId: string) => Session,
  log: (line: string) => void,
  /** The host's answer to a guest asking where its game is (`SteamLobby.here`). */
  here: () => string | null = () => null,
): SteamNet {
  const counts = {
    sentPackets: 0,
    sentBytes: 0,
    largestPacket: 0,
    sendFailures: 0,
    readPackets: 0,
    readBytes: 0,
    sessionFailures: 0,
    rtt: null as number | null,
    rttMax: null as number | null,
    rttSum: 0,
    rttCount: 0,
  };
  const send = (to: string, packet: Uint8Array): boolean => {
    let ok = false;
    try {
      ok = client.networking.sendP2PPacket(BigInt(to), RELIABLE, Buffer.from(packet));
    } catch (e) {
      log(`P2P send to ${to}: ${(e as Error).message}`);
    }
    counts.sentPackets++;
    counts.sentBytes += packet.length;
    counts.largestPacket = Math.max(counts.largestPacket, packet.length);
    if (!ok) {
      counts.sendFailures++;
      log(`P2P send failed: ${packet.length} bytes to ${to}`);
    }
    return ok;
  };

  const host = new SteamHost(send, accept, here);
  // From a random number, so a restarted app's links are never taken for its last life's.
  const guest = new SteamGuest(send, OPEN_WAIT_MS, undefined, randomInt(1, 0x7fffffff));

  // Anyone may open a session: who sits at the table is the server's to decide (§7.3).
  const request = client.callback.register(P2P_SESSION_REQUEST, ({ remote }) => {
    client.networking.acceptP2PSession(remote);
  });
  const failed = client.callback.register(P2P_SESSION_CONNECT_FAIL, ({ remote, error }) => {
    counts.sessionFailures++;
    log(`P2P session with ${remote} failed (${error})`);
    host.sessionFailed(remote.toString());
    guest.sessionFailed(remote.toString());
  });

  // The round trip to each host, and a host heard again after a silence (the bench's outage).
  const lastPong = new Map<string, number>();
  guest.onPong = (from, ms) => {
    const now = Date.now();
    const last = lastPong.get(from);
    // A silence of minutes is a game left and another joined, not an outage.
    if (last !== undefined && now - last > SILENCE_MS && now - last < 10 * 60_000)
      log(`the host answers again, after ${((now - last) / 1000).toFixed(1)} s`);
    lastPong.set(from, now);
    counts.rtt = ms;
    counts.rttMax = Math.max(counts.rttMax ?? 0, ms);
    counts.rttSum += ms;
    counts.rttCount++;
  };
  const pinging = setInterval(() => guest.ping(Date.now()), PING_MS);

  const poll = setInterval(() => {
    for (;;) {
      const size = client.networking.isP2PPacketAvailable();
      if (!size) return;
      let packet: networking.P2PPacket;
      try {
        packet = client.networking.readP2PPacket(size);
      } catch (e) {
        // Announced but gone (S1 saw it with two apps on one Steam client): read again later.
        log(`P2P read: ${(e as Error).message}`);
        return;
      }
      counts.readPackets++;
      counts.readBytes += packet.size;
      const from = packet.steamId.steamId64.toString();
      const data = new Uint8Array(packet.data.buffer, packet.data.byteOffset, packet.data.length);
      host.receive(from, data);
      guest.receive(from, data);
    }
  }, POLL_MS);

  return {
    guest,
    stats: () => ({
      ...counts,
      hostLinks: host.size,
      guestLinks: guest.size,
      guestLinksDialled: guest.dialled,
    }),
    stop() {
      clearInterval(poll);
      clearInterval(pinging);
      host.closeAll();
      guest.closeAll();
      request.disconnect();
      failed.disconnect();
    },
  };
}
