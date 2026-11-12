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
  /** Whether achievements count here (docs/STEAM_ACHIEVEMENTS.md §3.1, the app decides). */
  achievements: boolean;
}

/** The Steam build's bridge, as `gamePreload.ts` exposes it. */
export interface GameHost {
  steam(): Promise<HostSteam>;
  /** Lobbies an invite or Join asked for, and who invited where Steam says (S3.6). */
  lobbies(): Promise<{ lobby: string; from: string | null }[]>;
  fullscreen(): Promise<boolean>;
  /** Sets the window's fullscreen; the state it now has. */
  setFullscreen(on: boolean): Promise<boolean>;
  quit(): Promise<void>;
  onFullscreen(listener: (on: boolean) => void): void;
  /** A link to another player's game over Steam, by this page's own number (`net/steamDial.ts`). */
  linkOpen(id: number, host: string): void;
  linkSend(id: number, text: string): void;
  linkClose(id: number): void;
  onLink(listener: (event: HostLinkEvent) => void): void;
  /** A player's avatar wanted: it comes through `onAvatar`, and again whenever it changes. */
  avatarWant(steamId: string): void;
  onAvatar(listener: (said: { steamId: string; avatar: HostAvatar | null }) => void): void;
  /** The Steam lobby beside this page's room (STEAM.md §7.3, S3.3); see `gamePreload.ts`. */
  lobbyCreate(kind: LobbyKind): Promise<string | null>;
  lobbyRoom(room: string | null): void;
  lobbyData(data: Record<string, string>): void;
  lobbyJoinable(joinable: boolean): void;
  lobbyLeave(): void;
  lobbyInvite(): void;
  lobbyInviteUser(steamId: string): void;
  lobbyJoin(lobby: string): Promise<string | null>;
  /** Our lobbies for Find a game, friends' first, their data equal to these key-values. */
  lobbyList(
    filter?: Record<string, string>,
  ): Promise<{ lobby: string; owner: string; data: Record<string, string> }[]>;
  find(host: string): Promise<unknown>;
  presence(values: Record<string, string | null>): void;
  /** Achievements and stats by API name (AC3); see `steam/achievements.ts`. */
  achievementsHeld(ids: readonly string[]): Promise<string[]>;
  achieve(id: string): void;
  stats(): Promise<{
    castles_sealed: number;
    walls_destroyed: number;
    towers_bought: number;
    towers_bought_count: number;
  } | null>;
  setStats(stats: {
    castles_sealed: number;
    walls_destroyed: number;
    towers_bought: number;
    towers_bought_count: number;
  }): Promise<boolean>;
  achievementProgress(id: string, current: number, max: number): void;
  onJoinAsked(listener: () => void): void;
}

/** Who may join the host's Steam lobby, chosen under Play (S3.3). */
export type LobbyKind = 'friends' | 'public' | 'invite';

/** A Steam avatar's pixels, RGBA row by row. */
export interface HostAvatar {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** What a link over Steam says, as the app passes it on. */
export type HostLinkEvent =
  | { id: number; event: 'open' | 'close' | 'error' }
  | { id: number; event: 'message'; text: string };

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
