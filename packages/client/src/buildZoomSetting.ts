import { escape } from './html.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/**
 * The island zoom (the user's design, 2026-11-16; `islandZoom.ts`): off, the game as it was —
 * no button, the whole map always; otherwise the magnifier by the player's island, and each
 * build phase opens zoomed out or in as chosen here. Out by default, so the button is the
 * only thing new to someone who never asks for it.
 */
export type BuildZoom = 'off' | 'out' | 'in';

const KEY = 'bollfort.buildZoom';

export const BUILD_ZOOMS: readonly BuildZoom[] = ['off', 'out', 'in'];

export function parseBuildZoom(saved: string | null | undefined): BuildZoom | null {
  return BUILD_ZOOMS.find((setting) => setting === saved) ?? null;
}

/** Read every frame of a match, so kept here rather than read from storage each time. */
let current: BuildZoom | null = null;

export function storedBuildZoom(): BuildZoom {
  current ??= parseBuildZoom(stored(KEY)) ?? 'out';
  return current;
}

// Another tab of the game changing it: stored there, so read again here.
globalThis.addEventListener?.('storage', (event) => {
  if (event.key === KEY) current = null;
});

export function saveBuildZoom(chosen: BuildZoom): void {
  current = chosen;
  store(KEY, chosen);
}

/** The choices as the menus offer them, for a `<select>`. */
export function buildZoomOptions(): string {
  return BUILD_ZOOMS.map(
    (value) => `<option value="${value}">${escape(t(`buildZoom.${value}`))}</option>`,
  ).join('');
}
