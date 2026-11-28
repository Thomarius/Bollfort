import { describe, expect, it } from 'vitest';
import { defaultCampaignConfig as config, defaultRuleset } from '@bollfort/config';

import { campaignRuleset, newCarry, poolFor, startingContinues } from './ruleset.js';

describe('campaignRuleset', () => {
  it("builds a level's ruleset from the campaign's config", () => {
    const ruleset = campaignRuleset(config, defaultRuleset, {
      difficulty: 'normal',
      level: 1,
      players: 1,
      seed: 5,
      carry: { scores: [300], roundsPlayed: 3, firepower: 0 },
      continued: false,
    });
    expect(ruleset.players.min).toBe(1);
    expect(ruleset.scoring.maxRounds).toBeNull();
    expect(ruleset.specials.enabled).toBe(false);
    expect(ruleset.campaign).toMatchObject({
      difficulty: 'normal',
      level: 1,
      shape: 'corner',
      map: {
        width: 44,
        height: 32,
        seaMarginTiles: 4,
        landFraction: 0.5,
        coastNoise: { amplitudeTiles: 7, frequency: 0.06 },
        lakes: 0,
        lakeRadiusTiles: 4,
        castles: 5,
      },
      fleet: {
        pool: [16, 8, 0],
        maxAfloat: 16,
        // Level 2: the fleet reckons it four rounds in from its start.
        roundOffset: 4,
        timing: {
          arrivalMs: 1000,
          spawnStepMin: 3,
          spawnStepRange: 10,
          tileMs: [2100, 1400, 1050, 850],
          runSlackMs: 2400,
          restMs: [1000, 2000, 3000, 4000],
        },
        hitsToSink: [2, 3, 5],
        fire: { everyMs: 733, flightFactor: 1 },
      },
      scoring: { hitPoints: 10, sinkPoints: [20, 40, 60], multiplier: 1 },
      maxRounds: 5,
      firepower: { level: 0, shotSpeed: 1, firstHitExtra: 0, openingCannons: 0 },
      pieceStartRound: 3,
      carry: { scores: [300] },
    });
    // Everything else is versus play's.
    expect(ruleset.phases).toEqual(defaultRuleset.phases);
    expect(ruleset.build).toEqual(defaultRuleset.build);
  });

  it('draws a shape from those the level allows, by the seed', () => {
    const shapes = new Set(
      Array.from(
        { length: 40 },
        (_, seed) =>
          campaignRuleset(config, defaultRuleset, {
            difficulty: 'normal',
            level: 4,
            players: 1,
            seed,
            carry: newCarry(config, 'normal', 1),
            continued: false,
          }).campaign?.shape,
      ),
    );
    expect(shapes).toEqual(new Set(config.levels[4]?.shapes));
  });

  it("starts the fleet's reckoning late on every level but the first", () => {
    const offset = (difficulty: 'normal' | 'veteran', level: number) =>
      campaignRuleset(config, defaultRuleset, {
        difficulty,
        level,
        players: 1,
        seed: 1,
        carry: newCarry(config, difficulty, 1),
        continued: false,
      }).campaign?.fleet.roundOffset;
    expect(offset('normal', 0)).toBe(0);
    expect(offset('normal', 1)).toBe(4);
    expect(offset('veteran', 1)).toBe(4);
    expect(offset('normal', 5)).toBe(4);
  });

  it('sizes the map and its castles for the players', () => {
    const map = (players: number) =>
      campaignRuleset(config, defaultRuleset, {
        difficulty: 'normal',
        level: 5,
        players,
        seed: 1,
        carry: newCarry(config, 'normal', players),
        continued: false,
      }).campaign?.map;
    expect(map(1)).toMatchObject({ width: 44, height: 32, castles: 2, lakes: 1 });
    expect(map(3)).toMatchObject({ width: 66, height: 40, castles: 6, landFraction: 0.42 });
  });

  it('makes ships tougher from level 4, and scores Veteran half again', () => {
    const level = (difficulty: 'normal' | 'veteran', index: number) =>
      campaignRuleset(config, defaultRuleset, {
        difficulty,
        level: index,
        players: 1,
        seed: 1,
        carry: newCarry(config, difficulty, 1),
        continued: false,
      }).campaign;
    expect(level('normal', 2)?.fleet.hitsToSink).toEqual([2, 3, 5]);
    expect(level('normal', 3)?.fleet.hitsToSink).toEqual([3, 4, 6]);
    expect(level('veteran', 1)?.scoring.multiplier).toBe(1.5);
  });

  it('scales the pool and the room afloat for co-op', () => {
    // 1 + 0.6 for each other player, rounded per kind (CAMPAIGN §8.1).
    expect(poolFor(config, 'normal', 4, 1)).toEqual([2, 25, 10]);
    expect(poolFor(config, 'normal', 4, 2)).toEqual([3, 40, 16]);
    expect(poolFor(config, 'veteran', 4, 3)).toEqual([4, 70, 31]);
    const afloat = campaignRuleset(config, defaultRuleset, {
      difficulty: 'normal',
      level: 0,
      players: 3,
      seed: 1,
      carry: newCarry(config, 'normal', 3),
      continued: false,
    }).campaign?.fleet.maxAfloat;
    expect(afloat).toBe(24);
  });

  it('starts a campaign with no firepower, its continues and, on Veteran, a bonus', () => {
    expect(newCarry(config, 'normal', 1)).toEqual({ scores: [0], roundsPlayed: 0, firepower: 0 });
    expect(newCarry(config, 'veteran', 3)).toEqual({
      scores: [500, 500, 500],
      roundsPlayed: 0,
      firepower: 0,
    });
    expect(startingContinues(config, 'easy')).toBeNull();
    expect(startingContinues(config, 'normal')).toBe(4);
    expect(startingContinues(config, 'veteran')).toBe(4);
    expect(startingContinues(config, 'legend')).toBe(0);
    // Veteran starts at level 2 and plays level 5 twice.
    expect(config.difficulties.veteran.levelOrder).toEqual([1, 2, 3, 4, 4, 5]);
  });

  it("builds the team's firepower into the level, and a continue's cannons", () => {
    const rules = (firepower: number, continued: boolean) =>
      campaignRuleset(config, defaultRuleset, {
        difficulty: 'normal',
        level: 2,
        players: 1,
        seed: 1,
        carry: { ...newCarry(config, 'normal', 1), firepower },
        continued,
      }).campaign?.firepower;
    expect(rules(1, true)).toEqual({
      level: 1,
      shotSpeed: 1.25,
      firstHitExtra: 0,
      openingCannons: 2,
    });
    expect(rules(3, false)).toEqual({
      level: 3,
      shotSpeed: 1.5,
      firstHitExtra: 1,
      openingCannons: 0,
    });
    // Never beyond the most.
    expect(rules(9, false)).toEqual({
      level: 4,
      shotSpeed: 1.5,
      firstHitExtra: 2,
      openingCannons: 0,
    });
  });

  it('refuses a table a campaign cannot take', () => {
    const setup = {
      difficulty: 'normal' as const,
      level: 0,
      seed: 1,
      carry: newCarry(config, 'normal', 1),
      continued: false,
    };
    expect(() => campaignRuleset(config, defaultRuleset, { ...setup, players: 4 })).toThrow();
    expect(() => campaignRuleset(config, defaultRuleset, { ...setup, players: 2 })).toThrow();
    expect(() =>
      campaignRuleset(config, defaultRuleset, { ...setup, level: 6, players: 1 }),
    ).toThrow();
  });
});
