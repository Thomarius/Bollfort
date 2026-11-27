import {
  BALANCED,
  botProfile,
  defaultAiConfig,
  defaultTerrainConfig,
  type Ruleset,
} from '@bollfort/config';
import {
  Rng,
  applyAction,
  besideLand,
  campaignLevelRuleset,
  createMatch,
  drainEvents,
  shipFits,
  step,
  type CampaignState,
  type MatchState,
  type Ship,
} from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { Bot } from './bot.js';
import { FleetAim } from './fleetAim.js';
import { takeBotTurns } from './seating.js';

/** A level with no fleet of its own and no shot from one: the ships are the test's. */
function quietLevel(): Ruleset {
  const ruleset = campaignLevelRuleset();
  const campaign = ruleset.campaign!;
  return {
    ...ruleset,
    campaign: {
      ...campaign,
      maxRounds: 9,
      threshold: 0,
      threat: { perGrunt: 0, perCannon: 0 },
      fleet: { ...campaign.fleet, pool: [0, 0, 0], fire: { ...campaign.fleet.fire, everyMs: 1e9 } },
    },
  };
}

/** A bot's island played into its first battle, guns placed; a dormant ship keeps the level on. */
function inBattle(seed: number): MatchState {
  const state = createMatch({
    seed,
    ruleset: quietLevel(),
    terrainConfig: defaultTerrainConfig,
    players: [{ name: 'Bot', isBot: true }],
  });
  const fleet = state.campaign as CampaignState;
  const far = fleet.spawnPoints[0]!;
  fleet.ships = [ship(900, 'raider', far.x, far.y)];
  const bot = new Bot(0, { level: 8, personality: BALANCED });
  const rng = new Rng(seed);
  for (let i = 0; i < 20_000 && state.phase !== 'combat'; i++) {
    takeBotTurns(state, rng, () => bot);
    step(state);
  }
  drainEvents(state);
  return state;
}

function ship(id: number, kind: Ship['kind'], x: number, y: number): Ship {
  return {
    id,
    kind,
    x,
    y,
    hits: 0,
    heading: 0,
    run: null,
    runs: 0,
    arrivedTick: 0,
    shotId: null,
    nextLandTick: 0,
  };
}

/** The 2 × 2 places on open sea, with a run of `tiles` free eastward from each if asked. */
function seaPlaces(state: MatchState, tiles = 0): { x: number; y: number }[] {
  const places: { x: number; y: number }[] = [];
  for (let y = 0; y < state.height - 1; y++) {
    for (let x = 0; x < state.width - 1 - tiles; x++) {
      let free = true;
      for (let t = 0; t <= tiles && free; t++) free = shipFits(state, x + t, y, null);
      if (free) places.push({ x, y });
    }
  }
  return places;
}

const sure = {
  ...botProfile(defaultAiConfig, { level: 10, personality: BALANCED }),
  ownAccuracy: 1,
};

describe('a bot’s aim at the fleet (CAMPAIGN CA12)', () => {
  it('leads a sailing ship and hits it', () => {
    const state = inBattle(5);
    expect(state.phase).toBe('combat');
    const at = seaPlaces(state, 8)[0]!;
    const sailing: Ship = {
      ...ship(1, 'raider', at.x, at.y),
      run: { dx: 1, dy: 0, tiles: 8, startTick: state.tick, ticksPerTile: 26 },
    };
    (state.campaign as CampaignState).ships = [sailing];
    const aim = new FleetAim(0, sure).aim(state, new Rng(1));
    expect(aim).not.toBeNull();
    // Led: not where it is now, but along its run.
    expect(aim!.x).toBeGreaterThan(at.x + 1);
    expect(applyAction(state, { kind: 'fire', player: 0, ...aim! })).toBeNull();
    let hit = false;
    for (let i = 0; i < 600 && !hit; i++) {
      step(state);
      hit = drainEvents(state).some((e) => e.kind === 'ship_hit' && e.shipId === 1);
    }
    expect(hit).toBe(true);
  });

  it('takes a transport at the coast before any nearer ship', () => {
    const state = inBattle(5);
    const places = seaPlaces(state);
    const coast = places.find((p) => besideLand(state, ship(0, 'transport', p.x, p.y)))!;
    const open = places.filter((p) => !besideLand(state, ship(0, 'raider', p.x, p.y)));
    // The raider as near the guns as open sea allows: the nearest place to the coast's transport.
    const near = open.sort(
      (a, b) =>
        Math.abs(a.x - coast.x) +
        Math.abs(a.y - coast.y) -
        Math.abs(b.x - coast.x) -
        Math.abs(b.y - coast.y),
    )[0]!;
    (state.campaign as CampaignState).ships = [
      ship(1, 'raider', near.x, near.y),
      ship(2, 'transport', coast.x, coast.y),
    ];
    const aim = new FleetAim(0, sure).aim(state, new Rng(1))!;
    expect(Math.abs(aim.x - (coast.x + 1))).toBeLessThanOrEqual(1);
    expect(Math.abs(aim.y - (coast.y + 1))).toBeLessThanOrEqual(1);
  });

  it('leaves a ship its shots in the air will sink', () => {
    const state = inBattle(5);
    const at = seaPlaces(state)[0]!;
    // A raider one hit from sinking, and a shot of the bot's already on its way to it.
    const raider = { ...ship(1, 'raider', at.x, at.y), hits: 0 };
    (state.campaign as CampaignState).ships = [raider];
    const rules = state.ruleset.campaign!;
    raider.hits = Math.max(0, rules.fleet.hitsToSink[0] - 1);
    const aim = new FleetAim(0, sure);
    const first = aim.aim(state, new Rng(1))!;
    expect(applyAction(state, { kind: 'fire', player: 0, ...first })).toBeNull();
    expect(aim.aim(state, new Rng(1))).toBeNull();
  });
});
