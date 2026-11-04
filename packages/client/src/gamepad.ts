import type { ArtConfig } from '@bollfort/config';

/**
 * A controller, as pure functions (STEAM.md §8, package C): a pad's state read into the
 * mouse's actions, a held direction into grid steps, the reticle's motion, and the jump to the
 * nearest thing in a direction. No DOM here, so all of it is tested on its own; `pads.ts` reads
 * the browser's Gamepad API and `padMatch.ts` drives the match's `Controls` with it.
 *
 * The rule (the user's, 2026-11-02): a controller only ever does what the mouse already can.
 * Accept is the left button, Turn the right, Menu is Esc.
 */

export type PadAction = 'accept' | 'turn' | 'menu';

/** The buttons bound to each action, by their index in the standard mapping. */
export type Bindings = Readonly<Record<PadAction, readonly number[]>>;

/**
 * A, B and Start in the W3C standard mapping, which Chromium gives an Xbox pad and Steam
 * Input's default (§8): A is 0, B is 1, Start 9.
 */
export const DEFAULT_BINDINGS: Bindings = { accept: [0], turn: [1], menu: [9] };

/** The d-pad's buttons in the standard mapping. */
const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;

export type GamepadTuning = ArtConfig['gamepad'];

/** As much of the browser's `Gamepad` as is read, so tests can make one. */
export interface PadLike {
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

export interface Vec {
  x: number;
  y: number;
}

export interface PadReading {
  /** The actions whose buttons are down. */
  held: ReadonlySet<PadAction>;
  /** The d-pad, each axis -1, 0 or 1; y grows downwards, as the screen's does. */
  dpad: Vec;
  /**
   * The left stick past the dead zone, rescaled so its length runs from 0 at the dead zone's
   * edge to 1 pushed all the way, its direction kept.
   */
  stick: Vec;
  /** Any button down or the stick out of its dead zone: the pad is being used. */
  touched: boolean;
}

const down = (pad: PadLike, button: number): boolean => pad.buttons[button]?.pressed === true;

/** A pad's state as the game reads it. */
export function readPad(pad: PadLike, bindings: Bindings, deadzone: number): PadReading {
  const held = new Set<PadAction>();
  for (const action of ['accept', 'turn', 'menu'] as const)
    if (bindings[action].some((button) => down(pad, button))) held.add(action);

  const dpad = {
    x: (down(pad, DPAD.right) ? 1 : 0) - (down(pad, DPAD.left) ? 1 : 0),
    y: (down(pad, DPAD.down) ? 1 : 0) - (down(pad, DPAD.up) ? 1 : 0),
  };

  const sx = pad.axes[0] ?? 0;
  const sy = pad.axes[1] ?? 0;
  const length = Math.hypot(sx, sy);
  let stick = { x: 0, y: 0 };
  if (length > deadzone && length > 0) {
    // Radial: a diagonal is as easy to hold as a straight push.
    const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
    stick = { x: (sx / length) * scaled, y: (sy / length) * scaled };
  }

  const touched = pad.buttons.some((b) => b.pressed) || stick.x !== 0 || stick.y !== 0;
  return { held, dpad, stick, touched };
}

/** The actions pressed since the last reading: an edge, so a held button acts once. */
export function pressedSince(
  before: ReadonlySet<PadAction>,
  now: ReadonlySet<PadAction>,
): Set<PadAction> {
  return new Set([...now].filter((action) => !before.has(action)));
}

/**
 * The way the pad points, as grid steps: the d-pad first, else the stick, an axis counted
 * once the stick leans that way by more than half its push (so a stick held a little off
 * straight does not wander). `strength` is how far the stick is pushed, 0 for the d-pad.
 */
export function heading(reading: PadReading): { dir: Vec; strength: number } {
  if (reading.dpad.x !== 0 || reading.dpad.y !== 0) return { dir: reading.dpad, strength: 0 };
  const { x, y } = reading.stick;
  const length = Math.hypot(x, y);
  if (length === 0) return { dir: { x: 0, y: 0 }, strength: 0 };
  const lean = (v: number): number => (Math.abs(v) / length > 0.5 ? Math.sign(v) : 0);
  return { dir: { x: lean(x), y: lean(y) }, strength: length };
}

/**
 * A held direction as steps: one at once, then after `repeatDelayMs` one every `repeatMs`,
 * faster the further the stick is pushed, down to `repeatFastestMs`. A new direction starts
 * again with a step at once.
 */
export class Repeater {
  private dir: Vec = { x: 0, y: 0 };
  private waitMs = 0;

  constructor(private readonly tuning: GamepadTuning) {}

  /** The steps to take this frame, along each axis. */
  update(dir: Vec, strength: number, elapsedMs: number): Vec {
    if (dir.x === 0 && dir.y === 0) {
      this.dir = dir;
      return { x: 0, y: 0 };
    }
    if (dir.x !== this.dir.x || dir.y !== this.dir.y) {
      this.dir = dir;
      this.waitMs = this.tuning.repeatDelayMs;
      return { ...dir };
    }
    const { repeatMs, repeatFastestMs } = this.tuning;
    const every = repeatMs + (repeatFastestMs - repeatMs) * Math.min(1, strength);
    this.waitMs -= elapsedMs;
    let steps = 0;
    while (this.waitMs <= 0) {
      steps++;
      this.waitMs += every;
    }
    return { x: dir.x * steps, y: dir.y * steps };
  }

  /** Forgets the held direction, so the next push steps at once. */
  reset(): void {
    this.dir = { x: 0, y: 0 };
  }
}

/**
 * The reticle moved for one frame, in tiles: the stick's speed rising with the square of its
 * push, so a light touch aims finely; the d-pad at a fixed speed; both times `boost` while
 * Turn is held. Kept within the board.
 */
export function moveCursor(
  at: Vec,
  reading: PadReading,
  boosted: boolean,
  elapsedMs: number,
  tuning: GamepadTuning,
  size: { width: number; height: number },
): Vec {
  const { x: sx, y: sy } = reading.stick;
  const push = Math.hypot(sx, sy);
  const seconds = (elapsedMs / 1000) * (boosted ? tuning.boost : 1);
  const vx =
    sx * push * tuning.cursorTilesPerSecond + reading.dpad.x * tuning.dpadCursorTilesPerSecond;
  const vy =
    sy * push * tuning.cursorTilesPerSecond + reading.dpad.y * tuning.dpadCursorTilesPerSecond;
  // Just short of the far edge, so the tile under it is always on the board.
  const clamp = (v: number, size: number): number => Math.min(size - 1e-6, Math.max(0, v));
  return { x: clamp(at.x + vx * seconds, size.width), y: clamp(at.y + vy * seconds, size.height) };
}

/**
 * The item nearest in a direction from a point, or null when there is none that way: only
 * those ahead count, and one off to the side is weighed as farther than one straight ahead,
 * so pushing right picks the castle to the right, not the one a little nearer below it.
 * Castles in the match and buttons in a menu are chosen alike.
 */
export function nearestInDirection<T>(
  from: Vec,
  items: readonly { at: Vec; item: T }[],
  dir: Vec,
): T | null {
  const length = Math.hypot(dir.x, dir.y);
  if (length === 0) return null;
  const ux = dir.x / length;
  const uy = dir.y / length;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { at, item } of items) {
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const along = dx * ux + dy * uy;
    if (along <= 1e-9) continue;
    const across = Math.abs(dx * uy - dy * ux);
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** A tile moved by grid steps, kept on the board. */
export function stepTile(tile: Vec, steps: Vec, size: { width: number; height: number }): Vec {
  return {
    x: Math.min(size.width - 1, Math.max(0, tile.x + steps.x)),
    y: Math.min(size.height - 1, Math.max(0, tile.y + steps.y)),
  };
}
