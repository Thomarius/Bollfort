import { describe, expect, it } from 'vitest';

import { ACHIEVEMENT_IDS, achievementProblems } from './achievements.js';
import { defaultAchievements, defaultRuleset, locales } from './defaults.js';
import { placeholders } from './locale.js';

describe('the achievements’ config', () => {
  it('lists the 35 the user chose, each earnable under the default rules', () => {
    expect(ACHIEVEMENT_IDS).toHaveLength(35);
    expect(Object.keys(defaultAchievements)).toEqual(ACHIEVEMENT_IDS);
    expect(achievementProblems(defaultAchievements, defaultRuleset)).toEqual([]);
  });

  it('refuses what the rules make impossible', () => {
    const problems = achievementProblems(
      {
        ...defaultAchievements,
        TOWERING_VICTORY: { towers: 4 },
        STRAIGHT_THROUGH: { walls: 4 },
        SWEET_DREAMS: { guns: 4 },
        WARLORD: { levelFloor: 5 },
      },
      defaultRuleset,
    );
    expect(problems).toHaveLength(4);
  });
});

describe('the achievements’ texts', () => {
  // Steam shows a description as it is, so its numbers are the config's, filled in when the
  // texts are written out (AC5): a description names exactly its achievement's thresholds.
  it('name each achievement and use exactly its thresholds as placeholders', () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(typeof locales.en[`achievement.${id}.name`], id).toBe('string');
      const desc = locales.en[`achievement.${id}.desc`];
      expect(typeof desc, id).toBe('string');
      expect([...placeholders(desc!)].sort(), id).toEqual(
        Object.keys(defaultAchievements[id]).sort(),
      );
    }
  });
});
