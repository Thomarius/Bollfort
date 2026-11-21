import { describe, expect, it } from 'vitest';

import { FIT_FLOOR_PX, fittedSize } from './fitText.js';

describe('a title fitted to its box', () => {
  it('keeps its size when it fits', () => {
    expect(fittedSize(16, 180, 200)).toBe(16);
    expect(fittedSize(16, 200, 200)).toBe(16);
  });

  it('shrinks by the ratio it is too wide, rounded down', () => {
    // "GROSSGRUNDBESITZ" in a wide face: 236 px of text in a 210 px card.
    expect(fittedSize(16, 236, 210)).toBe(14.2);
    expect(fittedSize(16, 200, 150)).toBe(12);
    expect(fittedSize(16, 16 * 200, FIT_FLOOR_PX * 200)).toBe(FIT_FLOOR_PX);
  });

  it('gives up below the floor, so a long name wraps rather than shrinking to nothing', () => {
    expect(fittedSize(16, 400, 200)).toBeNull();
    expect(fittedSize(16, 400, 200, 7)).toBe(8);
  });

  it('measures nothing in a box not laid out', () => {
    expect(fittedSize(16, 120, 0)).toBeNull();
    expect(fittedSize(16, 0, 120)).toBeNull();
  });
});
