import { contextBridge, ipcRenderer } from 'electron';

import type { SteamInfo } from './steam.js';

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
};

export type GameHost = typeof host;

contextBridge.exposeInMainWorld('bollfortHost', host);
