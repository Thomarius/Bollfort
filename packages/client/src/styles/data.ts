import {
  LANGUAGES,
  defaultArtConfig,
  defaultAudioManifest,
  locales,
  stylePaletteProblems,
  withStyleMusic,
  withStyleSounds,
  type StyleSound,
  type ArtStyle,
  type AudioManifest,
  type Language,
  type Locale,
  type StylePalette,
} from '@bollfort/config';

import type { StyleData } from './definition.js';
import { supporterAdmin } from './admin.js';
import { SUPPORTER_DATA } from './supporter.js';
import { wildwestData } from './wildwest/data.js';

/*
 * The data of the styles that bring their own parts (SP1a), and the shared config with those
 * parts added: the audio manifest with their tracks, the texts with theirs, their colours.
 * Plain values only, so Node reads this as the page does — `npm run credits` and the tests —
 * where the registry (`registry.ts`) brings stylesheets and drawing with it.
 */

/**
 * The styles with parts of their own, in the order the menu offers them, after the base: the
 * Wild West, and in the admin mode the supporter styles (`supporter.ts`, `admin.ts`).
 */
export const OWN_STYLE_DATA: readonly StyleData[] = [
  wildwestData,
  ...(supporterAdmin() ? SUPPORTER_DATA : []),
];

/** The audio manifest with the styles' own tracks and sounds, each credited by its file. */
export const audioManifest: AudioManifest = withStyleSounds(
  withStyleMusic(
    defaultAudioManifest,
    OWN_STYLE_DATA.flatMap((style) =>
      style.music === undefined ? [] : [{ style: style.id, ...style.music }],
    ),
  ),
  OWN_STYLE_DATA.flatMap((style) =>
    Object.entries(style.sounds ?? {}).map(([sound, own]) => ({
      style: style.id,
      sound: sound as StyleSound,
      ...own,
    })),
  ),
);

/** Every language's texts: the shared locale's and the styles' own. */
export const allTexts: Record<Language, Locale> = Object.fromEntries(
  LANGUAGES.map((language) => [
    language,
    Object.assign({}, locales[language], ...OWN_STYLE_DATA.map((s) => s.texts?.[language] ?? {})),
  ]),
) as Record<Language, Locale>;

const palettes = new Map(
  OWN_STYLE_DATA.flatMap((s) => (s.palette === undefined ? [] : [[s.id, s.palette] as const])),
);

/** The colours a style brings itself, if it does; else `undefined`, and `stylePalettes` has them. */
export function ownPalette(style: ArtStyle): StylePalette | undefined {
  return palettes.get(style);
}

/**
 * What is wrong with the styles' own parts against the shared files: texts outside the style's
 * names, or named in the shared locale too; colours that move a player's hue, or are in
 * `stylePalettes` too. The tracks are checked as the manifest is made (`withStyleMusic`).
 */
export function styleDataProblems(styles: readonly StyleData[] = OWN_STYLE_DATA): string[] {
  const problems: string[] = [];
  for (const style of styles) {
    for (const key of Object.keys(style.texts?.en ?? {})) {
      if (key !== `style.${style.id}` && !key.startsWith(`${style.id}.`)) {
        problems.push(`style "${style.id}": its text "${key}" is not named for it`);
      }
      if (key in locales.en) {
        problems.push(`style "${style.id}": its text "${key}" is in the shared locale too`);
      }
    }
    if (style.palette !== undefined) {
      if (style.id in defaultArtConfig.stylePalettes) {
        problems.push(`style "${style.id}": its colours are in stylePalettes too`);
      }
      for (const problem of stylePaletteProblems(style.palette, defaultArtConfig)) {
        problems.push(`style "${style.id}": ${problem}`);
      }
    }
  }
  return problems;
}

// As the shared config fails at startup on a bad value (`defaults.ts`), so do the styles' own.
const problems = styleDataProblems();
if (problems.length > 0) throw new Error(`Invalid styles:\n  - ${problems.join('\n  - ')}`);
