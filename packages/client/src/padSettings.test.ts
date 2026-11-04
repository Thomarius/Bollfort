import { describe, expect, it } from 'vitest';

import { DEFAULT_BINDINGS } from './gamepad.js';
import { buttonName, parseBindings, parseCursorSpeed, rebind } from './padSettings.js';

describe('binding a button', () => {
  it('gives the action the button', () => {
    expect(rebind(DEFAULT_BINDINGS, 'accept', 2)).toEqual({ accept: [2], turn: [1], menu: [9] });
  });

  it('swaps with the action that had it, so each keeps one and none is left without', () => {
    // B to Accept: Turn takes A, Accept's old one.
    expect(rebind(DEFAULT_BINDINGS, 'accept', 1)).toEqual({ accept: [1], turn: [0], menu: [9] });
    // A to Menu: Accept takes Start.
    expect(rebind(DEFAULT_BINDINGS, 'menu', 0)).toEqual({ accept: [9], turn: [1], menu: [0] });
  });

  it('leaves the d-pad and the guide button alone', () => {
    for (const button of [12, 13, 14, 15, 16])
      expect(rebind(DEFAULT_BINDINGS, 'accept', button)).toBe(DEFAULT_BINDINGS);
  });
});

describe('the bindings as saved', () => {
  it('reads back what was saved', () => {
    const saved = rebind(DEFAULT_BINDINGS, 'turn', 3);
    expect(parseBindings(JSON.stringify(saved))).toEqual(saved);
  });

  it('refuses anything not a whole, valid set, so the defaults stand', () => {
    for (const text of [
      null,
      'nonsense',
      '{}',
      '{"accept":[0],"turn":[1]}',
      '{"accept":[0],"turn":[0],"menu":[9]}',
      '{"accept":[13],"turn":[1],"menu":[9]}',
      '{"accept":[0,2],"turn":[1],"menu":[9]}',
    ])
      expect(parseBindings(text)).toBeNull();
  });
});

describe('the names and the cursor speed', () => {
  it('names the buttons as an Xbox pad prints them', () => {
    expect([0, 1, 2, 3, 9].map(buttonName)).toEqual(['A', 'B', 'X', 'Y', 'Start']);
  });

  it('reads a saved speed, and nothing else', () => {
    expect(parseCursorSpeed('fast')).toBe('fast');
    expect(parseCursorSpeed('warp')).toBeNull();
  });
});
