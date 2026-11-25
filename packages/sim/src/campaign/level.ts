import type { MatchEnd, MatchState } from '../types.js';

/**
 * The end of a campaign level (docs/CAMPAIGN.md §8.3, §9). A campaign is one team against the
 * fleet, so versus play's ending — one team left — would end it at its first resolution; here a
 * level ends only when it is survived or the team is out of lives.
 *
 * Every function here is reached only with `state.ruleset.campaign` present: versus play never
 * comes through this file.
 */

/**
 * Whether the level is survived, asked as the battle's intermission ends, its last shot down:
 * once the rounds played in it reach the level's limit. The fleet's threat falling below the
 * level's threshold joins this with the fleet (CA7).
 */
export function levelCleared(state: MatchState): boolean {
  const campaign = state.ruleset.campaign;
  if (campaign === undefined) return false;
  return state.round >= campaign.maxRounds;
}

/**
 * How the level ends at a resolution, if it does: lost once nobody is left in it, which is a
 * player failing with the team's lives spent (CAMPAIGN §9). Null while anyone plays on.
 */
export function levelEndAtResolution(state: MatchState): MatchEnd | null {
  return state.players.some((p) => !p.eliminated) ? null : 'level_lost';
}
