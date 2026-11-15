import {
  artForStyle,
  defaultArtConfig,
  type ArtConfig,
  type ArtLook,
  type ArtStyle,
} from '@bollfort/config';

import { GAME_TITLE, type Title } from '../titles.js';

import { BASE_STYLES } from './base.js';
import { audioManifest, ownPalette } from './data.js';
import type { StyleDefinition } from './definition.js';
import { supporterAdmin } from './admin.js';
import { SUPPORTER_STYLES } from './supporter.js';
import { wildwest } from './wildwest/index.js';

/*
 * Every style the game can draw in, and what each brings (SP1a): the one list the menu, the
 * gallery, Random, the HUD, the titles and the scene ask. The base styles' parts are in the
 * shared files; a style in a folder of its own brings them itself and is added here alone.
 */

/**
 * Every style, in the order the menu offers them: in the admin mode the supporter styles last
 * (`supporter.ts`, `admin.ts`; STEAM.md §6.1).
 */
export const STYLES: readonly StyleDefinition[] = [
  ...BASE_STYLES,
  wildwest,
  ...(supporterAdmin() ? SUPPORTER_STYLES : []),
];

const BY_ID = new Map(STYLES.map((style) => [style.id, style]));

/** Every style's name, in the menu's order. */
export const STYLE_IDS: readonly ArtStyle[] = STYLES.map((style) => style.id);

/** Whether `value` names a style there is: a link's, a save's, anything hand-typed. */
export function isStyle(value: unknown): value is ArtStyle {
  return typeof value === 'string' && BY_ID.has(value);
}

/** A style's definition. Asked for one there is not, it throws: the name was never checked. */
export function styleDefinition(style: ArtStyle): StyleDefinition {
  const found = BY_ID.get(style);
  if (found === undefined) throw new Error(`no style "${style}"`);
  return found;
}

/**
 * Which looks each style is made for. A style may be made for one look only — a calm
 * drafting-paper build look, say — and is then offered for that one alone.
 */
export const STYLE_LOOKS: Readonly<Record<ArtStyle, readonly ArtLook[]>> = Object.fromEntries(
  STYLES.map((style) => [style.id, style.looks]),
);

export function styleServes(
  style: ArtStyle,
  look: ArtLook,
  looks: Readonly<Record<ArtStyle, readonly ArtLook[]>> = STYLE_LOOKS,
): boolean {
  return looks[style]?.includes(look) ?? false;
}

/** The styles made for a look, in the order the menu offers them. */
export function stylesFor(
  look: ArtLook,
  looks: Readonly<Record<ArtStyle, readonly ArtLook[]>> = STYLE_LOOKS,
): ArtStyle[] {
  return STYLE_IDS.filter((style) => styleServes(style, look, looks));
}

/**
 * The first of `candidates` that names a style made for `look` — a link's, then what the
 * menu saved, then the default, say — so a stale or hand-typed choice falls through to
 * the next rather than drawing a look in a style that was never made for it.
 */
export function chooseStyle(
  look: ArtLook,
  candidates: readonly unknown[],
  fallback: ArtStyle,
  looks: Readonly<Record<ArtStyle, readonly ArtLook[]>> = STYLE_LOOKS,
): ArtStyle {
  for (const candidate of candidates) {
    if (isStyle(candidate) && styleServes(candidate, look, looks)) return candidate;
  }
  return fallback;
}

/**
 * The art as one style draws it: the shared config with that style's own colours over it,
 * whether they are in `stylePalettes` or the style brings them itself. Every theme is handed
 * this rather than the shared art.
 */
export function styleArt(art: ArtConfig, style: ArtStyle): ArtConfig {
  return artForStyle(art, style, ownPalette(style) ?? art.stylePalettes[style]);
}

/**
 * Each style's title, drawn once and kept: it is a canvas turned into an image, and the
 * menu's random half asks for a new one at every sweep. Nothing in it moves or varies.
 */
const titles = new WeakMap<ArtConfig, Map<ArtStyle, Title>>();

export function styleTitle(style: ArtStyle, art: ArtConfig): Title {
  let drawn = titles.get(art);
  if (drawn === undefined) titles.set(art, (drawn = new Map()));
  let title = drawn.get(style);
  if (title === undefined) {
    title = styleDefinition(style).title(GAME_TITLE, art);
    drawn.set(style, title);
  }
  return title;
}

/**
 * What is wrong with the list against the shared files, which name styles by their names
 * alone now: a name twice or malformed, colours or a track for a style there is not, a
 * default look in a style not made for it.
 */
export function registryProblems(
  styles: readonly StyleDefinition[] = STYLES,
  art: ArtConfig = defaultArtConfig,
): string[] {
  const problems: string[] = [];
  const ids = new Set<ArtStyle>();
  for (const { id, looks } of styles) {
    if (ids.has(id)) problems.push(`style "${id}" is listed twice`);
    if (!/^[a-z][a-z0-9]*$/.test(id)) problems.push(`style "${id}": not lower case letters`);
    // The menu's and the links' word for a new style at every banner (`looks.ts`).
    if (id === 'random') problems.push('no style may be named "random"');
    if (looks.length === 0) problems.push(`style "${id}" is made for no look`);
    ids.add(id);
  }
  for (const id of Object.keys(art.stylePalettes)) {
    if (!ids.has(id)) problems.push(`art: stylePalettes has colours for "${id}", no style`);
  }
  for (const id of Object.keys(audioManifest.styleMusic)) {
    if (!ids.has(id)) problems.push(`audio: styleMusic has a track for "${id}", no style`);
  }
  for (const id of Object.keys(audioManifest.styleSounds)) {
    if (!ids.has(id)) problems.push(`audio: styleSounds has sounds for "${id}", no style`);
  }
  for (const look of ['build', 'combat'] as const) {
    const style = art.styles[look];
    if (!styles.some((s) => s.id === style && s.looks.includes(look))) {
      problems.push(`art: the ${look} look's "${style}" is not a style made for it`);
    }
  }
  return problems;
}

// Fails as the page loads, as a bad config file does (`defaults.ts`).
const problems = registryProblems();
if (problems.length > 0) throw new Error(`Invalid styles:\n  - ${problems.join('\n  - ')}`);

/**
 * The stylesheets the styles bring themselves, each in a `<style>` at the end of the page's
 * head as the page loads — so after `style.css` however the build splits its chunks. Their
 * rules build on the shared ones and win ties with them by coming later, as when they stood
 * in `style.css`: a titled Wild West banner's letter-spacing and its news line's do. Imported
 * as plain CSS, Vite put the Wild West's sheet in the chunk the registry fell into, linked
 * before `style.css`, and those two ties went the other way (SP1a).
 */
function installStylesheets(styles: readonly StyleDefinition[]): void {
  if (globalThis.document === undefined) return;
  for (const style of styles) {
    if (style.stylesheet === undefined) continue;
    const node = document.createElement('style');
    node.dataset.style = style.id;
    node.textContent = style.stylesheet;
    document.head.append(node);
  }
}

installStylesheets(STYLES);
