import { z } from 'zod';

/**
 * Campaign mode (docs/CAMPAIGN.md): one to three people against an enemy fleet over six levels.
 * This is the campaign as a whole — its levels, difficulties, pools and scoring; one level's share
 * of it travels in the match's ruleset as `ruleset.campaign` (`CampaignLevelSchema` in
 * `ruleset.ts`), built from this by `campaignRuleset` in `@bollfort/campaign`.
 *
 * The fleet's, grunts' and fire's timings (CAMPAIGN §5.2–§7.2) join this as their work packages
 * are built; what is here is what the levels and difficulties are made of.
 */

export const CAMPAIGN_DIFFICULTIES = ['easier', 'normal', 'veteran', 'harder'] as const;
export const CampaignDifficultySchema = z.enum(CAMPAIGN_DIFFICULTIES);
export type CampaignDifficulty = z.infer<typeof CampaignDifficultySchema>;

/** Where a level's sea lies (CAMPAIGN §3.1); `bay` is reserved for later. */
export const MAP_SHAPES = ['coast', 'corner', 'strip', 'island', 'bay'] as const;
export const MapShapeSchema = z.enum(MAP_SHAPES);
export type MapShape = z.infer<typeof MapShapeSchema>;

export const SHIP_KINDS = ['raider', 'transport', 'fireship'] as const;
export const ShipKindSchema = z.enum(SHIP_KINDS);
export type ShipKind = z.infer<typeof ShipKindSchema>;

/** The campaign's six levels: five and the final battle (CAMPAIGN §1). */
export const CAMPAIGN_LEVELS = 6;

/** The most people a campaign takes (CAMPAIGN §0). */
export const CAMPAIGN_MAX_PLAYERS = 3;

const count = z.number().int().nonnegative();

/** A level's ships for one player, raider / transport / fireship (CAMPAIGN §8.1). */
const PoolSchema = z.tuple([count, count, count]);
export type ShipPool = z.infer<typeof PoolSchema>;

const LevelSchema = z.strictObject({
  /** The shapes its map may take, one drawn from the seed (CAMPAIGN §3.1). */
  shapes: z.array(MapShapeSchema).min(1),
  /** Lakes cut inland (the final battle's island has one). */
  lakes: count,
  /** Castles for one player; `castlesPerExtraPlayer` more for each other (CAMPAIGN §3.4). */
  castles: z.number().int().positive(),
  /** The fleet's threat below which the level is cleared, for one player (CAMPAIGN §8.3). */
  threshold: count,
  /** The level is survived once this many rounds have been played in it (CAMPAIGN §8.3). */
  maxRounds: z.number().int().positive(),
  /** Points to every player for clearing it (CAMPAIGN §11). */
  clearPoints: count,
});
export type CampaignLevel = z.infer<typeof LevelSchema>;

const perLevel = <T extends z.ZodType>(schema: T) => z.array(schema).length(CAMPAIGN_LEVELS);

const DifficultySchema = z.strictObject({
  /** Offered in the campaign's menu; the reserved settings are not, until decided (CAMPAIGN §9). */
  offered: z.boolean(),
  /**
   * The levels played, by their index in `levels`, in order: Veteran starts at level 2 and
   * plays level 5 twice (CAMPAIGN §9).
   */
  levelOrder: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(CAMPAIGN_LEVELS - 1),
    )
    .min(1),
  /** Ships per level, for one player (CAMPAIGN §8.1). */
  pool: perLevel(PoolSchema),
  /** Rounds between fireships added to the pool, per level; null for none (CAMPAIGN §8.2). */
  fireshipEvery: perLevel(z.number().int().positive().nullable()),
  /** The team's lives at the campaign's start, for one player (CAMPAIGN §9). */
  lives: z.number().int().positive(),
  livesPerExtraPlayer: count,
  /** Retries of a lost level in a campaign; null for unlimited. */
  retries: count.nullable(),
  /** The grunts' allowance, as a factor (CAMPAIGN §6.2). */
  gruntFactor: z.number().positive(),
  /** Every point earned, as a factor (CAMPAIGN §11). */
  scoreMultiplier: z.number().positive(),
  /** Points to every player as the campaign starts: Veteran's, for the level it skips. */
  startBonus: count,
});
export type CampaignDifficultyConfig = z.infer<typeof DifficultySchema>;

const ShipKindConfigSchema = z.strictObject({
  hitsToSink: z.number().int().positive(),
  /** Its share of the fleet's threat (CAMPAIGN §8.3). */
  weight: count,
  /** To the player whose shot sank it (CAMPAIGN §11). */
  sinkPoints: count,
});

const MapSizeSchema = z.strictObject({
  players: z.number().int().min(1).max(CAMPAIGN_MAX_PLAYERS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const CampaignConfigSchema = z
  .strictObject({
    levels: perLevel(LevelSchema),
    difficulties: z.strictObject({
      easier: DifficultySchema,
      normal: DifficultySchema,
      veteran: DifficultySchema,
      harder: DifficultySchema,
    }),
    /** Castles added for every player beyond the first (CAMPAIGN §3.4). */
    castlesPerExtraPlayer: count,
    /** Each kind's pool, scaled for co-op by 1 + this × (players − 1), rounded (CAMPAIGN §8.1). */
    coopPoolFactor: z.number().nonnegative(),
    /** The grunts' allowance, scaled for co-op the same way (CAMPAIGN §6.2). */
    coopGruntFactor: z.number().nonnegative(),
    /** A life back for each level cleared, up to the count the campaign started with (§9). */
    lifePerLevel: z.boolean(),
    map: z.strictObject({
      /** By player count (CAMPAIGN §3.2): the map's size is configured here, not measured. */
      sizes: z.array(MapSizeSchema).length(CAMPAIGN_MAX_PLAYERS),
      /** Open water along every sea edge, for the ships to manoeuvre in. */
      seaMarginTiles: z.number().int().positive(),
      /**
       * The land's share of the map, by shape (CAMPAIGN §3.2: 55–65% for a coast, less where
       * the sea comes from more sides).
       */
      landFraction: z.strictObject(
        Object.fromEntries(MAP_SHAPES.map((s) => [s, z.number().gt(0).lt(1)])) as Record<
          MapShape,
          z.ZodNumber
        >,
      ),
      /**
       * The coastline's noise: how far in or out it moves the shore, in tiles either way, and
       * its frequency. Larger than an island's, whose distances to the sea are a few tiles where
       * a campaign map's run to forty.
       */
      coastNoise: z.strictObject({
        amplitudeTiles: z.number().nonnegative(),
        frequency: z.number().positive(),
      }),
      /** A lake's radius, before the noise roughens its shore. */
      lakeRadiusTiles: z.number().int().positive(),
    }),
    fleet: z.strictObject({
      kinds: z.strictObject({
        raider: ShipKindConfigSchema,
        transport: ShipKindConfigSchema,
        fireship: ShipKindConfigSchema,
      }),
      /** From this level's index on, every ship takes `extraHits` more to sink (CAMPAIGN §5.1). */
      toughFromLevel: z
        .number()
        .int()
        .min(0)
        .max(CAMPAIGN_LEVELS - 1),
      extraHits: count,
      /** Ships afloat at once, for one player, and more for each other (CAMPAIGN §5.2). */
      maxAfloat: z.number().int().positive(),
      maxAfloatPerExtraPlayer: count,
    }),
    threat: z.strictObject({
      /** Each grunt on land adds this to the fleet's threat (CAMPAIGN §8.3)… */
      perGrunt: count,
      /** …and each of the team's cannons takes this off it. */
      perCannon: count,
    }),
    pieces: z.strictObject({
      /** Each level deals pieces from this round of the size schedule on (CAMPAIGN §7.4). */
      levelStartRound: z.number().int().min(1),
      /** Small pieces while a player holds no sealed castle (CAMPAIGN §7.4), held in reserve. */
      repairDeck: z.boolean(),
    }),
    scoring: z.strictObject({
      /** Per hit on a ship (CAMPAIGN §11). */
      hitPoints: count,
      /** Per grunt shot. */
      gruntPoints: count,
    }),
  })
  .refine(
    (c) =>
      [...c.map.sizes.map((s) => s.players)].sort().join() ===
      Array.from({ length: CAMPAIGN_MAX_PLAYERS }, (_, i) => i + 1).join(),
    { message: 'map.sizes needs one size for each player count, 1 to 3', path: ['map', 'sizes'] },
  )
  .refine((c) => c.levels.every((l) => l.castles >= 2), {
    // One to choose and a spare (CAMPAIGN §3.4); every other player adds two.
    message: 'every level needs at least two castles for one player',
    path: ['levels'],
  })
  .refine((c) => c.castlesPerExtraPlayer >= 1, {
    message: 'castlesPerExtraPlayer must give every player a castle of their own',
    path: ['castlesPerExtraPlayer'],
  });
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;
