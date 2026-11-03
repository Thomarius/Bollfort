import { PROTOCOL_VERSION, RoomListSchema, type RoomListing } from '@bollfort/protocol';

import { escape } from './html.js';
import type { TextKey } from '@bollfort/config';

import { t } from './i18n.js';
import { withIcon } from './icons.js';

/**
 * The games browser (STEAM.md §4): the Find a game window's list of open rooms, each with a
 * Join button, refreshed every few seconds while it is open, and two filters. Fetched over plain
 * HTTP, since the menu has no socket open. Outside Steam the rooms are those of the server the
 * page came from; under Steam they will be Steam's public lobbies, in the same shape, so nothing
 * here knows the source.
 */

/** How often the window asks again. */
export const REFRESH_MS = 3000;

/** The browser's two filters (STEAM.md §4), kept simple for a small player base. */
export interface BrowserFilters {
  /** Free-for-all only, teams only, or either. */
  mode: 'any' | 'ffa' | 'teams';
  /** Special towers on, off, or either. */
  towers: 'any' | 'on' | 'off';
}

export const NO_FILTERS: BrowserFilters = { mode: 'any', towers: 'any' };

/** Filters as stored, or none where they cannot be read. */
export function parseFilters(raw: string | null): BrowserFilters {
  try {
    const value = JSON.parse(raw ?? '{}') as Partial<Record<keyof BrowserFilters, unknown>>;
    return {
      mode: value.mode === 'ffa' || value.mode === 'teams' ? value.mode : 'any',
      towers: value.towers === 'on' || value.towers === 'off' ? value.towers : 'any',
    };
  } catch {
    return NO_FILTERS;
  }
}

/** The rooms the filters let through, in the server's order. */
export function filterRooms(rooms: readonly RoomListing[], filters: BrowserFilters): RoomListing[] {
  return rooms.filter(
    (room) =>
      (filters.mode === 'any' || (filters.mode === 'teams') === room.teamSize > 1) &&
      (filters.towers === 'any' || (filters.towers === 'on') === room.towers),
  );
}

/**
 * The rooms a server listed, or null when there is nothing to show a browser for: no
 * server at all — the dev server answers any path with its page, not JSON — or one on
 * another protocol, whose rooms this page could not join.
 */
export function parseRoomList(body: unknown): RoomListing[] | null {
  const parsed = RoomListSchema.safeParse(body);
  if (!parsed.success || parsed.data.protocol !== PROTOCOL_VERSION) return null;
  return parsed.data.rooms;
}

/** The filters' markup: each a few-option select, shown as buttons (`choices.ts`). */
export function filtersMarkup(filters: BrowserFilters): string {
  const select = (
    id: string,
    label: string,
    chosen: string,
    options: readonly [string, string][],
  ): string =>
    `<label class="browser-filter">${label}<select id="${id}" data-ui="seg" aria-label="${escape(label)}">` +
    options
      .map(
        ([value, text]) =>
          `<option value="${value}"${value === chosen ? ' selected' : ''}>${text}</option>`,
      )
      .join('') +
    `</select></label>`;
  return (
    `<div class="browser-filters">` +
    select('filter-mode', t('browser.filterMode'), filters.mode, [
      ['any', t('browser.either')],
      ['ffa', t('browser.freeForAll')],
      ['teams', t('browser.teamsOnly')],
    ]) +
    select('filter-towers', t('browser.filterTowers'), filters.towers, [
      ['any', t('browser.either')],
      ['on', t('browser.on')],
      ['off', t('browser.off')],
    ]) +
    `</div>`
  );
}

/**
 * The list's markup: a row per room the filters let through; and with none, a line saying so
 * and the one button that hosts a public single match, as the menu's Single match does, for
 * others to find here (STEAM.md §4).
 */
export function gamesMarkup(
  rooms: readonly RoomListing[],
  filters: BrowserFilters = NO_FILTERS,
): string {
  const shown = filterRooms(rooms, filters);
  if (shown.length === 0) {
    const none = rooms.length === 0 ? t('browser.none') : t('browser.noneMatching');
    return (
      `<div class="browser-empty"><p class="note">${none}</p>` +
      `<button id="host-public" class="primary">${withIcon('play', t('browser.hostPublic'))}</button>` +
      `<p class="note">${t('browser.hostPublicNote')}</p></div>`
    );
  }
  const rows = shown.map((room) => {
    const detail = [
      ...(room.tournament === null ? [] : [t('browser.tournament', { team: room.tournament })]),
      room.teamSize > 1 ? t('browser.teams', { n: room.teamSize }) : t('browser.ffa'),
      t('browser.free', { free: room.playerCount - room.people, players: room.playerCount }),
      room.towers ? t('browser.towersOn') : t('browser.towersOff'),
    ].join(' · ');
    return (
      `<li><span class="host">${escape(room.host)}</span>` +
      `<span class="detail">${detail}</span>` +
      `<button class="join-open" data-code="${escape(room.code)}">${t('browser.join')}</button></li>`
    );
  });
  return `<ul class="open-games">${rows.join('')}</ul>`;
}

/** The refusals a player can be told of in their own language, by the server's code. */
const REFUSALS: Record<string, TextKey> = {
  bad_message: 'refusal.bad_message',
  no_capacity: 'refusal.no_capacity',
  no_room: 'refusal.no_room',
  removed: 'lobby.removed',
  room_full: 'refusal.room_full',
};

/**
 * What a server's refusal says, in the player's language where the code is known; a code
 * this page does not know — a newer server's — keeps the server's own English words, so it
 * still says something.
 */
export function refusalText(code: string, message: string): string {
  const key = REFUSALS[code];
  return key === undefined ? message : t(key);
}

/** What the menu is told when a room it chose went while it was looking. */
export function joinRefusedNotice(code: string): string | null {
  switch (code) {
    case 'room_full':
      return t('browser.refused.full');
    case 'no_room':
      return t('browser.refused.closed');
    case 'removed':
      return t('lobby.removed');
    default:
      return null;
  }
}
