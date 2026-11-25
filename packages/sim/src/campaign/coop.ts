import { Terrain, type Castle, type MatchState, type PlayerState } from '../types.js';

/**
 * Co-op on one map (docs/CAMPAIGN.md §6.1, CA10). A campaign's players are one team on one
 * island, island 1: its walls and its ground are the team's, and every player stands on it
 * (`createMatch` gives each of them island 1). What is still each player's own is their main
 * castle, chosen, and their guns; the castles sealed at a resolution are handed out among them
 * here, so each player is judged by the castles they hold, as versus play judges them by their
 * island's.
 *
 * One player is the same code with one holder: their main castle if sealed, else the nearest
 * sealed one, and every other sealed castle dealt to them — every sealed castle theirs, as
 * before co-op.
 *
 * Every function here is reached only in a campaign: versus play never comes through this file.
 */

/** Whether another player still in has this castle as their main castle. */
export function castleTaken(state: MatchState, castleId: number, playerId: number): boolean {
  return state.players.some(
    (p) => p.id !== playerId && !p.eliminated && p.startingCastleId === castleId,
  );
}

/** The castles a player may choose: their island's that no other player holds as their main. */
export function freeCastles(state: MatchState, player: PlayerState): Castle[] {
  return state.castles.filter(
    (c) => c.islandId === player.islandId && !castleTaken(state, c.id, player.id),
  );
}

/**
 * The castles a player may choose as they stand, in versus play or a campaign: their island's,
 * less a teammate's main castle in a campaign. What the client offers, so it never offers a castle
 * the match would refuse.
 */
export function choosableCastles(state: MatchState, player: PlayerState): Castle[] {
  return state.campaign === null
    ? state.castles.filter((c) => c.islandId === player.islandId)
    : freeCastles(state, player);
}

/**
 * The castle chosen for a player who did not choose: the free one nearest the middle of the land
 * (CAMPAIGN §6.1), ties to the lowest id. Integer arithmetic throughout: every distance is taken
 * from the land's sum of positions against the castle's middle scaled by the land's size, both
 * doubled, so no division is needed.
 */
export function fallbackCastle(state: MatchState, player: PlayerState): Castle | null {
  const free = freeCastles(state, player);
  if (free.length === 0) return null;
  let tiles = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < state.terrain.length; i++) {
    if (state.terrain[i] !== Terrain.Land) continue;
    tiles++;
    sumX += i % state.width;
    sumY += Math.floor(i / state.width);
  }
  let best: Castle | null = null;
  let bestDistance = Infinity;
  for (const castle of free) {
    const dx = (2 * castle.x + castle.w - 1) * tiles - 2 * sumX;
    const dy = (2 * castle.y + castle.h - 1) * tiles - 2 * sumY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = castle;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Who holds each sealed castle, by castle id: a player's id, or -1 for a castle unsealed or
 * nobody's (CAMPAIGN §6.1). In turn:
 *
 * 1. each player's main castle to them, if sealed;
 * 2. each player still without one, in seat order, takes the nearest sealed castle left, measured
 *    from their main castle;
 * 3. the sealed castles left are dealt one each in turn, the player with the fewest guns first
 *    (ties by seat), among the players holding one — each a castle's reward more for them.
 *
 * A player out, or still owing a choice after a continue, holds nothing. A player with nothing at
 * a resolution has failed (§9).
 */
export function castleHolders(state: MatchState, castleEnclosed: readonly boolean[]): number[] {
  const holders = state.castles.map(() => -1);
  const sealed = (castle: Castle): boolean => castleEnclosed[castle.id] === true;
  const byId = new Map(state.castles.map((c) => [c.id, c] as const));
  const indexOf = new Map(state.castles.map((c, index) => [c.id, index] as const));
  const playing = state.players.filter((p) => !p.eliminated && p.startingCastleId !== null);
  const holding = new Set<number>();

  for (const player of playing) {
    const main = byId.get(player.startingCastleId as number);
    if (main === undefined || !sealed(main)) continue;
    const index = indexOf.get(main.id) as number;
    if (holders[index] !== -1) continue;
    holders[index] = player.id;
    holding.add(player.id);
  }

  for (const player of playing) {
    if (holding.has(player.id)) continue;
    const main = byId.get(player.startingCastleId as number);
    if (main === undefined) continue;
    let best = -1;
    let bestDistance = Infinity;
    state.castles.forEach((castle, index) => {
      if (holders[index] !== -1 || !sealed(castle)) return;
      const distance = Math.abs(castle.x - main.x) + Math.abs(castle.y - main.y);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    if (best < 0) continue;
    holders[best] = player.id;
    holding.add(player.id);
  }

  if (holding.size === 0) return holders;
  const guns = new Map<number, number>();
  for (const cannon of state.cannons) guns.set(cannon.owner, (guns.get(cannon.owner) ?? 0) + 1);
  const turn = [...holding].sort((a, b) => (guns.get(a) ?? 0) - (guns.get(b) ?? 0) || a - b);
  let next = 0;
  state.castles.forEach((castle, index) => {
    if (holders[index] !== -1 || !sealed(castle)) return;
    holders[index] = turn[next % turn.length] as number;
    next++;
  });
  return holders;
}

/** The castles each player holds, by player id: `castleHolders` counted. */
export function heldCastles(state: MatchState, castleEnclosed: readonly boolean[]): number[] {
  const counts = state.players.map(() => 0);
  for (const holder of castleHolders(state, castleEnclosed)) {
    if (holder >= 0) counts[holder] = (counts[holder] as number) + 1;
  }
  return counts;
}
