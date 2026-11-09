import { store, stored } from '../storage.js';

/**
 * The match a guest was in under Steam, kept for **Back to the match** (STEAM.md §7.3, S3.2):
 * written as the match starts, cleared as it ends or is left. Started again with one kept —
 * the app crashed, or was closed by mistake — the menu offers the button, and the host's
 * server takes the guest back into their seat by Steam ID.
 *
 * Kept in the page's own storage, which the Steam build keeps with the app's data.
 */
export interface KeptMatch {
  /** The host's Steam ID. */
  host: string;
  /** The room's code on the host's server. */
  room: string;
  /** When it was kept, in milliseconds since 1970. */
  at: number;
}

const KEY = 'bollfort.steamMatch';

/** Longer than the longest match: after it, the match is surely over. */
export const KEPT_FOR_MS = 3 * 60 * 60 * 1000;

export function keepMatch(host: string, room: string, now = Date.now()): void {
  store(KEY, JSON.stringify({ host, room, at: now }));
}

export function forgetMatch(): void {
  store(KEY, '');
}

/** The match kept, or null: none, unreadable, or too old to be running still. */
export function keptMatch(now = Date.now()): KeptMatch | null {
  const text = stored(KEY);
  if (text === null || text === '') return null;
  try {
    const kept = JSON.parse(text) as Partial<KeptMatch>;
    if (typeof kept.host !== 'string' || !/^\d{1,20}$/.test(kept.host)) return null;
    if (typeof kept.room !== 'string' || kept.room.length < 4 || kept.room.length > 12) return null;
    if (typeof kept.at !== 'number' || now - kept.at > KEPT_FOR_MS || kept.at > now) return null;
    return { host: kept.host, room: kept.room, at: kept.at };
  } catch {
    return null;
  }
}
