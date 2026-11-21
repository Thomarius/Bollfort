import { describe, expect, it } from 'vitest';

import { placeOn, readBounds } from './windowPlace.js';

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe("the game window's place", () => {
  it('reads what was saved, and nothing broken or too small', () => {
    const bounds = { x: 100, y: 80, width: 1280, height: 800 };
    expect(readBounds({ fullscreen: false, bounds })).toEqual(bounds);
    expect(readBounds(null)).toBeNull();
    expect(readBounds({ bounds: { x: 1, y: 2, width: '3', height: 4 } })).toBeNull();
    expect(readBounds({ bounds: { x: 0, y: 0, width: 300, height: 200 } })).toBeNull();
    expect(readBounds({ bounds: { x: 0.5, y: 0, width: 1280, height: 800 } })).toBeNull();
  });

  it('opens where it was while that is on a screen', () => {
    const bounds = { x: 100, y: 80, width: 1280, height: 800 };
    expect(placeOn(bounds, [screen])).toEqual(bounds);
  });

  it('opens centred when its screen has gone, or nothing was saved', () => {
    const onSecond = { x: 2100, y: 100, width: 1280, height: 800 };
    expect(placeOn(onSecond, [screen])).toBeNull();
    expect(placeOn(onSecond, [screen, { x: 1920, y: 0, width: 2560, height: 1400 }])).toEqual(
      onSecond,
    );
    expect(placeOn(null, [screen])).toBeNull();
  });

  it('wants more than a sliver on screen', () => {
    expect(placeOn({ x: 1850, y: 100, width: 1280, height: 800 }, [screen])).toBeNull();
  });
});
