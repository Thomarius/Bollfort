import {
  LANGUAGES,
  defaultArtConfig,
  defaultAudioManifest,
  localeProblems,
  locales,
} from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import { allTexts, audioManifest, ownPalette, styleDataProblems } from './data.js';
import type { StyleData, StyleDefinition } from './definition.js';
import {
  STYLES,
  STYLE_IDS,
  STYLE_LOOKS,
  chooseStyle,
  isStyle,
  registryProblems,
  styleArt,
  styleDefinition,
  stylesFor,
} from './registry.js';
import { wildwest } from './wildwest/index.js';

describe('styles per look', () => {
  // No shipped style is made for one look yet, so the rules are tried on a table that has
  // one: pixel for combat alone.
  const looks = { ...STYLE_LOOKS, pixel: ['combat'] as const };

  it('offers every shipped style for a look it is made for, the defaults included', () => {
    expect(stylesFor('build')).toContain(defaultArtConfig.styles.build);
    expect(stylesFor('combat')).toContain(defaultArtConfig.styles.combat);
  });

  it('offers a look only the styles made for it', () => {
    expect(stylesFor('build', looks)).not.toContain('pixel');
    expect(stylesFor('combat', looks)).toContain('pixel');
  });

  it('takes the first candidate made for the look, and falls through the rest', () => {
    expect(chooseStyle('build', ['pixel', 'night'], 'flat', looks)).toBe('night');
    expect(chooseStyle('combat', ['pixel', 'night'], 'flat', looks)).toBe('pixel');
  });

  it('offers every shipped style for both looks, cyberpunk and the Wild West included', () => {
    for (const style of ['cyberpunk', 'wildwest']) {
      expect(stylesFor('build')).toContain(style);
      expect(stylesFor('combat')).toContain(style);
    }
  });

  it('falls back past a missing, unknown or stale choice', () => {
    expect(chooseStyle('build', [null, undefined, 'sepia', 42], 'flat', looks)).toBe('flat');
    expect(chooseStyle('build', ['pixel'], 'flat', looks)).toBe('flat');
  });
});

describe('the registry', () => {
  it('lists the 24 styles in the menu’s order, the Wild West last', () => {
    expect(STYLE_IDS).toHaveLength(24);
    expect(STYLE_IDS[0]).toBe('flat');
    expect(STYLE_IDS.at(-1)).toBe('wildwest');
    expect(styleDefinition('wildwest')).toBe(wildwest);
  });

  it('knows a style by its name only', () => {
    expect(isStyle('noir')).toBe(true);
    expect(isStyle('sepia')).toBe(false);
    expect(isStyle('random')).toBe(false);
    expect(isStyle(7)).toBe(false);
    expect(() => styleDefinition('sepia')).toThrow(/sepia/);
  });

  it('agrees with the shared files as they stand', () => {
    expect(registryProblems()).toEqual([]);
    expect(styleDataProblems()).toEqual([]);
  });

  it('refuses colours or a track for a style there is not, and a default not made for its look', () => {
    const art = {
      ...defaultArtConfig,
      stylePalettes: { ...defaultArtConfig.stylePalettes, sepia: {} },
      styles: { build: 'sepia', combat: 'noir' },
    };
    expect(registryProblems(STYLES, art)).toEqual([
      'art: stylePalettes has colours for "sepia", no style',
      'art: the build look\'s "sepia" is not a style made for it',
    ]);
  });

  it('refuses a style twice, misnamed, named "random" or made for no look', () => {
    const like = (id: string, looks: StyleDefinition['looks'] = ['build']): StyleDefinition => ({
      ...wildwest,
      id,
      looks,
    });
    const problems = registryProblems([
      ...STYLES,
      like('noir'),
      like('Sepia'),
      like('random'),
      like('x', []),
    ]);
    expect(problems).toEqual([
      'style "noir" is listed twice',
      'style "Sepia": not lower case letters',
      'no style may be named "random"',
      'style "x" is made for no look',
    ]);
  });
});

describe('a style with parts of its own', () => {
  it('brings its texts into every language, named for itself and complete', () => {
    for (const language of LANGUAGES) {
      expect(allTexts[language]['style.wildwest']).toBeDefined();
      // Merged over the shared locale, which keeps every text of its own.
      expect(Object.keys(allTexts[language])).toHaveLength(
        Object.keys(locales[language]).length + Object.keys(wildwest.texts!.en).length,
      );
      expect(localeProblems(wildwest.texts!.en, wildwest.texts![language]), language).toEqual([]);
    }
    expect(allTexts.de['style.wildwest']).toBe('Wilder Westen');
  });

  it('brings its track and its credit into the manifest, after the manifest’s own', () => {
    expect(defaultAudioManifest.styleMusic.wildwest).toBeUndefined();
    expect(audioManifest.styleMusic.wildwest).toEqual(wildwest.music!.entry);
    expect(Object.keys(audioManifest.styleMusic).at(-1)).toBe('wildwest');
    expect(audioManifest.credits[wildwest.music!.entry.file]).toEqual(wildwest.music!.credit);
  });

  it('draws in its own colours', () => {
    expect(defaultArtConfig.stylePalettes.wildwest).toBeUndefined();
    expect(ownPalette('wildwest')).toBe(wildwest.palette);
    expect(styleArt(defaultArtConfig, 'wildwest').palette.waterMid).toBe('#cdbfa6');
    expect(styleArt(defaultArtConfig, 'night')).not.toBe(defaultArtConfig);
    expect(styleArt(defaultArtConfig, 'cyberpunk').palette).toBeDefined();
  });

  it('is refused texts not named for it, or in the shared locale too, and colours that move a hue', () => {
    const players = defaultArtConfig.players.map((p, i) =>
      i === 0 ? { ...p, base: '#00ff00' } : p,
    );
    const bad: StyleData = {
      id: 'sepia',
      looks: ['build'],
      texts: {
        en: { 'style.sepia': 'Sepia', 'noir.words': 'x', 'call.combat': 'x' },
        de: {},
        hes: {},
      },
      palette: { players },
    };
    expect(styleDataProblems([bad])).toEqual([
      'style "sepia": its text "noir.words" is not named for it',
      'style "sepia": its text "noir.words" is in the shared locale too',
      'style "sepia": its text "call.combat" is not named for it',
      'style "sepia": its text "call.combat" is in the shared locale too',
      `style "sepia": "${players[0]!.name}" moves its hue by 128 degrees`,
    ]);
  });
});
