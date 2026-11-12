import { pocketCount } from '@bollfort/ai';
import {
  SPECIAL_KINDS,
  type AchievementId,
  type AchievementsConfig,
  type SpecialKind,
} from '@bollfort/config';
import {
  NEIGHBOURS_8,
  Structure,
  computeEnclosure,
  inRepairReach,
  repairRadiusOf,
  type Cannon,
  type MatchEvent,
  type MatchState,
  type Shot,
} from '@bollfort/sim';

/**
 * Steam achievements, detected (docs/STEAM_ACHIEVEMENTS.md §3, §4): one seat's, from the match
 * as every page replays it — its events and its state after each step — so nothing travels on
 * the wire and nothing is taken on anyone else's word. The page feeds `observe` as the match
 * plays, as `RoundStats` is fed; the harness feeds it from recordings (`--achievements`).
 *
 * Covered here: the 30 earned in a match. The stats' achievements are `statAchievements`, over
 * Steam's running totals; a tournament's three are `tournamentAchievements`; Read the manual is
 * the client's alone.
 */

export interface AchievementTable {
  /** The player whose achievements these are. */
  seat: number;
  /** Each player's bot level by player id, null for a person. */
  levels: readonly (number | null)[];
}

/** What a match adds to Steam's stats; `towers_bought` a bitmask by `SPECIAL_KINDS`, to be OR'd. */
export interface StatIncrements {
  castles_sealed: number;
  walls_destroyed: number;
  towers_bought: number;
}

/** Steam's totals after a match: the stats' achievements read them. */
export type StatTotals = StatIncrements;

export class AchievementWatcher {
  readonly stats: StatIncrements = { castles_sealed: 0, walls_destroyed: 0, towers_bought: 0 };
  private readonly earned: AchievementId[] = [];
  private drained = 0;
  private readonly held: Set<AchievementId>;
  private readonly seat: number;

  /** By island id, its player. */
  private playerOfIsland = new Map<number, number>();
  private readonly shots = new Map<number, Shot>();
  /** This barrage's walls destroyed, by shooter then victim; it closes as the build phase opens. */
  private barrage: number[][] = [];
  private lastBarrage: number[][] = [];
  private barrageWalls = 0;
  private readonly rapidShots = new Map<number, number>();
  private readonly lulled = new Map<number, number>();
  private readonly waveWalls = new Map<number, number>();
  /** Rivals the seat's Frost Cannon froze a tile of in this barrage, and in the last one. */
  private frozeNow = new Set<number>();
  private frozeLast = new Set<number>();
  /** Castles each player holds sealed as of the last count, for a breach to be seen. */
  private sealed: number[] = [];
  private buildClockEnd = Number.POSITIVE_INFINITY;
  private sealedBefore = 0;
  /** Cells the seat laid on a teammate's island. */
  private readonly lentCells = new Set<number>();
  private towersBought = 0;
  private spentLife = false;
  private away = false;

  constructor(
    private readonly config: AchievementsConfig,
    private readonly table: AchievementTable,
    /** Achievements already held, skipped — and the dearer checks with them. */
    held: Iterable<AchievementId> = [],
  ) {
    this.seat = table.seat;
    this.held = new Set(held);
  }

  /** Achievements earned so far in this match, in the order earned. */
  get unlocked(): readonly AchievementId[] {
    return this.earned;
  }

  /** Those earned since the last call. */
  drain(): AchievementId[] {
    const fresh = this.earned.slice(this.drained);
    this.drained = this.earned.length;
    return fresh;
  }

  /**
   * After every step, with the events it produced. `present` is false while a bot plays the
   * seat for an absent person: nothing it does is credited, and a result asks for the person
   * seated at the end (§3.2).
   */
  observe(state: MatchState, events: readonly MatchEvent[], present = true): void {
    if (this.playerOfIsland.size === 0) {
      for (const p of state.players) this.playerOfIsland.set(p.islandId, p.id);
      const n = state.players.length;
      this.barrage = blank(n);
      this.lastBarrage = blank(n);
      this.sealed = new Array<number>(n).fill(0);
    }
    if (!present) this.away = true;
    const me = this.seat;
    const mine = present;
    let wallsFell = false;
    const struck = new Set<number>();

    const destroyed = (shooter: number, tiles: readonly number[]): void => {
      if (tiles.length === 0) return;
      wallsFell = true;
      for (const tile of tiles) {
        const victim = this.playerOfIsland.get(state.islandId[tile] ?? 0);
        if (victim !== undefined) this.barrage[shooter]![victim]!++;
        if (shooter === me && victim !== undefined) struck.add(victim);
      }
      if (shooter !== me || !mine) return;
      this.stats.walls_destroyed += tiles.length;
      this.barrageWalls += tiles.length;
      if (this.barrageWalls >= this.config.BIG_BARRAGE.walls) this.earn('BIG_BARRAGE');
    };

    for (const e of events) {
      switch (e.kind) {
        case 'phase_changed':
          if (e.phase === 'combat') {
            this.barrage = blank(state.players.length);
            this.barrageWalls = 0;
            this.rapidShots.clear();
            this.frozeNow = new Set();
            if (this.wants('FIRST_BREACH')) this.sealed = sealedCounts(state);
          } else if (e.phase === 'build') {
            this.lastBarrage = this.barrage;
            this.frozeLast = this.frozeNow;
            this.buildClockEnd = e.phaseEndTick;
          }
          break;
        case 'shot_fired':
          this.shots.set(e.shot.id, e.shot);
          if (e.shot.owner === me && mine && e.shot.kind === 'rapid') {
            const n = (this.rapidShots.get(e.shot.cannonId) ?? 0) + 1;
            this.rapidShots.set(e.shot.cannonId, n);
            if (n >= this.config.RAPID_FIRE.shots) this.earn('RAPID_FIRE');
          }
          break;
        case 'shot_impact': {
          const shot = this.shots.get(e.shotId);
          this.shots.delete(e.shotId);
          if (shot === undefined) break;
          destroyed(shot.owner, e.destroyed);
          if (shot.owner !== me || !mine) break;
          if (shot.kind === 'bertha' && e.destroyed.length >= this.config.BIG_BANG.walls) {
            this.earn('BIG_BANG');
          }
          if (shot.kind === 'biggest' && e.destroyed.length >= this.config.HEAVYWEIGHT.walls) {
            this.earn('HEAVYWEIGHT');
          }
          break;
        }
        case 'lightning_struck':
          destroyed(e.owner, e.destroyed);
          if (e.owner === me && mine && e.destroyed.length >= this.config.CHAIN_REACTION.walls) {
            this.earn('CHAIN_REACTION');
          }
          break;
        case 'laser_fired':
          destroyed(e.owner, e.destroyed);
          if (e.owner === me && mine && e.destroyed.length >= this.config.STRAIGHT_THROUGH.walls) {
            this.earn('STRAIGHT_THROUGH');
          }
          break;
        case 'wave_ended':
          if (e.destroyed === null) break;
          destroyed(e.owner, [e.destroyed]);
          if (e.owner === me && mine) {
            const n = (this.waveWalls.get(e.waveId) ?? 0) + 1;
            this.waveWalls.set(e.waveId, n);
            if (n >= this.config.BASS_DROP.walls) this.earn('BASS_DROP');
          }
          break;
        case 'gun_slept':
          if (e.owner === me && mine) {
            const n = (this.lulled.get(e.shotId) ?? 0) + 1;
            this.lulled.set(e.shotId, n);
            if (n >= this.config.SWEET_DREAMS.guns) this.earn('SWEET_DREAMS');
          }
          break;
        case 'tile_frozen': {
          const victim = this.playerOfIsland.get(state.islandId[e.tile] ?? 0);
          if (e.owner === me && mine && victim !== undefined && this.rival(state, victim)) {
            this.frozeNow.add(victim);
          }
          break;
        }
        case 'walls_repaired':
          wallsFell = true; // walls stood again: the count of sealed castles may have risen
          break;
        case 'cannon_placed':
          if (e.player === me && mine && e.cannonKind !== 'cannon') this.towerBought(state, e);
          break;
        case 'piece_placed':
          if (e.player !== me || !mine) break;
          this.lend(state, e.cells);
          if (e.tick >= this.buildClockEnd && this.sealedBefore === 0) {
            if ((state.players[me]?.enclosedCastles ?? 0) > 0) this.earn('JUST_IN_TIME');
          }
          break;
        case 'round_resolved':
          for (const result of e.results) {
            if (result.player === me && mine) this.resolved(state, result.enclosedCastles);
          }
          if (mine) this.neighbourly(state, e.results);
          break;
        case 'player_continued':
        case 'player_eliminated':
          if (e.player === me) this.spentLife = true;
          else if (mine && this.rival(state, e.player)) this.lifeLost(e.player);
          break;
        case 'game_over':
          if (present) this.finished(state);
          break;
        default:
      }
    }

    // A breach is seen by counting afresh after the walls fell: `enclosedCastles` is not
    // refreshed by shots. Once a step, and only until the achievement is held.
    if (wallsFell && this.wants('FIRST_BREACH') && this.sealed.length > 0) {
      const now = sealedCounts(state);
      if (mine) for (const v of struck) if (now[v]! < this.sealed[v]!) this.earn('FIRST_BREACH');
      this.sealed = now;
    }
    this.sealedBefore = state.players[me]?.enclosedCastles ?? 0;
  }

  private wants(id: AchievementId): boolean {
    return !this.held.has(id) && !this.earned.includes(id);
  }

  private earn(id: AchievementId): void {
    if (this.wants(id)) this.earned.push(id);
  }

  private rival(state: MatchState, player: number): boolean {
    return state.players[player]?.team !== state.players[this.seat]?.team;
  }

  /** The seat's resolution: its castles and ground (§4: 3, 7, 8, 9, 10). */
  private resolved(state: MatchState, castles: number): void {
    this.stats.castles_sealed += castles;
    const island = state.players[this.seat]?.islandId ?? 0;
    if (castles === 0) return;
    if (this.wants('POCKET') && pocketCount(state, this.seat) > 0) this.earn('POCKET');
    const own = state.castles.filter((c) => c.islandId === island).length;
    if (own > 0 && castles >= own) this.earn('FULL_ESTATE');
    if (this.wants('LAND_GRAB') || this.wants('EMPIRE')) {
      let tiles = 0;
      for (const t of state.territory) if (t === island) tiles++;
      if (tiles >= this.config.LAND_GRAB.tiles) this.earn('LAND_GRAB');
      if (tiles >= this.config.EMPIRE.tiles) this.earn('EMPIRE');
    }
  }

  /** Cells laid on a teammate's island, kept for Good neighbour. */
  private lend(state: MatchState, cells: readonly number[]): void {
    const own = state.players[this.seat]?.islandId;
    for (const cell of cells) if (state.islandId[cell] !== own) this.lentCells.add(cell);
  }

  /**
   * A teammate's castle sealed with the seat's blocks in its wall: a block the seat laid on
   * the teammate's island, still standing, bordering the ground they hold sealed.
   */
  private neighbourly(
    state: MatchState,
    results: readonly { player: number; enclosedCastles: number }[],
  ): void {
    if (this.lentCells.size === 0 || !this.wants('GOOD_NEIGHBOUR')) return;
    for (const cell of [...this.lentCells]) {
      if (state.structure[cell] !== Structure.Wall) this.lentCells.delete(cell);
    }
    for (const result of results) {
      if (result.player === this.seat || result.enclosedCastles === 0) continue;
      if (this.rival(state, result.player)) continue;
      const island = state.players[result.player]?.islandId;
      for (const cell of this.lentCells) {
        if (state.islandId[cell] === island && borders(state, cell, island)) {
          this.earn('GOOD_NEIGHBOUR');
          return;
        }
      }
    }
  }

  /**
   * A rival spent a life or went out at a resolution: the seat's if it took more of their wall
   * than anyone in the barrage before (Lights out), and their island frozen by its Frost Cannon
   * for the build phase between (Cold shoulder).
   */
  private lifeLost(victim: number): void {
    const taken = this.lastBarrage.map((row) => row[victim] ?? 0);
    const mineTaken = taken[this.seat] ?? 0;
    if (mineTaken > 0 && taken.every((n, p) => p === this.seat || n < mineTaken)) {
      this.earn('LIGHTS_OUT');
    }
    if (this.frozeLast.has(victim)) this.earn('COLD_SHOULDER');
  }

  private towerBought(state: MatchState, e: { cannonKind: string }): void {
    this.earn('SPECIAL_DELIVERY');
    this.towersBought++;
    const bit = SPECIAL_KINDS.indexOf(e.cannonKind as SpecialKind);
    if (bit >= 0) this.stats.towers_bought |= 1 << bit;
    if (e.cannonKind === 'architect' && this.wants('ARCHITECT_ZONING')) {
      const architects = state.cannons.filter(
        (c) => c.owner === this.seat && c.kind === 'architect',
      );
      if (apartSet(state, architects, this.config.ARCHITECT_ZONING.towers)) {
        this.earn('ARCHITECT_ZONING');
      }
    }
  }

  /** The match's end, the person at the table (§4: 1, 2, 14–17, 19, 34, 35). */
  private finished(state: MatchState): void {
    this.earn('FIRST_MATCH');
    const me = state.players[this.seat];
    if (me === undefined) return;
    if (!this.spentLife && !me.eliminated && !this.away) this.earn('UNTOUCHABLE');
    if (this.table.levels.filter((level) => level === null).length >= 2) {
      this.earn('AMONG_FRIENDS');
    }
    const won =
      !state.draw &&
      state.winners.length > 0 &&
      state.winners.every((w) => state.players[w]?.team === me.team);
    if (!won) return;
    this.earn('FIRST_WIN');
    const floor = this.opponentFloor(state);
    if (floor >= this.config.SEASONED.levelFloor) this.earn('SEASONED');
    if (floor >= this.config.WARLORD.levelFloor) this.earn('WARLORD');
    if (state.endedBy === 'elimination') this.earn('SOLE_SURVIVOR');
    if (state.players.some((p) => p.id !== me.id && p.team === me.team)) {
      this.earn('IN_GOOD_COMPANY');
    }
    if (this.towersBought >= this.config.TOWERING_VICTORY.towers) this.earn('TOWERING_VICTORY');
  }

  /** The weakest opponent bot's level; a person, or no bot at all, passes any floor (§3.3). */
  private opponentFloor(state: MatchState): number {
    let floor = Number.POSITIVE_INFINITY;
    for (const p of state.players) {
      if (!this.rival(state, p.id)) continue;
      const level = this.table.levels[p.id];
      if (level !== null && level !== undefined) floor = Math.min(floor, level);
    }
    return floor;
  }
}

/** The stats' achievements, met by Steam's totals after a match. */
export function statAchievements(config: AchievementsConfig, totals: StatTotals): AchievementId[] {
  const met: AchievementId[] = [];
  if (totals.castles_sealed >= config.SEAL_OF_APPROVAL.castles) met.push('SEAL_OF_APPROVAL');
  if (totals.walls_destroyed >= config.DEMOLITION_CREW.walls) met.push('DEMOLITION_CREW');
  if (towersBoughtCount(totals.towers_bought) >= SPECIAL_KINDS.length) met.push('ALL_TOWERS');
  return met;
}

/** The kinds set in a `towers_bought` mask: Steam's `towers_bought_count`, its progress. */
export function towersBoughtCount(mask: number): number {
  let count = 0;
  for (let bit = 0; bit < SPECIAL_KINDS.length; bit++) if ((mask >> bit) & 1) count++;
  return count;
}

/** A tournament the host's team played to its end. */
export interface TournamentResult {
  /** Their team won it. */
  champion: boolean;
  /** Their matches, and those they won outright. */
  matches: number;
  won: number;
}

export function tournamentAchievements(result: TournamentResult): AchievementId[] {
  const met: AchievementId[] = ['SEASON_TICKET'];
  if (result.champion) met.push('CHAMPION');
  if (result.champion && result.matches > 0 && result.won === result.matches) {
    met.push('INVINCIBLE');
  }
  return met;
}

function blank(n: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

function sealedCounts(state: MatchState): number[] {
  return computeEnclosure(state).enclosedCastlesByPlayer.slice();
}

function borders(state: MatchState, cell: number, island: number | undefined): boolean {
  const x = cell % state.width;
  const y = (cell - x) / state.width;
  for (const [ox, oy] of NEIGHBOURS_8) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    if (state.territory[ny * state.width + nx] === island) return true;
  }
  return false;
}

/** Whether any `count` of these Architects have reaches no tile shares (Zoning laws). */
function apartSet(state: MatchState, architects: readonly Cannon[], count: number): boolean {
  if (architects.length < count) return false;
  const apart = (a: Cannon, b: Cannon): boolean => !reachesMeet(state, a, b);
  const pick = (from: number, chosen: Cannon[]): boolean => {
    if (chosen.length === count) return true;
    for (let i = from; i < architects.length; i++) {
      const next = architects[i]!;
      if (chosen.every((c) => apart(c, next)) && pick(i + 1, [...chosen, next])) return true;
    }
    return false;
  };
  return pick(0, []);
}

/** Whether a tile lies within the repair reach of both (`inRepairReach`, its cost's radius). */
export function reachesMeet(state: MatchState, a: Cannon, b: Cannon): boolean {
  const ra = repairRadiusOf(state.ruleset, a.cost);
  const rb = repairRadiusOf(state.ruleset, b.cost);
  const x0 = Math.floor(Math.max(a.x - ra, b.x - rb)) - 1;
  const x1 = Math.ceil(Math.min(a.x + a.w + ra, b.x + b.w + rb)) + 1;
  const y0 = Math.floor(Math.max(a.y - ra, b.y - rb)) - 1;
  const y1 = Math.ceil(Math.min(a.y + a.h + ra, b.y + b.h + rb)) + 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inRepairReach(a, ra, x, y) && inRepairReach(b, rb, x, y)) return true;
    }
  }
  return false;
}
