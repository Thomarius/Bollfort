import {
  defaultRuleset,
  defaultTerrainConfig,
  RulesetSchema,
  type Ruleset,
} from '@bollfort/config';

import { step } from './match.js';
import type { CampaignState, Grunt, Ship } from './campaign/state.js';
import { seaOf, spawnPointsOf } from './campaign/terrain.js';
import { placedBarrels } from './specials.js';
import {
  Structure,
  Terrain,
  type Cannon,
  type CannonKind,
  type Castle,
  type MatchState,
  type PlayerState,
} from './types.js';

/**
 * Builds a match state from an ASCII picture. Enclosure bugs are geometric, and a
 * picture states the case far more clearly than a typed array literal.
 *
 * `.` water   `,` empty land   `#` wall   `@` castle   `*` cannon
 * `B` Big Bertha   `A` Architect   `R` Rapid Cannon   `L` Lightning Tower, `G` Allerdickste
 *   Bertha, `X` Laser Tower, `F` Frost Cannon, `Z` Lullaby Tower, `W` Subwoofer, `D` Drone Tower, `K` Fortified Tower — special
 *   towers at cost 3; `b` `a` `r` `l` `g` `x` `f` `z` `w` `d` `k` the same at cost 2
 * `1`-`4` empty land belonging to that island (default is island 1)
 *
 * Adjacent `@`, `*` or tower glyphs are grouped into one structure by bounding box.
 *
 * `islands`, when given, is a second picture of the same size in which a digit puts
 * that tile on that island whatever the first picture holds. It is how a wall, castle
 * or cannon is given to a player other than the first — which matters now that a
 * shot damages only an opponent's wall. Any other glyph leaves the tile alone.
 *
 * Every wall is owned by the island it stands on, as it would be in play.
 */
/** The glyph of each kind of gun in a picture. */
const GUN_GLYPHS: Readonly<Record<string, { kind: CannonKind; cost: number }>> = {
  '*': { kind: 'cannon', cost: 1 },
  B: { kind: 'bertha', cost: 3 },
  A: { kind: 'architect', cost: 3 },
  R: { kind: 'rapid', cost: 3 },
  b: { kind: 'bertha', cost: 2 },
  a: { kind: 'architect', cost: 2 },
  r: { kind: 'rapid', cost: 2 },
  L: { kind: 'lightning', cost: 3 },
  l: { kind: 'lightning', cost: 2 },
  G: { kind: 'biggest', cost: 3 },
  g: { kind: 'biggest', cost: 2 },
  X: { kind: 'laser', cost: 3 },
  x: { kind: 'laser', cost: 2 },
  F: { kind: 'frost', cost: 3 },
  f: { kind: 'frost', cost: 2 },
  Z: { kind: 'lullaby', cost: 3 },
  z: { kind: 'lullaby', cost: 2 },
  W: { kind: 'subwoofer', cost: 3 },
  w: { kind: 'subwoofer', cost: 2 },
  D: { kind: 'drone', cost: 3 },
  d: { kind: 'drone', cost: 2 },
  K: { kind: 'fortified', cost: 3 },
  k: { kind: 'fortified', cost: 2 },
};

export function stateFromAscii(
  art: string,
  ruleset: Ruleset = defaultRuleset,
  islands?: string,
): MatchState {
  const picture = (text: string): string[] =>
    text
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  const rows = picture(art);
  const overlay = islands === undefined ? [] : picture(islands);
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const size = width * height;

  const terrain = new Uint8Array(size);
  const islandId = new Uint8Array(size);
  const structure = new Uint8Array(size);
  const owner = new Uint8Array(size);

  const at = (x: number, y: number): string => (rows[y] as string)[x] ?? '.';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      // A ship (`S`, its 2 × 2 footprint) floats on water.
      if (ch === '.' || ch === 'S') continue;
      const i = y * width + x;
      terrain[i] = Terrain.Land;
      islandId[i] = ch >= '1' && ch <= '9' ? Number(ch) : 1;
      const over = overlay[y]?.[x];
      if (over !== undefined && over >= '1' && over <= '9') islandId[i] = Number(over);
      if (ch === '#') {
        structure[i] = Structure.Wall;
        owner[i] = islandId[i] as number;
      } else if (ch === '@') structure[i] = Structure.Castle;
      else if (ch === 'K' || ch === 'k') {
        structure[i] = Structure.Stone;
        owner[i] = islandId[i] as number;
      } else if (GUN_GLYPHS[ch] !== undefined) structure[i] = Structure.Cannon;
    }
  }

  const blocks = (glyph: string): { x: number; y: number; w: number; h: number }[] => {
    const seen = new Uint8Array(size);
    const found: { x: number; y: number; w: number; h: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (at(x, y) !== glyph || seen[y * width + x] === 1) continue;
        let w = 0;
        while (at(x + w, y) === glyph && seen[y * width + x + w] === 0) w++;
        let h = 0;
        while (h < height - y && at(x, y + h) === glyph) h++;
        for (let oy = 0; oy < h; oy++)
          for (let ox = 0; ox < w; ox++) seen[(y + oy) * width + x + ox] = 1;
        found.push({ x, y, w, h });
      }
    }
    return found;
  };

  const castles: Castle[] = blocks('@').map((b, id) => ({
    id,
    islandId: islandId[b.y * width + b.x] as number,
    ...b,
    enclosed: false,
  }));
  const cannons: Cannon[] = Object.entries(GUN_GLYPHS)
    .flatMap(([glyph, gun]) => blocks(glyph).map((b) => ({ ...gun, ...b })))
    .map(({ kind, cost, ...b }, id) => {
      const cannon: Cannon = {
        id,
        owner: (islandId[b.y * width + b.x] as number) - 1,
        kind,
        cost,
        ...b,
        active: true,
        shotIds: [],
      };
      const barrels = placedBarrels(ruleset, kind, cost);
      if (barrels !== undefined) cannon.barrels = barrels;
      return cannon;
    });

  for (const castle of castles) {
    for (let oy = 0; oy < castle.h; oy++)
      for (let ox = 0; ox < castle.w; ox++)
        owner[(castle.y + oy) * width + castle.x + ox] = castle.islandId;
  }

  const islandIds = [...new Set([...islandId].filter((v) => v > 0))].sort((a, b) => a - b);
  const players: PlayerState[] = islandIds.map((island, id) => ({
    id,
    islandId: island,
    name: `p${id}`,
    isBot: true,
    eliminated: false,
    eliminatedRound: null,
    startingCastleId: null,
    enclosedCastles: 0,
    cannonsToPlace: 0,
    pieceIndex: 0,
    team: id,
    pieceRound: 0,
    overtimeSpent: false,
    score: 0,
    wallsDestroyed: 0,
    special: null,
    specialsBought: 0,
    openingPlacement: false,
  }));

  // A campaign's board has its fleet: raiders where the picture shows ships, the level's pool
  // still to come.
  let campaign: CampaignState | null = null;
  if (ruleset.campaign !== undefined) {
    const sea = seaOf(terrain, width, height);
    const ships: Ship[] = blocks('S').map((b, id) => ({
      id,
      kind: 'raider',
      x: b.x,
      y: b.y,
      hits: 0,
      heading: 0,
      run: null,
      runs: 0,
      arrivedTick: 0,
      shotId: null,
      nextLandTick: 0,
    }));
    // And its grunts (`m`, on land), facing north, their clocks at zero.
    const grunts: Grunt[] = blocks('m').flatMap((b) =>
      Array.from({ length: b.w * b.h }, (_, k) => ({
        id: 0,
        x: b.x + (k % b.w),
        y: b.y + Math.floor(k / b.w),
        facing: 0,
        nextStepTick: 0,
        nextActTick: 0,
        nextBreedTick: 0,
      })),
    );
    grunts.forEach((g, id) => (g.id = id));
    campaign = {
      pool: [...ruleset.campaign.fleet.pool],
      wave: [0, 0, 0],
      ships,
      nextShipId: ships.length,
      spawnCursor: 0,
      nextArrivalTick: 0,
      cannonsGiven: 0,
      shots: [],
      nextShotId: 0,
      nextFireTick: 0,
      fireCursor: -1,
      aimed: [],
      struck: [],
      grunts,
      nextGruntId: grunts.length,
      gruntsLeft: 0,
      sea,
      spawnPoints: spawnPointsOf(sea, width, height),
    };
  }

  return {
    seed: 1,
    ruleset,
    terrainConfig: defaultTerrainConfig,
    width,
    height,
    tick: 0,
    round: 1,
    phase: 'combat',
    phaseEndTick: 1000,
    pendingPhase: null,
    overtime: false,
    players: players.length > 0 ? players : [],
    // Every player on their own, with no lives: a test wanting either sets it.
    teams: players.map((_, id) => ({ id, continuesRemaining: 0, continuesAtStart: 0 })),
    teamNames: null,
    terrain,
    islandId,
    structure,
    owner,
    territory: new Uint8Array(size),
    castles,
    cannons,
    shots: [],
    lostWalls: [],
    frozen: [],
    waves: [],
    nextCannonId: cannons.length,
    nextShotId: 0,
    campaign,
    winners: [],
    draw: false,
    endedBy: null,
    events: [],
  };
}

/**
 * Steps past the opening intermission to the first playable phase. Every match now
 * begins with the announcement, so tests that want to act need to get past it.
 */
export function beginMatch(state: MatchState): MatchState {
  while (state.phase === 'intermission') step(state);
  return state;
}

/**
 * A ruleset where failing to seal is final.
 *
 * Continues are on by default, so "fails to enclose anything" no longer means "is out"
 * — it means "spends a life". Tests about elimination itself want the simpler rule, and
 * saying so explicitly is better than them quietly testing something else.
 */
export function withoutContinues(ruleset: Ruleset): Ruleset {
  return { ...ruleset, elimination: { ...ruleset.elimination, continues: 0 } };
}

/**
 * A ruleset without the round cap, for anything about elimination or long matches:
 * with it, a match reaching `game_over` says nothing about whether anyone was beaten.
 */
export function withoutRoundCap(ruleset: Ruleset): Ruleset {
  return { ...ruleset, scoring: { ...ruleset.scoring, maxRounds: null } };
}

/** A ruleset with the special towers played. */
export function withSpecials(ruleset: Ruleset): Ruleset {
  return { ...ruleset, specials: { ...ruleset.specials, enabled: true } };
}

/** A ruleset with compressed phases, so a whole match runs in a test in milliseconds. */
export function fastRuleset(ruleset: Ruleset = defaultRuleset): Ruleset {
  return {
    ...ruleset,
    phases: {
      castleSelectMs: 400,
      combatMs: 1500,
      buildMs: 1200,
      cannonPlaceMs: 600,
      endOfPhasePauseMs: 100,
      transitionBannerMs: 200,
      continueBannerMs: 200,
    },
  };
}

/**
 * A campaign level's ruleset as `campaignRuleset` (`@bollfort/campaign`, which depends on this
 * package) builds one for one player on Normal: level 1, a coast, three rounds, two lives.
 */
export function campaignLevelRuleset(ruleset: Ruleset = defaultRuleset): Ruleset {
  return RulesetSchema.parse({
    ...ruleset,
    players: { min: 1, max: 3 },
    specials: { ...ruleset.specials, enabled: false },
    scoring: { ...ruleset.scoring, maxRounds: null },
    campaign: {
      difficulty: 'normal',
      level: 0,
      shape: 'coast',
      map: {
        width: 44,
        height: 32,
        seaMarginTiles: 4,
        landFraction: 0.6,
        coastNoise: { amplitudeTiles: 7, frequency: 0.06 },
        lakes: 0,
        lakeRadiusTiles: 4,
        castles: 6,
      },
      maxRounds: 3,
      lives: 2,
      pieceStartRound: 3,
      carry: { scores: [0], roundsPlayed: 0 },
      fleet: {
        pool: [10, 0, 0],
        maxAfloat: 16,
        timing: {
          arrivalMs: 1000,
          spawnStepMin: 3,
          spawnStepRange: 10,
          tileMs: [2100, 1400, 1050, 850],
          runSlackMs: 2400,
        },
        hitsToSink: [2, 3, 5],
        aim: { base: [-10, 0, 10, 15, 0], perGuarded: 5, perStruck: 12, skipRecent: 8 },
        fire: { everyMs: 733, flightFactor: 1 },
      },
      grunts: {
        allowance: [5, 6, 7, 8, 9, 10, 12, 13],
        factor: 1,
        timing: { landMs: 1866, breedMs: 11733, stepMs: 1600, smashMs: 6933 },
      },
      ice: { early: 2, late: 3, lateFromRound: 8 },
      scoring: { hitPoints: 10, gruntPoints: 10, sinkPoints: [20, 40, 60], multiplier: 1 },
    },
  });
}
