import { describe, expect, it } from 'vitest';
import {
  defaultRuleset,
  defaultTerrainConfig,
  RulesetSchema,
  type CampaignLevelRules,
  type Ruleset,
} from '@bollfort/config';

import { createMatch, hashMatchState, step } from '../match.js';
import { campaignLevelRuleset, fastRuleset, stateFromAscii } from '../testing.js';
import { openBuild } from './fleet.js';
import { levelCleared, threat } from './level.js';
import type { CampaignState } from './state.js';
import { Structure, type MatchState } from '../types.js';

/** A fast campaign level, with the overrides these tests turn. */
function campaignRules(
  overrides: { maxRounds?: number; lives?: number; scores?: number[] } = {},
): Ruleset {
  const rules = campaignLevelRuleset(fastRuleset(defaultRuleset));
  const campaign = rules.campaign as CampaignLevelRules;
  return {
    ...rules,
    campaign: {
      ...campaign,
      maxRounds: overrides.maxRounds ?? 3,
      // No ships: these are about the level's end, and an idle player's walls would not last.
      // And no threat, so only the round limit or the lives can end the level.
      fleet: { ...campaign.fleet, pool: [0, 0, 0] },
      threshold: 0,
      threat: { perGrunt: 0, perCannon: 0 },
      lives: overrides.lives ?? 2,
      carry: { ...campaign.carry, scores: overrides.scores ?? [0] },
    },
  };
}

function solo(ruleset: Ruleset, seed = 7): MatchState {
  return createMatch({
    seed,
    ruleset,
    terrainConfig: defaultTerrainConfig,
    players: [{ name: 'You', isBot: false }],
  });
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

  it('brings the carried score and lives, and deals from its later pieces', () => {
    const state = solo(campaignRules({ lives: 4, scores: [1250] }));
    expect(state.players[0]?.score).toBe(1250);
    expect(state.teams[0]?.continuesRemaining).toBe(4);
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

  it('forgives the first round, spends a life later, and is lost once none is left', () => {
    const state = solo(campaignRules({ lives: 1, maxRounds: 10 }));
    for (let failures = 0; failures < 3; failures++) {
      stepUntil(state, (s) => s.phase === 'combat');
      breachRing(state);
      stepUntil(state, (s) => s.phase !== 'combat');
      stepUntil(state, (s) => s.phase === 'cannon_place' || s.phase === 'combat');
      // The first round's failure is free; the second spends the one life.
      if (failures < 2) {
        expect(state.phase).not.toBe('game_over');
        expect(state.teams[0]?.continuesRemaining).toBe(failures === 0 ? 1 : 0);
      }
    }
    expect(state.phase).toBe('game_over');
    expect(state.endedBy).toBe('level_lost');
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

  it('keeps the map through a continue: only the failing guns go', () => {
    const state = solo(campaignRules({ lives: 2, maxRounds: 10 }));
    stepUntil(state, (s) => s.phase === 'combat');
    breachRing(state);
    const walls = state.structure.filter((t) => t === Structure.Wall).length;
    expect(state.cannons.length).toBeGreaterThan(0);
    stepUntil(state, (s) => s.phase === 'cannon_place');
    // The ring stands but for the breach's two loose ends, swept as orphans at the resolution —
    // where versus play would have wiped it whole; the guns are gone, a castle to choose again.
    expect(state.structure.filter((t) => t === Structure.Wall).length).toBe(walls - 2);
    expect(state.cannons).toEqual([]);
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
    expect(levelCleared(state)).toBe(false);
    fleet.pool = [0, 0, 0];
    fleet.wave = [0, 0, 0];
    expect(threat(state)).toBe(7 + 4 - 7);
    expect(levelCleared(state)).toBe(true);
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
});
