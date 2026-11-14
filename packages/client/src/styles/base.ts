import type { ArtLook } from '@bollfort/config';

import {
  animeTitle,
  blockTitle,
  brickTitle,
  cartoonTitle,
  chocolateTitle,
  christmasTitle,
  electricTitle,
  glassTitle,
  halloweenTitle,
  inkedTitle,
  moonlitTitle,
  mythologyTitle,
  neonTitle,
  noirTitle,
  officeTitle,
  operaTitle,
  piratesTitle,
  planTitle,
  sakuraTitle,
  sportsTitle,
  stoneTitle,
  underseaTitle,
  wiesnTitle,
} from '../titles.js';

import type { StyleDefinition, StyleFlavour } from './definition.js';

/** Every look a style may be made for: all of the base styles are made for both. */
const BOTH: readonly ArtLook[] = ['build', 'combat'];

/**
 * A style's own words under each phase's call (ARCHIVE 14d, 14q, 14w, 14x): its texts named
 * `<style>.call.<phase>` in the shared locale files.
 */
function calls(style: 'sports' | 'pirates' | 'anime' | 'mythology'): StyleFlavour {
  return {
    castle_select: `${style}.call.castleSelect` as const,
    combat: `${style}.call.combat` as const,
    build: `${style}.call.build` as const,
    cannon_place: `${style}.call.cannonPlace` as const,
    final: `${style}.call.final` as const,
  };
}

/**
 * The styles whose parts live in the shared files — their config in `config/art.default.json`,
 * their texts in `config/locale/`, their music in the audio manifest, their skins in
 * `style.css` — in the order the menu offers them. A style that brings its parts itself is in
 * a folder of its own beside this file (`wildwest/`).
 *
 * Visual styles are interchangeable implementations of one renderer interface.
 * `flat` is the minimal look: solid colour, no textures, no atlas to generate. `night` is
 * the pixel style under a palette of its own (`stylePalettes`). `cyberpunk` is neon
 * outlines on a dark circuit board, `blueprint` a plan in white ink on blue paper,
 * `parchment` an old hand-drawn map, `bricks` a board built of toy bricks, `glass` a
 * church window of stained glass, `chocolate` a sweet-shop land on a river of chocolate,
 * `halloween` a haunted land round a bog, `sakura` an Edo castle town as a woodblock print,
 * `oktoberfest` the beer festival on an island in a sea of beer, `opera` a night at the opera
 * on a sea whose waves are staves, `office` an open-plan office at war with itself,
 * `undersea` a coral reef on the seabed, the deep all round it, `electric` a storm
 * laboratory under a thunderstorm, `cartoon` a 1930s rubber-hose cartoon in black and white, `christmas` a snowy island on Christmas Eve,
 * `noir` a crime city at night drawn as a cel-shaded graphic novel, `sports` a stadium whose
 * guns are sportsmen of ten ball sports throwing, kicking and hitting their balls, `pirates`
 * a pirates' cove in Caribbean daylight, log stockades and ship's cannon with parrots on them,
 * `anime` a summer's day in an anime, its guns chibi heroes of eight clans, a clan to a team,
 * `mythology` ancient Greece as black-figure vase painting, its guns onager catapults.
 */
export const BASE_STYLES: readonly StyleDefinition[] = [
  {
    id: 'flat',
    looks: BOTH,
    name: 'style.flat',
    banner: 'banner-flat',
    skin: 'hud-flat',
    title: blockTitle,
    theme: () => import('../render/flat.js').then((m) => () => new m.FlatTheme()),
  },
  {
    id: 'pixel',
    looks: BOTH,
    name: 'style.pixel',
    banner: 'banner-classic',
    skin: 'hud-classic',
    title: stoneTitle,
    theme: () =>
      import('../render/pixel.js').then((m) => (seed) => new m.PixelTheme(seed, 'pixel')),
  },
  {
    id: 'night',
    looks: BOTH,
    name: 'style.night',
    banner: 'banner-classic',
    skin: 'hud-classic',
    title: moonlitTitle,
    theme: () =>
      import('../render/pixel.js').then((m) => (seed) => new m.PixelTheme(seed, 'night')),
  },
  {
    id: 'cyberpunk',
    looks: BOTH,
    name: 'style.cyberpunk',
    banner: 'banner-neon',
    skin: 'hud-neon',
    title: neonTitle,
    theme: () => import('../render/cyberpunk.js').then((m) => (seed) => new m.CyberpunkTheme(seed)),
  },
  {
    id: 'blueprint',
    looks: BOTH,
    name: 'style.blueprint',
    banner: 'banner-plan',
    skin: 'hud-plan',
    title: planTitle,
    theme: () => import('../render/blueprint.js').then((m) => () => new m.BlueprintTheme()),
  },
  {
    id: 'parchment',
    looks: BOTH,
    name: 'style.parchment',
    banner: 'banner-ribbon',
    skin: 'hud-ink',
    title: inkedTitle,
    theme: () => import('../render/parchment.js').then((m) => (seed) => new m.ParchmentTheme(seed)),
  },
  {
    id: 'bricks',
    looks: BOTH,
    name: 'style.bricks',
    banner: 'banner-bricks',
    skin: 'hud-bricks',
    title: brickTitle,
    theme: () => import('../render/bricks.js').then((m) => () => new m.BricksTheme()),
  },
  {
    id: 'glass',
    looks: BOTH,
    name: 'style.glass',
    banner: 'banner-glass',
    skin: 'hud-glass',
    title: glassTitle,
    theme: () => import('../render/glass.js').then((m) => () => new m.GlassTheme()),
  },
  {
    id: 'chocolate',
    looks: BOTH,
    name: 'style.chocolate',
    banner: 'banner-chocolate',
    skin: 'hud-chocolate',
    title: chocolateTitle,
    theme: () => import('../render/chocolate.js').then((m) => (seed) => new m.ChocolateTheme(seed)),
  },
  {
    id: 'halloween',
    looks: BOTH,
    name: 'style.halloween',
    banner: 'banner-halloween',
    skin: 'hud-halloween',
    title: halloweenTitle,
    theme: () => import('../render/halloween.js').then((m) => (seed) => new m.HalloweenTheme(seed)),
  },
  {
    id: 'sakura',
    looks: BOTH,
    name: 'style.sakura',
    banner: 'banner-sakura',
    skin: 'hud-sakura',
    title: sakuraTitle,
    theme: () => import('../render/sakura.js').then((m) => (seed) => new m.SakuraTheme(seed)),
  },
  {
    id: 'oktoberfest',
    looks: BOTH,
    name: 'style.oktoberfest',
    banner: 'banner-wiesn',
    skin: 'hud-wiesn',
    title: wiesnTitle,
    theme: () =>
      import('../render/oktoberfest.js').then((m) => (seed) => new m.OktoberfestTheme(seed)),
  },
  {
    id: 'opera',
    looks: BOTH,
    name: 'style.opera',
    banner: 'banner-opera',
    skin: 'hud-opera',
    title: operaTitle,
    theme: () => import('../render/opera.js').then((m) => (seed) => new m.OperaTheme(seed)),
  },
  {
    id: 'office',
    looks: BOTH,
    name: 'style.office',
    banner: 'banner-office',
    skin: 'hud-office',
    title: officeTitle,
    theme: () => import('../render/office.js').then((m) => (seed) => new m.OfficeTheme(seed)),
  },
  {
    id: 'undersea',
    looks: BOTH,
    name: 'style.undersea',
    banner: 'banner-undersea',
    skin: 'hud-undersea',
    title: underseaTitle,
    theme: () => import('../render/undersea.js').then((m) => (seed) => new m.UnderseaTheme(seed)),
  },
  {
    id: 'electric',
    looks: BOTH,
    name: 'style.electric',
    banner: 'banner-electric',
    skin: 'hud-electric',
    title: electricTitle,
    theme: () => import('../render/electric.js').then((m) => (seed) => new m.ElectricTheme(seed)),
  },
  {
    id: 'cartoon',
    looks: BOTH,
    name: 'style.cartoon',
    banner: 'banner-cartoon',
    skin: 'hud-cartoon',
    title: cartoonTitle,
    theme: () => import('../render/cartoon.js').then((m) => (seed) => new m.CartoonTheme(seed)),
  },
  {
    id: 'christmas',
    looks: BOTH,
    name: 'style.christmas',
    banner: 'banner-christmas',
    skin: 'hud-christmas',
    title: christmasTitle,
    theme: () => import('../render/christmas.js').then((m) => (seed) => new m.ChristmasTheme(seed)),
  },
  {
    id: 'noir',
    looks: BOTH,
    name: 'style.noir',
    banner: 'banner-noir',
    skin: 'hud-noir',
    title: noirTitle,
    theme: () => import('../render/noir.js').then((m) => (seed) => new m.NoirTheme(seed)),
  },
  {
    id: 'sports',
    looks: BOTH,
    name: 'style.sports',
    banner: 'banner-sports',
    skin: 'hud-sports',
    flavour: calls('sports'),
    title: sportsTitle,
    theme: () => import('../render/sports.js').then((m) => (seed) => new m.SportsTheme(seed)),
  },
  {
    id: 'pirates',
    looks: BOTH,
    name: 'style.pirates',
    banner: 'banner-pirates',
    skin: 'hud-pirates',
    flavour: calls('pirates'),
    title: piratesTitle,
    theme: () => import('../render/pirates.js').then((m) => (seed) => new m.PiratesTheme(seed)),
  },
  {
    id: 'anime',
    looks: BOTH,
    name: 'style.anime',
    banner: 'banner-anime',
    skin: 'hud-anime',
    flavour: calls('anime'),
    title: animeTitle,
    theme: () => import('../render/anime.js').then((m) => (seed) => new m.AnimeTheme(seed)),
  },
  {
    id: 'mythology',
    looks: BOTH,
    name: 'style.mythology',
    banner: 'banner-mythology',
    skin: 'hud-mythology',
    flavour: calls('mythology'),
    title: mythologyTitle,
    theme: () => import('../render/mythology.js').then((m) => (seed) => new m.MythologyTheme(seed)),
  },
];
