import { DEFAULT_BINDINGS, type Bindings, type PadAction } from './gamepad.js';
import { store, stored } from './storage.js';

/**
 * A controller's settings (STEAM.md §8, package C3): which button does each action, and how
 * fast the reticle moves in combat. The page's own, as every setting is.
 *
 * Each action has one button. Binding a button already another action's swaps the two, so
 * every action keeps a button and the pad can never lock itself out of the menus — Accept and
 * Menu above all, which §8 asks to keep one always.
 */

const BINDINGS_KEY = 'bollfort.padBindings';
const CURSOR_KEY = 'bollfort.padCursor';

export const PAD_ACTIONS: readonly PadAction[] = ['accept', 'turn', 'menu'];

/**
 * The buttons an action may take, in the standard mapping: the face buttons, the shoulders and
 * triggers, Select and Start, and the sticks pressed. Not the d-pad (12–15), which moves and is
 * not rebound, nor the guide button (16), which Steam and the system keep for themselves.
 */
export const BINDABLE: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * A button's name, as printed on an Xbox pad and the Deck: the standard mapping is Xbox's
 * layout. C4 draws the glyphs, PlayStation's where the pad is one.
 */
const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'LS', 'RS'];

export function buttonName(button: number): string {
  return NAMES[button] ?? `#${button}`;
}

/** Bindings as saved, or null for anything not a whole, valid set of them. */
export function parseBindings(text: string | null): Bindings | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const result: Partial<Record<PadAction, readonly number[]>> = {};
  const seen = new Set<number>();
  for (const action of PAD_ACTIONS) {
    const buttons = record[action];
    if (!Array.isArray(buttons) || buttons.length !== 1) return null;
    const button: unknown = buttons[0];
    if (typeof button !== 'number' || !BINDABLE.includes(button) || seen.has(button)) return null;
    seen.add(button);
    result[action] = [button];
  }
  return result as Bindings;
}

/** `action` on `button`; whichever action had that button takes `action`'s old one. */
export function rebind(bindings: Bindings, action: PadAction, button: number): Bindings {
  if (!BINDABLE.includes(button)) return bindings;
  const old = bindings[action][0];
  const next = { ...bindings };
  for (const other of PAD_ACTIONS) {
    if (other !== action && bindings[other].includes(button) && old !== undefined)
      next[other] = [old];
  }
  next[action] = [button];
  return next;
}

let bindings: Bindings | null = null;

export function storedBindings(): Bindings {
  bindings ??= parseBindings(stored(BINDINGS_KEY)) ?? DEFAULT_BINDINGS;
  return bindings;
}

export function saveBindings(chosen: Bindings): void {
  bindings = chosen;
  store(BINDINGS_KEY, JSON.stringify(chosen));
}

/** The reticle's speed in combat, as a factor of the config's (`gamepad.cursorTilesPerSecond`). */
export type CursorSpeed = 'slow' | 'normal' | 'fast';

export const CURSOR_SPEEDS: Readonly<Record<CursorSpeed, number>> = {
  slow: 0.7,
  normal: 1,
  fast: 1.4,
};

export function parseCursorSpeed(saved: string | null | undefined): CursorSpeed | null {
  return (Object.keys(CURSOR_SPEEDS) as CursorSpeed[]).find((s) => s === saved) ?? null;
}

/** Read every frame of combat, so kept here rather than read from storage each time. */
let cursor: CursorSpeed | null = null;

export function storedCursorSpeed(): CursorSpeed {
  cursor ??= parseCursorSpeed(stored(CURSOR_KEY)) ?? 'normal';
  return cursor;
}

export function saveCursorSpeed(chosen: CursorSpeed): void {
  cursor = chosen;
  store(CURSOR_KEY, chosen);
}
