import type { HostAvatar } from '../host.js';
import { escape } from '../html.js';
import { steamPlay } from './steamPlay.js';

/**
 * Players' Steam avatars on the page (STEAM.md §7.3, S3.4): asked of the app by Steam ID the
 * first time a seat carrying one is drawn, kept as an image's address, and told again as it
 * changes — Steam's "?" first for a player it did not know, the real picture a moment later.
 * Outside Steam, or for a seat with no Steam ID, there is none.
 */

const urls = new Map<string, string | null>();
const listeners = new Set<() => void>();
let listening = false;
/** Bumped at every picture that arrives, so what is drawn from them knows to draw again. */
let version = 0;

function toUrl(avatar: HostAvatar): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = avatar.width;
  canvas.height = avatar.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const pixels = new Uint8ClampedArray(avatar.width * avatar.height * 4);
  pixels.set(avatar.rgba.subarray(0, pixels.length));
  context.putImageData(new ImageData(pixels, avatar.width, avatar.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** The avatar's address, asking for it the first time; null until it comes, or without one. */
export function avatarUrl(steamId: string | null | undefined): string | null {
  const steam = steamPlay();
  if (steam === null || steamId === null || steamId === undefined) return null;
  if (!listening) {
    listening = true;
    steam.host.onAvatar(({ steamId: id, avatar }) => {
      urls.set(id, avatar === null ? null : toUrl(avatar));
      version++;
      for (const listener of listeners) listener();
    });
  }
  if (!urls.has(steamId)) {
    urls.set(steamId, null);
    steam.host.avatarWant(steamId);
  }
  return urls.get(steamId) ?? null;
}

/** Changes with every picture that arrives. */
export function avatarsVersion(): number {
  return version;
}

/** Told whenever a picture arrives; the function returned stops it. */
export function onAvatars(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The avatar as an image before a name, or nothing. */
export function avatarImg(url: string | null | undefined): string {
  return url === null || url === undefined
    ? ''
    : `<img class="avatar" src="${escape(url)}" alt="" draggable="false" />`;
}
