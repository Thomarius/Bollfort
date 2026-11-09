import path from 'node:path';

import {
  LANGUAGES,
  PRESENCE_TOKENS,
  STEAM_LANGUAGES,
  locales,
  type Language,
  type TextKey,
} from '@bollfort/config';

import { vdf } from './vdf.js';

/**
 * Rich presence's localisation files (STEAM.md §7.3, S3.4), one a language Steam lists, for
 * Steamworks → Community → Rich Presence: each token the game sets in `steam_display` with its
 * text from `config/locale/`, `{key}` written as Steam's `%key%`. The shape is the Enhanced Rich
 * Presence page's (`"lang"` holding `"Language"` and `"Tokens"`); the ISteamFriends page shows
 * another (the language as a block), to be settled by the first upload (S4).
 */

export const REPO = path.resolve(import.meta.dirname, '../../..');
export const PRESENCE_DIR = path.join(REPO, 'assets', 'steam');

/** A text with its `{key}` placeholders as Steam's `%key%`. */
export function steamText(text: string): string {
  return text.replace(/\{(\w+)\}/g, '%$1%');
}

/** The file for one language, or null for one Steam does not list. */
export function presenceFile(language: Language): { name: string; text: string } | null {
  const steam = STEAM_LANGUAGES[language];
  if (steam === undefined) return null;
  const locale = locales[language];
  const tokens = Object.entries(PRESENCE_TOKENS).map(([token, key]): [string, string] => {
    const text = locale[key as TextKey];
    if (typeof text !== 'string') throw new Error(`${language}: ${key} is not a sentence`);
    return [token, steamText(text)];
  });
  return {
    name: `rich_presence_${steam}.vdf`,
    text: `${vdf('lang', [
      ['Language', steam],
      ['Tokens', tokens],
    ])}\n`,
  };
}

export function presenceFiles(): { name: string; text: string }[] {
  return LANGUAGES.flatMap((language) => presenceFile(language) ?? []);
}
