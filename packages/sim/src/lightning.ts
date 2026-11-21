import { variantConfig, variantOf, type LightningVariant, type TowerCost } from '@bollfort/config';

import { streamFor } from './rng.js';
import { stoneAt, strikeCandidates, strikeWall } from './shots.js';
import type { MatchState, Shot } from './types.js';

/**
 * The Lightning Tower's strike (the user's design, 2026-10-17; docs/SPECIAL_TOWERS.md): on the
 * tick it fires, the tile aimed at is struck, and then the bolt jumps `jumps` times, each time
 * from the last tile struck to a wall within `jumpRadius` of it — any live opponent's, so
 * where islands lie close it leaps the channel — or, with no such wall in reach or by its
 * `missChance`, to a tile at random in reach, from which it goes on all the same. Every
 * strike clears one tile as an ordinary shot does (`strikeWall`). A tile struck once is not
 * chosen again.
 *
 * The chance is the match's own and nobody else's: a stream of its own for every shot, from
 * the seed and the shot's id, so every client draws the same chain and nothing else's draws
 * move. The shot itself stays in the air for an ordinary shot's flight to the tile aimed at,
 * which is the tower's reload, and lands nothing (`resolveImpacts`).
 */
export function strikeLightning(state: MatchState, shot: Shot): void {
  const config = variantConfig(
    state.ruleset.specials,
    variantOf('lightning', shot.cost as TowerCost),
  ) as LightningVariant;
  const rng = streamFor(state.seed, `lightning:${shot.id}`);
  const { width, height } = state;
  const struck = new Set<number>();
  // Fortified Towers struck: each is drawn once a bolt at most, by any of its tiles.
  const struckStones = new Set<number>();
  const path: { x: number; y: number }[] = [];
  const destroyed: number[] = [];
  const strike = (x: number, y: number): void => {
    const i = y * width + x;
    struck.add(i);
    const stone = stoneAt(state, i);
    if (stone !== null) struckStones.add(stone.id);
    path.push({ x, y });
    if (strikeWall(state, shot.owner, i)) destroyed.push(i);
  };
  strike(shot.toX, shot.toY);

  const r = config.jumpRadius;
  const reach = Math.floor(r);
  for (let jump = 0; jump < config.jumps; jump++) {
    const from = path[path.length - 1] as { x: number; y: number };
    const tiles: number[] = [];
    for (let y = Math.max(0, from.y - reach); y <= Math.min(height - 1, from.y + reach); y++) {
      for (let x = Math.max(0, from.x - reach); x <= Math.min(width - 1, from.x + reach); x++) {
        const dx = x - from.x;
        const dy = y - from.y;
        if ((dx === 0 && dy === 0) || dx * dx + dy * dy > r * r) continue;
        const i = y * width + x;
        tiles.push(i);
      }
    }
    // An opponent's Fortified Tower draws a jump as one wall does, and takes no damage.
    const walls = strikeCandidates(
      state,
      shot.owner,
      tiles.filter((i) => !struck.has(i)),
      struckStones,
    );
    // Drawn every jump, missed or not, so a lever's change never shifts the draws after it.
    const missed = rng.nextFloat() < config.missChance;
    const pool = !missed && walls.length > 0 ? walls : tiles;
    if (pool.length === 0) break;
    const next = pool[rng.nextInt(pool.length)] as number;
    strike(next % width, Math.floor(next / width));
  }

  state.events.push({
    kind: 'lightning_struck',
    tick: state.tick,
    shotId: shot.id,
    owner: shot.owner,
    fromX: shot.fromX,
    fromY: shot.fromY,
    path,
    destroyed,
  });
}
