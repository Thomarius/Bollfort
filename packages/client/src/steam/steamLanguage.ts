import type { Language } from '@bollfort/config';

/**
 * The game's language from Steam's (STEAM.md §7.2, S3.4), on the first start only: Steam's
 * word for German gives Deutsch, any other English. Hessian is never Steam's; after the first
 * start the player's own choice holds, as the menu's Options saves it.
 */
export function languageOfSteam(word: string | null): Language {
  return word === 'german' ? 'de' : 'en';
}
