import {
  CAMPAIGN_MAX_PLAYERS,
  RulesetSchema,
  type CampaignConfig,
  type CampaignDifficulty,
  type CampaignDifficultyConfig,
  type Ruleset,
} from '@bollfort/config';
import { streamFor } from '@bollfort/sim';

/**
 * What a campaign carries from one level to the next (docs/CAMPAIGN.md §2): the level's start,
 * so a level left or lost is played again from exactly there.
 */
export interface CampaignCarry {
  /** Each player's score, by player. */
  scores: number[];
  /** The team's lives. */
  lives: number;
  /** Rounds played in the campaign before this level. */
  roundsPlayed: number;
}

export interface CampaignLevelSetup {
  difficulty: CampaignDifficulty;
  /** The level's index in the campaign's `levels`, 0 to 5. */
  level: number;
  /** People playing, 1 to 3. */
  players: number;
  /** The level's seed, from which its map's shape is drawn as its terrain is. */
  seed: number;
  carry: CampaignCarry;
}

function difficultyOf(
  config: CampaignConfig,
  difficulty: CampaignDifficulty,
): CampaignDifficultyConfig {
  return config.difficulties[difficulty];
}

/** The team's lives as a campaign starts (CAMPAIGN §9). */
export function startingLives(
  config: CampaignConfig,
  difficulty: CampaignDifficulty,
  players: number,
): number {
  const d = difficultyOf(config, difficulty);
  return d.lives + d.livesPerExtraPlayer * (players - 1);
}

/** A new campaign's carry: Veteran's start bonus to everyone, the starting lives. */
export function newCarry(
  config: CampaignConfig,
  difficulty: CampaignDifficulty,
  players: number,
): CampaignCarry {
  return {
    scores: Array.from({ length: players }, () => difficultyOf(config, difficulty).startBonus),
    lives: startingLives(config, difficulty, players),
    roundsPlayed: 0,
  };
}

/**
 * The ruleset one campaign level is played on: versus play's, with the level's section
 * (`ruleset.campaign`) and the few of versus play's rules a campaign sets aside — one to three
 * players, no round cap of its own (the level has its limit), no special towers (CAMPAIGN §17).
 * Checked against the schema, so a campaign config that builds a ruleset no match could take
 * fails here, not in a match.
 */
export function campaignRuleset(
  config: CampaignConfig,
  base: Ruleset,
  setup: CampaignLevelSetup,
): Ruleset {
  const { difficulty, level, players, seed, carry } = setup;
  if (!Number.isInteger(players) || players < 1 || players > CAMPAIGN_MAX_PLAYERS) {
    throw new RangeError(`a campaign takes 1-${CAMPAIGN_MAX_PLAYERS} players, got ${players}`);
  }
  const entry = config.levels[level];
  if (entry === undefined) throw new RangeError(`no campaign level ${level}`);
  if (carry.scores.length !== players) {
    throw new RangeError(`the carry has ${carry.scores.length} scores for ${players} players`);
  }
  // Drawn as the level is set up, so the shape is in the ruleset and the terrain needs no draw.
  const shape = entry.shapes[streamFor(seed, 'campaign-shape').nextInt(entry.shapes.length)];
  if (shape === undefined) throw new RangeError(`campaign level ${level} has no shape`);

  return RulesetSchema.parse({
    ...base,
    players: { min: 1, max: CAMPAIGN_MAX_PLAYERS },
    specials: { ...base.specials, enabled: false },
    scoring: { ...base.scoring, maxRounds: null },
    campaign: {
      difficulty,
      level,
      shape,
      maxRounds: entry.maxRounds,
      lives: carry.lives,
      pieceStartRound: config.pieces.levelStartRound,
      carry: { scores: [...carry.scores], roundsPlayed: carry.roundsPlayed },
    },
  });
}
