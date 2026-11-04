import { describe, expect, it } from 'vitest';

import { DEFAULT_BINDINGS } from './gamepad.js';
import { glyphHtml, glyphLabel, padFamily, withGlyphs } from './glyphs.js';

describe('button glyphs', () => {
  it("tells a PlayStation pad by its name or Sony's vendor ID, and takes anything else for Xbox's layout", () => {
    expect(
      padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'),
    ).toBe('playstation');
    expect(padFamily('Wireless Controller (Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(padFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(padFamily('Steam Virtual Gamepad (Vendor: 28de Product: 11ff)')).toBe('xbox');
  });

  it('labels the buttons as each family prints them', () => {
    expect([0, 1, 2, 3, 9].map((b) => glyphLabel(b, 'xbox'))).toEqual(['A', 'B', 'X', 'Y', 'Menu']);
    expect([0, 1, 2, 3, 9].map((b) => glyphLabel(b, 'playstation'))).toEqual([
      '✕',
      '○',
      '□',
      '△',
      'Options',
    ]);
  });

  it('draws the face buttons round and the rest as pills', () => {
    expect(glyphHtml(0, 'xbox')).toContain('face');
    expect(glyphHtml(4, 'xbox')).toContain('pill');
  });

  it('puts each action’s bound button in its place, the text around it escaped', () => {
    const html = withGlyphs((m) => `${m.accept} < ${m.turn} & ${m.menu}`, DEFAULT_BINDINGS, 'xbox');
    expect(html).toBe(
      `${glyphHtml(0, 'xbox')} &lt; ${glyphHtml(1, 'xbox')} &amp; ${glyphHtml(9, 'xbox')}`,
    );
  });

  it('shows a remapped button as bound', () => {
    const html = withGlyphs((m) => m.accept, { accept: [2], turn: [1], menu: [9] }, 'playstation');
    expect(html).toBe(glyphHtml(2, 'playstation'));
  });
});
