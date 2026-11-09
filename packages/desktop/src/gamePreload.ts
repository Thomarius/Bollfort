import { contextBridge, ipcRenderer } from 'electron';

import type { PageLinkEvent } from './pageLinks.js';
import type { SteamInfo } from './steam.js';
import type { Avatar } from './steamAvatars.js';
import type { SteamNetStats } from './steamNet.js';

/**
 * What the Steam build's game window may ask of the app (STEAM.md §3.5): Steam's state, the
 * lobbies an invite asked for (S3 joins them), and the window's fullscreen, which the page's
 * Full screen button switches at the window rather than the page's own, so Esc stays pause.
 * The page finds it as `window.bollfortHost`; in a browser or the launcher's window it is absent.
 */
const host = {
  steam: (): Promise<SteamInfo> => ipcRenderer.invoke('host-steam'),
  lobbies: (): Promise<string[]> => ipcRenderer.invoke('host-lobbies'),
  fullscreen: (): Promise<boolean> => ipcRenderer.invoke('host-fullscreen'),
  setFullscreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke('host-set-fullscreen', on),
  /** The app closed, as its window's close button would (the menu's Quit). */
  quit: (): Promise<void> => ipcRenderer.invoke('host-quit'),
  onFullscreen: (listener: (on: boolean) => void): void => {
    ipcRenderer.on('host-fullscreen', (_event, on: boolean) => listener(on));
  },
  /**
   * Links to another player's game over Steam (STEAM.md §7.3), by the page's own numbers: the
   * address is the host's Steam ID. What they say comes back through `onLink`.
   */
  linkOpen: (id: number, host: string): void => ipcRenderer.send('steam-link-open', id, host),
  linkSend: (id: number, text: string): void => ipcRenderer.send('steam-link-send', id, text),
  linkClose: (id: number): void => ipcRenderer.send('steam-link-close', id),
  onLink: (listener: (event: PageLinkEvent) => void): void => {
    ipcRenderer.on('steam-link', (_event, value: PageLinkEvent) => listener(value));
  },
  /** A player's avatar wanted, by Steam ID: it comes through `onAvatar`, and again as it changes. */
  avatarWant: (steamId: string): void => ipcRenderer.send('steam-avatar-want', steamId),
  onAvatar: (listener: (said: { steamId: string; avatar: Avatar | null }) => void): void => {
    ipcRenderer.on('steam-avatar', (_event, said: { steamId: string; avatar: Avatar | null }) =>
      listener(said),
    );
  },
  /** Steam's P2P traffic, for the bench (§3.4); null without Steam. */
  steamStats: (): Promise<SteamNetStats | null> => ipcRenderer.invoke('host-steam-stats'),
};

export type GameHost = typeof host;

contextBridge.exposeInMainWorld('bollfortHost', host);
