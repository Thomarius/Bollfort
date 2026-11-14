import {
  AudioCreditSchema,
  LocaleSchema,
  StyleMusicEntrySchema,
  StylePaletteSchema,
} from '@bollfort/config';
import { z } from 'zod';

import { styleTextKey, type StyleData, type StyleTexts } from '../definition.js';

import styleJson from './style.json' with { type: 'json' };
import textsJson from './texts.json' with { type: 'json' };

/**
 * The Wild West look (ARCHIVE 14y): mesas over a canyon floor at high noon — adobe
 * walls, staked claims, frontier buildings with windpumps turning while sealed, and mortar
 * barrels for guns lobbing dynamite; tumbleweeds rolling. The first style to bring all of its
 * parts itself (SP1a): its tunables, colours, music and texts here and in `style.json` and
 * `texts.json`, its skin in `style.css`, its title and theme beside them.
 */
export const WildWestStyleSchema = z.strictObject({
  /** A barrel's hop as it fires, its rocking while it reloads, a windpump's turn. */
  hopMs: z.number().int().positive(),
  rockMs: z.number().int().positive(),
  pumpTurnMs: z.number().int().positive(),
  /** Tumbleweeds rolling over each island's open ground, and across the canyon floor. */
  tumbleweedsPerIsland: z.number().int().nonnegative(),
  tumbleweedTilesPerSecond: z.number().positive(),
  floorTumbleweedEveryMs: z.number().int().positive(),
  /** A stagecoach crossing the canyon floor now and then, and vultures circling. */
  stagecoachEveryMs: z.number().int().positive(),
  stagecoachTilesPerSecond: z.number().positive(),
  vultures: z.number().int().nonnegative(),
  /** Gold glinting in the claims each second, and the share of wall hits that letter a word. */
  glintsPerSecond: z.number().nonnegative(),
  wordChance: z.number().min(0).max(1),
  wordMs: z.number().int().positive(),
  /** High noon: the widescreen bars' share of the screen's height, and the heat's shimmer. */
  barShare: z.number().min(0).max(0.5),
  shimmerAlpha: z.number().min(0).max(1),
  /** The locomotive's puff, calm and hurried. */
  puffMs: z.number().int().positive(),
  hurriedPuffMs: z.number().int().positive(),
});
export type WildWestStyleConfig = z.infer<typeof WildWestStyleSchema>;

/** `style.json`: the tunables, the colours over the shared ones, the track and its credit. */
const WildWestFileSchema = z.strictObject({
  config: WildWestStyleSchema,
  palette: StylePaletteSchema,
  music: StyleMusicEntrySchema,
  credit: AudioCreditSchema,
});

/**
 * Parsed as the page loads, as the shared config is, so a typo in either file fails at the
 * start rather than when the look is first drawn.
 */
const file = WildWestFileSchema.parse(styleJson);
const texts: StyleTexts = z
  .strictObject({ en: LocaleSchema, de: LocaleSchema, hes: LocaleSchema })
  .parse(textsJson);

/** The Wild West's tunables, which its theme and its sea life read. */
export const WILDWEST: WildWestStyleConfig = file.config;

/** The words a wall hit may letter, `|` between them. */
export const WILDWEST_WORDS = styleTextKey(texts, 'wildwest.words');

export const wildwestData = {
  id: 'wildwest',
  looks: ['build', 'combat'],
  palette: file.palette,
  music: { entry: file.music, credit: file.credit },
  texts,
} as const satisfies StyleData;

/** Its name, and its words under each phase's call. */
export const wildwestKeys = {
  name: styleTextKey(texts, 'style.wildwest'),
  flavour: {
    castle_select: styleTextKey(texts, 'wildwest.call.castleSelect'),
    combat: styleTextKey(texts, 'wildwest.call.combat'),
    build: styleTextKey(texts, 'wildwest.call.build'),
    cannon_place: styleTextKey(texts, 'wildwest.call.cannonPlace'),
    final: styleTextKey(texts, 'wildwest.call.final'),
  },
};
