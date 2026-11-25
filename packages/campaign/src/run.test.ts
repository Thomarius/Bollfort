import { describe, expect, it } from 'vitest';
import { defaultCampaignConfig as config } from '@bollfort/config';

import {
  finalStage,
  levelSeed,
  levelSetup,
  newCampaign,
  nextLevel,
  recordLevel,
  retriesLeft,
  retryLevel,
  won,
  type LevelOutcome,
} from './run.js';
import { parseCampaignSave } from './save.js';

const NOW = '2026-11-25T12:00:00.000Z';

function campaign(difficulty: 'normal' | 'veteran' = 'normal') {
  return newCampaign(config, { id: 'c-1', difficulty, names: ['Ada'], seed: 9, now: NOW });
}

function outcome(cleared: boolean, scores: number[], lives: number): LevelOutcome {
  return { cleared, scores, lives, rounds: 3, shape: 'coast', sunk: [4, 1, 0], grunts: 2 };
}

describe('a campaign run', () => {
  it('starts at the first level of its difficulty, saved as the schema has it', () => {
    const normal = campaign();
    expect(nextLevel(config, normal)).toBe(0);
    expect(normal.carry).toEqual({ scores: [0], lives: 3, roundsPlayed: 0, retriesUsed: 0 });
    // Veteran skips level 1, with 500 points for it.
    const veteran = campaign('veteran');
    expect(nextLevel(config, veteran)).toBe(1);
    expect(veteran.carry.scores).toEqual([500]);
    expect(parseCampaignSave(JSON.parse(JSON.stringify(normal)))).toEqual({
      ok: true,
      save: normal,
    });
    expect(parseCampaignSave({ ...normal, version: 2 })).toEqual({ ok: false, reason: 'version' });
    expect(parseCampaignSave({ ...normal, stage: 'x' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('carries a cleared level on: its bonus, a life back up to the start, the rounds', () => {
    const save = campaign();
    const after = recordLevel(config, save, outcome(true, [400], 1), NOW);
    expect(after.stage).toBe(1);
    // 250 for level 1 on top of the 400 scored; a life back, from 1 to 2.
    expect(after.carry).toEqual({ scores: [650], lives: 2, roundsPlayed: 3, retriesUsed: 0 });
    expect(after.history).toEqual([
      {
        level: 0,
        shape: 'coast',
        rounds: 3,
        points: [650],
        result: 'cleared',
        sunk: [4, 1, 0],
        grunts: 2,
      },
    ]);
    // Never more lives than the campaign began with.
    expect(recordLevel(config, save, outcome(true, [0], 3), NOW).carry.lives).toBe(3);
    // The given save is left as it was.
    expect(save.stage).toBe(0);
  });

  it('plays a lost level again from its start, on a fresh map, while retries last', () => {
    const save = recordLevel(config, campaign('veteran'), outcome(true, [900], 2), NOW);
    const lost = recordLevel(config, save, outcome(false, [1100], 0), NOW);
    expect(lost.defeated).toBe(true);
    expect(lost.finished).toBe(false);
    expect(lost.carry).toEqual(save.carry);
    expect(levelSeed(lost)).not.toBe(levelSeed(save));
    expect(retriesLeft(config, lost)).toBe(2);
    const again = retryLevel(lost, NOW);
    expect(again.defeated).toBe(false);
    expect(retriesLeft(config, again)).toBe(1);
    // Veteran's last retry spent, a loss ends the campaign.
    const spent = retryLevel(recordLevel(config, again, outcome(false, [0], 0), NOW), NOW);
    expect(retriesLeft(config, spent)).toBe(0);
    expect(recordLevel(config, spent, outcome(false, [0], 0), NOW).finished).toBe(true);
    // Normal's are unlimited.
    expect(retriesLeft(config, campaign())).toBeNull();
  });

  it('is won after its final battle', () => {
    let save = campaign();
    for (let stage = 0; stage < 6; stage++) {
      expect(finalStage(config, save)).toBe(stage === 5);
      save = recordLevel(config, save, outcome(true, save.carry.scores, 3), NOW);
    }
    expect(save.finished).toBe(true);
    expect(won(config, save)).toBe(true);
    // The bonuses of all six levels: 250 to 1250, and 2000.
    expect(save.carry.scores).toEqual([250 + 500 + 750 + 1000 + 1250 + 2000]);
  });

  it('sets the next level up from the save, the carry its start', () => {
    const save = recordLevel(config, campaign(), outcome(true, [300], 2), NOW);
    expect(levelSetup(config, save)).toEqual({
      difficulty: 'normal',
      level: 1,
      players: 1,
      seed: levelSeed(save),
      carry: { scores: [550], lives: 3, roundsPlayed: 3 },
    });
  });
});
