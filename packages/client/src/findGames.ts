import { type RoomListing } from '@bollfort/protocol';

import {
  REFRESH_MS,
  filtersMarkup,
  gamesMarkup,
  parseFilters,
  parseRoomList,
  type BrowserFilters,
} from './browser.js';
import { enhanceChoices } from './choices.js';
import { escape } from './html.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/**
 * Find a game (STEAM.md §4): the games browser as a window of its own over the menu, as How to
 * play and Options are — the filters above, the open rooms below, refreshed every few seconds
 * while it is open, and with none, the button that hosts a public single match.
 */

/** Where the filters are remembered between visits. */
const FILTERS_KEY = 'bollfort.browserFilters';

export interface FindGamesActions {
  /** The menu's click. */
  click(): void;
  /** Join the room with this code; the window has closed. */
  join(code: string): void;
  /** Host a public single match, as the menu's Single match; the window has closed. */
  host(): void;
  /** A line above the list: a game that filled or closed while it was listed. */
  notice?: string | null;
}

export function openFindGames(actions: FindGamesActions): void {
  const root = document.createElement('div');
  root.className = 'how-to-play find-games';
  let filters: BrowserFilters = parseFilters(stored(FILTERS_KEY));
  let rooms: RoomListing[] | null | undefined; // undefined: not yet asked
  let shown = '';

  const close = (): void => {
    root.remove();
  };
  root.innerHTML = `
    <div class="panel">
      <h2>${t('browser.title')}</h2>
      ${actions.notice ? `<p class="notice">${escape(actions.notice)}</p>` : ''}
      ${filtersMarkup(filters)}
      <div id="open-games"><p class="note">${t('menu.lookingForServer')}</p></div>
      <button class="close quiet">${t('credits.close')}</button>
    </div>`;
  enhanceChoices(root);
  const list = root.querySelector<HTMLElement>('#open-games')!;

  const draw = (): void => {
    if (rooms === undefined) return;
    const html =
      rooms === null ? `<p class="note">${t('menu.noServer')}</p>` : gamesMarkup(rooms, filters);
    // Only when it changed, so a Join button is not replaced under a pressed mouse.
    if (html !== shown) list.innerHTML = shown = html;
  };
  for (const [id, key] of [
    ['#filter-mode', 'mode'],
    ['#filter-towers', 'towers'],
  ] as const) {
    const select = root.querySelector<HTMLSelectElement>(id);
    select?.addEventListener('change', () => {
      actions.click();
      filters = parseFilters(JSON.stringify({ ...filters, [key]: select.value }));
      store(FILTERS_KEY, JSON.stringify(filters));
      draw();
    });
  }

  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const code = target.closest<HTMLButtonElement>('.join-open')?.dataset.code;
    if (code !== undefined) {
      actions.click();
      close();
      actions.join(code);
      return;
    }
    if (target.closest('#host-public') !== null) {
      actions.click();
      close();
      actions.host();
    }
  });
  root.querySelector('.close')?.addEventListener('click', () => {
    actions.click();
    close();
  });
  // A click on the dimmed menu around the panel closes it too, as Options' does.
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      actions.click();
      close();
    }
  });

  const refresh = async (): Promise<void> => {
    let fetched: RoomListing[] | null;
    try {
      const response = await fetch('/api/rooms', { cache: 'no-store' });
      fetched = parseRoomList(await response.json());
    } catch {
      fetched = null;
    }
    if (!root.isConnected) return;
    rooms = fetched;
    draw();
  };
  document.body.append(root);
  void refresh();
  const timer = setInterval(() => {
    if (root.isConnected) void refresh();
    else clearInterval(timer);
  }, REFRESH_MS);
}
