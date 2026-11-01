/*
 * The languages the game speaks, apart from their texts and their schema so the desktop
 * window can choose one without bundling the whole configuration (PLAN 11.20).
 */

/**
 * The languages the game speaks, by code, each named in itself for the chooser. Hessian, the
 * south Hessian of Badesalz, is the user's joke (2026-11-01): it has no code of its own, so
 * `hes` here, never sent anywhere, and no browser asks for it — it is only ever chosen.
 */
export const LANGUAGES = ['en', 'de', 'hes'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  hes: 'Hessisch',
};

/**
 * The language a page declares in `lang`: Hessian is German to the browser, so CSS uppercase
 * writes ß as SS and a screen reader reads in a German voice.
 */
export const PAGE_LANGS: Record<Language, string> = { en: 'en', de: 'de', hes: 'de' };

/** Whether `code` names a language the game speaks. */
export function isLanguage(code: string | null | undefined): code is Language {
  return code !== null && code !== undefined && (LANGUAGES as readonly string[]).includes(code);
}

/**
 * The first language of the browser's own the game speaks — "de-AT" is German — or English.
 * What a first visit starts in, before anybody has chosen.
 */
export function detectLanguage(preferences: readonly string[]): Language {
  for (const preference of preferences) {
    const code = preference.toLowerCase().split('-')[0];
    if (isLanguage(code)) return code;
  }
  return 'en';
}
