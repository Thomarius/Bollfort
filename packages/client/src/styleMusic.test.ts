import { describe, expect, it } from 'vitest';

import { lookTrack, type StyleTrackRules } from './styleMusic.js';

/** Medieval and Minimal keep the shared music, as the manifest has it. */
const rules = (on = true): StyleTrackRules => ({
  on,
  hasTrack: (style) => style !== 'pixel' && style !== 'flat',
});

describe('a look’s track (the user’s rule, 2026-11-17)', () => {
  it('is the style’s own when on, whatever played before but itself', () => {
    expect(lookTrack('anime', 'music_admin', null, rules())).toBe('style:anime');
    expect(lookTrack('anime', 'music_battle', 'music_admin', rules())).toBe('style:anime');
    expect(lookTrack('anime', 'music_admin', 'style:noir', rules())).toBe('style:anime');
  });

  it('is the shared music when the style’s own just played, so the music still changes', () => {
    expect(lookTrack('opera', 'music_battle', 'style:opera', rules())).toBe('music_battle');
  });

  it('is the shared music for a style without a track of its own', () => {
    expect(lookTrack('pixel', 'music_admin', null, rules())).toBe('music_admin');
  });

  it('is always the shared music when off', () => {
    expect(lookTrack('anime', 'music_admin', null, rules(false))).toBe('music_admin');
    expect(lookTrack('anime', 'music_battle', 'music_admin', rules(false))).toBe('music_battle');
  });

  it('never repeats the track just played, over any run of looks', () => {
    const styles = ['opera', 'noir', 'pixel', 'anime'] as const;
    let previous: ReturnType<typeof lookTrack> | null = null;
    // A fixed sequence of looks, building and combat in turn, each in one of four styles.
    for (let k = 0; k < 60; k++) {
      const style = styles[(k * 7 + Math.floor(k / 3)) % styles.length]!;
      const track = lookTrack(
        style,
        k % 2 === 0 ? 'music_admin' : 'music_battle',
        previous,
        rules(),
      );
      expect(track).not.toBe(previous);
      previous = track;
    }
  });
});
