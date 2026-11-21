/**
 * The game window's size and place, remembered between starts (PLAN §11 item 10, GL1): it had
 * opened at 1400 × 900 in the middle of the screen every time, as a page would, whatever the
 * player had made of it. Pure, for the test; the windows read and write it beside their other
 * settings.
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smaller than this, a remembered window is taken for a mistake and not restored. */
export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 500;

/** How much of a remembered window must lie on a screen still there for it to be restored. */
const ON_SCREEN_PX = 120;

/** A remembered window's bounds, read from what was saved; null if it is no use. */
export function readBounds(saved: unknown): Bounds | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const b = (saved as Record<string, unknown>)['bounds'];
  if (typeof b !== 'object' || b === null) return null;
  const { x, y, width, height } = b as Record<string, unknown>;
  const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  if (!whole(x) || !whole(y) || !whole(width) || !whole(height)) return null;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  return { x, y, width, height };
}

/**
 * Where to open: the remembered bounds if enough of them lies on one of the screens as they
 * are now — a monitor unplugged since would leave the window out of sight — else null, for the
 * default size, centred.
 */
export function placeOn(saved: Bounds | null, screens: readonly Bounds[]): Bounds | null {
  if (saved === null) return null;
  const visible = screens.some((s) => {
    const w = Math.min(saved.x + saved.width, s.x + s.width) - Math.max(saved.x, s.x);
    const h = Math.min(saved.y + saved.height, s.y + s.height) - Math.max(saved.y, s.y);
    return w >= ON_SCREEN_PX && h >= ON_SCREEN_PX;
  });
  return visible ? saved : null;
}
