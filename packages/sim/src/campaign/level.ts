import { SHIP_KINDS } from '@bollfort/config';

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
 * The fleet's threat (CAMPAIGN §8.3): every ship still to come, waiting in the wave or afloat,
 * by its kind's weight, and the grunts on land, less the team's guns. Every gun counts against
 * it, so a well-armed team finishes a level sooner.
 */
export function threat(state: MatchState): number {
  const rules = state.ruleset.campaign;
  const fleet = state.campaign;
  if (rules === undefined || fleet === null) return 0;
  const weights = rules.fleet.weights;
  let total = 0;
  SHIP_KINDS.forEach((kind, k) => {
    const afloat = fleet.ships.filter((s) => s.kind === kind).length;
    total +=
      (weights[k] as number) * ((fleet.pool[k] as number) + (fleet.wave[k] as number) + afloat);
  });
  return (
    total +
    rules.threat.perGrunt * fleet.grunts.length -
    rules.threat.perCannon * state.cannons.length
  );
}

/**
 * Whether the level is survived, asked as the battle's intermission ends, its last shot down:
 * once the fleet's threat has fallen below the level's threshold, or the rounds played in it
 * reach the level's limit, so no level is endless (CAMPAIGN §8.3).
 */
export function levelCleared(state: MatchState): boolean {
  const campaign = state.ruleset.campaign;
  if (campaign === undefined) return false;
  return state.round >= campaign.maxRounds || threat(state) < campaign.threshold;
}

/**
 * How the level ends at a resolution, if it does: lost once nobody is left in it, which is a
 * player failing with the team's lives spent (CAMPAIGN §9). Null while anyone plays on.
 */
export function levelEndAtResolution(state: MatchState): MatchEnd | null {
  return state.players.some((p) => !p.eliminated) ? null : 'level_lost';
}
