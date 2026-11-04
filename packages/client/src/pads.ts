import { defaultArtConfig } from '@bollfort/config';

import {
  pressedSince,
  readPad,
  type Bindings,
  type PadAction,
  type PadReading,
} from './gamepad.js';
import { padFamily, withGlyphs, type PadFamily } from './glyphs.js';
import { storedBindings } from './padSettings.js';

/**
 * The controllers, read from the browser's Gamepad API once a frame (STEAM.md §8). Whichever
 * pad was touched last is the one read, so a second pad left on the desk does not fight the
 * first. A pad is "in use" from the moment it is touched until the mouse moves: while it is,
 * the page wears the class `pad`, which hides the pointer, and the match's ghost follows the
 * pad rather than the mouse.
 */
export class Pads {
  private before = new Set<PadAction>();
  private lastReading: PadReading | null = null;
  private claimedAt = -Infinity;
  /** When the pad was last touched, by the page's clock; for the demo's idle clock. */
  touchedAt = -Infinity;
  private pressedSet = new Set<PadAction>();
  private readAt = -1;
  private chosen: number | null = null;
  private inUse = false;
  private readonly listeners: ((inUse: boolean) => void)[] = [];
  bindings: Bindings = storedBindings();
  /** The buttons down at the last read, by index, to find which went down since. */
  private rawBefore = new Set<number>();
  private rawPressed: number[] = [];
  /**
   * While set, the next button pressed goes here and nowhere else: Options' Controller window
   * waiting for the button to bind (`padLoop.ts` holds the menus back meanwhile).
   */
  capture: ((button: number) => void) | null = null;
  /** How the pad in use prints its buttons, for the glyphs (`glyphs.ts`). */
  family: PadFamily = 'xbox';

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
    if (now === this.readAt) return this.lastReading;
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
    if (pad !== null) {
      reading = readPad(pad, this.bindings, tuning.deadzone);
      this.family = padFamily(pad.id);
    }
    const down = new Set<number>();
    pad?.buttons.forEach((b, i) => {
      if (b.pressed) down.add(i);
    });
    this.rawPressed = [...down].filter((i) => !this.rawBefore.has(i));
    this.rawBefore = down;
    const held = reading?.held ?? new Set<PadAction>();
    this.pressedSet = pressedSince(this.before, held);
    this.before = new Set(held);
    this.lastReading = reading;
    if (reading?.touched === true) {
      this.touchedAt = now;
      this.use(true);
    }
    return reading;
  }

  /** The pad as last read, or null with none. */
  get last(): PadReading | null {
    return this.lastReading;
  }

  /**
   * The match's board takes the pad this frame (`padMatch.ts`): the menus leave it alone
   * until it has gone a few frames unclaimed — paused, or the match over.
   */
  claim(now: number): void {
    this.claimedAt = now;
  }

  /** Whether the board has had the pad within the last few frames. */
  claimed(now: number): boolean {
    return now - this.claimedAt < 100;
  }

  /** The buttons, by index, that went down since the frame before. */
  get buttonsPressed(): readonly number[] {
    return this.rawPressed;
  }

  /** Whether a controller is connected at all. */
  get connected(): boolean {
    return (navigator.getGamepads?.() ?? []).some((pad) => pad?.connected === true);
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

/**
 * A text for the pad, as HTML, each `{accept}`, `{turn}` or `{menu}` in it the glyph of the
 * button bound to that action; null with the mouse in use, for the mouse's own text.
 */
export function padText(
  text: (marks: Readonly<Record<PadAction, string>>) => string,
): string | null {
  return pads.active ? withGlyphs(text, pads.bindings, pads.family) : null;
}
