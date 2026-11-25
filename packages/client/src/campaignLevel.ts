import {
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_LEVELS,
  defaultConfigBundle,
  type CampaignDifficulty,
} from '@bollfort/config';
import { campaignRuleset, newCarry } from '@bollfort/campaign';

import type { LookChoices } from './looks.js';
import { DEFAULT_SETTINGS, type Setup } from './session.js';

/**
 * One campaign level for one person, started from the address (`?campaign=1&level=N&difficulty=`,
 * docs/CAMPAIGN.md CA1): a new campaign's carry, the level asked for (1 to 6, the first by
 * default) and its difficulty (Normal by default; the reserved ones too, for trying them).
 * The campaign's own screens and saves come with CA8.
 */
export function campaignLevelSetup(
  query: URLSearchParams,
  seed: number,
  name: string,
  styles: LookChoices,
): Setup {
  const asked = Number(query.get('level') ?? 1);
  const level = Number.isInteger(asked) && asked >= 1 && asked <= CAMPAIGN_LEVELS ? asked - 1 : 0;
  const named = query.get('difficulty') ?? 'normal';
  const difficulty: CampaignDifficulty = (CAMPAIGN_DIFFICULTIES as readonly string[]).includes(
    named,
  )
    ? (named as CampaignDifficulty)
    : 'normal';
  const { campaign, ruleset } = defaultConfigBundle;
  return {
    seats: [null],
    seed,
    styles,
    name,
    settings: DEFAULT_SETTINGS,
    ruleset: campaignRuleset(campaign, ruleset, {
      difficulty,
      level,
      players: 1,
      seed,
      carry: newCarry(campaign, difficulty, 1),
    }),
  };
}
