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
import { withIcon } from './icons.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/**
 * Find a game (STEAM.md §4): the games browser as a window of its own over the menu, as How to
 * play and Options are — the filters above, the open rooms below, asked again a few seconds
 * after each answer while it is open, and with none, the button that hosts a public single match.
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
  /**
   * Where the rows come from: the server's rooms by default, Steam's lobbies under Steam
   * (STEAM.md §4). Null when there is nowhere to ask.
   */
  list?: () => Promise<RoomListing[] | null>;
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
  // The next ask's clock beside the heading (the user's, 2026-11-11): a ring filling over the
  // wait, turning while the answer is awaited, and a click asks at once.
  root.innerHTML = `
    <div class="panel">
      <div class="find-games-head">
        <h2>${t('browser.title')}</h2>
        <button class="refresh-games quiet" data-tip="${escape(t('browser.refreshTip'))}"
          aria-label="${escape(t('browser.refreshTip'))}" style="--refresh-ms: ${REFRESH_MS}ms">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle class="track" cx="12" cy="12" r="8" />
            <circle class="fill" cx="12" cy="12" r="8" pathLength="100" />
          </svg>
        </button>
      </div>
      ${actions.notice ? `<p class="notice">${escape(actions.notice)}</p>` : ''}
      ${filtersMarkup(filters)}
      <div id="open-games"><p class="note">${t('menu.lookingForServer')}</p></div>
      <div class="split join-row">
        <input id="code" type="text" maxlength="8" spellcheck="false" autocomplete="off"
          aria-label="${escape(t('menu.codePlaceholder'))}" placeholder="${escape(t('menu.codePlaceholder'))}" />
        <button id="join">${withIcon('join', t('menu.join'))}</button>
      </div>
      <button class="close quiet" data-back>${t('credits.close')}</button>
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
  // A room's code, from the menu since 2026-11-22 (PLAN §11 item 10, GL1): a text field on the
  // first screen read as a web form. Enter in the field is Join, as a form's would be.
  const codeField = root.querySelector<HTMLInputElement>('#code')!;
  const joinButton = root.querySelector<HTMLButtonElement>('#join')!;
  const joinCode = (): void => {
    const code = codeField.value.trim();
    if (code.length === 0 || joinButton.disabled) return;
    actions.click();
    close();
    actions.join(code);
  };
  joinButton.addEventListener('click', joinCode);
  codeField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinCode();
  });
  // Joining by code needs a server this page can reach: asked once as the window opens, the
  // field and Join disabled without one, the window keeping its shape.
  void fetch('/api/rooms', { cache: 'no-store' })
    .then(async (response) => parseRoomList(await response.json()))
    .catch(() => null)
    .then((answer) => {
      for (const control of [codeField, joinButton]) {
        control.disabled = answer === null;
        if (answer === null) control.dataset.tip = t('menu.noServer');
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
      if (actions.list !== undefined) fetched = await actions.list();
      else {
        const response = await fetch('/api/rooms', { cache: 'no-store' });
        fetched = parseRoomList(await response.json());
      }
    } catch {
      fetched = null;
    }
    if (!root.isConnected) return;
    rooms = fetched;
    draw();
  };
  document.body.append(root);
  // The next ask only once this one has its answer, and none once the window has closed.
  const button = root.querySelector<HTMLButtonElement>('.refresh-games')!;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let asking = false;
  const again = (): void => {
    timer = null;
    asking = true;
    button.dataset.state = 'asking';
    void refresh().then(() => {
      asking = false;
      if (!root.isConnected) return;
      // The fill's animation begun afresh for each wait.
      delete button.dataset.state;
      void button.offsetWidth;
      button.dataset.state = 'waiting';
      timer = setTimeout(again, REFRESH_MS);
    });
  };
  button.addEventListener('click', () => {
    if (asking) return;
    actions.click();
    if (timer !== null) clearTimeout(timer);
    again();
  });
  again();
}
