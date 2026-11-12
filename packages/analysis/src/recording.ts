import type { AchievementId, AchievementsConfig, ConfigBundle } from '@bollfort/config';
import {
  replayRecording,
  setupOfRecorded,
  type RecordingLine,
  type ReplayResult,
} from '@bollfort/protocol';

import { AchievementWatcher, type StatIncrements } from './achievements.js';
import { RoundStats, type StatRow, type Tier } from './stats.js';

/**
 * A recorded match's per-round statistics, by replaying it through exactly the code a bot
 * soak is measured with — so rounds played by people and by bots share one table, a
 * person's seat marked `human`.
 *
 * Cheap: a whole ten-round match, every measurement included, replays in about 0.2 s,
 * the heaviest single measurement (the tightest seal still missing, as a build phase
 * ends) about 15 ms. Cheap enough for the server to do as a match ends.
 */
export function statsOfRecording(
  bundle: ConfigBundle,
  lines: readonly RecordingLine[],
): { rows: StatRow[]; replay: ReplayResult } {
  const header = lines[0];
  if (header?.kind !== 'header') throw new Error('a recording starts with its header');
  const tierOf = (player: number): Tier => setupOfRecorded(header.players[player]) ?? 'human';
  const sampler = new RoundStats(bundle, header.id, header.seed, tierOf);
  const replay = replayRecording(lines, (state, events) => sampler.observe(state, events));
  return { rows: sampler.rows, replay };
}

/** What one seat of a recorded match would have earned (docs/STEAM_ACHIEVEMENTS.md, AC2). */
export interface SeatAchievements {
  player: number;
  name: string;
  /** The seat's bot level, null for a person. */
  level: number | null;
  unlocked: readonly AchievementId[];
  stats: StatIncrements;
}

/**
 * Every seat's achievements in a recorded match, bots' included, each watched as its page would
 * watch it and nothing held before. Exact only where the replay is (`replay.mismatches`).
 */
export function achievementsOfRecording(
  config: AchievementsConfig,
  lines: readonly RecordingLine[],
): { seats: SeatAchievements[]; replay: ReplayResult } {
  const header = lines[0];
  if (header?.kind !== 'header') throw new Error('a recording starts with its header');
  const levels = header.players.map((p) => setupOfRecorded(p)?.level ?? null);
  const watchers = levels.map((_, seat) => new AchievementWatcher(config, { seat, levels }));
  const replay = replayRecording(lines, (state, events) => {
    for (const watcher of watchers) watcher.observe(state, events);
  });
  const seats = watchers.map((watcher, player) => ({
    player,
    name: header.players[player]?.name ?? `player ${player}`,
    level: levels[player] ?? null,
    unlocked: watcher.unlocked,
    stats: watcher.stats,
  }));
  return { seats, replay };
}
