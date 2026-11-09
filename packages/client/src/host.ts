/**
 * The app the page runs in, when it is the Steam build (STEAM.md §3.5): `window.bollfortHost`,
 * put there by the desktop's `gamePreload.ts`. In a browser, the dev server or the launcher's
 * own window it is absent, and everything here says so.
 */

/** What the Steam build says of Steam. */
export interface HostSteam {
  ready: boolean;
  name: string | null;
  steamId: string | null;
  language: string | null;
  error: string | null;
}

/** The Steam build's bridge, as `gamePreload.ts` exposes it. */
export interface GameHost {
  steam(): Promise<HostSteam>;
  lobbies(): Promise<string[]>;
  fullscreen(): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  onFullscreen(listener: (on: boolean) => void): void;
}

/** The Steam build's bridge, or null anywhere else. */
export function gameHost(): GameHost | null {
  return (window as unknown as { bollfortHost?: GameHost }).bollfortHost ?? null;
}

/**
 * The menu's notice for a Steam build started without Steam: it plays locally, and online
 * play needs Steam (STEAM.md §3.5). Null when Steam is there, or this is no Steam build.
 */
export function steamMissing(steam: HostSteam | null): boolean {
  return steam !== null && !steam.ready;
}
