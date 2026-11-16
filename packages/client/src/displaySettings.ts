import { storedChoice } from './storedChoice.js';

/**
 * Screen shake (the user's, 2026-11-16): how hard the board shakes as the player's own wall is
 * hit. Motion: Reduced already stopped it with every other movement; this is for someone who
 * wants the rest of the motion and less of the shake.
 */
export type ShakeSetting = 'off' | 'low' | 'full';
export const shakeSetting = storedChoice<ShakeSetting>(
  'bollfort.shake',
  ['off', 'low', 'full'],
  'full',
  'shake',
);

const SHAKE_SCALES: Record<ShakeSetting, number> = { off: 0, low: 0.5, full: 1 };

/** The shake's reach as a share of the art's, as chosen. */
export function shakeScale(): number {
  return SHAKE_SCALES[shakeSetting.get()];
}

/**
 * The frame rate's cap in a match (the user's, 2026-11-16): none, or 60 or 30 frames a
 * second, to spare a laptop's or the Steam Deck's battery. The match keeps time by the clock,
 * not by frames, so fewer frames play it out the same.
 */
export type FrameLimit = 'off' | '60' | '30';
export const frameLimitSetting = storedChoice<FrameLimit>(
  'bollfort.frameLimit',
  ['off', '60', '30'],
  'off',
  'frameLimit',
);

/** The least time between two frames drawn, in ms; 0 for none. */
export function frameIntervalMs(limit: FrameLimit = frameLimitSetting.get()): number {
  return limit === 'off' ? 0 : 1000 / Number(limit);
}

/**
 * Whether a frame is drawn at `now`, its due time `due` as kept between frames. A frame is
 * drawn within a millisecond of its due time, and the next falls due an interval after this
 * one was — so a screen faster than the cap, its frames not falling on the interval, still
 * averages the cap (60 on a 144 Hz screen) — or at once after a stall, rather than a burst to
 * catch up.
 */
export function frameDue(
  now: number,
  due: number,
  intervalMs: number,
): { draw: boolean; due: number } {
  if (intervalMs <= 0) return { draw: true, due: now };
  if (now < due - 1) return { draw: false, due };
  const next = due + intervalMs;
  return { draw: true, due: now - next > intervalMs ? now + intervalMs : next };
}

/**
 * Mute in background (the user's, 2026-11-16): the game silent while its window is not the
 * one in front. Off by default, as the game always was: online, a match plays on behind
 * another window, and someone waiting in a lobby may want to hear it start.
 */
export type BackgroundMute = 'off' | 'on';
export const backgroundMuteSetting = storedChoice<BackgroundMute>(
  'bollfort.backgroundMute',
  ['off', 'on'],
  'off',
  'backgroundMute',
);
