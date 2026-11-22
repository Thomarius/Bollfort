import { contextBridge, ipcRenderer } from 'electron';

/**
 * What the GitHub build's game window may ask of the app (PLAN §11 item 11, PG2): its own
 * fullscreen — switched at the window, not the page's, so Esc stays the game's pause, as in the
 * Steam build — closing the app, and the server's panel, which the app no longer opens first.
 * The page finds it as `window.bollfortApp` (`client/src/host.ts`, `windowHost`); it is not the
 * Steam build's `bollfortHost`, whose presence the page takes for Steam.
 */
const app = {
  fullscreen: (): Promise<boolean> => ipcRenderer.invoke('app-fullscreen'),
  setFullscreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke('app-set-fullscreen', on),
  onFullscreen: (listener: (on: boolean) => void): void => {
    ipcRenderer.on('app-fullscreen', (_event, on: boolean) => listener(on));
  },
  /** The app closed, the server stopped first (the menu's Quit). */
  quit: (): Promise<void> => ipcRenderer.invoke('app-quit'),
  /** The server's panel: its addresses for other players, the internet and the online link. */
  hosting: (): void => ipcRenderer.send('app-hosting'),
};

contextBridge.exposeInMainWorld('bollfortApp', app);

export type AppApi = typeof app;
