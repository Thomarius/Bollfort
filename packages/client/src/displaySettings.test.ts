import { describe, expect, it } from 'vitest';

import { saveBuildZoom, storedBuildZoom } from './buildZoomSetting.js';
import {
  backgroundMuteSetting,
  frameDue,
  frameIntervalMs,
  frameLimitSetting,
  shakeScale,
  shakeSetting,
} from './displaySettings.js';
import { saveMouseWheel, storedMouseWheel } from './mouseWheelSetting.js';
import { resetSettings } from './settingsRows.js';

/** The frames drawn over a second of a screen refreshing every `refreshMs`, under a cap. */
function framesDrawn(refreshMs: number, intervalMs: number): number {
  let due = 0;
  let drawn = 0;
  for (let now = refreshMs; now <= 1000 + 1e-6; now += refreshMs) {
    const frame = frameDue(now, due, intervalMs);
    due = frame.due;
    if (frame.draw) drawn++;
  }
  return drawn;
}

describe('the frame rate cap', () => {
  it('draws every frame without one', () => {
    expect(frameIntervalMs('off')).toBe(0);
    expect(framesDrawn(1000 / 144, 0)).toBe(144);
  });

  it('halves a 60 Hz screen at 30', () => {
    // One more at the start, the first frame drawn before any beat is kept.
    expect(Math.abs(framesDrawn(1000 / 60, frameIntervalMs('30')) - 30)).toBeLessThanOrEqual(1);
  });

  it('averages the cap on a screen faster than it, whose frames miss its beat', () => {
    expect(framesDrawn(1000 / 144, frameIntervalMs('60'))).toBeGreaterThanOrEqual(57);
    expect(framesDrawn(1000 / 144, frameIntervalMs('60'))).toBeLessThanOrEqual(61);
  });

  it('draws at once after a stall, then keeps the beat rather than catching up', () => {
    const after = frameDue(5000, 100, 1000 / 30);
    expect(after.draw).toBe(true);
    expect(frameDue(5010, after.due, 1000 / 30).draw).toBe(false);
  });
});

describe('the display and sound settings', () => {
  it('shakes fully until asked for less', () => {
    expect(shakeScale()).toBe(1);
    shakeSetting.save('low');
    expect(shakeScale()).toBe(0.5);
    shakeSetting.save('off');
    expect(shakeScale()).toBe(0);
    expect(shakeSetting.parse('wobbly')).toBeNull();
  });

  it('are put back by Reset to defaults, volumes and all', () => {
    const volumes = { music: 0.2, sounds: 0 };
    const target = {
      volume: (kind: 'music' | 'sounds') => volumes[kind],
      setVolume: (kind: 'music' | 'sounds', value: number) => (volumes[kind] = value),
      play: () => undefined,
    };
    shakeSetting.save('off');
    frameLimitSetting.save('30');
    backgroundMuteSetting.save('on');
    saveBuildZoom('in');
    saveMouseWheel('zoom');
    resetSettings(target);
    expect([shakeSetting.get(), frameLimitSetting.get(), backgroundMuteSetting.get()]).toEqual([
      'full',
      'off',
      'off',
    ]);
    expect([storedBuildZoom(), storedMouseWheel()]).toEqual(['out', 'turn']);
    expect(volumes).toEqual({ music: 1, sounds: 1 });
  });
});
