import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type * as Koffi from 'koffi';

/**
 * Players' avatars under the Steam build (STEAM.md §7.3, S3.4). `steamworks.js` has no friends
 * interface, so these few calls go to Steam's flat C API through an FFI (`koffi`), on the very
 * `steam_api` library `steamworks.js` ships and has already initialised: loaded by the same
 * path, it is the same module in the process, its Steam already up. No fork, no Rust.
 *
 * An avatar is watched, not read once. Steam keeps the pictures of players it knows; another's
 * it fetches on asking, and until then — and even after the player's first `PersonaStateChange`
 * — it hands back its grey "?" picture as though it were the avatar (2026-11-09, on 480: one
 * player's real picture came only at a later change, seconds on). So `AvatarWatch` publishes
 * what Steam has, and again whenever it changes.
 */

/** An avatar's pixels, as Steam gives them: RGBA, row by row. */
export interface Avatar {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** What Steam is asked: the picture as it stands, and to fetch a player it does not know. */
export interface AvatarSource {
  /** The picture now: `loading` while Steam loads it, null if there is none. */
  read(steamId: string): Avatar | 'loading' | null;
  /** Asks Steam for what it lacks of the player; true while it fetches. */
  request(steamId: string): boolean;
}

/** Re-reads after a player is first wanted, for a change Steam never announces. */
export const REREAD_MS = [1000, 3000, 8000, 20_000] as const;

function same(a: Avatar | null, b: Avatar | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.width !== b.width || a.height !== b.height || a.rgba.length !== b.rgba.length) return false;
  for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) return false;
  return true;
}

/**
 * The avatars the page has asked for, each published as Steam has it and again whenever it
 * changes: at the player's `PersonaStateChange`, and at a few times after they were first
 * wanted. Nothing is published while a picture is still loading.
 */
export class AvatarWatch {
  private readonly shown = new Map<string, Avatar | null | undefined>();

  constructor(
    private readonly source: AvatarSource,
    private readonly publish: (steamId: string, avatar: Avatar | null) => void,
    private readonly later: (then: () => void, ms: number) => void = (then, ms) => {
      setTimeout(then, ms);
    },
  ) {}

  /** The player's avatar wanted: published now if Steam has it, and whenever it changes. */
  want(steamId: string): void {
    const known = this.shown.get(steamId);
    if (this.shown.has(steamId)) {
      // Asked again — a page loaded again — so said again.
      if (known !== undefined) this.publish(steamId, known);
      return;
    }
    this.shown.set(steamId, undefined);
    this.source.request(steamId);
    this.check(steamId);
    for (const ms of REREAD_MS) this.later(() => this.check(steamId), ms);
  }

  /** Steam has news of a player: their picture read again, if wanted. */
  personaChanged(steamId: string): void {
    if (this.shown.has(steamId)) this.check(steamId);
  }

  private check(steamId: string): void {
    const now = this.source.read(steamId);
    if (now === 'loading') return;
    const before = this.shown.get(steamId);
    if (before !== undefined && same(before, now)) return;
    this.shown.set(steamId, now);
    this.publish(steamId, now);
  }
}

/** Where `steamworks.js` keeps Steam's library for this system, unpacked in a packaged app. */
export function steamApiPath(platform = process.platform): string {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('steamworks.js/package.json'));
  const file =
    platform === 'win32'
      ? join(root, 'dist', 'win64', 'steam_api64.dll')
      : join(root, 'dist', 'linux64', 'libsteam_api.so');
  // A native library cannot be opened inside the app's archive; the packaging unpacks it.
  return file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

/** The largest picture taken: Steam's large avatars are 184 pixels square. */
const MAX_SIDE = 256;

/** Steam's own calls; to be opened only once Steam is initialised (`steamworks.init`). */
export function steamAvatarSource(libraryPath = steamApiPath()): AvatarSource {
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof Koffi;
  const lib = koffi.load(libraryPath);
  const friendsOf = lib.func('void *SteamAPI_SteamFriends_v017()');
  const utilsOf = lib.func('void *SteamAPI_SteamUtils_v010()');
  const mediumAvatar = lib.func(
    'int SteamAPI_ISteamFriends_GetMediumFriendAvatar(void *self, uint64_t steamId)',
  );
  const requestInfo = lib.func(
    'bool SteamAPI_ISteamFriends_RequestUserInformation(void *self, uint64_t steamId, bool nameOnly)',
  );
  const imageSize = lib.func(
    'bool SteamAPI_ISteamUtils_GetImageSize(void *self, int image, _Out_ uint32_t *width, _Out_ uint32_t *height)',
  );
  const imageRgba = lib.func(
    'bool SteamAPI_ISteamUtils_GetImageRGBA(void *self, int image, _Out_ uint8_t *dest, int size)',
  );
  const friends: unknown = friendsOf();
  const utils: unknown = utilsOf();
  if (friends === null || utils === null) throw new Error('Steam’s interfaces are not there');

  return {
    request: (steamId) => requestInfo(friends, BigInt(steamId), false) as boolean,
    read(steamId) {
      const image = mediumAvatar(friends, BigInt(steamId)) as number;
      if (image === -1) return 'loading';
      if (image === 0) return null;
      const width = [0];
      const height = [0];
      if (!(imageSize(utils, image, width, height) as boolean)) return null;
      const w = width[0] ?? 0;
      const h = height[0] ?? 0;
      if (w <= 0 || h <= 0 || w > MAX_SIDE || h > MAX_SIDE) return null;
      const rgba = Buffer.alloc(w * h * 4);
      if (!(imageRgba(utils, image, rgba, rgba.length) as boolean)) return null;
      return { width: w, height: h, rgba: new Uint8Array(rgba) };
    },
  };
}
