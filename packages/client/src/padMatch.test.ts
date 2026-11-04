import { defaultArtConfig } from '@bollfort/config';
import { stateFromAscii, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { DEFAULT_BINDINGS, readPad, type PadAction, type PadReading } from './gamepad.js';
import { PadMatch, type Steerable } from './padMatch.js';

const tuning = defaultArtConfig.gamepad;
const FRAME = 16;

/** The pad with these buttons down (standard mapping) and the stick here. */
function reading(buttons: number[] = [], stick: [number, number] = [0, 0]): PadReading {
  return readPad(
    {
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
      axes: [stick[0], stick[1]],
    },
    DEFAULT_BINDINGS,
    tuning.deadzone,
  );
}

const A = 0;
const B = 1;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

/** What the pad did to the controls, as the mouse would have. */
class Recorder implements Steerable {
  hoverTile: { x: number; y: number } | null = null;
  readonly done: string[] = [];
  accept(): void {
    this.done.push(`accept ${this.hoverTile?.x},${this.hoverTile?.y}`);
  }
  turn(): void {
    this.done.push('turn');
  }
}

/** A frame with nothing new pressed, or with these presses. */
function frame(pad: PadMatch, r: PadReading, pressed: PadAction[] = [], active = true): void {
  pad.update(r, new Set(pressed), FRAME, active);
}

/**
 * One island, three castles on it: top left, top right and bottom middle. Its centre is
 * (6, 4), the bottom castle's middle tile (6, 6).
 */
function board(): MatchState {
  return stateFromAscii(`
    ...............
    .,,,,,,,,,,,,,.
    .,@@,,,,,,,@@,.
    .,@@,,,,,,,@@,.
    .,,,,,,,,,,,,,.
    .,,,,,,,,,,,,,.
    .,,,,,@@,,,,,,.
    .,,,,,@@,,,,,,.
    .,,,,,,,,,,,,,.
    ...............
  `);
}

const HOME = { x: 7, y: 4.5 };

describe('the build phase with a pad', () => {
  function building(): { state: MatchState; steer: Recorder; pad: PadMatch } {
    const state = board();
    state.phase = 'build';
    const steer = new Recorder();
    return { state, steer, pad: new PadMatch(state, 0, HOME, steer, tuning) };
  }

  it('starts the ghost at the island centre, and moves it a tile a press', () => {
    const { steer, pad } = building();
    frame(pad, reading());
    expect(steer.hoverTile).toEqual({ x: 7, y: 4 });
    frame(pad, reading([RIGHT]));
    expect(steer.hoverTile).toEqual({ x: 8, y: 4 });
    frame(pad, reading());
    frame(pad, reading([UP]));
    frame(pad, reading());
    frame(pad, reading([UP]));
    expect(steer.hoverTile).toEqual({ x: 8, y: 2 });
  });

  it('places with Accept and turns with Turn, a press each', () => {
    const { steer, pad } = building();
    frame(pad, reading([A]), ['accept']);
    frame(pad, reading([A]));
    frame(pad, reading([B]), ['turn']);
    expect(steer.done).toEqual(['accept 7,4', 'turn']);
  });

  it('keeps the edge of the board', () => {
    const { steer, pad } = building();
    for (let i = 0; i < 200; i++) frame(pad, reading([LEFT]));
    expect(steer.hoverTile).toEqual({ x: 0, y: 4 });
  });

  it('leaves the ghost to the mouse while the mouse is in use, and takes it up from there', () => {
    const { steer, pad } = building();
    frame(pad, reading(), [], false);
    expect(steer.hoverTile).toBeNull();
    steer.hoverTile = { x: 3, y: 7 };
    frame(pad, reading([DOWN]), [], true);
    expect(steer.hoverTile).toEqual({ x: 3, y: 8 });
  });
});

describe('choosing a castle with a pad', () => {
  function choosing(): { steer: Recorder; pad: PadMatch } {
    const state = board();
    state.phase = 'castle_select';
    state.players[0]!.startingCastleId = null;
    const steer = new Recorder();
    return { steer, pad: new PadMatch(state, 0, HOME, steer, tuning) };
  }

  it('starts on the castle nearest the island centre, and jumps the way pushed', () => {
    const { steer, pad } = choosing();
    frame(pad, reading());
    // The bottom castle, (6..7, 6..7), is nearest (7, 4.5).
    expect(steer.hoverTile).toEqual({ x: 7, y: 7 });
    frame(pad, reading([UP, LEFT]));
    expect(steer.hoverTile).toEqual({ x: 3, y: 3 });
    frame(pad, reading());
    frame(pad, reading([RIGHT]));
    expect(steer.hoverTile).toEqual({ x: 12, y: 3 });
    // Nothing further right: it stays.
    frame(pad, reading());
    frame(pad, reading([RIGHT]));
    expect(steer.hoverTile).toEqual({ x: 12, y: 3 });
    frame(pad, reading([A]), ['accept']);
    expect(steer.done).toEqual(['accept 12,3']);
  });
});

describe('combat with a pad', () => {
  function fighting(): { state: MatchState; steer: Recorder; pad: PadMatch } {
    const state = board();
    state.phase = 'combat';
    const steer = new Recorder();
    return { state, steer, pad: new PadMatch(state, 0, HOME, steer, tuning) };
  }

  it('starts the reticle over the island and moves it freely, faster with Turn held', () => {
    const { steer, pad } = fighting();
    frame(pad, reading());
    expect(pad.reticle).toEqual({ x: 7.5, y: 4.5 });
    const second = (buttons: number[]): number => {
      const from = pad.reticle!.x;
      // A few frames: on this small board a longer run boosted would reach the edge.
      for (let i = 0; i < 4; i++) frame(pad, reading(buttons, [-1, 0]));
      return from - pad.reticle!.x;
    };
    const plain = second([]);
    const boosted = second([B]);
    expect(boosted / plain).toBeCloseTo(tuning.boost, 1);
    // Turn in combat only boosts: the right button does nothing there.
    expect(steer.done).toEqual([]);
    expect(steer.hoverTile).toEqual({
      x: Math.floor(pad.reticle!.x),
      y: Math.floor(pad.reticle!.y),
    });
  });

  it('fires with Accept where the reticle is', () => {
    const { steer, pad } = fighting();
    frame(pad, reading());
    frame(pad, reading([A]), ['accept']);
    expect(steer.done).toEqual(['accept 7,4']);
  });

  it('keeps the reticle from the announcement into combat, and starts afresh the next combat', () => {
    const { state, pad } = fighting();
    state.phase = 'intermission';
    state.pendingPhase = 'combat';
    frame(pad, reading());
    for (let i = 0; i < 20; i++) frame(pad, reading([RIGHT]));
    const aimed = pad.reticle!;
    state.phase = 'combat';
    frame(pad, reading());
    expect(pad.reticle).toEqual(aimed);

    state.phase = 'build';
    frame(pad, reading());
    state.round++;
    state.phase = 'combat';
    frame(pad, reading());
    expect(pad.reticle).toEqual({ x: 7.5, y: 4.5 });
  });
});
