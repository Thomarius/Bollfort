import {
  CAMPAIGN_MAX_PLAYERS,
  RulesetSchema,
  SHIP_KINDS,
  type CampaignConfig,
  type CampaignDifficulty,
  type CampaignDifficultyConfig,
  type Ruleset,
  type ShipPool,
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

/**
 * A level's ships, raider / transport / frostship: the difficulty's pool for one player, each kind
 * scaled for co-op by 1 + `coopPoolFactor` × (players − 1), rounded (CAMPAIGN §8.1).
 */
export function poolFor(
  config: CampaignConfig,
  difficulty: CampaignDifficulty,
  level: number,
  players: number,
): ShipPool {
  const pool = difficultyOf(config, difficulty).pool[level];
  if (pool === undefined) throw new RangeError(`no campaign level ${level}`);
  const factor = 1 + config.coopPoolFactor * (players - 1);
  return pool.map((n) => Math.round(n * factor)) as ShipPool;
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
  const size = config.map.sizes.find((s) => s.players === players);
  if (size === undefined) throw new RangeError(`no campaign map size for ${players} players`);

  return RulesetSchema.parse({
    ...base,
    players: { min: 1, max: CAMPAIGN_MAX_PLAYERS },
    specials: { ...base.specials, enabled: false },
    scoring: { ...base.scoring, maxRounds: null },
    campaign: {
      difficulty,
      level,
      shape,
      map: {
        width: size.width,
        height: size.height,
        seaMarginTiles: config.map.seaMarginTiles,
        landFraction: config.map.landFraction[shape],
        coastNoise: { ...config.map.coastNoise },
        lakes: entry.lakes,
        lakeRadiusTiles: config.map.lakeRadiusTiles,
        spawnClearanceTiles: config.map.spawnClearanceTiles,
        castles: entry.castles + config.castlesPerExtraPlayer * (players - 1),
      },
      fleet: {
        pool: poolFor(config, difficulty, level, players),
        maxAfloat: config.fleet.maxAfloat + config.fleet.maxAfloatPerExtraPlayer * (players - 1),
        weights: SHIP_KINDS.map((kind) => config.fleet.kinds[kind].weight) as ShipPool,
        frostshipEvery: difficultyOf(config, difficulty).frostshipEvery[level] ?? null,
        hitsToSink: SHIP_KINDS.map(
          (kind) =>
            config.fleet.kinds[kind].hitsToSink +
            (level >= config.fleet.toughFromLevel ? config.fleet.extraHits : 0),
        ) as ShipPool,
        timing: { ...config.fleet.timing, tileMs: [...config.fleet.timing.tileMs] },
        aim: { ...config.fleet.aim, base: [...config.fleet.aim.base] },
        fire: { ...config.fleet.fire },
      },
      grunts: {
        allowance: [...config.grunts.allowance],
        factor:
          difficultyOf(config, difficulty).gruntFactor *
          (1 + config.coopGruntFactor * (players - 1)),
        timing: { ...config.grunts.timing },
      },
      ice: { ...config.ice },
      comeback: { ...config.comeback },
      scoring: {
        hitPoints: config.scoring.hitPoints,
        gruntPoints: config.scoring.gruntPoints,
        sinkPoints: SHIP_KINDS.map((kind) => config.fleet.kinds[kind].sinkPoints) as ShipPool,
        multiplier: difficultyOf(config, difficulty).scoreMultiplier,
      },
      maxRounds: entry.maxRounds,
      threshold: entry.threshold * (1 + config.coopPoolFactor * (players - 1)),
      threat: { ...config.threat },
      lives: carry.lives,
      pieceStartRound: config.pieces.levelStartRound,
      carry: { scores: [...carry.scores], roundsPlayed: carry.roundsPlayed },
    },
  });
}
