import { SHIP_KINDS } from '@bollfort/config';
import { firesItself, type MatchEvent, type MatchState } from '@bollfort/sim';

/**
 * What the end of a match shows beside the final standings: for each player the wall
 * they destroyed and the most castles they held at once, and every
 * score round by round, so the summary shows where the match was won.
 *
 * Kept from the events the client already receives, as they arrive, so it needs nothing
 * from the server. A client that joined part-way — a reconnect — saw only the rounds
 * since, and its chart starts there; the standings themselves come from the state and
 * are always whole.
 *
 * Separated from the drawing so it can be tested without a browser, as `scores.ts` is.
 */
export class MatchLog {
  /** Wall blocks each player's shots destroyed. */
  readonly destroyed = new Map<number, number>();
  /** Every player's banked score, and castles sealed, after each resolution seen. */
  readonly scores: { round: number; byPlayer: number[]; castles: number[] }[] = [];
  /** Who fired each shot in flight, since an impact names only the shot. */
  private readonly shooters = new Map<number, number>();
  /**
   * For the awards (PLAN 11.18 Y5): the wall each player's shots broke on each opponent's
   * island, by shooter then owner — a wall is its island's, whoever built it; pieces each
   * player laid; lives each spent; and every player's guns and territory points at each
   * resolution seen, beside its scores.
   */
  readonly brokeOf = new Map<number, Map<number, number>>();
  readonly pieces = new Map<number, number>();
  readonly livesSpent = new Map<number, number>();
  readonly guns: number[][] = [];
  readonly territoryPoints: number[][] = [];
  /**
   * Each player's points by where they came from, summed over the resolutions seen: ground held,
   * guns firing, walls destroyed (`RoundResult`) — together the score banked.
   */
  readonly pointsFrom = new Map<number, { ground: number; guns: number; walls: number }>();
  /**
   * For the accuracy: each player's shots fired by a click, and how many of them knocked down a
   * wall — a Lightning strike's, a Laser beam's or a wave's if any of its walls fell. A Drone
   * Tower's missiles are not aimed by the player and are left out.
   */
  readonly aimed = new Map<number, number>();
  readonly aimedHits = new Map<number, number>();
  /**
   * A campaign level's (docs/CAMPAIGN.md CA12, its end screen): the ships that came by kind, in
   * `SHIP_KINDS` order, the grunts that landed, and each player's points for hitting and sinking
   * ships and for the grunts they beat, the difficulty's factor in them.
   */
  readonly arrived = [0, 0, 0];
  /** The kind of each ship seen arriving, by id: a ship recycled at the coast arrives again. */
  private readonly shipKinds = new Map<number, number>();
  gruntsLanded = 0;
  readonly shipPoints = new Map<number, number>();
  readonly gruntPoints = new Map<number, number>();
  /** The aimed shots that have already counted as a hit, so a wave's lanes count once. */
  private readonly counted = new Set<number>();
  private readonly aimedShots = new Set<number>();

  /** `state` is the match as it stands once these events have happened. */
  note(
    events: readonly MatchEvent[],
    state: Pick<MatchState, 'players'> &
      Partial<Pick<MatchState, 'cannons' | 'islandId' | 'ruleset'>>,
  ): void {
    const add = (map: Map<number, number>, player: number, n: number): void => {
      map.set(player, (map.get(player) ?? 0) + n);
    };
    for (const event of events) {
      switch (event.kind) {
        case 'shot_fired':
          this.shooters.set(event.shot.id, event.shot.owner);
          if (!firesItself(event.shot.kind)) {
            this.aimed.set(event.shot.owner, (this.aimed.get(event.shot.owner) ?? 0) + 1);
            this.aimedShots.add(event.shot.id);
          }
          break;
        case 'shot_impact': {
          const shooter = this.shooters.get(event.shotId);
          this.shooters.delete(event.shotId);
          if (shooter !== undefined) this.broke(shooter, event.shotId, event.destroyed, state);
          this.aimedShots.delete(event.shotId);
          break;
        }
        // The towers whose walls fall otherwise than by a shot landing (ARCHIVE 16s: they were
        // missing from the wall counted, and from the awards): a Lightning strike and a Laser
        // beam as they are fired, each lane of a Subwoofer's wave as it ends.
        case 'lightning_struck':
        case 'laser_fired':
          this.shooters.delete(event.shotId);
          this.broke(event.owner, event.shotId, event.destroyed, state);
          break;
        case 'wave_ended':
          if (event.destroyed !== null) {
            this.broke(event.owner, event.waveId, [event.destroyed], state);
          }
          break;
        case 'piece_placed':
          this.pieces.set(event.player, (this.pieces.get(event.player) ?? 0) + 1);
          break;
        case 'ship_arrived': {
          const k = SHIP_KINDS.indexOf(event.ship.kind);
          this.arrived[k] = (this.arrived[k] ?? 0) + 1;
          this.shipKinds.set(event.ship.id, k);
          break;
        }
        case 'ship_recycled': {
          // Gone to come again: counted once, when it does.
          const k = this.shipKinds.get(event.shipId);
          if (k !== undefined) this.arrived[k] = Math.max(0, (this.arrived[k] ?? 0) - 1);
          break;
        }
        case 'grunt_landed':
          this.gruntsLanded++;
          break;
        case 'ship_hit': {
          // A hit that sinks is paid with the sinking, whose event carries both (`hitShips`); one
          // that does not, as `hitShips` awards it.
          const scoring = state.ruleset?.campaign?.scoring;
          if (!event.sunk && scoring !== undefined) {
            add(this.shipPoints, event.player, Math.round(scoring.hitPoints * scoring.multiplier));
          }
          break;
        }
        case 'ship_sunk':
          add(this.shipPoints, event.player, event.points);
          break;
        case 'grunt_killed':
          if (event.player >= 0) add(this.gruntPoints, event.player, event.points);
          break;
        case 'player_continued':
          this.livesSpent.set(event.player, (this.livesSpent.get(event.player) ?? 0) + 1);
          break;
        case 'round_resolved': {
          // The scores as banked by this resolution, which the state already carries.
          const castles = state.players.map(() => 0);
          for (const result of event.results) castles[result.player] = result.enclosedCastles;
          this.scores.push({
            round: event.round,
            byPlayer: state.players.map((p) => p.score),
            castles,
          });
          const territory = state.players.map(() => 0);
          for (const result of event.results) territory[result.player] = result.territoryPoints;
          for (const result of event.results) {
            const from = this.pointsFrom.get(result.player) ?? { ground: 0, guns: 0, walls: 0 };
            from.ground += result.territoryPoints;
            from.guns += result.gunPoints;
            from.walls += result.damagePoints;
            this.pointsFrom.set(result.player, from);
          }
          this.territoryPoints.push(territory);
          this.guns.push(
            state.players.map((p) => (state.cannons ?? []).filter((c) => c.owner === p.id).length),
          );
          break;
        }
        default:
          break;
      }
    }
  }

  /** Walls a shooter's shot knocked down, by the island each stood on, and its hit counted once. */
  private broke(
    shooter: number,
    shotId: number,
    tiles: readonly number[],
    state: Partial<Pick<MatchState, 'islandId'>>,
  ): void {
    if (tiles.length === 0) return;
    this.destroyed.set(shooter, (this.destroyed.get(shooter) ?? 0) + tiles.length);
    const victims = this.brokeOf.get(shooter) ?? new Map<number, number>();
    for (const tile of tiles) {
      const owner = (state.islandId?.[tile] ?? 0) - 1;
      if (owner >= 0) victims.set(owner, (victims.get(owner) ?? 0) + 1);
    }
    this.brokeOf.set(shooter, victims);
    if (this.aimedShots.has(shotId) && !this.counted.has(shotId)) {
      this.counted.add(shotId);
      this.aimedHits.set(shooter, (this.aimedHits.get(shooter) ?? 0) + 1);
    }
  }

  /** Walls of these players' islands that others knocked down, by who did it. */
  lostTo(players: readonly number[]): Map<number, number> {
    const by = new Map<number, number>();
    for (const [shooter, victims] of this.brokeOf) {
      if (players.includes(shooter)) continue;
      for (const p of players) {
        const n = victims.get(p) ?? 0;
        if (n > 0) by.set(shooter, (by.get(shooter) ?? 0) + n);
      }
    }
    return by;
  }

  /** Walls these players knocked down on everyone else's islands, by whose island. */
  brokeBy(players: readonly number[]): Map<number, number> {
    const on = new Map<number, number>();
    for (const shooter of players) {
      for (const [victim, n] of this.brokeOf.get(shooter) ?? []) {
        if (players.includes(victim)) continue;
        on.set(victim, (on.get(victim) ?? 0) + n);
      }
    }
    return on;
  }
}

/**
 * The most castles a group of players — one, or a team — held sealed at once, at any
 * resolution seen: a team's best round, not the sum of its members' separate bests.
 */
export function mostCastlesOf(log: MatchLog, players: readonly number[]): number {
  let best = 0;
  for (const round of log.scores) {
    best = Math.max(
      best,
      players.reduce((sum, p) => sum + (round.castles[p] ?? 0), 0),
    );
  }
  return best;
}

/** A line of the chart: the points it passes through, in the chart's own pixels. */
export interface ChartLine {
  key: number;
  points: { x: number; y: number }[];
}

/**
 * Score by round as lines across a `width` by `height` chart: rounds along, points up,
 * every line from nought before the first round seen. One line per series — a player in
 * free-for-all, a team in a team match — keyed as given.
 */
export function scoreChart(
  series: readonly { key: number; scores: readonly number[] }[],
  rounds: number,
  width: number,
  height: number,
): ChartLine[] {
  const top = Math.max(1, ...series.flatMap((s) => s.scores));
  const step = rounds > 0 ? width / rounds : width;
  return series.map((s) => ({
    key: s.key,
    points: [0, ...s.scores].map((score, i) => ({
      x: Number((i * step).toFixed(1)),
      y: Number((height - (score / top) * height).toFixed(1)),
    })),
  }));
}
