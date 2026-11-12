import { createRequire } from 'node:module';

import type * as Koffi from 'koffi';

import { SPACEWAR } from './steam.js';
import { steamApiPath } from './steamAvatars.js';

/**
 * Steam achievements and stats, the app's side (docs/STEAM_ACHIEVEMENTS.md AC3): the page decides
 * what was earned (`client/src/steam/achievements.ts`) and asks for it here, by API name. Steam
 * is the store of truth (§4.1), so nothing is kept beside it.
 *
 * Steam has a player's stats only once they are loaded — the library of `steamworks.js` 0.4.0 is
 * from before Steam loaded them by itself (its `ISteamUserStats` is v012), so they are asked for
 * as Steam starts (`RequestCurrentStats`) — and until then every call fails. An achievement asked
 * for meanwhile waits and is tried again; given up after `MAX_TRIES`, since a name Steamworks
 * does not know fails for ever (any of ours under App ID 480).
 */

/** The few calls of Steam's this needs, so the logic is tested without Steam. */
export interface StatsApi {
  activate(name: string): boolean;
  isActivated(name: string): boolean;
  getInt(name: string): number | null;
  setInt(name: string, value: number): boolean;
  store(): boolean;
  /** Steam's popup of an achievement's progress; false where the FFI would not open. */
  indicateProgress(name: string, current: number, max: number): boolean;
}

/** Steam's stats, as the page knows them (`StatTotals` with the towers' count). */
export const STAT_NAMES = [
  'castles_sealed',
  'walls_destroyed',
  'towers_bought',
  'towers_bought_count',
] as const;
export type StatName = (typeof STAT_NAMES)[number];
export type Stats = Record<StatName, number>;

/**
 * Under App ID 480, behind `BOLLFORT_ACHIEVEMENTS=spacewar`, our names put onto Spacewar's own
 * achievements and stats, to try the plumbing before our App ID (AC3): the first match and win as
 * its two first achievements, everything else as its third, and three of our stats on its three
 * integers. Names as 480's own schema has them (2026-11-12): its example's ACH_HEAVY_FIRE is not there.
 */
const SPACEWAR_ACHIEVEMENTS: Record<string, string> = {
  FIRST_MATCH: 'ACH_WIN_ONE_GAME',
  FIRST_WIN: 'ACH_WIN_100_GAMES',
};
const SPACEWAR_OTHER = 'ACH_TRAVEL_FAR_SINGLE';
const SPACEWAR_STATS: Partial<Record<StatName, string>> = {
  castles_sealed: 'NumGames',
  walls_destroyed: 'NumWins',
  towers_bought: 'NumLosses',
};

/** How the page's names reach Steam: as they are, onto Spacewar's, or not at all. */
export type Naming = 'own' | 'spacewar' | 'off';

/** Ours under our App ID; under 480 only behind the switch, since 480 has none of ours. */
export function namingFor(appId: number, env: string | undefined): Naming {
  if (appId !== SPACEWAR) return 'own';
  return env === 'spacewar' ? 'spacewar' : 'off';
}

const MAX_TRIES = 15;
const RETRY_MS = 2000;

export class SteamAchievements {
  /** Achievements asked for that Steam has not taken yet, with the tries spent on each. */
  private readonly waiting = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: StatsApi,
    private readonly naming: Naming,
    private readonly log: (line: string) => void = () => {},
    private readonly schedule: (run: () => void, ms: number) => ReturnType<typeof setTimeout> = (
      run,
      ms,
    ) => setTimeout(run, ms),
  ) {}

  get enabled(): boolean {
    return this.naming !== 'off';
  }

  private achievementName(id: string): string {
    return this.naming === 'spacewar' ? (SPACEWAR_ACHIEVEMENTS[id] ?? SPACEWAR_OTHER) : id;
  }

  private statName(name: StatName): string | null {
    return this.naming === 'spacewar' ? (SPACEWAR_STATS[name] ?? null) : name;
  }

  /** Of these, the ones the player already holds; none while Steam has not loaded them. */
  held(ids: readonly string[]): string[] {
    if (!this.enabled) return [];
    return ids.filter((id) => this.api.isActivated(this.achievementName(id)));
  }

  /** Unlocks an achievement, now or as soon as Steam can. */
  achieve(id: string): void {
    if (!this.enabled || this.waiting.has(id)) return;
    if (this.api.activate(this.achievementName(id))) {
      this.log(`achievement ${id}`);
      return;
    }
    this.waiting.set(id, 1);
    this.retryLater();
  }

  private retryLater(): void {
    if (this.timer !== null || this.waiting.size === 0) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      for (const [id, tries] of [...this.waiting]) {
        if (this.api.activate(this.achievementName(id))) {
          this.waiting.delete(id);
          this.log(`achievement ${id}, try ${tries + 1}`);
        } else if (tries + 1 >= MAX_TRIES) {
          this.waiting.delete(id);
          this.log(`achievement ${id} refused by Steam ${MAX_TRIES} times: given up`);
        } else {
          this.waiting.set(id, tries + 1);
        }
      }
      if (this.waiting.size === 0) this.api.store();
      this.retryLater();
    }, RETRY_MS);
  }

  /** Steam's totals, or null while they are not loaded (or achievements are off). */
  stats(): Stats | null {
    if (!this.enabled) return null;
    const stats = {} as Stats;
    for (const name of STAT_NAMES) {
      const steam = this.statName(name);
      const value = steam === null ? 0 : this.api.getInt(steam);
      if (value === null) return null;
      stats[name] = value;
    }
    return stats;
  }

  /**
   * New totals, kept by Steam: each only ever raised, so a page with stale totals cannot lower
   * them. Stored once — Steam rate-limits storing — which also stores the match's achievements.
   */
  setStats(stats: Stats): boolean {
    if (!this.enabled) return false;
    let ok = true;
    for (const name of STAT_NAMES) {
      const steam = this.statName(name);
      const value = stats[name];
      if (steam === null || !Number.isSafeInteger(value) || value < 0) continue;
      const now = this.api.getInt(steam);
      if (now !== null && value <= now) continue;
      ok = this.api.setInt(steam, value) && ok;
    }
    const stored = this.api.store() && ok;
    this.log(
      `stats ${stored ? 'stored' : 'not stored'}: ${STAT_NAMES.map((n) => `${n} ${stats[n]}`).join(', ')}`,
    );
    return stored;
  }

  /** Steam's popup of a stat's achievement on its way, at its quarters (the page decides). */
  progress(id: string, current: number, max: number): void {
    if (!this.enabled) return;
    if (!this.api.indicateProgress(this.achievementName(id), current, max)) {
      this.log(`no progress shown for ${id}`);
    }
  }
}

/**
 * `IndicateAchievementProgress`, which `steamworks.js` lacks, through `koffi` on the library it
 * has initialised (as the avatars are); also `RequestCurrentStats`, asked once here. To be opened
 * only once Steam is initialised.
 */
export function steamProgress(
  libraryPath = steamApiPath(),
): (name: string, current: number, max: number) => boolean {
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof Koffi;
  const lib = koffi.load(libraryPath);
  const statsOf = lib.func('void *SteamAPI_SteamUserStats_v012()');
  const request = lib.func('bool SteamAPI_ISteamUserStats_RequestCurrentStats(void *self)');
  const indicate = lib.func(
    'bool SteamAPI_ISteamUserStats_IndicateAchievementProgress(void *self, const char *name, uint32_t current, uint32_t max)',
  );
  const userStats: unknown = statsOf();
  if (userStats === null) throw new Error('Steam’s user stats are not there');
  request(userStats);
  return (name, current, max) => indicate(userStats, name, current, max) as boolean;
}
