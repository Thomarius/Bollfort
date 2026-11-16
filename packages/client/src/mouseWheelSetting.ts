import { storedBuildZoom } from './buildZoomSetting.js';
import { escape } from './html.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/**
 * What the mouse wheel does in a match (the user's, 2026-11-16): turn the piece, as it always
 * has, or work the island zoom — up in, down out, as games do — the right button still turning
 * the piece. Turning by default, so nothing changes for someone who never looks.
 */
export type MouseWheel = 'turn' | 'zoom';

const KEY = 'bollfort.mouseWheel';

export const MOUSE_WHEELS: readonly MouseWheel[] = ['turn', 'zoom'];

export function parseMouseWheel(saved: string | null | undefined): MouseWheel | null {
  return MOUSE_WHEELS.find((setting) => setting === saved) ?? null;
}

/** Read at every turn of the wheel, so kept here rather than read from storage each time. */
let current: MouseWheel | null = null;

export function storedMouseWheel(): MouseWheel {
  current ??= parseMouseWheel(stored(KEY)) ?? 'turn';
  return current;
}

// Another tab of the game changing it: stored there, so read again here.
globalThis.addEventListener?.('storage', (event) => {
  if (event.key === KEY) current = null;
});

export function saveMouseWheel(chosen: MouseWheel): void {
  current = chosen;
  store(KEY, chosen);
}

/**
 * Whether the wheel zooms now: chosen so, and the island zoom not switched off — with nothing
 * to zoom, the wheel turns the piece again rather than doing nothing.
 */
export function wheelZooms(): boolean {
  return storedMouseWheel() === 'zoom' && storedBuildZoom() !== 'off';
}

/** The choices as the menus offer them, for a `<select>`. */
export function mouseWheelOptions(): string {
  return MOUSE_WHEELS.map(
    (value) => `<option value="${value}">${escape(t(`mouseWheel.${value}`))}</option>`,
  ).join('');
}
