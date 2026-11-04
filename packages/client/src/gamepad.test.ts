import { defaultArtConfig } from '@bollfort/config';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINDINGS,
  Repeater,
  heading,
  moveCursor,
  nearestBoxInDirection,
  nearestInDirection,
  pointBox,
  pressedSince,
  readPad,
  stepTile,
  type PadLike,
} from './gamepad.js';

const tuning = defaultArtConfig.gamepad;

/** A standard-mapping pad with these buttons down and the left stick here. */
function pad(buttons: number[] = [], stick: [number, number] = [0, 0]): PadLike {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
    axes: [stick[0], stick[1], 0, 0],
  };
}

describe('reading a pad', () => {
  it('reads A as Accept, B as Turn and Start as Menu', () => {
    expect([...readPad(pad([0]), DEFAULT_BINDINGS, 0.25).held]).toEqual(['accept']);
    expect([...readPad(pad([1, 9]), DEFAULT_BINDINGS, 0.25).held]).toEqual(['turn', 'menu']);
  });

  it('follows the bindings, a button bound elsewhere doing what it is bound to', () => {
    const swapped = { accept: [1], turn: [0], menu: [9] };
    expect([...readPad(pad([0]), swapped, 0.25).held]).toEqual(['turn']);
  });

  it('reads the d-pad as steps, down and right positive', () => {
    expect(readPad(pad([12, 15]), DEFAULT_BINDINGS, 0.25).dpad).toEqual({ x: 1, y: -1 });
  });

  it('ignores the stick inside its dead zone, and rescales it outside', () => {
    const resting = readPad(pad([], [0.2, 0.1]), DEFAULT_BINDINGS, 0.25);
    expect(resting.stick).toEqual({ x: 0, y: 0 });
    expect(resting.touched).toBe(false);
    const full = readPad(pad([], [1, 0]), DEFAULT_BINDINGS, 0.25);
    expect(full.stick).toEqual({ x: 1, y: 0 });
    expect(full.touched).toBe(true);
    const half = readPad(pad([], [0, 0.625]), DEFAULT_BINDINGS, 0.25);
    expect(half.stick.y).toBeCloseTo(0.5);
  });

  it('acts on a press once, not for as long as it is held', () => {
    const before = new Set<'accept'>();
    const held = new Set(['accept'] as const);
    expect([...pressedSince(before, held)]).toEqual(['accept']);
    expect([...pressedSince(held, held)]).toEqual([]);
  });
});

describe('the way the pad points', () => {
  it('takes the d-pad over the stick', () => {
    const r = readPad(pad([14], [1, 0]), DEFAULT_BINDINGS, 0.25);
    expect(heading(r)).toEqual({ dir: { x: -1, y: 0 }, strength: 0 });
  });

  it('keeps a stick held a little off straight on its axis, and a diagonal diagonal', () => {
    expect(heading(readPad(pad([], [1, 0.3]), DEFAULT_BINDINGS, 0.25)).dir).toEqual({
      x: 1,
      y: 0,
    });
    expect(heading(readPad(pad([], [0.7, 0.7]), DEFAULT_BINDINGS, 0.25)).dir).toEqual({
      x: 1,
      y: 1,
    });
  });
});

describe('a held direction', () => {
  it('steps at once, waits, then repeats', () => {
    const repeater = new Repeater(tuning);
    const right = { x: 1, y: 0 };
    expect(repeater.update(right, 0, 16)).toEqual({ x: 1, y: 0 });
    // Inside the delay, nothing more.
    expect(repeater.update(right, 0, tuning.repeatDelayMs - 20)).toEqual({ x: 0, y: 0 });
    expect(repeater.update(right, 0, 20)).toEqual({ x: 1, y: 0 });
    expect(repeater.update(right, 0, tuning.repeatMs)).toEqual({ x: 1, y: 0 });
  });

  it('repeats faster with the stick pushed further', () => {
    const count = (strength: number): number => {
      const repeater = new Repeater(tuning);
      let steps = 0;
      for (let ms = 0; ms < 2000; ms += 16)
        steps += repeater.update({ x: 0, y: 1 }, strength, 16).y;
      return steps;
    };
    expect(count(1)).toBeGreaterThan(count(0.1) * 1.8);
  });

  it('starts again with a step at once when the direction changes', () => {
    const repeater = new Repeater(tuning);
    repeater.update({ x: 1, y: 0 }, 0, 16);
    expect(repeater.update({ x: 0, y: 1 }, 0, 16)).toEqual({ x: 0, y: 1 });
    expect(repeater.update({ x: 0, y: 0 }, 0, 16)).toEqual({ x: 0, y: 0 });
    expect(repeater.update({ x: 0, y: 1 }, 0, 16)).toEqual({ x: 0, y: 1 });
  });
});

describe('the reticle', () => {
  const size = { width: 40, height: 30 };

  it('moves with the stick, finely at a light touch, and faster held boosted', () => {
    const at = { x: 10, y: 10 };
    const full = readPad(pad([], [1, 0]), DEFAULT_BINDINGS, 0.25);
    const light = readPad(pad([], [0.4, 0]), DEFAULT_BINDINGS, 0.25);
    const second = (r: typeof full, boost: boolean): number =>
      moveCursor(at, r, boost, 1000, tuning, size).x - at.x;
    expect(second(full, false)).toBeCloseTo(tuning.cursorTilesPerSecond);
    expect(second(light, false)).toBeLessThan(tuning.cursorTilesPerSecond * 0.05);
    expect(Math.min(30, second(full, true))).toBeCloseTo(
      Math.min(30, tuning.cursorTilesPerSecond * tuning.boost),
    );
  });

  it('stays on the board', () => {
    const r = readPad(pad([14, 12]), DEFAULT_BINDINGS, 0.25);
    expect(moveCursor({ x: 1, y: 1 }, r, true, 5000, tuning, size)).toEqual({ x: 0, y: 0 });
    const out = readPad(pad([15, 13]), DEFAULT_BINDINGS, 0.25);
    const far = moveCursor({ x: 38, y: 28 }, out, true, 5000, tuning, size);
    expect(Math.floor(far.x)).toBe(39);
    expect(Math.floor(far.y)).toBe(29);
  });
});

describe('the nearest thing in a direction', () => {
  // Three castles: one right and a little down, one nearer but straight down, one left.
  //   A . . . . . B
  //   . . . . . . .
  //   C . . . . . .
  const items = [
    { at: { x: 6, y: 1 }, item: 'right' },
    { at: { x: 0, y: 3 }, item: 'below' },
    { at: { x: -5, y: 0 }, item: 'left' },
  ];

  it('picks what lies that way, straight ahead weighed nearer than off to the side', () => {
    const from = { x: 0, y: 0 };
    expect(nearestInDirection(from, items, { x: 1, y: 0 })).toBe('right');
    expect(nearestInDirection(from, items, { x: 0, y: 1 })).toBe('below');
    expect(nearestInDirection(from, items, { x: -1, y: 0 })).toBe('left');
  });

  it('finds nothing where nothing lies', () => {
    expect(nearestInDirection({ x: 0, y: 0 }, items, { x: 0, y: -1 })).toBeNull();
  });
});

describe('a grid step', () => {
  it('moves by whole tiles and stops at the edge', () => {
    const size = { width: 5, height: 4 };
    expect(stepTile({ x: 2, y: 2 }, { x: 1, y: -1 }, size)).toEqual({ x: 3, y: 1 });
    expect(stepTile({ x: 4, y: 3 }, { x: 2, y: 2 }, size)).toEqual({ x: 4, y: 3 });
  });
});

describe('the nearest button in a direction', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({
    left,
    top,
    right,
    bottom,
  });
  // A wide button, and below it a narrow one to the left, a full-width one further down,
  // and a button off to the right on its own row.
  //   [  wide  ]
  //   [narrow]        [aside]
  //   [   further   ]
  const wide = box(0, 0, 400, 50);
  const items = [
    { box: box(0, 70, 200, 110), item: 'narrow' },
    { box: box(0, 200, 400, 240), item: 'further' },
    { box: box(500, 70, 600, 110), item: 'aside' },
  ];

  it('goes to the nearest one below that overlaps, though its centre is off to the side', () => {
    expect(nearestBoxInDirection(wide, items, { x: 0, y: 1 })).toBe('narrow');
  });

  it('takes only what lies wholly beyond the edge pushed', () => {
    expect(nearestBoxInDirection(items[0]!.box, items, { x: 1, y: 0 })).toBe('aside');
    expect(nearestBoxInDirection(items[0]!.box, items, { x: -1, y: 0 })).toBeNull();
  });

  it("puts a control's own nested ones first, measured centre to centre", () => {
    const card = box(100, 100, 260, 240);
    const heart = box(104, 104, 124, 124);
    const above = box(100, 60, 260, 90);
    const nested = [
      { box: above, item: 'above' },
      { box: pointBox(heart), item: 'heart', from: pointBox(card), first: true },
    ];
    expect(nearestBoxInDirection(card, nested, { x: 0, y: -1 })).toBe('heart');
    // Not that way: the heart is up and left of the card's centre, not below it.
    expect(nearestBoxInDirection(card, nested, { x: 0, y: 1 })).toBeNull();
  });
});
