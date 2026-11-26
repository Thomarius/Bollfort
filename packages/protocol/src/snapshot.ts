import {
  RulesetSchema,
  SHIP_KINDS,
  SPECIAL_KINDS,
  TerrainConfigSchema,
  TowerVariantSchema,
} from '@bollfort/config';
import { PHASES, copyCampaign, type CampaignState, type MatchState } from '@bollfort/sim';
import { z } from 'zod';

/**
 * Run-length encoding for the grid layers.
 *
 * A snapshot's dynamic layers are mostly long runs of nothing, so this is both far
 * smaller than the raw array and trivially cheap. Terrain and island membership are
 * never sent at all: they are regenerated from the seed, which the determinism work
 * makes safe.
 */
export function encodeRle(data: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const value = data[i] as number;
    let run = 1;
    while (i + run < data.length && data[i + run] === value) run++;
    out.push(value, run);
    i += run;
  }
  return out;
}

export function decodeRle(rle: readonly number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const value = rle[i] as number;
    const run = rle[i + 1] as number;
    for (let k = 0; k < run && at < length; k++) out[at++] = value;
  }
  return out;
}

const PlayerSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  islandId: z.number().int().positive(),
  name: z.string(),
  isBot: z.boolean(),
  eliminated: z.boolean(),
  eliminatedRound: z.number().int().nullable(),
  startingCastleId: z.number().int().nullable(),
  enclosedCastles: z.number().int().nonnegative(),
  cannonsToPlace: z.number().int().nonnegative(),
  pieceIndex: z.number().int().nonnegative(),
  team: z.number().int().nonnegative(),
  pieceRound: z.number().int().nonnegative(),
  overtimeSpent: z.boolean(),
  score: z.number().int().nonnegative(),
  wallsDestroyed: z.number().int().nonnegative(),
  special: TowerVariantSchema.nullable(),
  specialsBought: z.number().int().nonnegative(),
  openingPlacement: z.boolean(),
  /** The tile of the player's last shot, which aims their Drone Towers; absent until there is one. */
  droneAnchor: z.number().int().nonnegative().optional(),
});

const CannonKindSchema = z.enum(['cannon', ...SPECIAL_KINDS]);

const CastleSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  islandId: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  enclosed: z.boolean(),
});

const CannonSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  owner: z.number().int().nonnegative(),
  kind: CannonKindSchema,
  cost: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  active: z.boolean(),
  shotIds: z.array(z.number().int().nonnegative()),
  /** Asleep until this tick, a Lullaby Tower's doing; absent while awake. */
  asleepUntil: z.number().int().optional(),
  /** Lullabies taken towards its sleep; absent at none. */
  lulled: z.number().int().positive().optional(),
  /** A Fortified Tower's barrels where its variant sets them; absent otherwise. */
  barrels: z.number().int().positive().optional(),
});

const WaveSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  cannonId: z.number().int().nonnegative(),
  owner: z.number().int().nonnegative(),
  cost: z.number().int().positive(),
  lanes: z.array(
    z.strictObject({
      ax: z.number().int(),
      ay: z.number().int(),
      dx: z.number().int(),
      dy: z.number().int(),
      done: z.boolean(),
    }),
  ),
  launchTick: z.number().int(),
  /** The Fortified Towers that took a lane of it, by gun id; absent at none. */
  absorbed: z.array(z.number().int().nonnegative()).optional(),
});

const ShotSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  cannonId: z.number().int().nonnegative(),
  owner: z.number().int().nonnegative(),
  kind: CannonKindSchema,
  cost: z.number().int().positive(),
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number().int(),
  toY: z.number().int(),
  launchTick: z.number().int(),
  impactTick: z.number().int(),
});

/**
 * Everything a client needs to reconstruct the match exactly.
 *
 * The ruleset travels with it, so a client can never be running different rules from
 * the server — a mismatch would desync the simulation rather than merely look wrong.
 */
const int = z.number().int();
const counts = z.tuple([int.nonnegative(), int.nonnegative(), int.nonnegative()]);

/**
 * A campaign level's fleet and counters (docs/CAMPAIGN.md §13, protocol 39): everything of
 * `state.campaign` a match changes as it steps. The open sea and the spawn points come from the
 * terrain, which the page draws from the seed itself.
 */
const CampaignSnapshotSchema = z.strictObject({
  pool: counts,
  wave: counts,
  ships: z.array(
    z.strictObject({
      id: int.nonnegative(),
      kind: z.enum(SHIP_KINDS),
      x: int,
      y: int,
      hits: int.nonnegative(),
      heading: int,
      run: z
        .strictObject({
          dx: int,
          dy: int,
          tiles: int.nonnegative(),
          startTick: int,
          ticksPerTile: int.positive(),
        })
        .nullable(),
      runs: int.nonnegative(),
      arrivedTick: int,
      shotId: int.nonnegative().nullable(),
      nextLandTick: int,
    }),
  ),
  nextShipId: int.nonnegative(),
  spawnCursor: int.nonnegative(),
  nextArrivalTick: int,
  cannonsGiven: int.nonnegative(),
  shots: z.array(
    z.strictObject({
      id: int.nonnegative(),
      shipId: int.nonnegative(),
      kind: z.enum(SHIP_KINDS),
      fromX: int,
      fromY: int,
      toX: int,
      toY: int,
      launchTick: int,
      impactTick: int,
    }),
  ),
  nextShotId: int.nonnegative(),
  nextFireTick: int,
  fireCursor: int,
  aimed: z.array(int.nonnegative()),
  struck: z.array(int.nonnegative()),
  grunts: z.array(
    z.strictObject({
      id: int.nonnegative(),
      x: int,
      y: int,
      facing: int.min(0).max(3),
      nextStepTick: int,
      nextActTick: int,
      nextBreedTick: int,
    }),
  ),
  nextGruntId: int.nonnegative(),
  gruntsLeft: int.nonnegative(),
  frostshipCountdown: int.nullable(),
  castlesTaken: int.nonnegative(),
  wonInBattle: z.boolean(),
  sunk: counts,
  gruntsKilled: int.nonnegative(),
});

export const SnapshotSchema = z
  .strictObject({
    seed: z.number().int(),
    ruleset: RulesetSchema,
    terrain: TerrainConfigSchema,
    tick: z.number().int().nonnegative(),
    round: z.number().int().nonnegative(),
    phase: z.enum(PHASES),
    pendingPhase: z.enum(PHASES).nullable(),
    phaseEndTick: z.number().int(),
    overtime: z.boolean(),
    /** One and up in a campaign, whose ruleset says so; checked against it below. */
    players: z.array(PlayerSchema).min(1),
    teams: z.array(
      z.strictObject({
        id: z.number().int().nonnegative(),
        continuesRemaining: z.number().int().nonnegative(),
        continuesAtStart: z.number().int().nonnegative(),
      }),
    ),
    /** The teams' names where the table gave them (a tournament's), or null for letters. */
    teamNames: z.array(z.string().max(32)).nullable(),
    structure: z.array(z.number().int().nonnegative()),
    owner: z.array(z.number().int().nonnegative()),
    territory: z.array(z.number().int().nonnegative()),
    castles: z.array(CastleSchema),
    cannons: z.array(CannonSchema),
    shots: z.array(ShotSchema),
    lostWalls: z.array(z.number().int().nonnegative()),
    /** The Frost Cannons' freezes; absent from a snapshot of a match without them. */
    frozen: z
      .array(
        z.strictObject({
          tile: z.number().int().nonnegative(),
          share: z.number().positive().max(1),
          throughOvertime: z.boolean(),
          thawTick: z.number().int(),
          /** A campaign's frost ship's ice: the build phases it has left. */
          buildsLeft: z.number().int().nonnegative().optional(),
        }),
      )
      .optional(),
    /** The Subwoofers' waves in flight; absent from a snapshot of a match without any. */
    waves: z.array(WaveSchema).optional(),
    nextCannonId: z.number().int().nonnegative(),
    nextShotId: z.number().int().nonnegative(),
    winners: z.array(z.number().int().nonnegative()),
    draw: z.boolean(),
    endedBy: z.enum(['elimination', 'round_cap', 'level_cleared', 'level_lost']).nullable(),
    /** A campaign level's fleet; absent from versus play's snapshots. */
    campaign: CampaignSnapshotSchema.optional(),
  })
  .refine((s) => s.players.length >= s.ruleset.players.min, {
    message: 'fewer players than the ruleset allows',
    path: ['players'],
  });

export type Snapshot = z.infer<typeof SnapshotSchema>;

export function captureSnapshot(state: MatchState): Snapshot {
  return {
    seed: state.seed,
    ruleset: state.ruleset,
    terrain: state.terrainConfig,
    tick: state.tick,
    round: state.round,
    phase: state.phase,
    pendingPhase: state.pendingPhase,
    phaseEndTick: state.phaseEndTick,
    overtime: state.overtime,
    players: state.players.map((p) => ({ ...p })),
    teams: state.teams.map((t) => ({ ...t })),
    teamNames: state.teamNames === null ? null : [...state.teamNames],
    structure: encodeRle(state.structure),
    owner: encodeRle(state.owner),
    territory: encodeRle(state.territory),
    castles: state.castles.map((c) => ({ ...c })),
    cannons: state.cannons.map((c) => ({ ...c })),
    shots: state.shots.map((s) => ({ ...s })),
    lostWalls: [...state.lostWalls],
    ...(state.frozen.length > 0 ? { frozen: state.frozen.map((f) => ({ ...f })) } : {}),
    ...(state.waves.length > 0
      ? {
          waves: state.waves.map((w) => ({
            ...w,
            lanes: w.lanes.map((l) => ({ ...l })),
            ...(w.absorbed === undefined ? {} : { absorbed: [...w.absorbed] }),
          })),
        }
      : {}),
    nextCannonId: state.nextCannonId,
    nextShotId: state.nextShotId,
    winners: [...state.winners],
    draw: state.draw,
    endedBy: state.endedBy,
    ...(state.campaign === null ? {} : { campaign: campaignSnapshot(state.campaign) }),
  };
}

/** The part of a campaign's state the snapshot carries: `copyCampaign`, less the terrain's. */
function campaignSnapshot(campaign: CampaignState): z.infer<typeof CampaignSnapshotSchema> {
  const { sea: _sea, spawnPoints: _spawnPoints, ...changing } = copyCampaign(campaign);
  return changing;
}

/**
 * Overwrites a freshly created match with a snapshot.
 *
 * The caller builds the base state with `createMatch` using the snapshot's seed and
 * ruleset, which regenerates the terrain and the piece sequence; only what cannot be
 * derived is carried over the wire.
 */
export function applySnapshot(state: MatchState, snapshot: Snapshot): void {
  const size = state.width * state.height;
  state.tick = snapshot.tick;
  state.round = snapshot.round;
  state.phase = snapshot.phase;
  state.pendingPhase = snapshot.pendingPhase;
  state.phaseEndTick = snapshot.phaseEndTick;
  state.overtime = snapshot.overtime;
  // A player with no anchor carries no `droneAnchor` at all, as the match makes it.
  state.players = snapshot.players.map(({ droneAnchor, ...p }) => ({
    ...p,
    ...(droneAnchor === undefined ? {} : { droneAnchor }),
  }));
  state.teams = snapshot.teams.map((t) => ({ ...t }));
  state.teamNames = snapshot.teamNames === null ? null : [...snapshot.teamNames];
  state.structure = decodeRle(snapshot.structure, size);
  state.owner = decodeRle(snapshot.owner, size);
  state.territory = decodeRle(snapshot.territory, size);
  state.castles = snapshot.castles.map((c) => ({ ...c }));
  // A gun awake carries no `asleepUntil` at all, as the match makes it.
  state.cannons = snapshot.cannons.map(({ asleepUntil, lulled, barrels, ...c }) => ({
    ...c,
    ...(asleepUntil === undefined ? {} : { asleepUntil }),
    ...(lulled === undefined ? {} : { lulled }),
    ...(barrels === undefined ? {} : { barrels }),
  }));
  state.shots = snapshot.shots.map((s) => ({ ...s }));
  state.lostWalls = [...snapshot.lostWalls];
  // Ice without builds left carries no `buildsLeft` at all, as the match makes it (it is hashed
  // only when present).
  state.frozen = (snapshot.frozen ?? []).map(({ buildsLeft, ...f }) => ({
    ...f,
    ...(buildsLeft === undefined ? {} : { buildsLeft }),
  }));
  state.waves = (snapshot.waves ?? []).map(({ absorbed, ...w }) => ({
    ...w,
    lanes: w.lanes.map((l) => ({ ...l })),
    ...(absorbed === undefined ? {} : { absorbed: [...absorbed] }),
  }));
  state.nextCannonId = snapshot.nextCannonId;
  state.nextShotId = snapshot.nextShotId;
  state.winners = [...snapshot.winners];
  state.draw = snapshot.draw;
  state.endedBy = snapshot.endedBy;
  // The fleet over the one `createMatch` made, which keeps the terrain's sea and spawn points.
  if (snapshot.campaign !== undefined && state.campaign !== null) {
    state.campaign = copyCampaign({
      ...snapshot.campaign,
      sea: state.campaign.sea,
      spawnPoints: state.campaign.spawnPoints,
    });
  }
  state.events = [];
}
