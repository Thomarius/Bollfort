import { store, stored } from './storage.js';

/** Where this browser keeps its own ID (STEAM.md §5). */
const BROWSER_ID_KEY = 'bollfort.browserId';

/**
 * This browser's own random ID, made once and kept in its storage, sent with every create and
 * join: a room whose host removed this browser refuses it again, a new tab included, where the
 * seat's token lasts only the tab. A deterrent, not security: clearing the browser's data, or
 * another browser, gets round it, and storage refused makes a new one each time. A module of
 * its own, needing only storage, so the tournament's room can import it without the page.
 */
export function browserId(): string {
  const kept = stored(BROWSER_ID_KEY);
  if (kept !== null && /^[0-9a-f]{32}$/.test(kept)) return kept;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  store(BROWSER_ID_KEY, id);
  return id;
}
