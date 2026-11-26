import type { CampaignConfig, CampaignDifficulty } from '@bollfort/config';
import { streamFor } from '@bollfort/sim';

import { newCarry, startingContinues, type CampaignLevelSetup } from './ruleset.js';
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
    carry: { ...carry, continuesUsed: 0 },
    continued: false,
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

/** Continues the campaign has left; null where they are unlimited (CAMPAIGN §9). */
export function continuesLeft(config: CampaignConfig, save: CampaignSave): number | null {
  const allowed = startingContinues(config, save.difficulty);
  return allowed === null ? null : Math.max(0, allowed - save.carry.continuesUsed);
}

/**
 * Whether the level just lost was lost in its first round, which costs no continue and brings no
 * firepower (CAMPAIGN §9): an unlucky opening is simply played again.
 */
export function freeRetry(save: CampaignSave): boolean {
  const last = save.history.at(-1);
  return save.defeated && last?.result === 'lost' && last.rounds <= 1;
}

/**
 * The next level's seed: from the campaign's and the stage, so a level played again after a defeat
 * is the same map (the user's, 2026-11-26), and a save resumes the very map it left.
 */
export function levelSeed(save: CampaignSave): number {
  return streamFor(save.seed, `campaign-level:${save.stage}`).nextU32();
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
      roundsPlayed: save.carry.roundsPlayed,
      firepower: save.carry.firepower,
    },
    continued: save.continued,
  };
}

/** How a level ended, as the match left it. */
export interface LevelOutcome {
  cleared: boolean;
  /** Each player's score at the end, the carried score in it. */
  scores: readonly number[];
  rounds: number;
  shape: string;
  sunk: readonly [number, number, number];
  grunts: number;
}

/**
 * A level's result into the campaign. Cleared: the level's bonus to every player, the rounds
 * counted, the firepower brought down to what a cleared level keeps, and on to the next level — or
 * the campaign won after the last. Lost: recorded, and the carry kept as it was, so the level is
 * played again from its start (`continueLevel`); lost after its first round with no continue left,
 * the campaign is over, its save kept as its record.
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
    const lost = { ...save, playedAt: now, history, defeated: true };
    return { ...lost, finished: !freeRetry(lost) && continuesLeft(config, save) === 0 };
  }
  const stage = save.stage + 1;
  return {
    ...save,
    playedAt: now,
    stage,
    carry: {
      ...save.carry,
      scores,
      roundsPlayed: save.carry.roundsPlayed + outcome.rounds,
      firepower: Math.min(save.carry.firepower, config.firepower.keptAfterLevel),
    },
    continued: false,
    history,
    defeated: false,
    finished: stage >= levelOrder(config, save).length,
  };
}

/**
 * A lost level played again from its start, on the same map (CAMPAIGN §9). Lost in its first
 * round, for free; otherwise one continue spent, the team's firepower raised by one up to the
 * most, and the level opening with more cannons.
 */
export function continueLevel(
  config: CampaignConfig,
  save: CampaignSave,
  now: string,
): CampaignSave {
  if (freeRetry(save)) return { ...save, playedAt: now, defeated: false };
  return {
    ...save,
    playedAt: now,
    defeated: false,
    continued: true,
    carry: {
      ...save.carry,
      continuesUsed: save.carry.continuesUsed + 1,
      firepower: Math.min(config.firepower.max, save.carry.firepower + 1),
    },
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
