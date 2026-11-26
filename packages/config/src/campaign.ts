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

/** The four difficulties, easiest first (the user's names, 2026-11-25). */
export const CAMPAIGN_DIFFICULTIES = ['easy', 'normal', 'veteran', 'legend'] as const;
export const CampaignDifficultySchema = z.enum(CAMPAIGN_DIFFICULTIES);
export type CampaignDifficulty = z.infer<typeof CampaignDifficultySchema>;

/** Where a level's sea lies (CAMPAIGN §3.1); `bay` is reserved for later. */
export const MAP_SHAPES = ['coast', 'corner', 'strip', 'island', 'bay'] as const;
export const MapShapeSchema = z.enum(MAP_SHAPES);
export type MapShape = z.infer<typeof MapShapeSchema>;

export const SHIP_KINDS = ['raider', 'transport', 'frostship'] as const;
export const ShipKindSchema = z.enum(SHIP_KINDS);
export type ShipKind = z.infer<typeof ShipKindSchema>;

/** The campaign's six levels: five and the final battle (CAMPAIGN §1). */
export const CAMPAIGN_LEVELS = 6;

/** The most people a campaign takes (CAMPAIGN §0). */
export const CAMPAIGN_MAX_PLAYERS = 3;

const count = z.number().int().nonnegative();

/** A level's ships for one player, raider / transport / frostship (CAMPAIGN §8.1). */
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
  /** Rounds between frost ships added to the pool, per level; null for none (CAMPAIGN §8.2). */
  frostshipEvery: perLevel(z.number().int().positive().nullable()),
  /**
   * Continues in a campaign (CAMPAIGN §9): each plays a lost level again from its start, the
   * team's firepower raised; null for unlimited.
   */
  continues: count.nullable(),
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

/**
 * How the fleet moves (CAMPAIGN §5.2–§5.3), in milliseconds as the ruleset's phases are: the
 * reference's frames at 60 a second, rounded where a tick at 30 would have split them.
 */
export const FleetTimingSchema = z.strictObject({
  /** One ship of each kind still in the wave arrives this often. */
  arrivalMs: z.number().int().positive(),
  /** An arrival steps this many spawn points on at least, and fewer than `spawnStepRange`. */
  spawnStepMin: z.number().int().positive(),
  spawnStepRange: z.number().int().positive(),
  /** A tile's sailing at each speed, slowest first (CAMPAIGN §5.3: 2.1 s down to 0.85 s). */
  tileMs: z.array(z.number().int().positive()).min(1),
  /** A run may last this much beyond the battle's end. */
  runSlackMs: z.number().int().nonnegative(),
});
export type FleetTiming = z.infer<typeof FleetTimingSchema>;

/**
 * How the fleet chooses its targets (CAMPAIGN §5.5): each team wall tile scores `base` by its
 * count of wall neighbours, plus `perGuarded` for each castle or gun beside it, less `perStruck`
 * for each neighbour struck this battle; the tiles aimed at last are skipped.
 */
export const FleetAimSchema = z.strictObject({
  base: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  perGuarded: z.number(),
  perStruck: z.number(),
  skipRecent: z.number().int().nonnegative(),
});
export type FleetAim = z.infer<typeof FleetAimSchema>;

/** How the fleet fires (CAMPAIGN §5.4). */
export const FleetFireSchema = z.strictObject({
  /** A target is handed to one ship this often (the reference's 22 ticks). */
  everyMs: z.number().int().positive(),
  /** A fleet shot's flight against a cannon's over the same distance. */
  flightFactor: z.number().positive(),
});
export type FleetFire = z.infer<typeof FleetFireSchema>;

/**
 * The grunts transports land (CAMPAIGN §6.2–§6.4): how many a round, and how often they come
 * ashore, multiply, step and smash, in milliseconds (the reference's 56, 352, 48 and 208 ticks).
 */
export const GruntTimingSchema = z.strictObject({
  /** A transport beside the shore lands one this often while the allowance lasts. */
  landMs: z.number().int().positive(),
  /** Each grunt on land brings another beside it this often, from the same allowance. */
  breedMs: z.number().int().positive(),
  /** A grunt steps a tile this often, in the build phase. */
  stepMs: z.number().int().positive(),
  /**
   * When in a battle each grunt strikes what it faces, once: a time drawn for it between these,
   * from the battle's start (CAMPAIGN §6.4). One blow a battle, never two.
   */
  smashWindowMs: z
    .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
    .refine(([from, to]) => from <= to, {
      message: 'smashWindowMs runs from its first to its last',
    }),
});
export type GruntTiming = z.infer<typeof GruntTimingSchema>;

const MapSizeSchema = z.strictObject({
  players: z.number().int().min(1).max(CAMPAIGN_MAX_PLAYERS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const CampaignConfigSchema = z
  .strictObject({
    /**
     * Whether the main menu shows the Campaign button (the user's, 2026-11-25): the campaign is
     * early work, so it can be taken out of the menu with one switch, `?campaign=menu` still
     * opening its screen for trying it.
     */
    menuButton: z.boolean(),
    levels: perLevel(LevelSchema),
    difficulties: z.strictObject({
      easy: DifficultySchema,
      normal: DifficultySchema,
      veteran: DifficultySchema,
      legend: DifficultySchema,
    }),
    /** Castles added for every player beyond the first (CAMPAIGN §3.4). */
    castlesPerExtraPlayer: count,
    /** Each kind's pool, scaled for co-op by 1 + this × (players − 1), rounded (CAMPAIGN §8.1). */
    coopPoolFactor: z.number().nonnegative(),
    /** The grunts' allowance, scaled for co-op the same way (CAMPAIGN §6.2). */
    coopGruntFactor: z.number().nonnegative(),
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
      /**
       * A ship never arrives this close to land: where a sea band met a land edge of the map, a
       * spawn point stood beside the shore, and a transport arriving there in a build phase
       * landed its grunts at once (the user's playtest, 2026-11-25).
       */
      spawnClearanceTiles: z.number().int().nonnegative(),
      /** A lake's radius, before the noise roughens its shore. */
      lakeRadiusTiles: z.number().int().positive(),
    }),
    fleet: z.strictObject({
      kinds: z.strictObject({
        raider: ShipKindConfigSchema,
        transport: ShipKindConfigSchema,
        frostship: ShipKindConfigSchema,
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
      timing: FleetTimingSchema,
      aim: FleetAimSchema,
      fire: FleetFireSchema,
    }),
    grunts: z.strictObject({
      /** Grunts a round may land, by rounds played in the campaign, the last for every later. */
      allowance: z.array(count).min(1),
      timing: GruntTimingSchema,
    }),
    /**
     * The ice a frost ship's shot leaves (CAMPAIGN §7, frost ships the user's reading of the
     * fireships, 2026-11-25): the build phases it lasts, `early` in the campaign's first rounds,
     * `late` from round `lateFromRound` on.
     */
    ice: z.strictObject({
      early: z.number().int().positive(),
      late: z.number().int().positive(),
      lateFromRound: count,
    }),
    threat: z.strictObject({
      /** Each grunt on land adds this to the fleet's threat (CAMPAIGN §8.3)… */
      perGrunt: count,
      /** …and each of the team's cannons takes this off it. */
      perCannon: count,
    }),
    /**
     * The team's firepower (CAMPAIGN §9): raised by one with every continue, up to `max`, and kept
     * from level to level, though a level cleared leaves at most `keptAfterLevel` of it. Each step
     * of it, from 0, by its index: how much faster the team's shots fly, and how many hits more a
     * ship takes from the first shot that strikes it. A level played again after a continue opens
     * with `continueCannons` cannons more for every player.
     */
    firepower: z
      .strictObject({
        max: z.number().int().nonnegative(),
        keptAfterLevel: count,
        shotSpeed: z.array(z.number().min(1)).min(1),
        firstHitExtra: z.array(count).min(1),
        continueCannons: count,
      })
      .refine((f) => f.shotSpeed.length === f.max + 1 && f.firstHitExtra.length === f.max + 1, {
        message: 'firepower needs a shotSpeed and a firstHitExtra for every step, 0 to max',
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
