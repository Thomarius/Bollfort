import { describe, expect, it } from 'vitest';

import { parseStyleMusic, styleMusicOn } from './styleMusicSetting.js';

describe('the style music setting', () => {
  it('is on or off, nothing between (the user’s, 2026-11-17)', () => {
    expect(styleMusicOn('on')).toBe(true);
    expect(styleMusicOn('off')).toBe(false);
  });

  it('reads its own two values back, and the three saved before as the nearest', () => {
    expect(parseStyleMusic('on')).toBe('on');
    expect(parseStyleMusic('off')).toBe('off');
    expect(parseStyleMusic('always')).toBe('on');
    expect(parseStyleMusic('half')).toBe('on');
    expect(parseStyleMusic('never')).toBe('off');
    expect(parseStyleMusic('sometimes')).toBeNull();
    expect(parseStyleMusic(null)).toBeNull();
  });
});
