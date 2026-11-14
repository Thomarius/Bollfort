import type {
  ArtConfig,
  ArtLook,
  ArtStyle,
  AudioCredit,
  Language,
  LocaleText,
  StyleMusicEntry,
  StylePalette,
  TextKey,
} from '@bollfort/config';
import type { Phase } from '@bollfort/sim';

import type { Theme } from '../render/theme.js';
import type { Title } from '../titles.js';

/*
 * What a style is (SP1a): everything the game asks of one, in one place, so a style can live
 * in a folder of its own — or in a package of its own — and be added to the registry
 * (`registry.ts`) without a line of the shared code naming it.
 *
 * A style is two parts. Its data (`StyleData`) is plain values, which Node reads as well as
 * the page: the credits and the tests take a style's music and texts from it. Its definition
 * adds what only the page needs — its banner, skin and title, and its theme, a module fetched
 * the first time the style is asked for (ARCHIVE 15zf).
 */

/**
 * The name of a text a style brings itself (`StyleData.texts`), as `t` takes it beside the
 * shared locale's keys. Made by `styleTextKey`, which checks the style has the text.
 */
export type StyleTextKey = string & { readonly styleText: unique symbol };

/** A text's key, the shared locale's or a style's own. */
export type AnyTextKey = TextKey | StyleTextKey;

/** A style's own words under a phase's call, and under the final round's banner. */
export type StyleFlavour = Partial<Record<Phase | 'final', AnyTextKey>>;

/** A style's theme, made for a match's seed. */
export type ThemeMaker = (seed: number) => Theme;

/** A style's own texts, a set for every language, each with English's keys. */
export type StyleTexts = Record<Language, Record<string, LocaleText>>;

/**
 * A style's data: what it is made for and what it brings with it rather than in the shared
 * files. A style of the shared files brings nothing; one in a folder of its own may bring
 * all of it.
 */
export interface StyleData {
  /** Its name in links, saves and the code: lower case letters and digits. */
  readonly id: ArtStyle;
  /** The looks it is made for, building and combat, or one of them alone. */
  readonly looks: readonly ArtLook[];
  /** Its own colours over the shared ones, as `stylePalettes` in the art config would hold. */
  readonly palette?: StylePalette;
  /** Its own track, as the audio manifest's `styleMusic` would hold, and the file's credit. */
  readonly music?: { readonly entry: StyleMusicEntry; readonly credit: AudioCredit };
  /** Its texts, keyed `style.<id>` for its name and `<id>.…` for the rest. */
  readonly texts?: StyleTexts;
}

/** A style as the page uses it. */
export interface StyleDefinition extends StyleData {
  /** The text naming it in the menu and the gallery. */
  readonly name: AnyTextKey;
  /**
   * The phase banner it draws, a class of `.phase-call`; the arriving look's is shown. Medieval
   * and Night keep the dark band with gold that every style once shared (`banner-classic`).
   */
  readonly banner: string;
  /**
   * The HUD's skin in it, a class of the page's body (PLAN 11.11 W7): the bar, the clock and
   * the cannon count, the overlays and the menus' dress (MS4).
   */
  readonly skin: string;
  /** Its own words under the phase's call, where it has them (ARCHIVE 14d). */
  readonly flavour?: StyleFlavour;
  /**
   * Its skin's stylesheet, as text, where it brings its own rather than writing in
   * `style.css` (imported `?inline`); the registry puts it after `style.css` (`registry.ts`).
   */
  readonly stylesheet?: string;
  /** Its title in the menu, drawn once to an image and kept (`styleTitle`). */
  readonly title: (text: string, art: ArtConfig) => Title;
  /** Its theme's module, fetched when the style is first asked for. */
  readonly theme: () => Promise<ThemeMaker>;
}

/**
 * The key of one of a style's own texts, checked against its English set so a typo fails as
 * the style is loaded rather than showing the key.
 */
export function styleTextKey(texts: StyleTexts, key: string): StyleTextKey {
  if (!(key in texts.en)) throw new Error(`no text "${key}" among the style's own`);
  return key as StyleTextKey;
}
