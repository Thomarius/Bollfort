import { cheapestPlanFor } from '@bollwerk/ai';
import { Structure, type MatchState } from '@bollwerk/sim';

import type { Cell } from './render/theme.js';

/**
 * What a player's wall still lacked as a round was lost (ARCHIVE 15ze): the empty tiles of the
 * tightest wall that would have sealed one of their castles — the bots' own measure, the one the
 * statistics call `repairLeft` — so the round's end shows where it leaked, not only that it did.
 * `state` is the board as it stood before the resolution wiped it, which the screen still has
 * as it last drew it. Empty where no wall at all could seal one.
 */
export function leakCells(state: MatchState, player: number): Cell[] {
  const plan = cheapestPlanFor(state, player, 1, 1);
  if (plan === null) return [];
  return plan.tiles
    .filter((i) => state.structure[i] === Structure.Empty)
    .map((i) => ({ x: i % state.width, y: Math.floor(i / state.width) }));
}
