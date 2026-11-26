import { describe, expect, it } from 'vitest';
import { defaultCampaignConfig as config } from '@bollfort/config';

import {
  continueLevel,
  continuesLeft,
  finalStage,
  freeRetry,
  levelSeed,
  levelSetup,
  newCampaign,
  nextLevel,
  recordLevel,
  won,
  type LevelOutcome,
} from './run.js';
import { parseCampaignSave } from './save.js';

const NOW = '2026-11-25T12:00:00.000Z';

function campaign(difficulty: 'easy' | 'normal' | 'veteran' | 'legend' = 'normal') {
  return newCampaign(config, { id: 'c-1', difficulty, names: ['Ada'], seed: 9, now: NOW });
}

function outcome(cleared: boolean, scores: number[], rounds = 3): LevelOutcome {
  return { cleared, scores, rounds, shape: 'coast', sunk: [4, 1, 0], grunts: 2 };
}

describe('a campaign run', () => {
  it('starts at the first level of its difficulty, saved as the schema has it', () => {
    const normal = campaign();
    expect(nextLevel(config, normal)).toBe(0);
    expect(normal.carry).toEqual({ scores: [0], roundsPlayed: 0, firepower: 0, continuesUsed: 0 });
    expect(normal.continued).toBe(false);
    // Veteran skips level 1, with 500 points for it.
    const veteran = campaign('veteran');
    expect(nextLevel(config, veteran)).toBe(1);
    expect(veteran.carry.scores).toEqual([500]);
    expect(parseCampaignSave(JSON.parse(JSON.stringify(normal)))).toEqual({
      ok: true,
      save: normal,
    });
    expect(parseCampaignSave({ ...normal, version: 1 })).toEqual({ ok: false, reason: 'version' });
    expect(parseCampaignSave({ ...normal, stage: 'x' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('carries a cleared level on: its bonus and the rounds', () => {
    const save = campaign();
    const after = recordLevel(config, save, outcome(true, [400]), NOW);
    expect(after.stage).toBe(1);
    // 250 for level 1 on top of the 400 scored.
    expect(after.carry).toEqual({ scores: [650], roundsPlayed: 3, firepower: 0, continuesUsed: 0 });
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
    // The given save is left as it was.
    expect(save.stage).toBe(0);
  });

  it('plays a lost level again from its start, on the same map, a continue raising the firepower', () => {
    const save = recordLevel(config, campaign(), outcome(true, [900]), NOW);
    const lost = recordLevel(config, save, outcome(false, [1100]), NOW);
    expect(lost.defeated).toBe(true);
    expect(lost.finished).toBe(false);
    expect(freeRetry(lost)).toBe(false);
    // The score back to the level's start.
    expect(lost.carry).toEqual(save.carry);
    expect(levelSeed(lost)).toBe(levelSeed(save));
    expect(continuesLeft(config, lost)).toBe(4);
    const again = continueLevel(config, lost, NOW);
    expect(again.defeated).toBe(false);
    expect(again.continued).toBe(true);
    expect(again.carry.firepower).toBe(1);
    expect(continuesLeft(config, again)).toBe(3);
    expect(levelSetup(config, again)).toMatchObject({
      seed: levelSeed(save),
      carry: { scores: [1150], firepower: 1 },
      continued: true,
    });
  });

  it('forgives a level lost in its first round: no continue spent, no firepower', () => {
    const save = campaign('legend');
    const lost = recordLevel(config, save, outcome(false, [0], 1), NOW);
    expect(freeRetry(lost)).toBe(true);
    // Legend has no continue, and still plays it again.
    expect(lost.finished).toBe(false);
    const again = continueLevel(config, lost, NOW);
    expect(again.carry).toEqual(save.carry);
    expect(again.continued).toBe(false);
    expect(again.defeated).toBe(false);
  });

  it('ends the campaign at a loss with no continue left, its save kept as the record', () => {
    let save = campaign('veteran');
    for (let n = 0; n < 4; n++) {
      save = continueLevel(config, recordLevel(config, save, outcome(false, [0]), NOW), NOW);
    }
    expect(continuesLeft(config, save)).toBe(0);
    // Firepower to its most, 4.
    expect(save.carry.firepower).toBe(4);
    const over = recordLevel(config, save, outcome(false, [0]), NOW);
    expect(over.finished).toBe(true);
    expect(over.defeated).toBe(true);
    expect(won(config, over)).toBe(false);
    // Legend has none at all; Easy's are unlimited.
    expect(recordLevel(config, campaign('legend'), outcome(false, [0]), NOW).finished).toBe(true);
    expect(continuesLeft(config, campaign('easy'))).toBeNull();
  });

  it('keeps the firepower from level to level, brought down to what a cleared level keeps', () => {
    let save = campaign('easy');
    for (let n = 0; n < 6; n++) {
      save = continueLevel(config, recordLevel(config, save, outcome(false, [0]), NOW), NOW);
    }
    expect(save.carry.firepower).toBe(4);
    const cleared = recordLevel(config, save, outcome(true, [0]), NOW);
    expect(cleared.carry.firepower).toBe(3);
    expect(cleared.continued).toBe(false);
    const next = recordLevel(config, cleared, outcome(true, [0]), NOW);
    expect(next.carry.firepower).toBe(3);
  });

  it('is won after its final battle', () => {
    let save = campaign();
    for (let stage = 0; stage < 6; stage++) {
      expect(finalStage(config, save)).toBe(stage === 5);
      save = recordLevel(config, save, outcome(true, save.carry.scores), NOW);
    }
    expect(save.finished).toBe(true);
    expect(won(config, save)).toBe(true);
    // The bonuses of all six levels: 250 to 1250, and 2000.
    expect(save.carry.scores).toEqual([250 + 500 + 750 + 1000 + 1250 + 2000]);
  });

  it('sets the next level up from the save, the carry its start', () => {
    const save = recordLevel(config, campaign(), outcome(true, [300]), NOW);
    expect(levelSetup(config, save)).toEqual({
      difficulty: 'normal',
      level: 1,
      players: 1,
      seed: levelSeed(save),
      carry: { scores: [550], roundsPlayed: 3, firepower: 0 },
      continued: false,
    });
  });
});
