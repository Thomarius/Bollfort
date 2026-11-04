/**
 * The client's end of a link to a server, whatever carries it (STEAM.md §7.1, package T): a
 * WebSocket in the browser and the GitHub builds, Steam's peer-to-peer channel under the
 * Steam build, an in-memory fake in the tests.
 *
 * The contract every transport keeps: whole messages as text, delivered **reliably and in
 * order**, or the link closes. The protocol leans on it — a commit lost or overtaken would
 * leave the page playing a tick without its actions — so a carrier that can lose or reorder,
 * as Steam's unreliable sends can, is not a transport until something restores the order.
 */
export interface Link {
  send(text: string): void;
  /** Ends the link from this side; its `close` event may still follow, or may not. */
  close(): void;
}

/**
 * What a link says, each at most once but `message`. Never called from inside `dial` itself:
 * the caller holds the link before anything is heard on it.
 */
export interface LinkEvents {
  open(): void;
  message(text: string): void;
  /** The link is gone, by either end; after `error` too. */
  close(): void;
  /** Failed, as a socket that cannot reach its server fails; a `close` follows. */
  error(): void;
}

/** Opens a link to an address, its events going to `events`. */
export type Dial = (address: string, events: LinkEvents) => Link;

/** A WebSocket as a link: what it says passed on, as text. */
export function webSocketLink(socket: WebSocket, events: LinkEvents): Link {
  socket.addEventListener('open', () => events.open());
  socket.addEventListener('message', (event: MessageEvent) => events.message(String(event.data)));
  socket.addEventListener('close', () => events.close());
  socket.addEventListener('error', () => events.error());
  return {
    send: (text) => socket.send(text),
    close: () => socket.close(),
  };
}

export const dialWebSocket: Dial = (url, events) => webSocketLink(new WebSocket(url), events);
