import { defaultTerrainConfig } from '@bollfort/config';
import {
  Structure,
  applyAction,
  applyEnclosure,
  drainEvents,
  createMatch,
  footprintOf,
  startingRingTiles,
  step,
  type Action,
  type Castle,
  type MatchState,
  type Phase,
} from '@bollfort/sim';

import { TUTORIAL_LAYOUT, tutorialRuleset, type Tile, type TutorialLayout } from './layout.js';

/** You, and the rival. */
export const YOU = 0;
export const RIVAL = 1;

/** A tile's index on the board. */
export function tileIndex(state: Pick<MatchState, 'width'>, tile: Tile): number {
  return tile.y * state.width + tile.x;
}

function castleAt(state: MatchState, at: Tile): Castle {
  const castle = state.castles.find((c) => c.x === at.x && c.y === at.y);
  if (castle === undefined) throw new Error(`the tutorial's map has no castle at ${at.x},${at.y}`);
  return castle;
}

function act(state: MatchState, action: Action): void {
  const refused = applyAction(state, action);
  if (refused !== null) throw new Error(`the tutorial's board: ${action.kind} refused, ${refused}`);
}

/**
 * The board the tutorial opens on (docs/TUTORIAL.md §3), in the cannon phase of the first
 * round: your main castle sealed with a gun in its corner and two guns still to place, a second
 * castle walled but for two blocks of its east side, a gun out in the open; the rival's castle sealed, three guns in
 * it, and two lives left.
 *
 * Played up to there by the rules wherever they allow it — the castles chosen and the guns
 * placed as actions, so the rings and the guns are the game's own — and written in only where
 * they cannot be: the second ring, which no rule builds, and the gun outside every wall, which
 * no rule places. Its events are drained, so the screen starts on the board as it stands.
 */
export function tutorialBoard(
  names: readonly [string, string],
  layout: TutorialLayout = TUTORIAL_LAYOUT,
): MatchState {
  const ruleset = tutorialRuleset();
  const state = createMatch({
    seed: layout.seed,
    ruleset,
    terrainConfig: defaultTerrainConfig,
    players: [
      // No tower yet: Big Bertha is handed over in round 2 (`TutorialDirector`), since the HUD
      // speaks of a player's tower in every cannon phase.
      { name: names[0], isBot: false, team: 0 },
      { name: names[1], isBot: true, team: 1 },
    ],
  });
  while (state.phase !== 'castle_select') step(state);
  act(state, {
    kind: 'select_castle',
    player: YOU,
    castleId: castleAt(state, layout.mainCastle).id,
  });
  act(state, {
    kind: 'select_castle',
    player: RIVAL,
    castleId: castleAt(state, layout.rivalCastle).id,
  });
  // Asked afresh each time: `step` moves the phase on, which the type cannot see.
  const phase = (): Phase => state.phase;
  while (phase() !== 'cannon_place') step(state);
  for (const gun of layout.rivalCannons) {
    act(state, { kind: 'place_cannon', player: RIVAL, x: gun.x, y: gun.y });
  }
  act(state, { kind: 'place_cannon', player: YOU, ...layout.cornerCannon });

  // The second castle's ring, all but the two blocks the S fills.
  const island = state.players[YOU]!.islandId;
  const gap = new Set(layout.secondGap.map((tile) => tileIndex(state, tile)));
  for (const i of startingRingTiles(state, castleAt(state, layout.secondCastle))) {
    if (gap.has(i)) continue;
    state.structure[i] = Structure.Wall;
    state.owner[i] = island;
  }
  // The gun outside every wall, as a gun left behind by a wall since lost would stand.
  const [w, h] = footprintOf(ruleset, 'cannon', 1);
  const { x, y } = layout.idleCannon;
  state.cannons.push({
    id: state.nextCannonId++,
    owner: YOU,
    kind: 'cannon',
    cost: 1,
    x,
    y,
    w,
    h,
    active: false,
    shotIds: [],
  });
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      const i = (y + oy) * state.width + x + ox;
      state.structure[i] = Structure.Cannon;
      state.owner[i] = island;
    }
  }
  // The rival's last two lives: one lost in each round, the second ending the match (§4).
  state.teams[state.players[RIVAL]!.team]!.continuesRemaining = 1;
  applyEnclosure(state);
  drainEvents(state);
  return state;
}
