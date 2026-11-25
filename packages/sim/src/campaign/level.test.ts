import { describe, expect, it } from 'vitest';
import {
  defaultRuleset,
  defaultTerrainConfig,
  RulesetSchema,
  type CampaignLevelRules,
  type Ruleset,
} from '@bollfort/config';

import { createMatch, hashMatchState, step } from '../match.js';
import { campaignLevelRuleset, fastRuleset } from '../testing.js';
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

  it('spends a life on a failed seal, and is lost once none is left', () => {
    const state = solo(campaignRules({ lives: 1, maxRounds: 10 }));
    for (let failures = 0; failures < 2; failures++) {
      stepUntil(state, (s) => s.phase === 'combat');
      breachRing(state);
      stepUntil(state, (s) => s.phase !== 'combat');
      stepUntil(state, (s) => s.phase === 'cannon_place' || s.phase === 'combat');
      if (failures === 0) {
        expect(state.phase).not.toBe('game_over');
        expect(state.teams[0]?.continuesRemaining).toBe(0);
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
});
