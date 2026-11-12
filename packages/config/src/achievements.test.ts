import { describe, expect, it } from 'vitest';

import { ACHIEVEMENT_IDS, achievementProblems } from './achievements.js';
import { defaultAchievements, defaultRuleset } from './defaults.js';

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
