import { describe, expect, it } from 'vitest';

import { languageOfSteam } from './steamLanguage.js';

describe('the language from Steam’s', () => {
  it('is Deutsch for German, English for anything else', () => {
    expect(languageOfSteam('german')).toBe('de');
    expect(languageOfSteam('english')).toBe('en');
    expect(languageOfSteam('french')).toBe('en');
    expect(languageOfSteam(null)).toBe('en');
  });
});
