import { pads } from './pads.js';

/**
 * The controller read every frame, whatever is on screen (STEAM.md §8): Menu is Esc, so it
 * is sent as one, and whatever answers Esc — the pause menu, the demo — answers it. The match
 * reads the same pads in its own frame (`padMatch.ts`); `pads` reads them once a frame for
 * both.
 */
export function startPadLoop(): void {
  if (typeof navigator.getGamepads !== 'function') return;
  const frame = (now: number): void => {
    pads.read(now);
    if (pads.pressedNow('menu'))
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
