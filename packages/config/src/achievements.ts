import { z } from 'zod';

import { MAX_LEVEL } from './ai.js';
import type { Ruleset } from './ruleset.js';

/**
 * Steam achievements (docs/STEAM_ACHIEVEMENTS.md §4): the 35 the user chose (2026-11-12), each
 * under its API name — the name Steam and the code know it by, fixed once published — with the
 * numbers it is earned at. The thresholds come from the recordings (ARCHIVE 15zz); every one is
 * here rather than in the detector, and every achievement is listed, so a new one cannot be
 * forgotten in either place: the schema names each key, and an unknown or missing one is an error.
 */

const Count = z.number().int().positive();
const Floor = z.number().int().min(1).max(MAX_LEVEL);
const None = z.strictObject({});

export const AchievementsConfigSchema = z.strictObject({
  FIRST_MATCH: None,
  FIRST_WIN: None,
  POCKET: None,
  JUST_IN_TIME: None,
  FIRST_BREACH: None,
  READ_THE_MANUAL: None,
  FULL_ESTATE: None,
  /** Tiles of sealed territory at one resolution. */
  LAND_GRAB: z.strictObject({ tiles: Count }),
  EMPIRE: z.strictObject({ tiles: Count }),
  /** Castles sealed at resolutions, summed across matches (the stat `castles_sealed`). */
  SEAL_OF_APPROVAL: z.strictObject({ castles: Count }),
  /** Walls the player's shots destroyed in one combat phase, its shots landing after included. */
  BIG_BARRAGE: z.strictObject({ walls: Count }),
  LIGHTS_OUT: None,
  /** Walls destroyed, summed across matches (the stat `walls_destroyed`). */
  DEMOLITION_CREW: z.strictObject({ walls: Count }),
  /** A win with every opponent bot at this level or above. */
  SEASONED: z.strictObject({ levelFloor: Floor }),
  WARLORD: z.strictObject({ levelFloor: Floor }),
  UNTOUCHABLE: None,
  SOLE_SURVIVOR: None,
  GOOD_NEIGHBOUR: None,
  IN_GOOD_COMPANY: None,
  SEASON_TICKET: None,
  CHAMPION: None,
  INVINCIBLE: None,
  SPECIAL_DELIVERY: None,
  /** Every special kind bought once (the stat `towers_bought`, a bitmask, and its count). */
  ALL_TOWERS: None,
  /** Walls one Big Bertha shot destroys. */
  BIG_BANG: z.strictObject({ walls: Count }),
  /** Walls the Allerdickste Bertha's one shell destroys. */
  HEAVYWEIGHT: z.strictObject({ walls: Count }),
  /** Architects owned at once, no tile within the reach of two of them. */
  ARCHITECT_ZONING: z.strictObject({ towers: Count }),
  /** Shots one Rapid Cannon fires in one combat phase. */
  RAPID_FIRE: z.strictObject({ shots: Count }),
  /** Walls one Lightning strike destroys, the first tile and its jumps. */
  CHAIN_REACTION: z.strictObject({ walls: Count }),
  /** Walls one Laser beam clears. */
  STRAIGHT_THROUGH: z.strictObject({ walls: Count }),
  COLD_SHOULDER: None,
  /** Guns one Lullaby shot puts to sleep. */
  SWEET_DREAMS: z.strictObject({ guns: Count }),
  /** Walls one Subwoofer wave clears, a lane a wall. */
  BASS_DROP: z.strictObject({ walls: Count }),
  /** Special towers bought in a match the player wins. */
  TOWERING_VICTORY: z.strictObject({ towers: Count }),
  AMONG_FRIENDS: None,
});

export type AchievementsConfig = z.infer<typeof AchievementsConfigSchema>;
export type AchievementId = keyof AchievementsConfig;

/** Every achievement, in the order of the list (§4), which is Steam's order too. */
export const ACHIEVEMENT_IDS = Object.keys(AchievementsConfigSchema.shape) as AchievementId[];

/**
 * The stats Steam keeps for them (§4.1), integers all. `towers_bought` is a bitmask by
 * `SPECIAL_KINDS`, so a tower counts once; its count is what Steam shows as progress.
 */
export const ACHIEVEMENT_STATS = [
  'castles_sealed',
  'walls_destroyed',
  'towers_bought',
  'towers_bought_count',
] as const;
export type AchievementStat = (typeof ACHIEVEMENT_STATS)[number];

/**
 * What the ruleset makes impossible, which no schema of this file alone can see: more towers
 * than an island may hold, or a beam, wave or chain asked for more walls than its dearest
 * variant can take. Empty means every achievement can be earned under these rules.
 */
export function achievementProblems(config: AchievementsConfig, ruleset: Ruleset): string[] {
  const problems: string[] = [];
  const { specials } = ruleset;
  const cap = specials.maxOwned;
  for (const id of ['ARCHITECT_ZONING', 'TOWERING_VICTORY'] as const) {
    if (cap !== null && config[id].towers > cap) {
      problems.push(`achievements: ${id} asks for ${config[id].towers} towers, the cap is ${cap}`);
    }
  }
  // The most a tower's dearer variant can do, or null where the ruleset has no such tower.
  const most = <T>(
    kind: { '2'?: T | undefined; '3'?: T | undefined } | undefined,
    of: (v: T) => number,
  ): number | null => {
    const values = [kind?.['2'], kind?.['3']].filter((v): v is T => v !== undefined).map(of);
    return values.length === 0 ? null : Math.max(...values);
  };
  const limits: [AchievementId, number, number | null][] = [
    [
      'STRAIGHT_THROUGH',
      config.STRAIGHT_THROUGH.walls,
      most(specials.laser, (v) => Math.ceil(v.pierce)),
    ],
    ['BASS_DROP', config.BASS_DROP.walls, most(specials.subwoofer, (v) => v.waveWidth)],
    // The tile struck, then each jump.
    ['CHAIN_REACTION', config.CHAIN_REACTION.walls, most(specials.lightning, (v) => v.jumps + 1)],
    ['SWEET_DREAMS', config.SWEET_DREAMS.guns, most(specials.lullaby, (v) => v.targets)],
  ];
  for (const [id, asked, possible] of limits) {
    if (possible === null) problems.push(`achievements: ${id} needs a tower the ruleset lacks`);
    else if (asked > possible) {
      problems.push(`achievements: ${id} asks for ${asked}, the rules allow ${possible} at most`);
    }
  }
  if (config.WARLORD.levelFloor <= config.SEASONED.levelFloor) {
    problems.push('achievements: WARLORD’s level floor must be above SEASONED’s');
  }
  return problems;
}
