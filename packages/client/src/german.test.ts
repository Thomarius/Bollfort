import { defaultAudioManifest, locales, placeholders, type TextKey } from '@bollfort/config';
import type { Seat } from '@bollfort/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { filtersMarkup, gamesMarkup } from './browser.js';
import { creditsHtml } from './credits.js';
import { setLanguage, t } from './i18n.js';
import { lobbyMarkup, type LobbyView } from './lobby.js';
import { galleryMarkup } from './looks.js';

/*
 * The main screens in German and Hessian (PLAN 11.20): a key or a `{placeholder}` showing
 * through would mean a text the mechanism missed, which the English tests cannot see.
 * Hessian keeps the disclaimer in German (the user's choice, 2026-11-01).
 */
const LANGUAGES = [
  { language: 'de', name: 'German', start: 'Spiel starten', medieval: 'Mittelalter' },
  { language: 'hes', name: 'Hessian', start: 'Schbiel starte', medieval: 'Mittelalter' },
] as const;

function seat(playerId: number, name: string): Seat {
  return { playerId, name, isBot: false, connected: true, ready: false, special: null };
}

function view(over: Partial<LobbyView> = {}): LobbyView {
  return {
    code: 'ABC123',
    playerCount: 4,
    hostId: 0,
    humanPlayer: 0,
    seats: [seat(0, 'Ada'), seat(1, 'Bo')],
    bots: [5, 5, 5, 5],
    settings: { maxRounds: 10, teamSize: 2, continues: 2, specials: false },
    settingBounds: {
      maxRounds: { min: 5, max: 20 },
      teamSize: { min: 1, max: 4 },
      continues: { min: 0, max: 4 },
    },
    teams: [0, 0, 1, 1],
    playerLimits: { min: 2, max: 8 },
    seed: 42,
    hostBot: null,
    ...over,
  };
}

/** A key of the locale, written as one ("menu.play", "award.wrecker.detail"). */
const KEY = new RegExp(
  `\\b(${Object.keys(locales.en)
    .map((k) => k.replace(/\./g, '\\.'))
    .join('|')})\\b`,
);

function clean(html: string): void {
  expect(html).not.toMatch(/\{\w+\}/);
  expect(html).not.toMatch(KEY);
}

describe.each(LANGUAGES)('in $name', ({ language, start, medieval }) => {
  beforeAll(() => setLanguage(language));
  afterAll(() => setLanguage('en'));

  it('writes the lobby, for the host and for a guest', () => {
    const host = lobbyMarkup(view());
    clean(host);
    expect(host).toContain(start);
    expect(host).toContain('Team A');
    clean(
      lobbyMarkup(
        view({
          humanPlayer: 1,
          settings: { maxRounds: 10, teamSize: 1, continues: 2, specials: false },
        }),
      ),
    );
  });

  it('writes the open games, the gallery and the credits', () => {
    clean(
      gamesMarkup([
        {
          code: 'ABC123',
          host: 'Ada',
          people: 1,
          playerCount: 4,
          teamSize: 2,
          towers: true,
          tournament: null,
        },
      ]),
    );
    clean(gamesMarkup([]));
    clean(filtersMarkup({ mode: 'teams', towers: 'on' }));
    const gallery = galleryMarkup({ build: 'pixel', combat: 'random' }, 'build');
    clean(gallery);
    expect(gallery).toContain(medieval);
    const credits = creditsHtml(defaultAudioManifest);
    clean(credits);
    expect(credits).toContain('Bollfort ist ein inoffizielles Fanspiel');
  });

  it('fills every text, given its placeholders', () => {
    for (const key of Object.keys(locales.en) as TextKey[]) {
      const params = Object.fromEntries(
        [...placeholders(locales.en[key]!)].map((name) => [name, name === 'n' ? 2 : 'X']),
      );
      expect(t(key, params), key).not.toMatch(/\{\w+\}/);
    }
  });
});
