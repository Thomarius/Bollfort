import { describe, expect, it } from 'vitest';

import { inApp, titleFor } from './pageTitle.js';

describe('the tab', () => {
  it('names a room and how many people sit at it, or a pause, after the game', () => {
    expect(titleFor(null)).toBe('Bollfort');
    expect(titleFor({ kind: 'room', code: 'ABCD', people: 2, seats: 4 })).toBe(
      'Bollfort · Room ABCD · 2/4',
    );
    expect(titleFor({ kind: 'paused' })).toBe('Bollfort · Paused');
  });

  it('knows the desktop and Steam apps by Electron in the user agent', () => {
    expect(
      inApp('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0 Electron/39.2.0'),
    ).toBe(true);
    expect(inApp('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0')).toBe(false);
  });
});
