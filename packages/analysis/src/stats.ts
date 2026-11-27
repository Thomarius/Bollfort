import {
  personalityWords,
  skillAt,
  BALANCED,
  type BotSetup,
  type ConfigBundle,
} from '@bollfort/config';
import { cannonRoom, cheapestPlanFor, coverable, pocketCount } from '@bollfort/ai';
import { SHIP_KINDS, type CampaignDifficulty, type ShipKind } from '@bollfort/config';
import {
  Structure,
  Terrain,
  fleetBeaten,
  fleetGone,
  isFrozen,
  threat,
  type MatchEvent,
  type MatchState,
  type RoundResult,
} from '@bollfort/sim';

/** Who played a seat: a bot's level and personality, or a person, from a recording. */
export type Tier = BotSetup | 'human';

/**
 * How a table names who played a row: `human`, or the level — `L5` — with the
 * personality after it when it is not balanced, so a soak's summary groups like with like.
 */
export function rowLabel(row: Pick<StatRow, 'level' | 'personality'>): string {
  if (row.level === null) return 'human';
  const balanced = personalityWords(BALANCED);
  return row.personality === '' || row.personality === balanced
    ? `L${row.level}`
    : `L${row.level} ${row.personality}`;
}

// ------------------------------------------------------------------------- stats

/**
 * One row per player per round, sampled at the resolution that ends a build phase.
 *
 * That moment and no other: `enclosedCastles` is live during a build phase, so it is
 * legitimately zero mid-repair, and the sweep runs inside the same step — so the
 * cannon and wall counts here are what the next barrage will actually meet.
 */
export interface StatRow extends CampaignColumns {
  /** Which match: `sim-<seed>` for a bot soak, the recording's id for a replay. */
  match: string;
  seed: number;
  round: number;
  player: number;
  /** A bot's skill level, or null for a person. */
  level: number | null;
  /** A bot's personality in words (`personalityWords`), or empty for a person. */
  personality: string;
  /** The special tower the player brought (docs/SPECIAL_TOWERS.md), or empty for none. */
  special: string;
  enclosedCastles: number;
  cannonsAwarded: number;
  eliminated: boolean;
  cannonsOwned: number;
  cannonsActive: number;
  cannonRoom: number;
  /** Pockets held — sealed ground with no castle (§1.3) — after the sweep. */
  pockets: number;
  wallTiles: number;
  piecesPlaced: number;
  /** Null for a person, who has no pace to price a phase with. */
  piecesBudget: number | null;
  shotsFired: number;
  territoryPoints: number;
  /** For the guns firing at the resolution (`scoring.gunPoints`); 0 under the old rule. */
  gunPoints: number;
  damagePoints: number;
  /** Banked total after this round. */
  score: number;
  /**
   * Cells the tightest possible seal needed as the build phase opened, and how many it
   * still needed on the phase's last tick. Together they say why a round failed:
   * a repair larger than the phase could ever build, or one that fit and was missed.
   */
  repairAtBuild: number;
  repairLeft: number;
  /**
   * Of the cells still missing on the last tick, how many no piece in this player's bag
   * could cover at all — holes the round's pieces are too big for.
   */
  repairStuck: number;
  /** Special towers standing on the island after the resolution, among `cannonsOwned`. */
  towersOwned: number;
  /** Wall its Architects rebuilt as this round's barrage ended. */
  wallsRepaired: number;
  /** Tiles of its island a Frost Cannon had frozen as the build phase opened. */
  frozenAtBuild: number;
  /**
   * Of the cells the tightest seal still missed on the last tick, how many were frozen: a
   * round a freeze may have cost, the Frost Cannon's risk (docs/SPECIAL_TOWERS.md §2.7).
   */
  repairFrozen: number;
  /** Seconds of sleep its Lullaby Towers' shots put on rivals' guns this round. */
  sleepDealt: number;
}

/** How a campaign level ended, on its last row; empty on every other row and in versus play. */
export type LevelEnd = '' | 'threat' | 'round_limit' | 'lost';

/**
 * A campaign level's columns (docs/CAMPAIGN.md CA12), zero or empty in versus play. Those named
 * `team…` are the fleet's against the whole team, the same on every player's row of a round: a
 * campaign's players share one island, so its walls, frost and grunts are nobody's alone (and
 * `wallTiles`, `frozenAtBuild` and the repair columns are the team's too). The rest are the
 * player's own. A player's castles held are `enclosedCastles`, as `castleHolders` dealt them.
 *
 * A level won in a battle, or by its round limit, ends without a resolution: its last battle is a
 * row of its own, sampled as the level ends, with no ground, guns nor castles' reward banked.
 */
export interface CampaignColumns {
  difficulty: CampaignDifficulty | '';
  /** 1 to 6, the level's number; 0 in versus play. */
  campaignLevel: number;
  /** Which try at the level this is, from 1; 0 where nothing says (a recording without it). */
  attempt: number;
  firepower: number;
  levelEnd: LevelEnd;
  /** The fleet's threat after the resolution (CAMPAIGN §8.3), the level won below its threshold. */
  teamThreat: number;
  teamRaidersArrived: number;
  teamTransportsArrived: number;
  teamFrostshipsArrived: number;
  /** Ships that stood at the coast and went, to come again (§5.3). */
  teamShipsRecycled: number;
  teamRaidersAfloat: number;
  teamTransportsAfloat: number;
  teamFrostshipsAfloat: number;
  teamFleetShots: number;
  /** Walls the fleet's shots cleared. */
  teamWallsShot: number;
  teamGruntsLanded: number;
  teamGruntsAlive: number;
  teamWallsSmashed: number;
  teamCastlesTaken: number;
  /** Tiles a frost ship's shots froze. */
  teamIceLaid: number;
  /** The player's shots aimed at the sea: at ships, hit or not. */
  shotsAtSea: number;
  shipHits: number;
  raidersSunk: number;
  transportsSunk: number;
  frostshipsSunk: number;
  gruntsShot: number;
  /** Grunts walled in by a piece the player laid. */
  gruntsWalled: number;
  /** For hits on ships and sinking them, the difficulty's factor in it. */
  shipPoints: number;
  gruntKillPoints: number;
}

/** A versus match's campaign columns. */
export const NO_CAMPAIGN: Readonly<CampaignColumns> = {
  difficulty: '',
  campaignLevel: 0,
  attempt: 0,
  firepower: 0,
  levelEnd: '',
  teamThreat: 0,
  teamRaidersArrived: 0,
  teamTransportsArrived: 0,
  teamFrostshipsArrived: 0,
  teamShipsRecycled: 0,
  teamRaidersAfloat: 0,
  teamTransportsAfloat: 0,
  teamFrostshipsAfloat: 0,
  teamFleetShots: 0,
  teamWallsShot: 0,
  teamGruntsLanded: 0,
  teamGruntsAlive: 0,
  teamWallsSmashed: 0,
  teamCastlesTaken: 0,
  teamIceLaid: 0,
  shotsAtSea: 0,
  shipHits: 0,
  raidersSunk: 0,
  transportsSunk: 0,
  frostshipsSunk: 0,
  gruntsShot: 0,
  gruntsWalled: 0,
  shipPoints: 0,
  gruntKillPoints: 0,
};

/** Columns written as text, never as numbers. */
const TEXT_COLUMNS: ReadonlySet<string> = new Set([
  'match',
  'personality',
  'special',
  'difficulty',
  'levelEnd',
]);

/** One more of a kind, in a count by kind in `SHIP_KINDS` order. */
function bump(counts: number[], kind: ShipKind): void {
  const k = SHIP_KINDS.indexOf(kind);
  counts[k] = (counts[k] ?? 0) + 1;
}

const STAT_COLUMNS: (keyof StatRow)[] = [
  'match',
  'seed',
  'round',
  'player',
  'level',
  'personality',
  'enclosedCastles',
  'cannonsAwarded',
  'eliminated',
  'cannonsOwned',
  'cannonsActive',
  'cannonRoom',
  'pockets',
  'wallTiles',
  'piecesPlaced',
  'piecesBudget',
  'shotsFired',
  'territoryPoints',
  'gunPoints',
  'damagePoints',
  'score',
  'repairAtBuild',
  'repairLeft',
  'repairStuck',
  'special',
  'towersOwned',
  'wallsRepaired',
  'frozenAtBuild',
  'repairFrozen',
  'sleepDealt',
  ...(Object.keys(NO_CAMPAIGN) as (keyof CampaignColumns)[]),
];

/**
 * Pieces this tier could lay in a whole build phase.
 *
 * The same arithmetic the bot itself prices a plan with — base plus per-cell over an
 * average piece of 3.5 cells — so `piecesPlaced / piecesBudget` reads directly as how
 * much of the phase a bot actually used. A bot that seals early and then stands idle
 * shows up here as a ratio well under one, with nothing else needing to be measured.
 */
export function piecesBudget(bundle: ConfigBundle, tier: Tier): number | null {
  // A person has no pace to price a phase with; their pieces are counted, not rated. A
  // zero here once read in the table as "used none of it".
  if (tier === 'human') return null;
  const profile = skillAt(bundle.ai, tier.level);
  const perPiece = profile.placementBaseMs + profile.placementPerCellMs * 3.5;
  return bundle.ruleset.phases.buildMs / perPiece;
}

function wallTilesOf(state: MatchState, playerId: number): number {
  const islandId = state.players[playerId]?.islandId;
  let tiles = 0;
  for (let i = 0; i < state.structure.length; i++) {
    if (state.structure[i] === Structure.Wall && state.islandId[i] === islandId) tiles++;
  }
  return tiles;
}

/** The rows as CSV, a header line first — for a file, wherever the caller keeps it. */
export function statsCsv(rows: readonly StatRow[]): string {
  const lines = [STAT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      STAT_COLUMNS.map((column) => {
        const value = row[column];
        if (value === null) return '';
        return typeof value === 'number' ? Number(value.toFixed(2)) : String(value);
      }).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * A table `statsCsv` wrote, read back — a soak's or a recording's alike. Columns are found
 * by name, so a file from before a column was added still reads, the new one at its
 * zero; an empty level is a person's.
 */
export function parseStatsCsv(text: string): StatRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = (header ?? '').split(',');
  if (!names.includes('match') || !names.includes('score')) throw new Error('not a stats table');
  return lines.map((line) => {
    const cells = line.split(',');
    const raw = (column: keyof StatRow): string => cells[names.indexOf(column)] ?? '';
    const num = (column: keyof StatRow): number => Number(raw(column) || 0);
    const row = {} as Record<keyof StatRow, unknown>;
    for (const column of STAT_COLUMNS) {
      row[column] = TEXT_COLUMNS.has(column) ? raw(column) : num(column);
    }
    row.eliminated = raw('eliminated') === 'true';
    row.level = raw('level') === '' ? null : num('level');
    row.piecesBudget = raw('piecesBudget') === '' ? null : num('piecesBudget');
    return row as unknown as StatRow;
  });
}

/**
 * Gathers the rows for one match as it is stepped — bots in a soak, or a recording being
 * replayed — so people and bots are measured by exactly the same code.
 *
 * Call `observe` after every step with the events that step produced.
 */
export class RoundStats {
  readonly rows: StatRow[] = [];
  // Reset at every resolution, so a row counts only its own round's work.
  private readonly placed = new Map<number, number>();
  private readonly fired = new Map<number, number>();
  private readonly repaired = new Map<number, number>();
  private readonly repairAtBuild = new Map<number, number>();
  private readonly repairLeft = new Map<number, number>();
  private readonly repairStuck = new Map<number, number>();
  private readonly frozenAtBuild = new Map<number, number>();
  private readonly repairFrozen = new Map<number, number>();
  private readonly sleepDealt = new Map<number, number>();
  /** A campaign's counts since the last row, the team's and each player's. */
  private team = teamCounts();
  private readonly own = new Map<number, PlayerCounts>();

  /**
   * `attempt` is which try at a campaign level this is, where the caller knows it (the
   * recording's header, the harness's run); 0 where nothing says.
   */
  constructor(
    private readonly bundle: ConfigBundle,
    private readonly match: string,
    private readonly seed: number,
    private readonly tierOf: (player: number) => Tier,
    private readonly attempt = 0,
  ) {}

  observe(state: MatchState, events: readonly MatchEvent[]): void {
    /**
     * The tightest wall that would seal a castle, in cells still to fill — zero for a
     * wall that stands. Asked of the min cut rather than of `enclosedCastles`, which is
     * not recomputed when shots land and so still says "sealed" as a breached phase
     * opens.
     */
    const tightestRepair = (id: number): number =>
      cheapestPlanFor(state, id, 1, 1)?.cost ?? Number.POSITIVE_INFINITY;

    // Measured once as the phase opens and once on its last tick, which is the last
    // moment before the resolution wipes a failed island.
    if (state.phase === 'build' && state.tick === state.phaseEndTick - 1) {
      for (const p of state.players) {
        if (p.eliminated) continue;
        const plan = cheapestPlanFor(state, p.id, 1, 1);
        this.repairLeft.set(p.id, plan?.cost ?? Number.POSITIVE_INFINITY);
        const missing = plan?.tiles.filter((i) => state.structure[i] === Structure.Empty) ?? [];
        this.repairStuck.set(p.id, missing.filter((i) => !coverable(state, p.id, i)).length);
        this.repairFrozen.set(p.id, missing.filter((i) => isFrozen(state, i)).length);
      }
    }

    // Where this step's resolution put its rows, if it had one: a level lost there ends on them.
    let resolvedFrom: number | null = null;
    for (const event of events) {
      if (event.kind === 'phase_changed' && event.phase === 'build') {
        for (const p of state.players) {
          if (p.eliminated) continue;
          this.repairAtBuild.set(p.id, tightestRepair(p.id));
          const frozen = state.frozen.filter((f) => state.islandId[f.tile] === p.islandId);
          this.frozenAtBuild.set(p.id, frozen.length);
        }
      } else if (event.kind === 'piece_placed') {
        this.placed.set(event.player, (this.placed.get(event.player) ?? 0) + 1);
      } else if (event.kind === 'shot_fired') {
        this.fired.set(event.shot.owner, (this.fired.get(event.shot.owner) ?? 0) + 1);
        const at = event.shot.toY * state.width + event.shot.toX;
        if (state.campaign !== null && state.terrain[at] === Terrain.Water) {
          this.ownOf(event.shot.owner).shotsAtSea++;
        }
      } else if (event.kind === 'gun_slept') {
        this.sleepDealt.set(event.owner, (this.sleepDealt.get(event.owner) ?? 0) + event.ms / 1000);
      } else if (event.kind === 'walls_repaired') {
        this.repaired.set(
          event.player,
          (this.repaired.get(event.player) ?? 0) + event.tiles.length,
        );
      } else if (event.kind === 'round_resolved') {
        resolvedFrom = this.rows.length;
        // Sampled after the step that produced the event, so the sweep has already
        // run and these are the walls and guns the next barrage will meet.
        for (const result of event.results) {
          this.rows.push(this.rowOf(state, event.round, result, result.player));
        }
        this.reset();
      } else if (event.kind === 'game_over') {
        if (state.campaign !== null) this.endLevel(state, event.endedBy, resolvedFrom);
      } else if (state.campaign !== null) {
        this.countFleet(state, event);
      }
    }
  }

  /** A campaign's events, counted for the next row. */
  private countFleet(state: MatchState, event: MatchEvent): void {
    const team = this.team;
    switch (event.kind) {
      case 'ship_arrived':
        bump(team.arrived, event.ship.kind);
        return;
      case 'ship_recycled':
        team.recycled++;
        return;
      case 'fleet_fired':
        team.fleetShots++;
        return;
      case 'fleet_landed':
        if (event.destroyed !== null) team.wallsShot++;
        return;
      case 'grunt_landed':
        team.gruntsLanded++;
        return;
      case 'wall_smashed':
        team.wallsSmashed++;
        return;
      case 'castle_taken':
        team.castlesTaken++;
        return;
      case 'tile_frozen':
        if (event.owner === -1) team.iceLaid++;
        return;
      case 'ship_hit': {
        const own = this.ownOf(event.player);
        own.shipHits++;
        // A hit that sinks is paid with the sinking, whose event carries both (`hitShips`); one
        // that does not, as `hitShips` awards it: the difficulty's factor applied, rounded.
        const scoring = state.ruleset.campaign?.scoring;
        if (!event.sunk && scoring !== undefined) {
          own.shipPoints += Math.round(scoring.hitPoints * scoring.multiplier);
        }
        return;
      }
      case 'ship_sunk': {
        const own = this.ownOf(event.player);
        bump(own.sunk, event.ship.kind);
        own.shipPoints += event.points;
        return;
      }
      case 'grunt_killed': {
        if (event.player < 0) return;
        const own = this.ownOf(event.player);
        if (event.how === 'shot') own.gruntsShot++;
        else own.gruntsWalled++;
        own.gruntKillPoints += event.points;
        return;
      }
      default:
        return;
    }
  }

  private ownOf(player: number): PlayerCounts {
    let own = this.own.get(player);
    if (own === undefined) this.own.set(player, (own = playerCounts()));
    return own;
  }

  /**
   * A campaign level's end: marked on the rows of the resolution that ended it, if one did (a
   * loss), or on rows of their own for the battle that won it, which no resolution follows.
   */
  private endLevel(state: MatchState, endedBy: string, resolvedFrom: number | null): void {
    const end: LevelEnd =
      endedBy === 'level_lost'
        ? 'lost'
        : fleetBeaten(state) || fleetGone(state)
          ? 'threat'
          : 'round_limit';
    let from = resolvedFrom;
    if (from === null) {
      from = this.rows.length;
      for (const p of state.players) this.rows.push(this.rowOf(state, state.round, null, p.id));
      this.reset();
    }
    for (let i = from; i < this.rows.length; i++) (this.rows[i] as StatRow).levelEnd = end;
  }

  /**
   * A player's row: at a resolution, from its result; at a level's end in a battle, from the
   * board as it stands, nothing banked.
   */
  private rowOf(state: MatchState, round: number, result: RoundResult | null, id: number): StatRow {
    let owned = 0;
    let active = 0;
    let towers = 0;
    for (const cannon of state.cannons) {
      if (cannon.owner !== id) continue;
      owned++;
      if (cannon.active) active++;
      if (cannon.kind !== 'cannon') towers++;
    }
    const tier = this.tierOf(id);
    const player = state.players[id];
    return {
      match: this.match,
      seed: this.seed,
      round,
      player: id,
      level: tier === 'human' ? null : tier.level,
      personality: tier === 'human' ? '' : personalityWords(tier.personality),
      enclosedCastles: result?.enclosedCastles ?? player?.enclosedCastles ?? 0,
      cannonsAwarded: result?.cannonsAwarded ?? 0,
      eliminated: result?.eliminated ?? player?.eliminated ?? false,
      cannonsOwned: owned,
      cannonsActive: active,
      cannonRoom: cannonRoom(state, id),
      pockets: pocketCount(state, id),
      wallTiles: wallTilesOf(state, id),
      piecesPlaced: this.placed.get(id) ?? 0,
      piecesBudget: piecesBudget(this.bundle, tier),
      shotsFired: this.fired.get(id) ?? 0,
      territoryPoints: result?.territoryPoints ?? 0,
      gunPoints: result?.gunPoints ?? 0,
      damagePoints: result?.damagePoints ?? 0,
      score: player?.score ?? 0,
      repairAtBuild: this.repairAtBuild.get(id) ?? 0,
      repairLeft: this.repairLeft.get(id) ?? 0,
      repairStuck: this.repairStuck.get(id) ?? 0,
      special: player?.special ?? '',
      towersOwned: towers,
      wallsRepaired: this.repaired.get(id) ?? 0,
      frozenAtBuild: this.frozenAtBuild.get(id) ?? 0,
      repairFrozen: this.repairFrozen.get(id) ?? 0,
      sleepDealt: this.sleepDealt.get(id) ?? 0,
      ...this.campaignOf(state, id),
    };
  }

  private campaignOf(state: MatchState, id: number): CampaignColumns {
    const rules = state.ruleset.campaign;
    const fleet = state.campaign;
    if (rules === undefined || fleet === null) return { ...NO_CAMPAIGN };
    const team = this.team;
    const own = this.own.get(id) ?? playerCounts();
    const afloat = (kind: ShipKind): number => fleet.ships.filter((s) => s.kind === kind).length;
    return {
      difficulty: rules.difficulty,
      campaignLevel: rules.level + 1,
      attempt: this.attempt,
      firepower: rules.firepower.level,
      levelEnd: '',
      teamThreat: threat(state),
      teamRaidersArrived: team.arrived[0] as number,
      teamTransportsArrived: team.arrived[1] as number,
      teamFrostshipsArrived: team.arrived[2] as number,
      teamShipsRecycled: team.recycled,
      teamRaidersAfloat: afloat('raider'),
      teamTransportsAfloat: afloat('transport'),
      teamFrostshipsAfloat: afloat('frostship'),
      teamFleetShots: team.fleetShots,
      teamWallsShot: team.wallsShot,
      teamGruntsLanded: team.gruntsLanded,
      teamGruntsAlive: fleet.grunts.length,
      teamWallsSmashed: team.wallsSmashed,
      teamCastlesTaken: team.castlesTaken,
      teamIceLaid: team.iceLaid,
      shotsAtSea: own.shotsAtSea,
      shipHits: own.shipHits,
      raidersSunk: own.sunk[0] as number,
      transportsSunk: own.sunk[1] as number,
      frostshipsSunk: own.sunk[2] as number,
      gruntsShot: own.gruntsShot,
      gruntsWalled: own.gruntsWalled,
      shipPoints: own.shipPoints,
      gruntKillPoints: own.gruntKillPoints,
    };
  }

  private reset(): void {
    this.placed.clear();
    this.fired.clear();
    this.repaired.clear();
    this.repairAtBuild.clear();
    this.repairLeft.clear();
    this.repairStuck.clear();
    this.frozenAtBuild.clear();
    this.repairFrozen.clear();
    this.sleepDealt.clear();
    this.team = teamCounts();
    this.own.clear();
  }
}

/** The fleet's doings against the team since the last row. */
interface TeamCounts {
  /** By kind, in `SHIP_KINDS` order. */
  arrived: number[];
  recycled: number;
  fleetShots: number;
  wallsShot: number;
  gruntsLanded: number;
  wallsSmashed: number;
  castlesTaken: number;
  iceLaid: number;
}

const teamCounts = (): TeamCounts => ({
  arrived: [0, 0, 0],
  recycled: 0,
  fleetShots: 0,
  wallsShot: 0,
  gruntsLanded: 0,
  wallsSmashed: 0,
  castlesTaken: 0,
  iceLaid: 0,
});

/** A player's own against the fleet since the last row. */
interface PlayerCounts {
  shotsAtSea: number;
  shipHits: number;
  /** By kind, in `SHIP_KINDS` order. */
  sunk: number[];
  gruntsShot: number;
  gruntsWalled: number;
  shipPoints: number;
  gruntKillPoints: number;
}

const playerCounts = (): PlayerCounts => ({
  shotsAtSea: 0,
  shipHits: 0,
  sunk: [0, 0, 0],
  gruntsShot: 0,
  gruntsWalled: 0,
  shipPoints: 0,
  gruntKillPoints: 0,
});
