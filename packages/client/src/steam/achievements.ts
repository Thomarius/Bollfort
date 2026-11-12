import {
  AchievementWatcher,
  statAchievements,
  towersBoughtCount,
  tournamentAchievements,
  type StatIncrements,
  type StatTotals,
  type TournamentResult,
} from '@bollfort/analysis';
import {
  ACHIEVEMENT_IDS,
  SPECIAL_KINDS,
  defaultAchievements,
  type AchievementId,
  type AchievementsConfig,
} from '@bollfort/config';
import type { MatchEvent, MatchState } from '@bollfort/sim';
import { HOST_TEAM, type Progress, type Save } from '@bollfort/tournament';

import type { GameHost } from '../host.js';
import { store, stored } from '../storage.js';

/**
 * Steam achievements, the page's side (docs/STEAM_ACHIEVEMENTS.md AC3): which matches count
 * (§3's gates, one pure function), the detector fed as the match plays, and what only the page
 * sees — How to play's pages, a tournament's end. What was earned goes to the app by API name
 * (`window.bollfortHost`, the desktop's `steamAchievements.ts`); Steam keeps it. Outside the
 * Steam build, without Steam, or under App ID 480 without the switch, nothing here is reached.
 */

/** Steam's stats as the app takes them: the page's totals with the towers' count. */
export type SteamStats = StatTotals & { towers_bought_count: number };

/** The app, once Steam play has started with achievements on; null otherwise. */
let bridge: GameHost | null = null;

export function startAchievements(host: GameHost): void {
  bridge = host;
}

export function achievementsOn(): boolean {
  return bridge !== null;
}

/** The address's parameters that make a match no one's own play (§3.2). */
const DEV_PARAMS = ['snapshot', 'speed', 'autopilot', 'round', 'watch', 'demo'] as const;

/**
 * Whether a match counts (§3.2): a person seated in it, not the demo, not watched, and none of
 * the developer's parameters in the address. The Steam build's own `--game-params` (the bench's
 * `autopilot=1`) arrive the same way, so the bench earns nothing either.
 */
export function matchCounts(
  params: Pick<URLSearchParams, 'get'>,
  humanPlayer: number,
  demo: boolean,
): boolean {
  if (demo || humanPlayer < 0) return false;
  return DEV_PARAMS.every((name) => params.get(name) === null);
}

/**
 * One match's achievements, for the person's seat: the detector fed after every step, the
 * achievements sent as they are earned, the stats settled as the match ends.
 */
export class MatchAchievements {
  private readonly watcher: AchievementWatcher;
  private present = true;
  private ended = false;

  constructor(
    private readonly host: Pick<GameHost, 'achieve' | 'stats' | 'setStats' | 'achievementProgress'>,
    seat: number,
    /** Each player's bot level by player id, null for a person. */
    levels: readonly (number | null)[],
    held: readonly AchievementId[],
    private readonly config: AchievementsConfig = defaultAchievements,
  ) {
    this.watcher = new AchievementWatcher(config, { seat, levels }, held);
  }

  /** After each step, with that step's events. */
  step(state: MatchState, events: readonly MatchEvent[]): void {
    if (this.ended) return;
    this.watcher.observe(state, events, this.present);
    for (const id of this.watcher.drain()) this.host.achieve(id);
    if (state.phase === 'game_over') void this.end();
  }

  /**
   * The page missed steps — a rejoin after a drop, the server's board taking over — so a bot
   * played the seat meanwhile: the match no longer counts as the person's whole (§3.2).
   */
  rejoined(state: MatchState): void {
    this.present = false;
    this.watcher.observe(state, [], false);
    this.present = true;
  }

  /** The match over: its stats added to Steam's, and the stats' achievements they reach. */
  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    const before = await this.host.stats();
    if (before === null) return;
    const settled = settleStats(this.config, before, this.watcher.stats);
    for (const { id, current, max } of settled.progress) {
      this.host.achievementProgress(id, current, max);
    }
    for (const id of settled.unlock) this.host.achieve(id);
    await this.host.setStats(settled.totals);
  }
}

/** A stat's achievement and its threshold, for the progress Steam shows. */
function statGoals(config: AchievementsConfig): {
  id: AchievementId;
  of: (s: SteamStats) => number;
  max: number;
}[] {
  return [
    { id: 'SEAL_OF_APPROVAL', of: (s) => s.castles_sealed, max: config.SEAL_OF_APPROVAL.castles },
    { id: 'DEMOLITION_CREW', of: (s) => s.walls_destroyed, max: config.DEMOLITION_CREW.walls },
    { id: 'ALL_TOWERS', of: (s) => s.towers_bought_count, max: SPECIAL_KINDS.length },
  ];
}

/**
 * Steam's totals after a match: the counts added, the towers' mask OR'd and its count taken;
 * the stats' achievements they meet; and Steam's progress popup for each stat that crossed a
 * quarter of its way without arriving (AC3).
 */
export function settleStats(
  config: AchievementsConfig,
  before: SteamStats,
  match: StatIncrements,
): {
  totals: SteamStats;
  unlock: AchievementId[];
  progress: { id: AchievementId; current: number; max: number }[];
} {
  const mask = (before.towers_bought | match.towers_bought) >>> 0;
  const totals: SteamStats = {
    castles_sealed: before.castles_sealed + match.castles_sealed,
    walls_destroyed: before.walls_destroyed + match.walls_destroyed,
    towers_bought: mask,
    towers_bought_count: towersBoughtCount(mask),
  };
  const progress = statGoals(config).flatMap(({ id, of, max }) => {
    const was = of(before);
    const now = of(totals);
    const quarter = (n: number): number => Math.floor((4 * Math.min(n, max)) / max);
    return now < max && quarter(now) > quarter(was) ? [{ id, current: now, max }] : [];
  });
  return { totals, unlock: statAchievements(config, totals), progress };
}

/** The host's team's tournament as it ended: whether they won it, and their matches. */
export function tournamentResultOf(save: Save, progress: Progress): TournamentResult {
  let matches = 0;
  let won = 0;
  for (const step of save.steps) {
    for (const match of step.matches) {
      if (!match.teams.includes(HOST_TEAM)) continue;
      matches++;
      if (match.order[0] === HOST_TEAM) won++;
    }
  }
  return { champion: progress.status.kind === 'won', matches, won };
}

/** A tournament has ended for the host's team (§4: 20–22). */
export function tournamentEnded(save: Save, progress: Progress): void {
  if (bridge === null || progress.status.kind === 'playing') return;
  for (const id of tournamentAchievements(tournamentResultOf(save, progress))) bridge.achieve(id);
}

const PAGES_KEY = 'bollfort.howToPagesSeen';

/** The pages seen with this one, and whether that is every page: Read the manual (§4: 6). */
export function pagesSeen(
  seen: readonly string[],
  page: string,
  all: readonly string[],
): { seen: string[]; every: boolean } {
  const now = seen.includes(page) ? [...seen] : [...seen, page];
  return { seen: now, every: all.every((p) => now.includes(p)) };
}

/** How to play showed a page, by its caption's key: kept here, as Steam keeps no such list. */
export function howToPageShown(page: string, all: readonly string[]): void {
  if (bridge === null) return;
  let seen: string[] = [];
  try {
    const kept = JSON.parse(stored(PAGES_KEY) ?? '[]') as unknown;
    if (Array.isArray(kept)) seen = kept.filter((p): p is string => typeof p === 'string');
  } catch {
    // A garbled list starts again.
  }
  const after = pagesSeen(seen, page, all);
  if (after.seen.length !== seen.length) store(PAGES_KEY, JSON.stringify(after.seen));
  if (after.every) bridge.achieve('READ_THE_MANUAL');
}

/**
 * The match's achievements, when it counts and Steam is there: the achievements already held
 * asked first, so the detector skips them and their dearer checks.
 */
export async function matchAchievements(
  seat: number,
  levels: readonly (number | null)[],
): Promise<MatchAchievements | null> {
  const host = bridge;
  if (host === null) return null;
  const held = (await host.achievementsHeld(ACHIEVEMENT_IDS)).filter((id): id is AchievementId =>
    (ACHIEVEMENT_IDS as readonly string[]).includes(id),
  );
  return new MatchAchievements(host, seat, levels, held);
}
