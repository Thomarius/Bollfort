import { describe, expect, it } from 'vitest';

import {
  SHOW_ANYWAY_MS,
  placeOn,
  readBounds,
  showWhenPainted,
  type PaintedWindow,
} from './windowPlace.js';

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

describe('a window shown once painted', () => {
  const fake = (): {
    window: PaintedWindow;
    paint: () => void;
    shown: () => number;
    destroy: () => void;
  } => {
    let painted: (() => void) | null = null;
    let visible = false;
    let destroyed = false;
    let shows = 0;
    return {
      window: {
        once: (_event, listener) => (painted = listener),
        show: () => {
          shows++;
          visible = true;
        },
        isVisible: () => visible,
        isDestroyed: () => destroyed,
      },
      paint: () => painted?.(),
      shown: () => shows,
      destroy: () => (destroyed = true),
    };
  };

  it('shows at its first paint, and once only', () => {
    const f = fake();
    let late: (() => void) | null = null;
    showWhenPainted(f.window, (run) => (late = run));
    expect(f.shown()).toBe(0);
    f.paint();
    expect(f.shown()).toBe(1);
    late!();
    expect(f.shown()).toBe(1);
  });

  it('shows anyway when the paint never comes, but not a window already gone', () => {
    const f = fake();
    let late: (() => void) | null = null;
    let wait = 0;
    showWhenPainted(f.window, (run, ms) => {
      late = run;
      wait = ms;
    });
    expect(wait).toBe(SHOW_ANYWAY_MS);
    late!();
    expect(f.shown()).toBe(1);
    const gone = fake();
    let goneLate: (() => void) | null = null;
    showWhenPainted(gone.window, (run) => (goneLate = run));
    gone.destroy();
    goneLate!();
    expect(gone.shown()).toBe(0);
  });
});
