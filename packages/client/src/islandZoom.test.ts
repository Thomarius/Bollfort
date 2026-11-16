import type { MatchState, Phase } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import type { BuildZoom } from './buildZoomSetting.js';
import { placeShot, type FittedView } from './camera.js';
import {
  IslandZoom,
  buttonSpot,
  islandBox,
  islandShot,
  screenRect,
  timerBeside,
  towardsIsland,
  zoomStage,
} from './islandZoom.js';

interface Board {
  phase: Phase;
  pendingPhase?: Phase | null;
  /** Ticks into the intermission, of 100; its banner is the last 40. */
  tick?: number;
  owes?: boolean;
  eliminated?: boolean;
}

/** A board at a phase, the player either owing a castle or holding one. */
function board({ phase, pendingPhase = null, tick = 0, owes = false, eliminated = false }: Board) {
  return {
    phase,
    pendingPhase,
    tick,
    phaseEndTick: 100,
    ruleset: { tickRateHz: 10, phases: { transitionBannerMs: 4000 } },
    players: [{ id: 0, eliminated, startingCastleId: owes ? null : 3 }],
  } as unknown as MatchState;
}

/** Quick when asked for, calm when the phase moves the camera. */
const PACE = { manualMs: 300, autoMs: 3000 };

/** One frame of the zoom, instant, returning how far in it is. */
function frame(zoom: IslandZoom, at: Board, setting: BuildZoom = 'out'): number {
  return zoom.update(board(at), 0, setting, 0, 16, PACE, true);
}

const BUILD: Board = { phase: 'build' };
const CANNONS: Board = { phase: 'cannon_place' };
const COMBAT: Board = { phase: 'combat' };

describe('when the island zoom is open', () => {
  it('opens with the build phase’s banner, not while the last shots land', () => {
    const landing = board({ phase: 'intermission', pendingPhase: 'build', tick: 50 });
    const banner = board({ phase: 'intermission', pendingPhase: 'build', tick: 70 });
    expect(zoomStage(landing, 0, 0)).toBeNull();
    expect(zoomStage(banner, 0, 0)).toBe('build');
  });

  it('keeps the cannon phase after it, but never combat nor its banner', () => {
    expect(zoomStage(board(CANNONS), 0, 0)).toBe('cannon');
    expect(zoomStage(board({ phase: 'intermission', pendingPhase: 'cannon_place' }), 0, 0)).toBe(
      'cannon',
    );
    expect(zoomStage(board(COMBAT), 0, 0)).toBeNull();
    expect(
      zoomStage(board({ phase: 'intermission', pendingPhase: 'combat', tick: 90 }), 0, 0),
    ).toBe(null);
  });

  it('is shut while a castle is owed, and to the knocked out', () => {
    expect(zoomStage(board({ ...CANNONS, owes: true }), 0, 0)).toBeNull();
    expect(zoomStage(board({ ...BUILD, eliminated: true }), 0, 0)).toBeNull();
  });

  it('starts with the first build phase: the opening’s cannons see the whole map', () => {
    const zoom = new IslandZoom();
    frame(zoom, { phase: 'castle_select', owes: true }, 'in');
    expect(frame(zoom, CANNONS, 'in')).toBe(0);
    expect(zoom.available).toBe(false);
    expect(frame(zoom, BUILD, 'in')).toBe(1);
    expect(zoom.available).toBe(true);
  });

  it('starts again with the build phase after a continue’s castle choice', () => {
    const zoom = new IslandZoom();
    frame(zoom, BUILD, 'in');
    expect(frame(zoom, { ...CANNONS, owes: true }, 'in')).toBe(0);
    expect(frame(zoom, CANNONS, 'in')).toBe(0);
    expect(zoom.available).toBe(false);
    frame(zoom, COMBAT, 'in');
    expect(frame(zoom, BUILD, 'in')).toBe(1);
  });

  it('is never open with the setting off', () => {
    const zoom = new IslandZoom();
    expect(frame(zoom, BUILD, 'off')).toBe(0);
    expect(zoom.available).toBe(false);
    expect(zoom.toggle()).toBe(false);
  });
});

describe('what the island zoom shows', () => {
  it('opens each build phase as the setting says, whatever the last one ended on', () => {
    const zoom = new IslandZoom();
    expect(frame(zoom, BUILD, 'in')).toBe(1);
    zoom.toggle();
    expect(frame(zoom, BUILD, 'in')).toBe(0);
    frame(zoom, CANNONS, 'in');
    frame(zoom, COMBAT, 'in');
    expect(frame(zoom, BUILD, 'in')).toBe(1);
  });

  it('keeps through the cannon phase what the build phase ended on, and is out for combat', () => {
    const zoom = new IslandZoom();
    frame(zoom, BUILD, 'out');
    zoom.toggle();
    expect(frame(zoom, BUILD, 'out')).toBe(1);
    expect(frame(zoom, CANNONS, 'out')).toBe(1);
    expect(frame(zoom, COMBAT, 'out')).toBe(0);
    expect(frame(zoom, BUILD, 'out')).toBe(0);
  });

  it('takes a setting chosen mid-phase at once', () => {
    const zoom = new IslandZoom();
    frame(zoom, BUILD, 'out');
    expect(frame(zoom, BUILD, 'in')).toBe(1);
    expect(frame(zoom, CANNONS, 'off')).toBe(0);
    expect(frame(zoom, CANNONS, 'out')).toBe(0);
  });

  it('moves calmly when the phase moves it, quickly when the player asks', () => {
    const zoom = new IslandZoom();
    const step = (at: Board, ms: number, setting: BuildZoom = 'in'): number =>
      zoom.update(board(at), 0, setting, 0, ms, PACE, false);
    // In behind "Rebuild", at the calm pace: halfway after half of it.
    step(BUILD, 0);
    expect(step(BUILD, 1500)).toBeCloseTo(0.5);
    expect(step(BUILD, 1500)).toBe(1);
    // Out at the magnifier, at the quick one.
    zoom.toggle();
    expect(step(BUILD, 150)).toBeCloseTo(0.5);
    expect(step(BUILD, 150)).toBe(0);
    // In again by hand, and out before combat at the calm pace.
    zoom.toggle();
    expect(step(BUILD, 300)).toBe(1);
    expect(step(COMBAT, 1500)).toBeCloseTo(0.5);
    // A setting changed mid-phase is asked for, so quick.
    step(COMBAT, 1500);
    step(BUILD, 3000, 'out');
    expect(step(BUILD, 150, 'in')).toBeCloseTo(0.5);
  });

  it('takes over a calm move at the quick pace when the player asks mid-way', () => {
    const zoom = new IslandZoom();
    zoom.update(board(BUILD), 0, 'in', 0, 0, PACE, false);
    zoom.update(board(BUILD), 0, 'in', 0, 1500, PACE, false);
    zoom.toggle();
    expect(zoom.update(board(BUILD), 0, 'in', 0, 150, PACE, false)).toBe(0);
  });
});

/** A 40×20 board fitted at 10 px a tile into a 400×264 window, under a 64 px bar. */
const VIEW: FittedView = { tile: 10, originX: 0, originY: 64, width: 400, height: 264 };
const SIZE = { width: 40, height: 20 };
const FREE = { x: 0, y: 64, w: 400, h: 200 };

describe('the island zoom’s shot', () => {
  it('finds an island’s box', () => {
    const islandId = new Uint8Array(40 * 20);
    for (let y = 3; y <= 8; y++) for (let x = 5; x <= 14; x++) islandId[y * 40 + x] = 2;
    expect(islandBox({ width: 40, islandId }, 2)).toEqual({ minX: 5, minY: 3, maxX: 14, maxY: 8 });
    expect(islandBox({ width: 40, islandId }, 3)).toBeNull();
  });

  it('fits the island and its margin into the free screen, whole', () => {
    const box = { minX: 15, minY: 5, maxX: 24, maxY: 14 };
    const shot = islandShot(VIEW, SIZE, box, FREE, 1, 4)!;
    // 12 tiles of 10 px into 200 px of height.
    expect(shot.zoom).toBeCloseTo(200 / 120);
    const rect = screenRect(VIEW, placeShot(VIEW, SIZE, shot), box);
    expect(rect.y).toBeGreaterThanOrEqual(FREE.y);
    expect(rect.y + rect.h).toBeLessThanOrEqual(FREE.y + FREE.h + 0.5);
  });

  it('is no closer than its limit', () => {
    const box = { minX: 18, minY: 8, maxX: 21, maxY: 11 };
    expect(islandShot(VIEW, SIZE, box, FREE, 0, 2)!.zoom).toBe(2);
  });

  it('keeps an island on the board’s edge whole, though the camera keeps the edge on screen', () => {
    const box = { minX: 0, minY: 0, maxX: 9, maxY: 9 };
    const free = { x: 0, y: 64, w: 400, h: 180 };
    const shot = islandShot(VIEW, SIZE, box, free, 1, 4)!;
    const rect = screenRect(VIEW, placeShot(VIEW, SIZE, shot), box);
    expect(rect.y).toBeGreaterThanOrEqual(free.y - 0.5);
    expect(rect.y + rect.h).toBeLessThanOrEqual(free.y + free.h + 0.5);
  });

  it('is none where it would be no closer than the whole map', () => {
    const box = { minX: 0, minY: 0, maxX: 39, maxY: 19 };
    expect(islandShot(VIEW, SIZE, box, FREE, 1, 4)).toBeNull();
  });

  it('moves from the whole map to the shot, growing the island in place', () => {
    const box = { minX: 15, minY: 5, maxX: 24, maxY: 14 };
    const shot = islandShot(VIEW, SIZE, box, FREE, 1, 4)!;
    expect(towardsIsland(VIEW, shot, 0)).toBeNull();
    expect(towardsIsland(VIEW, shot, 1)).toBe(shot);
    const half = towardsIsland(VIEW, shot, 0.5)!;
    expect(half.zoom).toBeCloseTo(Math.sqrt(shot.zoom));
    // Halfway from where the whole map shows the island's middle to where the shot puts it.
    expect(half.at!.y).toBeCloseTo((64 + 10 * 10 + shot.at!.y) / 2);
  });
});

describe('the magnifier and the big timer while zoomed', () => {
  const free = { x: 0, y: 64, w: 400, h: 200 };

  it('puts the magnifier on the island’s bottom-right corner, inside the free screen', () => {
    expect(buttonSpot({ x: 100, y: 100, w: 100, h: 80 }, free, 40)).toEqual({ x: 200, y: 180 });
    expect(buttonSpot({ x: 100, y: 64, w: 300, h: 200 }, free, 40)).toEqual({ x: 380, y: 244 });
  });

  it('puts the timer by the shore on the side with most room', () => {
    expect(timerBeside({ x: 50, y: 64, w: 200, h: 200 }, free, 40)).toEqual({ x: 280, y: 164 });
    expect(timerBeside({ x: 150, y: 64, w: 200, h: 200 }, free, 40)).toEqual({ x: 120, y: 164 });
  });

  it('above or below a wide island, and nowhere where there is no room', () => {
    expect(timerBeside({ x: 0, y: 64, w: 400, h: 120 }, free, 40)).toEqual({ x: 200, y: 214 });
    expect(timerBeside({ x: 0, y: 64, w: 400, h: 200 }, free, 40)).toBeNull();
  });
});
