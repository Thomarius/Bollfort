import { describe, expect, it, vi } from 'vitest';

import type { Peer, Session } from './gateway.js';
import {
  FRAME,
  MAX_PACKET_BYTES,
  SteamGuest,
  SteamHost,
  decodeFrame,
  encodeFrame,
  type GuestLinkEvents,
} from './steamP2P.js';

const HOST = '76561198000000001';
const GUEST = '76561198000000002';

describe('frames', () => {
  it('carry their kind, link and text, any UTF-8 included', () => {
    const packet = encodeFrame(FRAME.toHost, 0xfffffffe, 'Größe ⚔');
    expect(decodeFrame(packet)).toEqual({ kind: FRAME.toHost, link: 0xfffffffe, text: 'Größe ⚔' });
  });

  it('turn away what is not one of ours', () => {
    expect(decodeFrame(new Uint8Array([1, 0, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([99, 0, 0, 0, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([2, 0, 0, 0, 0, 0xff]))).toBeNull();
  });
});

/**
 * Two machines wired straight together: each packet handed over at once unless held, so a
 * test can see what is on its way.
 */
function wire() {
  const sessions: { steamId: string; peer: Peer; heard: string[]; closed: number }[] = [];
  const sent: { from: string; to: string; packet: Uint8Array }[] = [];
  let cut = false;
  const host = new SteamHost(
    (to, packet) => {
      sent.push({ from: HOST, to, packet });
      if (!cut) guest.receive(HOST, packet);
      return true;
    },
    (peer, steamId): Session => {
      const s = { steamId, peer, heard: [] as string[], closed: 0 };
      sessions.push(s);
      return { receive: (text) => s.heard.push(text), closed: () => s.closed++ };
    },
  );
  const guest = new SteamGuest((to, packet) => {
    sent.push({ from: GUEST, to, packet });
    if (!cut) host.receive(GUEST, packet);
    return true;
  }, 10_000);
  return {
    host,
    guest,
    sessions,
    sent,
    cut: (on: boolean) => {
      cut = on;
    },
  };
}

function events() {
  const said: string[] = [];
  const e: GuestLinkEvents = {
    open: () => said.push('open'),
    message: (text) => said.push(`message ${text}`),
    close: () => said.push('close'),
    error: () => said.push('error'),
  };
  return { said, e };
}

describe('a link over P2P', () => {
  it('opens once the host has answered, with the guest’s Steam ID on the server’s side', () => {
    const w = wire();
    const { said, e } = events();
    const link = w.guest.dial(HOST, e);
    expect(said).toEqual(['open']);
    expect(w.sessions.map((s) => s.steamId)).toEqual([GUEST]);
    link.send('hello');
    w.sessions[0]!.peer.send('welcome');
    expect(w.sessions[0]!.heard).toEqual(['hello']);
    expect(said).toEqual(['open', 'message welcome']);
  });

  it('keeps what the page sent before the answer, in order', () => {
    const w = wire();
    w.cut(true);
    const { said, e } = events();
    const link = w.guest.dial(HOST, e);
    link.send('one');
    link.send('two');
    expect(said).toEqual([]);
    // The open arrives late, as Steam's first contact does, and the host answers it.
    w.cut(false);
    w.host.receive(GUEST, w.sent.find((p) => p.from === GUEST)!.packet);
    expect(said).toEqual(['open']);
    expect(w.sessions[0]!.heard).toEqual(['one', 'two']);
  });

  it('fails when the host does not answer in time, as a socket that cannot connect', () => {
    vi.useFakeTimers();
    try {
      const w = wire();
      w.cut(true);
      const { said, e } = events();
      w.guest.dial(HOST, e);
      vi.advanceTimersByTime(9_999);
      expect(said).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(said).toEqual(['error', 'close']);
      expect(w.guest.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes at both ends from either side', () => {
    const w = wire();
    const a = events();
    const linkA = w.guest.dial(HOST, a.e);
    linkA.close();
    expect(w.sessions[0]!.closed).toBe(1);
    expect(w.host.size).toBe(0);

    const b = events();
    w.guest.dial(HOST, b.e);
    w.sessions[1]!.peer.close();
    expect(b.said).toEqual(['open', 'close']);
    expect(w.sessions[1]!.closed).toBe(1);
  });

  it('ends every link with a host Steam gave up on, at both ends', () => {
    const w = wire();
    const { said, e } = events();
    w.guest.dial(HOST, e);
    w.guest.dial(HOST, events().e);
    w.guest.sessionFailed(HOST);
    w.host.sessionFailed(GUEST);
    expect(said).toEqual(['open', 'close']);
    expect(w.sessions.map((s) => s.closed)).toEqual([1, 1]);
    expect(w.guest.size + w.host.size).toBe(0);
  });

  it('takes a restarted guest’s link of the same number as new, the old one closed', () => {
    const w = wire();
    w.guest.dial(HOST, events().e);
    // The app again, counting its links from 1 as before.
    const again = new SteamGuest((_to, packet) => {
      w.host.receive(GUEST, packet);
      return true;
    }, 10_000);
    again.dial(HOST, events().e);
    expect(w.sessions.map((s) => s.closed)).toEqual([1, 0]);
    expect(w.host.size).toBe(1);
  });

  it('tells a guest whose link the host no longer knows, so its page rejoins', () => {
    const w = wire();
    const { said, e } = events();
    const link = w.guest.dial(HOST, e);
    // The host's app started again: none of its links survive.
    w.host.sessionFailed(GUEST);
    link.send('anyone?');
    expect(said).toEqual(['open', 'close']);
  });

  it('refuses a message over Steam’s limit by closing its link, not by sending it', () => {
    const w = wire();
    const { said, e } = events();
    w.guest.dial(HOST, e);
    w.sessions[0]!.peer.send('x'.repeat(MAX_PACKET_BYTES));
    expect(said).toEqual(['open', 'close']);
    expect(w.sessions[0]!.closed).toBe(1);
  });

  it('ignores packets for its links from anyone but their host', () => {
    const w = wire();
    const { said, e } = events();
    w.guest.dial(HOST, e);
    w.guest.receive('76561198000000003', encodeFrame(FRAME.toGuest, 1, 'not yours'));
    w.guest.receive('76561198000000003', encodeFrame(FRAME.closedByHost, 1));
    expect(said).toEqual(['open']);
  });
});

describe('asking a host where its game is', () => {
  function pair(here: string | null, reachable = true) {
    const at: { host: SteamHost | null } = { host: null };
    const guest = new SteamGuest((_to, packet) => {
      if (reachable) at.host?.receive(GUEST, packet);
      return true;
    }, 10_000);
    at.host = new SteamHost(
      (_to, packet) => {
        guest.receive(HOST, packet);
        return true;
      },
      () => {
        throw new Error('no link is opened by asking');
      },
      () => here,
    );
    return guest;
  }

  it('is answered with what the host says', async () => {
    await expect(pair('{"room":"ABCDEF"}').ask(HOST)).resolves.toBe('{"room":"ABCDEF"}');
  });

  it('is answered with nothing while the host hosts no game', async () => {
    await expect(pair(null).ask(HOST)).resolves.toBeNull();
  });

  it('gives up on a host that does not answer', async () => {
    vi.useFakeTimers();
    try {
      const asked = pair('x', false).ask(HOST);
      vi.advanceTimersByTime(10_000);
      await expect(asked).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a ping', () => {
  it('is answered by every host a link is open to, its round trip told', () => {
    const w = wire();
    const heard: string[] = [];
    w.guest.onPong = (host, ms) => heard.push(`${host} ${ms >= 0}`);
    w.guest.ping(Date.now());
    expect(heard).toEqual([]);
    w.guest.dial(HOST, events().e);
    w.guest.dial(HOST, events().e);
    w.guest.ping(Date.now());
    expect(heard).toEqual([`${HOST} true`]);
    expect(w.guest.dialled).toBe(2);
  });
});
