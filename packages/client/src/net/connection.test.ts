import {
  PROTOCOL_VERSION,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '@bollfort/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerConnection, retryDelay, type RetryPolicy } from './connection.js';
import { webSocketLink } from './transport.js';

/** A socket that does what the test says, when it says. */
class FakeSocket {
  readonly sent: ClientMessage[] = [];
  closed = false;
  private readonly handlers = new Map<string, ((event: unknown) => void)[]>();

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ClientMessage);
  }

  close(): void {
    this.closed = true;
  }

  fire(type: string, event: unknown = {}): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  open(): void {
    this.fire('open');
  }

  say(message: ServerMessage): void {
    this.fire('message', { data: encode(message) });
  }

  drop(): void {
    this.fire('close');
  }
}

const policy: RetryPolicy = { delaysMs: [100, 200], tries: 3 };

const welcome = (token = 'tok'): ServerMessage => ({
  type: 'welcome',
  protocol: PROTOCOL_VERSION,
  playerId: 1,
  hostId: 0,
  code: 'ABCDEF',
  token,
});

function connected(): { connection: ServerConnection; sockets: FakeSocket[]; heard: string[] } {
  const sockets: FakeSocket[] = [];
  const connection = new ServerConnection('ws://test', policy, (_url, events) => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return webSocketLink(socket as unknown as WebSocket, events);
  });
  const heard: string[] = [];
  connection.onMessage((message) => heard.push(message.type));
  void connection.connect();
  connection.joinRoom('Ada', 'abcdef');
  sockets[0]?.open();
  sockets[0]?.say(welcome());
  return { connection, sockets, heard };
}

describe('a connection that drops', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits longer at each try, the last wait repeated', () => {
    expect([0, 1, 2, 5].map((n) => retryDelay(policy, n))).toEqual([100, 200, 200, 200]);
  });

  it('is simply closed outside a match, and says it is lost', () => {
    const { connection, sockets } = connected();
    const lost = vi.fn();
    connection.onLost(lost);
    sockets[0]?.drop();
    expect(connection.state).toBe('closed');
    expect(connection.lost).toBe(true);
    expect(lost).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });

  it('in a match, rejoins its seat by its token and is open again once welcomed', () => {
    const { connection, sockets, heard } = connected();
    connection.rejoinWhile(() => true);
    sockets[0]?.drop();
    expect(connection.state).toBe('reconnecting');
    // Nothing is sent meanwhile: the seat is a bot's until the server has us back.
    connection.send({ type: 'pause', paused: true });
    vi.advanceTimersByTime(99);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(sockets[1]?.sent).toEqual([
      {
        type: 'join',
        protocol: expect.any(Number) as number,
        name: 'Ada',
        code: 'ABCDEF',
        token: 'tok',
      },
    ]);
    expect(connection.state).toBe('reconnecting');
    sockets[1]?.say(welcome());
    sockets[1]?.say({ type: 'pong', t: 0, serverTick: 0 });
    expect(connection.state).toBe('open');
    expect(heard).toEqual(['welcome', 'welcome']);
    // The old socket says nothing more to anyone.
    sockets[0]?.say(welcome('old'));
    expect(heard).toHaveLength(2);
  });

  it('gives up after its tries, and at once when the room refuses the rejoin', () => {
    const { connection, sockets } = connected();
    connection.rejoinWhile(() => true);
    const lost = vi.fn();
    connection.onLost(lost);
    sockets[0]?.drop();
    for (let i = 1; i <= 3; i++) {
      vi.advanceTimersByTime(200);
      sockets[i]?.drop();
    }
    expect(sockets).toHaveLength(4);
    expect(connection.state).toBe('closed');
    expect(lost).toHaveBeenCalledOnce();

    const again = connected();
    again.connection.rejoinWhile(() => true);
    const heard = again.heard.length;
    again.sockets[0]?.drop();
    vi.advanceTimersByTime(100);
    again.sockets[1]?.open();
    again.sockets[1]?.say({ type: 'error', code: 'no_room', message: 'gone' });
    expect(again.connection.lost).toBe(true);
    // The refusal is not passed on, to be shown as an error over the match.
    expect(again.heard).toHaveLength(heard);
  });

  it('rejoins at once when asked, as a page out of sync does', () => {
    const { connection, sockets } = connected();
    connection.rejoin();
    expect(sockets[0]?.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(connection.state).toBe('reconnecting');
    sockets[1]?.open();
    sockets[1]?.say(welcome());
    expect(connection.state).toBe('open');
  });

  it('is never reopened after being closed here', () => {
    const { connection, sockets } = connected();
    connection.rejoinWhile(() => true);
    const lost = vi.fn();
    connection.onLost(lost);
    connection.close();
    sockets[0]?.drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(lost).not.toHaveBeenCalled();
    expect(connection.lost).toBe(false);
  });
});
