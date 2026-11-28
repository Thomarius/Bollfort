import { describe, expect, it } from 'vitest';
import {
  defaultRuleset,
  defaultTerrainConfig,
  RulesetSchema,
  type CampaignLevelRules,
  type Ruleset,
} from '@bollfort/config';

import { applyAction, createMatch, hashMatchState, step } from '../match.js';
import { campaignLevelRuleset, fastRuleset, stateFromAscii } from '../testing.js';
import { fire } from '../shots.js';
import { openBuild } from './fleet.js';
import { fleetBeaten, threat } from './level.js';
import type { CampaignState } from './state.js';
import { Structure, type MatchState } from '../types.js';

/** A fast campaign level, with the overrides these tests turn. */
function campaignRules(
  overrides: {
    maxRounds?: number;
    scores?: number[];
    firepower?: CampaignLevelRules['firepower'];
  } = {},
): Ruleset {
  const rules = campaignLevelRuleset(fastRuleset(defaultRuleset));
  const campaign = rules.campaign as CampaignLevelRules;
  return {
    ...rules,
    campaign: {
      ...campaign,
      maxRounds: overrides.maxRounds ?? 3,
      // No ships: these are about the level's end, and an idle player's walls would not last.
      // And no threat, so only the round limit or a failure can end the level.
      // One ship that never fires (`solo` puts it at sea), so the level is never won for having
      // nothing left to fight.
      fleet: { ...campaign.fleet, pool: [0, 0, 0], fire: { ...campaign.fleet.fire, everyMs: 1e9 } },
      threshold: 0,
      threat: { perGrunt: 0, perCannon: 0 },
      firepower: overrides.firepower ?? campaign.firepower,
      carry: { ...campaign.carry, scores: overrides.scores ?? [0] },
    },
  };
}

function solo(ruleset: Ruleset, seed = 7): MatchState {
  const state = createMatch({
    seed,
    ruleset,
    terrainConfig: defaultTerrainConfig,
    players: [{ name: 'You', isBot: false }],
  });
  // A level with no fleet of its own gets the dormant ship its rules ask for.
  const fleet = state.campaign as CampaignState;
  const at = fleet.spawnPoints[0];
  if (fleet.pool.every((n) => n === 0) && at !== undefined) {
    fleet.ships = [
      {
        id: 999,
        kind: 'raider',
        x: at.x,
        y: at.y,
        hits: 0,
        heading: 0,
        run: null,
        runs: 0,
        restUntilTick: -1,
        arrivedTick: 0,
        shotId: null,
        nextLandTick: 0,
      },
    ];
  }
  return state;
}

/** Steps until the phase is reached or the match is over, never more than `limit` ticks. */
function stepUntil(state: MatchState, done: (s: MatchState) => boolean, limit = 20_000): void {
  for (let i = 0; i < limit && !done(state) && state.phase !== 'game_over'; i++) step(state);
}

/**
 * Opens the player's ring at the middle of its top edge — a corner would not breach it — as a
 * shot would, so the resolution finds no sealed castle.
 */
function breachRing(state: MatchState): void {
  const castle = state.castles.find((c) => c.id === state.players[0]?.startingCastleId);
  if (castle === undefined) throw new Error('no castle chosen');
  const ring = state.terrainConfig.startingWall.ringRadiusTiles;
  const i = (castle.y - ring) * state.width + castle.x;
  expect(state.structure[i]).toBe(Structure.Wall);
  state.structure[i] = Structure.Empty;
  state.owner[i] = 0;
}

describe('a campaign level', () => {
  it('takes one player, which versus play refuses', () => {
    expect(() => solo(campaignRules())).not.toThrow();
    const versus = RulesetSchema.safeParse({ ...defaultRuleset, players: { min: 1, max: 8 } });
    expect(versus.success).toBe(false);
    expect(() =>
      createMatch({
        seed: 1,
        ruleset: defaultRuleset,
        terrainConfig: defaultTerrainConfig,
        players: [{ name: 'You', isBot: false }],
      }),
    ).toThrow(RangeError);
  });

  it('brings the carried score and no continues, and deals from its later pieces', () => {
    const state = solo(campaignRules({ scores: [1250] }));
    expect(state.players[0]?.score).toBe(1250);
    // A failure ends the level: continues are the campaign's, which plays it again (§9).
    expect(state.teams[0]?.continuesRemaining).toBe(0);
    stepUntil(state, (s) => s.phase === 'build');
    // The first build phase deals the size schedule's third round.
    expect(state.round).toBe(1);
    expect(state.players[0]?.pieceRound).toBe(3);
  });

  it('is not ended by its one team, and is cleared after its last battle', () => {
    // An idle player: the castle and guns are chosen for them, and the ring is never breached.
    const state = solo(campaignRules({ maxRounds: 3 }));
    stepUntil(state, (s) => s.round === 1 && s.phase === 'build');
    expect(state.phase).toBe('build');
    stepUntil(state, () => false);
    expect(state.phase).toBe('game_over');
    expect(state.endedBy).toBe('level_cleared');
    expect(state.winners).toEqual([0]);
    // Three battles, two build phases between them: the level ends after the third battle.
    expect(state.round).toBe(3);
    expect(state.players[0]?.score).toBeGreaterThan(0);
  });

  it('is lost at the first failure, its first round too: the campaign decides what is free', () => {
    const state = solo(campaignRules({ maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'combat');
    breachRing(state);
    stepUntil(state, (s) => s.phase !== 'combat');
    stepUntil(state, (s) => s.phase === 'cannon_place' || s.phase === 'combat');
    expect(state.phase).toBe('game_over');
    expect(state.endedBy).toBe('level_lost');
    expect(state.round).toBe(1);
    expect(state.winners).toEqual([]);
    expect(state.draw).toBe(false);
  });

  it('replays to the same fingerprints', () => {
    const a = solo(campaignRules(), 11);
    const b = solo(campaignRules(), 11);
    const hashes = (s: MatchState): string[] => {
      const seen: string[] = [];
      while (s.phase !== 'game_over') {
        step(s);
        if (s.tick % 30 === 0) seen.push(hashMatchState(s));
      }
      seen.push(hashMatchState(s));
      return seen;
    };
    expect(hashes(a)).toEqual(hashes(b));
  });

  it("weighs the fleet's threat by kind, grunts for it and guns against it", () => {
    const state = stateFromAscii(
      `
      ........,,,,,,
      .SS.....,**,m,
      .SS.....,**,,,
      `,
      campaignLevelRuleset(),
    );
    const fleet = state.campaign as CampaignState;
    fleet.pool = [2, 1, 0];
    fleet.wave = [0, 0, 1];
    // 7 × (2 + the raider afloat) + 18 + 20, a grunt's 4, less a gun's 7.
    expect(threat(state)).toBe(7 * 3 + 18 + 20 + 4 - 7);
    // Below level 1's threshold of 20 after a battle, the level is cleared.
    expect(fleetBeaten(state)).toBe(false);
    fleet.pool = [0, 0, 0];
    fleet.wave = [0, 0, 0];
    expect(threat(state)).toBe(7 + 4 - 7);
    expect(fleetBeaten(state)).toBe(true);
  });

  it('adds a frost ship to the pool on its countdown, which starts two rounds long', () => {
    const rules = campaignLevelRuleset();
    const campaign = rules.campaign as CampaignLevelRules;
    const state = solo({
      ...rules,
      campaign: { ...campaign, fleet: { ...campaign.fleet, frostshipEvery: 2 } },
    });
    const fleet = state.campaign as CampaignState;
    expect(fleet.frostshipCountdown).toBe(4);
    const added: number[] = [];
    for (let round = 1; round <= 6; round++) {
      fleet.pool = [0, 0, 0];
      fleet.wave = [0, 0, 0];
      state.phase = 'build';
      state.round = round;
      openBuild(state);
      added.push(fleet.pool[2] + fleet.wave[2]);
    }
    // Every second round once it has run its first four.
    expect(added).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it("is won the moment the battle's last shot lands once the fleet is beaten", () => {
    // A battle with its clock run out and one gun's shot still in the air, the fleet already gone.
    const state = solo(campaignRules({ maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'combat');
    const rules = state.ruleset.campaign as CampaignLevelRules;
    state.ruleset = { ...state.ruleset, campaign: { ...rules, threshold: 1000 } };
    const cannon = state.cannons[0];
    expect(cannon).toBeDefined();
    stepUntil(state, (s) => s.tick === s.phaseEndTick - 5);
    const fired = fire(state, 0, 1, 1);
    expect('shot' in fired).toBe(true);
    stepUntil(state, (s) => s.phase !== 'combat');
    // No build phase next: the intermission leads to the end, its music unchanged.
    expect(state.phase).toBe('intermission');
    expect(state.pendingPhase).toBe('game_over');
    const landing = 'shot' in fired ? fired.shot.impactTick : 0;
    stepUntil(state, (s) => s.phase === 'game_over');
    expect(state.endedBy).toBe('level_cleared');
    // Ended on the tick the shot came down, not after the pause and the banner, in the battle's look.
    expect(state.tick).toBe(landing);
    expect((state.campaign as CampaignState).wonInBattle).toBe(true);
  });

  it("flies the team's shots faster with its firepower, and opens with its continue's cannons", () => {
    const firepower = { level: 2, shotSpeed: 1.5, firstHitExtra: 0, openingCannons: 2 };
    const state = solo(campaignRules({ maxRounds: 10, firepower }));
    stepUntil(state, (s) => s.phase === 'cannon_place');
    expect(state.players[0]?.cannonsToPlace).toBe(state.ruleset.cannons.startingCount + 2);
    stepUntil(state, (s) => s.phase === 'combat');
    const shot = fire(state, 0, 1, 1);
    if (!('shot' in shot)) throw new Error('no shot');
    const fast = shot.shot.impactTick - shot.shot.launchTick;
    // The same gun at the same tile without the firepower.
    const rules = state.ruleset.campaign as CampaignLevelRules;
    state.ruleset = {
      ...state.ruleset,
      campaign: { ...rules, firepower: { ...firepower, shotSpeed: 1 } },
    };
    state.shots = [];
    for (const c of state.cannons) c.shotIds = [];
    const plain = fire(state, 0, 1, 1);
    if (!('shot' in plain)) throw new Error('no shot');
    const slow = plain.shot.impactTick - plain.shot.launchTick;
    expect(Math.abs(fast * 1.5 - slow)).toBeLessThanOrEqual(1.5);
  });

  it('is won the moment nothing is left to fight, the last shot down, in any phase', () => {
    const state = solo(campaignRules({ maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'build');
    expect(state.phase).toBe('build');
    // The last ship gone, nothing to come, no grunt ashore: won in the build phase itself.
    (state.campaign as CampaignState).ships = [];
    step(state);
    expect(state.phase).toBe('game_over');
    expect(state.endedBy).toBe('level_cleared');
    // Won while building, so the screen keeps the build look.
    expect((state.campaign as CampaignState).wonInBattle).toBe(false);
  });

  it('brings the first wave in whole however soon the castle is chosen', () => {
    // Chosen at once, and chosen at the last moment: the same ships face the first battle.
    const quick = solo(campaignLevelRuleset(fastRuleset(defaultRuleset)), 5);
    const slow = solo(campaignLevelRuleset(fastRuleset(defaultRuleset)), 5);
    stepUntil(quick, (s) => s.phase === 'castle_select');
    const castle = quick.castles[0];
    expect(castle).toBeDefined();
    applyAction(quick, { kind: 'select_castle', player: 0, castleId: castle?.id ?? 0 });
    stepUntil(quick, (s) => s.phase === 'combat');
    stepUntil(slow, (s) => s.phase === 'combat');
    const ships = (s: MatchState): number => (s.campaign as CampaignState).ships.length;
    expect(ships(quick)).toBe(3);
    expect(ships(slow)).toBe(3);
  });

  it('is won with the board empty once the ships still to come are below the threshold', () => {
    const state = solo(campaignRules({ maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'build');
    const fleet = state.campaign as CampaignState;
    const rules = state.ruleset.campaign as CampaignLevelRules;
    // Two raiders still in the pool, 14 against a threshold of 20, and none on the board.
    state.ruleset = {
      ...state.ruleset,
      campaign: { ...rules, threshold: 20, threat: { perGrunt: 4, perCannon: 0 } },
    };
    fleet.pool = [2, 0, 0];
    fleet.wave = [0, 0, 0];
    fleet.ships = [];
    step(state);
    expect(state.endedBy).toBe('level_cleared');
  });

  it('is not won while the ships still to come are a threat', () => {
    const state = solo(campaignRules({ maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'build');
    const fleet = state.campaign as CampaignState;
    const rules = state.ruleset.campaign as CampaignLevelRules;
    state.ruleset = {
      ...state.ruleset,
      campaign: { ...rules, threshold: 20, threat: { perGrunt: 4, perCannon: 0 } },
    };
    fleet.pool = [5, 0, 0];
    fleet.ships = [];
    step(state);
    expect(state.phase).not.toBe('game_over');
  });
});
