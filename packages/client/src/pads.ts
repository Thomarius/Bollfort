import { defaultArtConfig } from '@bollfort/config';

import {
  DEFAULT_BINDINGS,
  pressedSince,
  readPad,
  type Bindings,
  type PadAction,
  type PadReading,
} from './gamepad.js';

/**
 * The controllers, read from the browser's Gamepad API once a frame (STEAM.md §8). Whichever
 * pad was touched last is the one read, so a second pad left on the desk does not fight the
 * first. A pad is "in use" from the moment it is touched until the mouse moves: while it is,
 * the page wears the class `pad`, which hides the pointer, and the match's ghost follows the
 * pad rather than the mouse.
 */
export class Pads {
  private before = new Set<PadAction>();
  private last: PadReading | null = null;
  private pressedSet = new Set<PadAction>();
  private readAt = -1;
  private chosen: number | null = null;
  private inUse = false;
  private readonly listeners: ((inUse: boolean) => void)[] = [];
  bindings: Bindings = DEFAULT_BINDINGS;

  constructor() {
    // Any real motion of the mouse hands control back to it; Chromium sends a move of zero
    // as a page scrolls, which is not the player.
    globalThis.addEventListener?.(
      'pointermove',
      (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && (event.movementX !== 0 || event.movementY !== 0))
          this.use(false);
      },
      { passive: true },
    );
  }

  /** Whether the pad, not the mouse, was the last thing touched. */
  get active(): boolean {
    return this.inUse;
  }

  /** Told whenever control passes between the pad and the mouse. */
  onChange(listener: (inUse: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private use(inUse: boolean): void {
    if (inUse === this.inUse) return;
    this.inUse = inUse;
    document.documentElement.classList.toggle('pad', inUse);
    for (const listener of this.listeners) listener(inUse);
  }

  /**
   * The pad as it stands this frame, or null with none connected. Read once a frame however
   * many ask (`now` the frame's time), so the presses since the last frame are the same for
   * each of them.
   */
  read(now: number): PadReading | null {
    if (now === this.readAt) return this.last;
    this.readAt = now;
    const pads = navigator.getGamepads?.() ?? [];
    const tuning = defaultArtConfig.gamepad;
    let reading: PadReading | null = null;
    // The pad last touched, by the browser's timestamp of its last change.
    let newest = -Infinity;
    for (const pad of pads) {
      if (pad === null || !pad.connected) continue;
      const r = readPad(pad, this.bindings, tuning.deadzone);
      if (r.touched && pad.timestamp > newest) {
        newest = pad.timestamp;
        this.chosen = pad.index;
      }
    }
    const pad = pads.find((p) => p !== null && p.index === this.chosen) ?? null;
    if (pad !== null) reading = readPad(pad, this.bindings, tuning.deadzone);
    const held = reading?.held ?? new Set<PadAction>();
    this.pressedSet = pressedSince(this.before, held);
    this.before = new Set(held);
    this.last = reading;
    if (reading?.touched === true) this.use(true);
    return reading;
  }

  /** Whether an action's button went down since the frame before. */
  pressedNow(action: PadAction): boolean {
    return this.pressedSet.has(action);
  }

  /** Every action whose button went down since the frame before. */
  get pressed(): ReadonlySet<PadAction> {
    return this.pressedSet;
  }
}

/** The page's one set of pads, shared by the match and the menus. */
export const pads = new Pads();
