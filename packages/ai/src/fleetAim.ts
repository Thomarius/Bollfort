import { SHIP_KINDS, type BotProfile } from '@bollfort/config';
import {
  FACINGS,
  SHIP_SIZE,
  Structure,
  besideLand,
  cannonCentreX,
  cannonCentreY,
  distanceSquared,
  findReadyCannon,
  shipPosition,
  shotFlightTicks,
  type Grunt,
  type MatchState,
  type Rng,
  type Ship,
} from '@bollfort/sim';

/**
 * A bot's aim in a campaign level (docs/CAMPAIGN.md CA12): at the fleet's ships and the grunts
 * ashore, where versus play's `Gunner` aims at rivals' walls, of which a campaign has none.
 *
 * In order, as the user ranked the danger: a **transport at the coast** — or bound for it on its
 * present run — which lands grunts at every build phase; then a grunt facing the team's wall or a
 * castle nobody held, before its one blow of the battle; then any other ship; then any other
 * grunt. Among ships the one fewest hits from sinking first, then the nearest in flight; among
 * grunts the nearest. A ship its own shots in the air will sink, and a grunt one is already
 * headed for, are left be.
 *
 * It leads a ship along its present run only, which is what a person sees it do: where the run
 * ends it may turn, and the bot cannot know where. Its misses are the level's `ownAccuracy`,
 * taken as the share of shots led right; a miss is a shot not led — aimed where the ship is — or
 * led a tile off. Assumed, not measured: the sessions' recordings (hits on ships for shots at sea)
 * are what to fit them to.
 */
export class FleetAim {
  constructor(
    private readonly playerId: number,
    private readonly profile: BotProfile,
  ) {}

  /** The tile to fire at now, or null with nothing worth a shot or no gun ready. */
  aim(state: MatchState, rng: Rng): { x: number; y: number } | null {
    const fleet = state.campaign;
    if (fleet === null) return null;
    const candidates: { tier: number; order: number; at: { x: number; y: number } }[] = [];
    const flying = state.shots.filter((s) => s.owner === this.playerId);

    for (const ship of fleet.ships) {
      const needed = this.hitsToSink(state, ship);
      const inbound = flying.filter((s) => this.strikes(ship, s.toX, s.toY, s.impactTick)).length;
      if (inbound >= needed) continue;
      const led = this.lead(state, ship);
      if (led === null) continue;
      const atCoast = besideLand(state, ship) || besideLand(state, runEnd(ship));
      const tier = ship.kind === 'transport' && atCoast ? 0 : 2;
      candidates.push({ tier, order: needed * 10_000 + led.flight, at: led });
    }

    for (const grunt of fleet.grunts) {
      if (flying.some((s) => s.toX === grunt.x && s.toY === grunt.y)) continue;
      const flight = this.flightTo(state, grunt.x, grunt.y);
      if (flight === null) continue;
      const tier = this.threatens(state, grunt) ? 1 : 3;
      candidates.push({ tier, order: flight, at: { x: grunt.x, y: grunt.y } });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.tier - b.tier || a.order - b.order);
    const best = candidates[0] as (typeof candidates)[number];
    return this.missed(state, rng, best.at);
  }

  /** Hits still needed to sink it, the team's firepower's first-hit bonus counted. */
  private hitsToSink(state: MatchState, ship: Ship): number {
    const rules = state.ruleset.campaign;
    if (rules === undefined) return 1;
    const total = rules.fleet.hitsToSink[SHIP_KINDS.indexOf(ship.kind)] as number;
    const bonus = ship.hits === 0 ? rules.firepower.firstHitExtra : 0;
    return Math.max(1, total - ship.hits - bonus);
  }

  /** Whether a shot landing on (x, y) at `tick` strikes the ship, as `shipStruck` judges it. */
  private strikes(ship: Ship, x: number, y: number, tick: number): boolean {
    const at = shipPosition(ship, tick);
    const px = x * 256 + 128;
    const py = y * 256 + 128;
    const span = SHIP_SIZE * 256;
    return px > at.x - 128 && px < at.x + span + 128 && py > at.y - 128 && py < at.y + span + 128;
  }

  /**
   * Where to aim for the shot to meet the ship along its present run: the tile under its middle
   * as it will be when the shot lands, from the gun that would fire, worked out again from the
   * new tile a few times, since the tile chooses the gun and the gun the flight.
   */
  private lead(
    state: MatchState,
    ship: Ship,
  ): { x: number; y: number; flight: number; now: { x: number; y: number } } | null {
    const now = middleTile(shipPosition(ship, state.tick));
    let at = now;
    let flight = 0;
    for (let i = 0; i < 3; i++) {
      const f = this.flightTo(state, at.x, at.y);
      if (f === null) return null;
      flight = f;
      at = middleTile(shipPosition(ship, state.tick + flight));
    }
    if (at.x < 0 || at.y < 0 || at.x >= state.width || at.y >= state.height) return null;
    return { ...at, flight, now };
  }

  /** The flight of a shot fired now at (x, y), from the gun the rules would fire; null for none. */
  private flightTo(state: MatchState, x: number, y: number): number | null {
    const cannon = findReadyCannon(state, this.playerId, x, y);
    if (cannon === null) return null;
    const fromX = cannonCentreX(cannon);
    const fromY = cannonCentreY(cannon);
    const range = state.ruleset.shots.maxRangeTiles;
    if (range !== null && distanceSquared(fromX, fromY, x, y) > range * range) return null;
    return shotFlightTicks(state, cannon, fromX, fromY, x, y);
  }

  /**
   * Whether a grunt faces the team's wall or a castle nobody held, as it will strike once this
   * battle; one that has struck already (a person sees the blow) is no longer a danger in it.
   */
  private threatens(state: MatchState, grunt: Grunt): boolean {
    if (state.phase === 'combat' && grunt.nextActTick < 0) return false;
    const [dx, dy] = FACINGS[grunt.facing] as readonly [number, number];
    const x = grunt.x + dx;
    const y = grunt.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
    const i = y * state.width + x;
    if (state.structure[i] === Structure.Wall) return state.owner[i] !== 0;
    if (state.structure[i] !== Structure.Castle) return false;
    const castle = state.castles.find(
      (c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h,
    );
    return castle !== undefined && !castle.enclosed;
  }

  /** The tile as fired: led right at the level's accuracy, else not led, or led a tile off. */
  private missed(
    state: MatchState,
    rng: Rng,
    at: { x: number; y: number; now?: { x: number; y: number } },
  ): { x: number; y: number } {
    if (this.profile.ownAccuracy >= 1 || rng.nextFloat() < this.profile.ownAccuracy) {
      return { x: at.x, y: at.y };
    }
    if (at.now !== undefined && rng.nextFloat() < 0.5) return at.now;
    const [dx, dy] = OFFSETS[rng.nextInt(OFFSETS.length)] as readonly [number, number];
    return {
      x: Math.min(state.width - 1, Math.max(0, at.x + dx)),
      y: Math.min(state.height - 1, Math.max(0, at.y + dy)),
    };
  }
}

const OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** The tile whose middle is nearest a ship's middle, its top-left corner given in 1/256 tile. */
function middleTile(corner: { x: number; y: number }): { x: number; y: number } {
  const half = (SHIP_SIZE * 256) / 2;
  return { x: Math.floor((corner.x + half) / 256), y: Math.floor((corner.y + half) / 256) };
}

/** The ship as it will stand at its present run's end. */
function runEnd(ship: Ship): Ship {
  const run = ship.run;
  if (run === null) return ship;
  return { ...ship, x: ship.x + run.dx * run.tiles, y: ship.y + run.dy * run.tiles, run: null };
}
