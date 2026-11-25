import type { CampaignConfig, CampaignDifficulty } from '@bollfort/config';
import { streamFor } from '@bollfort/sim';

import { newCarry, startingLives, type CampaignLevelSetup } from './ruleset.js';
import { CAMPAIGN_SAVE_VERSION, type CampaignSave, type LevelRecord } from './save.js';

/**
 * A campaign's run (docs/CAMPAIGN.md §2, §9, §12): which level comes next, the setup it is played
 * with, and what its result does to the campaign — pure, so the client's screens only show it and
 * the tests need no page. Every function returns a new save and leaves the one it is given alone.
 */

export interface NewCampaign {
  id: string;
  difficulty: CampaignDifficulty;
  names: readonly string[];
  seed: number;
  now: string;
}

export function newCampaign(config: CampaignConfig, options: NewCampaign): CampaignSave {
  const { difficulty, names } = options;
  const carry = newCarry(config, difficulty, names.length);
  return {
    version: CAMPAIGN_SAVE_VERSION,
    id: options.id,
    createdAt: options.now,
    playedAt: options.now,
    difficulty,
    seed: options.seed >>> 0,
    players: names.map((name) => ({ name })),
    stage: 0,
    carry: { ...carry, retriesUsed: 0 },
    history: [],
    defeated: false,
    finished: false,
  };
}

/** The levels a campaign of this difficulty plays, by their index in `levels`. */
export function levelOrder(config: CampaignConfig, save: CampaignSave): readonly number[] {
  return config.difficulties[save.difficulty].levelOrder;
}

/** The level the campaign plays next, by its index in `levels`. */
export function nextLevel(config: CampaignConfig, save: CampaignSave): number {
  const order = levelOrder(config, save);
  return order[Math.min(save.stage, order.length - 1)] as number;
}

/** Whether the next level is the campaign's last, the final battle. */
export function finalStage(config: CampaignConfig, save: CampaignSave): boolean {
  return save.stage >= levelOrder(config, save).length - 1;
}

/** Retries of a lost level the campaign has left; null where they are unlimited (§9). */
export function retriesLeft(config: CampaignConfig, save: CampaignSave): number | null {
  const allowed = config.difficulties[save.difficulty].retries;
  return allowed === null ? null : Math.max(0, allowed - save.carry.retriesUsed);
}

/**
 * The next level's seed: from the campaign's, the stage and how often it has been lost there, so
 * a retry is a fresh map of the level's shapes and a save resumes the very map it left.
 */
export function levelSeed(save: CampaignSave): number {
  const tries = save.history.filter((h) => h.result === 'lost').length;
  return streamFor(save.seed, `campaign-level:${save.stage}:${tries}`).nextU32();
}

/** What the next level is played with: everything `campaignRuleset` needs. */
export function levelSetup(config: CampaignConfig, save: CampaignSave): CampaignLevelSetup {
  return {
    difficulty: save.difficulty,
    level: nextLevel(config, save),
    players: save.players.length,
    seed: levelSeed(save),
    carry: {
      scores: [...save.carry.scores],
      lives: save.carry.lives,
      roundsPlayed: save.carry.roundsPlayed,
    },
  };
}

/** How a level ended, as the match left it. */
export interface LevelOutcome {
  cleared: boolean;
  /** Each player's score at the end, the carried score in it. */
  scores: readonly number[];
  /** The team's lives left. */
  lives: number;
  rounds: number;
  shape: string;
  sunk: readonly [number, number, number];
  grunts: number;
}

/**
 * A level's result into the campaign. Cleared: the level's bonus to every player, a life back up
 * to the count the campaign began with, the rounds counted, and on to the next level — or the
 * campaign won after the last. Lost: recorded, and the carry kept as it was, so a retry plays the
 * level again from its start; with no retry left the campaign is over.
 */
export function recordLevel(
  config: CampaignConfig,
  save: CampaignSave,
  outcome: LevelOutcome,
  now: string,
): CampaignSave {
  const level = nextLevel(config, save);
  const entry = config.levels[level];
  const multiplier = config.difficulties[save.difficulty].scoreMultiplier;
  const bonus = outcome.cleared ? Math.round((entry?.clearPoints ?? 0) * multiplier) : 0;
  const scores = save.players.map((_, i) => (outcome.scores[i] ?? 0) + bonus);
  const record: LevelRecord = {
    level,
    shape: outcome.shape,
    rounds: outcome.rounds,
    points: scores.map((score, i) => score - (save.carry.scores[i] ?? 0)),
    result: outcome.cleared ? 'cleared' : 'lost',
    sunk: [...outcome.sunk],
    grunts: outcome.grunts,
  };
  const history = [...save.history, record];
  if (!outcome.cleared) {
    return {
      ...save,
      playedAt: now,
      history,
      defeated: true,
      finished: retriesLeft(config, save) === 0,
    };
  }
  const most = startingLives(config, save.difficulty, save.players.length);
  const lives = config.lifePerLevel ? Math.min(most, outcome.lives + 1) : outcome.lives;
  const stage = save.stage + 1;
  return {
    ...save,
    playedAt: now,
    stage,
    carry: {
      ...save.carry,
      scores,
      lives: Math.max(outcome.lives, lives),
      roundsPlayed: save.carry.roundsPlayed + outcome.rounds,
    },
    history,
    defeated: false,
    finished: stage >= levelOrder(config, save).length,
  };
}

/** A lost level played again from its start, one retry spent. */
export function retryLevel(save: CampaignSave, now: string): CampaignSave {
  return {
    ...save,
    playedAt: now,
    defeated: false,
    carry: { ...save.carry, retriesUsed: save.carry.retriesUsed + 1 },
  };
}

/** Whether the campaign was won: every level cleared. */
export function won(config: CampaignConfig, save: CampaignSave): boolean {
  return save.finished && save.stage >= levelOrder(config, save).length;
}

/** The team's total, every player's score together. */
export function teamTotal(save: CampaignSave): number {
  return save.carry.scores.reduce((a, b) => a + b, 0);
}
