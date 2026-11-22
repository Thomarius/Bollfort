import { defaultRuleset, type Ruleset, type TowerVariant } from '@bollfort/config';

/**
 * The tutorial's board (docs/TUTORIAL.md §3): a two-player map from a fixed seed, and the
 * places on it the script works with. Every place is checked against the map the seed makes
 * (`director.test.ts`), so a change to the terrain generator that moves a castle fails there
 * rather than leaving the tutorial pointing at sea.
 *
 * You are player 0, on the west island; the rival is player 1, its mirror image to the east.
 */

export interface Tile {
  x: number;
  y: number;
}

export interface TutorialLayout {
  seed: number;
  /** Top-left tiles of the castles: your main castle, your second one, the rival's. */
  mainCastle: Tile;
  secondCastle: Tile;
  rivalCastle: Tile;
  /** Your gun in the corner of the main castle's ring, beside the corner the rival breaks. */
  cornerCannon: Tile;
  /** Your gun out in the open between the two rings, which never fires (§3). */
  idleCannon: Tile;
  /** The rival's three guns, inside its ring. */
  rivalCannons: readonly Tile[];
  /** The tiles the rival's shots break: the long gap's two, then the corner. */
  sideGap: readonly Tile[];
  cornerGap: Tile;
  /** What is missing of the second castle's ring: an L, its corner and both arms. */
  secondGap: readonly Tile[];
  /**
   * The rival's shots in order, at your island: the three that break the gaps and four for
   * show — the keep, the sea, a gun and bare ground — which break nothing (§4, round 1).
   */
  rivalShots: readonly Tile[];
  /** The rival's shots in the second barrage: four walls, the repair left to you (§4, round 2). */
  rivalShotsAgain: readonly Tile[];
}

export const TUTORIAL_LAYOUT: TutorialLayout = {
  seed: 1,
  mainCastle: { x: 11, y: 12 },
  secondCastle: { x: 19, y: 18 },
  rivalCastle: { x: 41, y: 12 },
  // The ring round the main castle runs from (8, 9) to (15, 16): the corner the rival breaks
  // is its north-east one, so the gun sits in the interior's north-east corner.
  cornerCannon: { x: 13, y: 10 },
  idleCannon: { x: 17, y: 11 },
  rivalCannons: [
    { x: 39, y: 10 },
    { x: 39, y: 14 },
    { x: 43, y: 14 },
  ],
  // On the east side, which faces the rival, so its shots come straight at it. Upright, so the
  // two-block piece, dealt lying down, has to be turned (task 3).
  sideGap: [
    { x: 15, y: 12 },
    { x: 15, y: 13 },
  ],
  cornerGap: { x: 15, y: 9 },
  // The south-east corner of the ring from (16, 15) to (23, 22): the L, dealt with its corner
  // top-left, fits only turned half round — the same either way the wheel turns (task 5).
  secondGap: [
    { x: 23, y: 22 },
    { x: 22, y: 22 },
    { x: 23, y: 21 },
  ],
  rivalShots: [
    { x: 11, y: 12 }, // the keep: castles never break
    { x: 15, y: 12 },
    { x: 26, y: 8 }, // the sea
    { x: 15, y: 9 },
    { x: 13, y: 10 }, // the corner gun: guns never break
    { x: 15, y: 13 },
    { x: 20, y: 13 }, // bare ground
  ],
  rivalShotsAgain: [
    { x: 11, y: 9 },
    { x: 8, y: 13 },
    { x: 12, y: 16 },
    { x: 23, y: 18 },
  ],
};

/** The tower the second round brings in: Big Bertha at two cannons (§4, round 2; the user's). */
export const TUTORIAL_TOWER: TowerVariant = 'bertha2';

/** The pieces dealt in the build phase, in the order the tasks need them (§4, tasks 3–5). */
export const TUTORIAL_PIECES = ['i2', 'i1', 'l3'] as const;

/** How the tutorial is paced, in milliseconds of play: nothing here is a rule of the game. */
export const TUTORIAL_TIMING = {
  /** The rival's walls to break before each barrage may end: more the second time, with Bertha. */
  wallsToBreak: [9, 14],
  /** Into the barrage before the rival's first shot, and between its shots. */
  rivalFirstShotMs: 2500,
  rivalShotGapMs: 1600,
  /** Into the first barrage before the silent gun is pointed out. */
  silentAfterMs: 4000,
  /** The second build phase's clock, once a castle of yours is sealed (§4, round 2). */
  countdownMs: 10000,
} as const;

/**
 * The default rules, with the tutorial's pieces dealt, no overtime — the tutorial ends each
 * build phase itself (§5) — and the special towers on, for Big Bertha in the second round. The
 * clocks are held by the tutorial, not changed here, so the rules a new player learns are the
 * real ones.
 */
export function tutorialRuleset(base: Ruleset = defaultRuleset): Ruleset {
  return {
    ...base,
    specials: { ...base.specials, enabled: true },
    build: { ...base.build, overtimeMs: 0, pieceScript: [...TUTORIAL_PIECES] },
  };
}
