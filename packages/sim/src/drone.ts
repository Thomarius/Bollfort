import type { DroneVariant, TowerCost } from '@bollfort/config';

import { isAwake } from './lullaby.js';
import { distanceSquared } from './math.js';
import { streamFor } from './rng.js';
import { cannonCentreX, cannonCentreY, newShot, strikable } from './shots.js';
import { circleOffsets, isLoaded } from './specials.js';
import type { Cannon, MatchState } from './types.js';

/**
 * The Drone Tower (the user's design, 2026-11-20, a trial; docs/SPECIAL_TOWERS.md §2.10): no
 * click fires it. Whenever one of its barrels is loaded, it is awake and active, and its last
 * launch is `launchGapMs` past, it launches at a wall drawn at random within `radius` of its
 * owner's last shot (`droneAnchor`) — any its owner may strike, less the tiles their shots are
 * already flying to. With none, it holds fire. The shot flies as a cannon's from the tower,
 * times `flightFactor`, and lands as any.
 */

/** A Drone Tower's levers at this cost. */
export function droneOf(state: MatchState, cost: number): DroneVariant {
  const drone = state.ruleset.specials.drone?.[cost as TowerCost];
  if (drone === undefined) throw new Error(`no drone at cost ${cost} in this ruleset`);
  return drone;
}

/**
 * The walls a Drone Tower's next missile may be drawn from, in row order: those within the
 * radius of the anchor that its owner may strike, in range, and no shot of its owner's already
 * flying to. Empty where there is no anchor. Pure, so the client and the tests can ask it.
 */
export function droneTargets(state: MatchState, cannon: Cannon): number[] {
  const anchor = state.players[cannon.owner]?.droneAnchor;
  if (anchor === undefined) return [];
  const taken = new Set<number>();
  for (const shot of state.shots) {
    if (shot.owner === cannon.owner) taken.add(shot.toY * state.width + shot.toX);
  }
  const ax = anchor % state.width;
  const ay = (anchor - ax) / state.width;
  const maxRange = state.ruleset.shots.maxRangeTiles;
  const out: number[] = [];
  for (const [dx, dy] of circleOffsets(droneOf(state, cannon.cost).radius)) {
    const x = ax + dx;
    const y = ay + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    const i = y * state.width + x;
    if (taken.has(i) || !strikable(state, cannon.owner, i)) continue;
    if (
      maxRange !== null &&
      distanceSquared(cannonCentreX(cannon), cannonCentreY(cannon), x, y) > maxRange * maxRange
    ) {
      continue;
    }
    out.push(i);
  }
  return out;
}

/** Whether this tower launched within its `launchGapMs`: a launch that recent is still in the air. */
function launchedLately(state: MatchState, cannon: Cannon): boolean {
  const gapMs = droneOf(state, cannon.cost).launchGapMs;
  const gap = Math.ceil((gapMs * state.ruleset.tickRateHz) / 1000);
  for (const shot of state.shots) {
    if (shot.cannonId === cannon.id && shot.launchTick > state.tick - gap) return true;
  }
  return false;
}

/**
 * Launches every Drone Tower that may, one missile a tower a tick, players in seat order and each
 * one's towers by id. Called once a tick in combat after the tick's actions, so a click and a
 * launch on one tick see the new anchor, and never on the barrage's last tick, on which no click
 * can fire either. The draw comes from a stream of its own for every shot, by the shot's id.
 */
export function launchDrones(state: MatchState): void {
  if (state.phase !== 'combat' || state.tick >= state.phaseEndTick) return;
  if (state.ruleset.specials.drone === undefined) return;
  for (const player of state.players) {
    if (player.eliminated || player.droneAnchor === undefined) continue;
    for (const cannon of state.cannons) {
      if (cannon.owner !== player.id || cannon.kind !== 'drone') continue;
      if (!cannon.active || !isLoaded(cannon) || !isAwake(state, cannon)) continue;
      if (launchedLately(state, cannon)) continue;
      const targets = droneTargets(state, cannon);
      if (targets.length === 0) continue;
      const rng = streamFor(state.seed, `drone:${state.nextShotId}`);
      const tile = targets[rng.nextInt(targets.length)] as number;
      const x = tile % state.width;
      const shot = newShot(state, cannon, x, (tile - x) / state.width);
      cannon.shotIds.push(shot.id);
      state.shots.push(shot);
      state.events.push({ kind: 'shot_fired', tick: state.tick, shot });
    }
  }
}
