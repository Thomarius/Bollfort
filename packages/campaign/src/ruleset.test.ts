import { describe, expect, it } from 'vitest';
import { defaultCampaignConfig as config, defaultRuleset } from '@bollfort/config';

import { campaignRuleset, newCarry, startingLives } from './ruleset.js';

describe('campaignRuleset', () => {
  it("builds a level's ruleset from the campaign's config", () => {
    const ruleset = campaignRuleset(config, defaultRuleset, {
      difficulty: 'normal',
      level: 1,
      players: 1,
      seed: 5,
      carry: { scores: [300], lives: 2, roundsPlayed: 3 },
    });
    expect(ruleset.players.min).toBe(1);
    expect(ruleset.scoring.maxRounds).toBeNull();
    expect(ruleset.specials.enabled).toBe(false);
    expect(ruleset.campaign).toEqual({
      difficulty: 'normal',
      level: 1,
      shape: 'corner',
      maxRounds: 8,
      lives: 2,
      pieceStartRound: 3,
      carry: { scores: [300], roundsPlayed: 3 },
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
          }).campaign?.shape,
      ),
    );
    expect(shapes).toEqual(new Set(config.levels[4]?.shapes));
  });

  it('starts a campaign with its lives and, on Veteran, a bonus', () => {
    expect(newCarry(config, 'normal', 1)).toEqual({ scores: [0], lives: 3, roundsPlayed: 0 });
    expect(newCarry(config, 'veteran', 3)).toEqual({
      scores: [500, 500, 500],
      lives: 4,
      roundsPlayed: 0,
    });
    expect(startingLives(config, 'normal', 2)).toBe(4);
    // Veteran starts at level 2 and plays level 5 twice.
    expect(config.difficulties.veteran.levelOrder).toEqual([1, 2, 3, 4, 4, 5]);
  });

  it('refuses a table a campaign cannot take', () => {
    const setup = {
      difficulty: 'normal' as const,
      level: 0,
      seed: 1,
      carry: newCarry(config, 'normal', 1),
    };
    expect(() => campaignRuleset(config, defaultRuleset, { ...setup, players: 4 })).toThrow();
    expect(() => campaignRuleset(config, defaultRuleset, { ...setup, players: 2 })).toThrow();
    expect(() =>
      campaignRuleset(config, defaultRuleset, { ...setup, level: 6, players: 1 }),
    ).toThrow();
  });
});
