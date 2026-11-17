import { escape } from './html.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/**
 * Whether a style's own track plays (the user's, 2026-11-17, in place of always, half the time
 * and never): on, wherever the rule of `lookTrack` allows — every change of look still changes the
 * music; off, the shared music only. On is the default.
 */
export type StyleMusicSetting = 'on' | 'off';

const KEY = 'bollfort.styleMusic';

export const STYLE_MUSIC_SETTINGS: readonly StyleMusicSetting[] = ['on', 'off'];

/**
 * The setting as saved, or null for anything else. The three choices saved before are read as
 * the nearest of the two: always and half the time as on, never as off.
 */
export function parseStyleMusic(saved: string | null | undefined): StyleMusicSetting | null {
  if (saved === 'always' || saved === 'half') return 'on';
  if (saved === 'never') return 'off';
  return STYLE_MUSIC_SETTINGS.find((setting) => setting === saved) ?? null;
}

export function storedStyleMusic(): StyleMusicSetting {
  return parseStyleMusic(stored(KEY)) ?? 'on';
}

export function saveStyleMusic(chosen: StyleMusicSetting): void {
  store(KEY, chosen);
}

/** Whether the styles' own tracks play, as `lookTrack` takes it. */
export function styleMusicOn(setting: StyleMusicSetting = storedStyleMusic()): boolean {
  return setting === 'on';
}

/** The choices as the menu offers them, for a `<select>`. */
export function styleMusicOptions(): string {
  return STYLE_MUSIC_SETTINGS.map(
    (value) => `<option value="${value}">${escape(t(`styleMusic.${value}`))}</option>`,
  ).join('');
}
