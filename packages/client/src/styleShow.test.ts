import { computeEnclosure, Structure, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { openingBoard, StyleShow, type ShowStage, type StyleShowFrame } from './styleShow.js';

/** Each player's wall blocks, counted. */
function walls(state: MatchState): number[] {
  return state.players.map(
    (p) =>
      state.structure.filter((s, i) => s === Structure.Wall && state.owner[i] === p.islandId)
        .length,
  );
}

/** Plays the show at 60 frames a second until `stop` says so, or for at most `ms`. */
function playUntil(
  show: StyleShow,
  stop: (frame: StyleShowFrame) => boolean,
  ms = 60_000,
): { frames: StyleShowFrame[]; stages: ShowStage[] } {
  const frames: StyleShowFrame[] = [];
  const stages: ShowStage[] = [];
  for (let t = 0; t < ms; t += 1000 / 60) {
    const frame = show.advance(1000 / 60);
    frames.push(frame);
    if (frame.began !== null) stages.push(frame.began);
    if (stop(frame)) break;
  }
  return { frames, stages };
}

describe('the style preview’s scenes', () => {
  it('opens on two castles sealed, three guns each, in combat', () => {
    const state = openingBoard();
    expect(state.phase).toBe('combat');
    expect(computeEnclosure(state).castleEnclosed.filter(Boolean).length).toBe(2);
    for (const player of [0, 1]) {
      expect(state.cannons.filter((c) => c.owner === player && c.active)).toHaveLength(3);
    }
  });

  it('breaches both rings, bannering into building, and seals them again', () => {
    const show = new StyleShow();
    const before = walls(show.state);
    const { frames, stages } = playUntil(show, (f) => f.began === 'fade');
    expect(stages).toEqual(['banner', 'build', 'fade']);
    // The barrage's shots land as they fly, the banner coming within seconds.
    const bannerAt = frames.findIndex((f) => f.began === 'banner');
    expect(bannerAt / 60).toBeLessThan(7);
    // Each fired three at the rival's wall and one into the water: three blocks each, lost.
    const destroyed = frames.flatMap((f) =>
      f.events.flatMap((e) => (e.kind === 'shot_impact' ? e.destroyed : [])),
    );
    expect(destroyed).toHaveLength(6);
    const splashes = frames.flatMap((f) =>
      f.events.filter((e) => e.kind === 'shot_impact' && e.destroyed.length === 0),
    );
    expect(splashes).toHaveLength(2);
    // Built up again in pieces of one or two, the first player's each held first.
    const landed = frames.flatMap((f) => f.landed);
    expect(landed.length).toBeGreaterThanOrEqual(4);
    expect(walls(show.state)).toEqual(before);
    expect(computeEnclosure(show.state).castleEnclosed.filter(Boolean).length).toBe(2);
  });

  it('holds the first player’s pieces in hand before setting them down', () => {
    const show = new StyleShow();
    let held = 0;
    playUntil(show, (f) => {
      if (show.held !== null) held++;
      return f.began === 'fade';
    });
    expect(held).toBeGreaterThan(30);
  });

  it('crosses the banner eased, and fades dark and back to the board as it first stood', () => {
    const show = new StyleShow();
    const start = walls(show.state);
    let mostDark = 0;
    const progress: number[] = [];
    const { stages } = playUntil(show, (f) => {
      mostDark = Math.max(mostDark, show.darkness);
      const p = show.bannerProgress;
      if (p !== null) progress.push(p);
      return f.began === 'barrage';
    });
    expect(stages.at(-1)).toBe('barrage');
    expect(mostDark).toBeGreaterThan(0.95);
    expect(show.darkness).toBe(0);
    expect(walls(show.state)).toEqual(start);
    expect(progress[0]).toBeLessThan(0.05);
    expect(progress.at(-1)).toBeGreaterThan(0.95);
    for (let k = 1; k < progress.length; k++) expect(progress[k]).toBeGreaterThan(progress[k - 1]!);
  });
});
