import { owesCastleChoice } from '../match.js';
import { legalCannonPlacements } from '../placement.js';
import { streamFor } from '../rng.js';
import type { Action, MatchState } from '../types.js';
import { fallbackCastle } from './coop.js';

/**
 * What a person away from a co-op level does now (docs/CAMPAIGN.md §13): their castle chosen and
 * their guns placed at once, as the clock's fallback would have done them, so the team does not
 * wait out a phase for someone who is not there. A campaign never gives their seat to a bot; their
 * guns stand silent and their teammates may build for them.
 *
 * Played by the room as the seat's own actions, so they are recorded and every page applies them
 * as any other: the choice needs only to be one the rules accept, and it is drawn from the seed so
 * that the same match makes the same one. Versus play's fallback (`autoFinishCannonPhase`) is not
 * touched, so neither are its matches.
 */
export function awayAction(state: MatchState, playerId: number): Action | null {
  if (state.campaign === null) return null;
  const player = state.players[playerId];
  if (player === undefined || player.eliminated) return null;
  if (state.phase !== 'castle_select' && state.phase !== 'cannon_place') return null;
  if (owesCastleChoice(player)) {
    const castle = fallbackCastle(state, player);
    if (castle !== null) return { kind: 'select_castle', player: playerId, castleId: castle.id };
  }
  if (state.phase !== 'cannon_place' || player.cannonsToPlace <= 0) return null;
  const spots = legalCannonPlacements(state, playerId);
  if (spots.length === 0) return null;
  const rng = streamFor(state.seed, `away:${state.round}:${playerId}:${player.cannonsToPlace}`);
  const spot = spots[rng.nextInt(spots.length)] as { x: number; y: number };
  return { kind: 'place_cannon', player: playerId, x: spot.x, y: spot.y };
}
