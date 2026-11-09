/**
 * The Steam build's decisions (STEAM.md §3.5, S2), as plain functions so they are tested
 * without Electron or Steam; `steamMain.ts` carries them out.
 */

/**
 * Steam's App ID: Spacewar's, 480, which every developer may use, until ours is bought (S4).
 * The only place it is written; nothing ships a `steam_appid.txt` (`package.js` refuses one).
 */
export const STEAM_APP_ID = 480;
/** Spacewar's: on it `RestartAppIfNecessary` always answers no, so it is not asked. */
export const SPACEWAR = 480;

/** How the Steam build starts on this system, with these arguments, for this App ID. */
export interface StartPlan {
  /**
   * Without Chromium's sandbox, on Linux: with Steam's overlay preloaded the sandbox held the
   * window back 70–80 s (STEAM.md §3.3).
   */
  noSandbox: boolean;
  /**
   * Started on Linux without `--no-sandbox` on its command line: the app starts itself again
   * with it. The switch set from inside comes too late — Chromium's helper processes start
   * before the app's code, still sandboxed, and the page's crashed on /dev/shm (2026-11-09).
   * Steamworks' launch options, ours to set, pass it from S4 on; this covers any other start.
   */
  relaunch: boolean;
  /**
   * Whether to ask Steam to start the app itself (Q6, decided for our App ID): started
   * outside Steam it quits, and Steam starts it again, the overlay injected.
   */
  restartCheck: boolean;
  /** A lobby an accepted invite started the app for, handed to S3's joining. */
  connectLobby: string | null;
}

export function startPlan(platform: string, argv: readonly string[], appId: number): StartPlan {
  return {
    noSandbox: platform === 'linux',
    relaunch: platform === 'linux' && !argv.includes('--no-sandbox'),
    restartCheck: appId !== SPACEWAR,
    connectLobby: connectLobby(argv),
  };
}

/** `+connect_lobby <id>`, as Steam starts a game for an accepted invite: the ID, or null. */
export function connectLobby(argv: readonly string[]): string | null {
  const at = argv.indexOf('+connect_lobby');
  const id = at >= 0 ? argv[at + 1] : undefined;
  return id !== undefined && /^\d+$/.test(id) ? id : null;
}

/** What the game's page is told of Steam (`gamePreload.ts`). */
export interface SteamInfo {
  /** Whether Steam initialised: without it the game plays locally, with a notice. */
  ready: boolean;
  name: string | null;
  steamId: string | null;
  /** Steam's language for the game, Steam's own word for it (`english`, `german`). */
  language: string | null;
  /** Why Steam did not initialise, for the log. */
  error: string | null;
}

export const NO_STEAM: SteamInfo = {
  ready: false,
  name: null,
  steamId: null,
  language: null,
  error: null,
};

/** The window's remembered choice: fullscreen unless the player left it (STEAM.md §3.5). */
export function savedFullscreen(saved: unknown): boolean {
  if (typeof saved !== 'object' || saved === null) return true;
  const value = (saved as Record<string, unknown>)['fullscreen'];
  return typeof value === 'boolean' ? value : true;
}

/** Ports to try for the game's own server, from the config's upward. */
export function serverPorts(first: number, count = 20): number[] {
  return Array.from({ length: count }, (_, i) => first + i).filter((p) => p <= 65535);
}

/**
 * `--game-params a=1&b=2` as the game page's query, or nothing: how the bench has both seats
 * played by the autopilot (`autopilot=1`, STEAM.md §3.4), as it did the spike's. Only a page's
 * own parameters, which any browser may set as well.
 */
export function pageQuery(argv: readonly string[]): string {
  const at = argv.indexOf('--game-params');
  const params = at >= 0 ? argv[at + 1] : undefined;
  if (params === undefined || !/^[\w=&.,-]{1,200}$/.test(params)) return '';
  return `?${params}`;
}
