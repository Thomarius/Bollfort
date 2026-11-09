import { defaultArtConfig } from '@bollfort/config';

import type { GameHost } from '../host.js';
import type { RetryPolicy } from './connection.js';
import type { Dial, LinkEvents } from './transport.js';

/**
 * Links over Steam's P2P (STEAM.md §7.3, S3.1), as the Steam build's page dials them: the
 * address is the host's Steam ID, and the app's main process carries the text (`steamNet.ts`),
 * opening the link only once the host has answered. The page numbers its links itself, so a
 * link is held the moment it is dialled.
 */
export function steamDial(host: GameHost): Dial {
  const links = new Map<number, LinkEvents>();
  let next = 1;
  host.onLink((said) => {
    const events = links.get(said.id);
    if (events === undefined) return;
    switch (said.event) {
      case 'open':
        events.open();
        return;
      case 'message':
        events.message(said.text);
        return;
      case 'error':
        events.error();
        return;
      case 'close':
        links.delete(said.id);
        events.close();
        return;
    }
  });
  return (address, events) => {
    const id = next++;
    links.set(id, events);
    host.linkOpen(id, address);
    return {
      send: (text) => {
        if (links.has(id)) host.linkSend(id, text);
      },
      close: () => {
        if (!links.delete(id)) return;
        host.linkClose(id);
      },
    };
  };
}

/**
 * A rejoin under Steam keeps trying for as long as a match may last (S3.2): Steam makes a
 * session again some 20 s after the network is back, where a socket is back at once.
 */
export const STEAM_RETRY: RetryPolicy = {
  delaysMs: defaultArtConfig.hud.network.reconnectDelaysMs,
  tries: defaultArtConfig.hud.network.steamReconnectTries,
};
