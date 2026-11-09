import type { ConfigBundle } from '@bollfort/config';
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  encode,
  type ServerMessage,
} from '@bollfort/protocol';

import type { Connection, Room } from './room.js';
import type { RoomManager } from './rooms.js';

/**
 * The server's end of one client's link, whatever carries it (STEAM.md §7.1, package T): a
 * WebSocket today, Steam's peer-to-peer channel under the Steam build, an in-memory fake in
 * the tests. A link carries whole messages as text, reliably and in order, or closes — which
 * is what a WebSocket and a reliable Steam send both give.
 */
export interface Peer {
  send(text: string): void;
  /** Ends the link from this side. The session is still told, through `closed`. */
  close(): void;
}

/** What the transport tells the gateway about a link it has accepted. */
export interface Session {
  /** A whole message as it arrived. */
  receive(text: string): void;
  /** The link is gone, from either side; called once or more, the rest ignored. */
  closed(): void;
}

/**
 * A message as sent, encoded once however many seats it goes to: a room broadcasts the
 * same message object to every connection, thirty times a second. Kept by the object,
 * which nothing changes once it is sent.
 */
const encodings = new WeakMap<ServerMessage, string>();
function encoded(message: ServerMessage): string {
  let text = encodings.get(message);
  if (text === undefined) {
    text = encode(message);
    encodings.set(message, text);
  }
  return text;
}

/**
 * Everything the server does with a client's messages, apart from the wire: the limits, the
 * protocol check, creating and joining rooms, and handing the rest to the room the client is
 * in. Taken out of `server.ts` so that another transport is only a new `Peer`.
 */
export class Gateway {
  private nextId = 0;
  /** Which room each connection is in, so later messages can be routed without a scan. */
  private readonly joined = new Map<string, Room>();

  constructor(
    private readonly bundle: ConfigBundle,
    private readonly rooms: RoomManager,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * A link accepted, with who is on its far end where the transport knows it: the sender's
   * Steam ID, which Steam stamps on every packet (STEAM.md §7.3). The client never states it,
   * as the server owns identity; with it a person takes their seat back after an outage or a
   * restart, and is refused once removed.
   */
  accept(peer: Peer, steamId?: string): Session {
    const { maxMessageBytes, maxTournamentBytes, maxMessagesPerSecond } = this.bundle.server.limits;
    const joined = this.joined;
    const rooms = this.rooms;
    let messagesThisSecond = 0;
    let windowStart = this.now();
    let open = true;

    const connection: Connection = {
      id: `c${this.nextId++}`,
      send(message: ServerMessage) {
        if (open) peer.send(encoded(message));
      },
      close(reason: string) {
        connection.send({ type: 'error', code: 'closed', message: reason });
        peer.close();
      },
    };

    const receive = (text: string): void => {
      if (!open) return;
      const now = this.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        messagesThisSecond = 0;
      }
      if (++messagesThisSecond > maxMessagesPerSecond) return;

      if (text.length > Math.max(maxMessageBytes, maxTournamentBytes)) return;

      const message = decodeClientMessage(text);
      // Only a tournament's table or end, which carry its save, may be longer than any other.
      const carriesSave = message?.type === 'tournament' || message?.type === 'tournamentEnd';
      if (text.length > maxMessageBytes && !carriesSave) return;
      if (message === null) {
        connection.send({ type: 'error', code: 'bad_message', message: 'unparseable message' });
        return;
      }

      if (message.type === 'create' || message.type === 'join') {
        if (message.protocol !== PROTOCOL_VERSION) {
          connection.close(`protocol ${message.protocol} is not ${PROTOCOL_VERSION}`);
          return;
        }
        // One room a connection: a second seat was left behind still connected when the
        // socket closed, so its room was never emptied and never closed, and a match never
        // handed it to a bot. The client opens a new socket for every room.
        if (joined.has(connection.id)) {
          connection.send({ type: 'error', code: 'in_a_room', message: 'already in a room' });
          return;
        }
      }

      if (message.type === 'create') {
        const room = rooms.create(message.players, message.public ?? true);
        if (room === null) {
          connection.send({ type: 'error', code: 'no_capacity', message: 'server is full' });
          return;
        }
        room.join(connection, message.name, undefined, message.browserId, steamId);
        joined.set(connection.id, room);
        return;
      }

      if (message.type === 'join') {
        const room = rooms.get(message.code);
        if (room === undefined) {
          connection.send({ type: 'error', code: 'no_room', message: 'no room with that code' });
          return;
        }
        // Removed by its host (STEAM.md §5): by this browser's ID, the seat's token, or Steam ID.
        if (room.refuses(message.browserId, message.token, steamId)) {
          connection.send({ type: 'error', code: 'removed', message: 'removed by the host' });
          return;
        }
        if (
          room.join(connection, message.name, message.token, message.browserId, steamId) === null
        ) {
          // A match under way takes back only those seated in it (S3.6), told so: its Steam
          // lobby stays joinable while one of them is away, so others may reach it.
          connection.send(
            room.started
              ? { type: 'error', code: 'match_running', message: 'that match is under way' }
              : { type: 'error', code: 'room_full', message: 'that room is full' },
          );
          return;
        }
        joined.set(connection.id, room);
        return;
      }

      // Everything else is only meaningful inside a room this connection is in.
      const room = joined.get(connection.id);
      if (room === undefined) {
        connection.send({ type: 'error', code: 'no_room', message: 'join a room first' });
        return;
      }
      room.handle(connection, message);
    };

    return {
      receive,
      closed() {
        if (!open) return;
        open = false;
        joined.get(connection.id)?.leave(connection);
        joined.delete(connection.id);
      },
    };
  }
}
