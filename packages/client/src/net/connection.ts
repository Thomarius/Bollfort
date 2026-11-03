import { defaultArtConfig } from '@bollfort/config';
import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '@bollfort/protocol';

import { t } from '../i18n.js';

/**
 * `reconnecting` while a dropped connection is being got back, `closed` once it is over:
 * closed here, or given up for lost (`lost`).
 */
export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** The waits before each try to rejoin, the last repeated, and how many tries in all. */
export interface RetryPolicy {
  delaysMs: readonly number[];
  tries: number;
}

const DEFAULT_RETRY: RetryPolicy = {
  delaysMs: defaultArtConfig.hud.network.reconnectDelaysMs,
  tries: defaultArtConfig.hud.network.reconnectTries,
};

/** The wait before try `n`, counted from 0. */
export function retryDelay(policy: RetryPolicy, n: number): number {
  return policy.delaysMs[Math.min(n, policy.delaysMs.length - 1)] ?? 0;
}

/**
 * The client's end of the wire.
 *
 * Reconnection is the point of the token: a dropped player's seat is played by a bot
 * until they come back, and presenting the token reclaims it rather than taking a new
 * one. The token is kept in session storage so a refresh does not cost the seat; and in a
 * match (`rejoinWhile`) a socket that drops is opened again by itself, joining with the
 * token, and the server answers with the match as it stands (ARCHIVE 15zc). The listeners
 * stay the same across sockets, so the match sees only a snapshot arrive.
 */
export class ServerConnection {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private listeners: ((message: ServerMessage) => void)[] = [];
  private closedListeners: (() => void)[] = [];

  state: ConnectionState = 'connecting';
  /** Given up for lost: the connection dropped, and every try to get it back failed. */
  lost = false;
  latencyMs = 0;
  private pingedAt = 0;
  /** The name joined under, and the room and seat the server last welcomed us to. */
  private name = '';
  private seat: { code: string; token: string } | null = null;
  /** This browser's ID, sent with every create and join (STEAM.md §5); none in tests. */
  browserId: string | null = null;
  private rejoining: () => boolean = () => false;
  private tries = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly policy: RetryPolicy = DEFAULT_RETRY,
    private readonly open: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  static defaultUrl(): string {
    const secure = globalThis.location.protocol === 'https:';
    return `${secure ? 'wss' : 'ws'}://${globalThis.location.host}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.attach();
      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', () => {
        if (this.state === 'connecting')
          reject(new Error(t('error.cannotReach', { url: this.url })));
      });
    });
  }

  /**
   * A socket, wired: everything it says goes to the listeners, and its close, if nobody
   * here closed it, to `dropped`. A socket replaced since is ignored, whatever it does.
   */
  private attach(): WebSocket {
    const socket = this.open(this.url);
    this.socket = socket;
    const current = (): boolean => this.socket === socket;
    socket.addEventListener('open', () => {
      if (!current()) return;
      if (this.state === 'reconnecting') {
        // Open is not back: the seat is, once the server welcomes us to it.
        if (this.seat !== null)
          socket.send(encode(this.joinMessage(this.seat.code, this.seat.token)));
        return;
      }
      this.state = 'open';
      for (const message of this.queue) socket.send(encode(message));
      this.queue = [];
    });
    socket.addEventListener('close', () => {
      if (current()) this.dropped();
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      if (!current()) return;
      const message = decodeServerMessage(String(event.data));
      if (message === null) return;
      if (message.type === 'pong') {
        // Round trip measured against our own clock, so no clock agreement is
        // needed — the simulation is paced by the server's commits, not by time.
        this.latencyMs = Math.round(performance.now() - message.t);
        return;
      }
      if (message.type === 'welcome') {
        this.seat = { code: message.code, token: message.token };
        if (this.state === 'reconnecting') {
          this.state = 'open';
          this.tries = 0;
        }
      }
      // A rejoin refused — the room gone, the seat no longer ours — is the end of trying,
      // not news for the lobby, which would show it as an error over the match.
      if (message.type === 'error' && this.state === 'reconnecting') {
        this.giveUp();
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    return socket;
  }

  /** The socket went, not closed from here: rejoined while a match wants it, else closed. */
  private dropped(): void {
    if (this.state === 'closed') return;
    if (this.seat === null || !this.rejoining()) {
      this.giveUp();
      return;
    }
    this.state = 'reconnecting';
    if (this.tries >= this.policy.tries) {
      this.giveUp();
      return;
    }
    const wait = retryDelay(this.policy, this.tries++);
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.state === 'reconnecting') this.attach();
    }, wait);
  }

  private giveUp(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.state = 'closed';
    this.lost = true;
    for (const listener of this.closedListeners) listener();
  }

  /**
   * From now on, a dropped socket is opened again and the seat rejoined while `when` says
   * so — through a match, its summary included, where the server keeps the seat; never in
   * a lobby, where a seat left is a seat gone.
   */
  rejoinWhile(when: () => boolean): void {
    this.rejoining = when;
  }

  /**
   * Drops the socket and rejoins at once, for the match as the server has it: how a page
   * out of sync gets back in step. Nothing if there is no seat to rejoin.
   */
  rejoin(): void {
    if (this.seat === null || this.state === 'closed') return;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.state = 'reconnecting';
    this.attach();
  }

  onMessage(listener: (message: ServerMessage) => void): void {
    this.listeners.push(listener);
  }

  /** Called once if the connection is lost for good — never for a close made here. */
  onLost(listener: () => void): void {
    this.closedListeners.push(listener);
  }

  /**
   * Sent once open, queued while first connecting, and dropped while reconnecting or once
   * closed: a move made while the seat is away would land on a board the page no longer
   * shows, and the server has a bot playing it meanwhile.
   */
  send(message: ClientMessage): void {
    if (this.socket && this.state === 'open') this.socket.send(encode(message));
    else if (this.state === 'connecting') this.queue.push(message);
  }

  private joinMessage(code: string, token?: string): ClientMessage {
    return {
      type: 'join',
      protocol: PROTOCOL_VERSION,
      name: this.name,
      code: code.toUpperCase(),
      ...(token === undefined ? {} : { token }),
      ...(this.browserId === null ? {} : { browserId: this.browserId }),
    };
  }

  createRoom(name: string, players: number, isPublic = true): void {
    this.name = name;
    this.send({
      type: 'create',
      protocol: PROTOCOL_VERSION,
      name,
      players,
      public: isPublic,
      ...(this.browserId === null ? {} : { browserId: this.browserId }),
    });
  }

  joinRoom(name: string, code: string, token?: string): void {
    this.name = name;
    this.send(this.joinMessage(code, token));
  }

  ping(): void {
    this.pingedAt = performance.now();
    this.send({ type: 'ping', t: this.pingedAt });
  }

  close(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.state = 'closed';
  }
}
