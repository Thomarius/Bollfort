import { PadMenus } from './padMenus.js';
import { pads } from './pads.js';

/**
 * The controller read every frame, whatever is on screen (STEAM.md §8): Menu is Esc, so it
 * is sent as one, and whatever answers Esc — the pause menu, the demo — answers it; and the
 * menus are walked with the pad (`padMenus.ts`) unless the match's board has it
 * (`padMatch.ts`). `pads` reads the pads once a frame for both.
 */
export function startPadLoop(): void {
  if (typeof navigator.getGamepads !== 'function') return;
  const menus = new PadMenus(pads);
  let last = performance.now();
  const frame = (now: number): void => {
    const elapsed = now - last;
    last = now;
    pads.read(now);
    // Waiting for a button to bind: it goes there, and nothing else hears it.
    const capture = pads.capture;
    if (capture !== null) {
      const [button] = pads.buttonsPressed;
      if (button !== undefined) capture(button);
    } else if (pads.pressedNow('menu'))
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    else if (!pads.claimed(now)) menus.update(elapsed);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
