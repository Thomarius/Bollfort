import { describe, expect, it } from 'vitest';
import {
  Structure,
  canPlacePiece,
  computeEnclosure,
  currentPieceId,
  legalCannonPlacements,
  pieceById,
  pieceCells,
  type MatchState,
} from '@bollfort/sim';

import { RIVAL, YOU, tileIndex, tutorialBoard } from './board.js';
import { TUTORIAL_LAYOUT, type Tile } from './layout.js';
import { TutorialMatch } from './session.js';
import { pointsAhead, type TutorialStep } from './director.js';

const NAMES = ['You', 'Rival'] as const;

/** The placement that fills exactly `target` with the piece held, as a person would find it. */
function placementInto(
  state: MatchState,
  target: readonly Tile[],
): { x: number; y: number; rotation: number } {
  const piece = currentPieceId(state, YOU);
  const wanted = new Set(target.map((t) => tileIndex(state, t)));
  for (let rotation = 0; rotation < 4; rotation++) {
    const cells = pieceCells(piece, rotation);
    for (const goal of target) {
      for (const [dx, dy] of cells) {
        const x = goal.x - dx;
        const y = goal.y - dy;
        const covered = cells.map(([cx, cy]) => (y + cy) * state.width + x + cx);
        if (covered.length === wanted.size && covered.every((i) => wanted.has(i))) {
          return { x, y, rotation };
        }
      }
    }
  }
  throw new Error('no placement fills the target');
}

/** Any placement of the piece held that fills one of `gaps`, as a free repair would. */
function placementOver(
  state: MatchState,
  gaps: readonly Tile[],
): { x: number; y: number; rotation: number } | null {
  const piece = currentPieceId(state, YOU);
  for (const gap of gaps) {
    if (state.structure[tileIndex(state, gap)] !== Structure.Empty) continue;
    for (let rotation = 0; rotation < 4; rotation++) {
      for (const [dx, dy] of pieceCells(piece, rotation)) {
        const x = gap.x - dx;
        const y = gap.y - dy;
        if (canPlacePiece(state, YOU, rotation, x, y) === null) return { x, y, rotation };
      }
    }
  }
  return null;
}

/** A rival wall tile still standing, for your next shot. */
function rivalWall(state: MatchState): Tile | null {
  const island = state.players[RIVAL]!.islandId;
  for (let i = 0; i < state.structure.length; i++) {
    if (state.structure[i] === Structure.Wall && state.islandId[i] === island) {
      return { x: i % state.width, y: Math.floor(i / state.width) };
    }
  }
  return null;
}

/** The main castle's ring tiles the rival's second barrage breaks. */
const MAIN_RING_HITS = TUTORIAL_LAYOUT.rivalShotsAgain.filter((t) => t.x <= 15 && t.y <= 16);

/** One tick of a prompt person: a note read at once, each task done as soon as it is set. */
function act(match: TutorialMatch): void {
  const { state, director } = match;
  if (director.holding) {
    match.continue();
    return;
  }
  const step = director.step;
  if (step === 'cannons' || step === 'lastCannon') {
    const spot = legalCannonPlacements(state, YOU)[0];
    if (spot !== undefined) match.submit({ kind: 'place_cannon', player: YOU, ...spot });
  }
  if (step === 'tower') {
    const spot = legalCannonPlacements(state, YOU)[0];
    if (spot !== undefined) {
      match.submit({ kind: 'place_cannon', player: YOU, ...spot, special: true });
    }
  }
  if (state.phase === 'combat') {
    const wall = rivalWall(state);
    if (wall !== null) match.submit({ kind: 'fire', player: YOU, ...wall });
  }
  const target =
    step === 'turn'
      ? TUTORIAL_LAYOUT.sideGap
      : step === 'corner'
        ? [TUTORIAL_LAYOUT.cornerGap]
        : step === 'second'
          ? TUTORIAL_LAYOUT.secondGap
          : null;
  if (target !== null && state.phase === 'build') {
    match.submit({ kind: 'place_piece', player: YOU, ...placementInto(state, target) });
  }
  if (step === 'repair' && state.phase === 'build') {
    const spot = placementOver(state, MAIN_RING_HITS);
    if (spot !== null) match.submit({ kind: 'place_piece', player: YOU, ...spot });
  }
}

/** Plays until `until` is reached or the tutorial ends; the steps in the order they came. */
function playThrough(
  match: TutorialMatch,
  until: TutorialStep = 'done',
  maxTicks = 30 * 60 * 10,
): { steps: TutorialStep[]; ticks: number } {
  const { director } = match;
  const steps: TutorialStep[] = [director.step];
  let ticks = 0;
  while (ticks < maxTicks && director.step !== until && !director.finished) {
    act(match);
    if (!director.holding) {
      match.tick();
      ticks++;
    }
    if (steps.at(-1) !== director.step) steps.push(director.step);
  }
  return { steps, ticks };
}

describe('the tutorial', () => {
  it('opens on the board its script is written for', () => {
    const state = tutorialBoard(NAMES);
    expect(state.phase).toBe('cannon_place');
    expect(state.players[YOU]!.cannonsToPlace).toBe(2);
    // Big Bertha comes in the second round, not before.
    expect(state.players[YOU]!.special).toBeNull();
    const main = state.castles.find((c) => c.x === 11 && c.y === 12)!;
    const second = state.castles.find((c) => c.x === 19 && c.y === 18)!;
    expect(main.enclosed).toBe(true);
    expect(second.enclosed).toBe(false);
    // The gun in the corner fires, the one in the open does not; the rival's three all do.
    const mine = state.cannons.filter((c) => c.owner === YOU);
    expect(mine.map((c) => c.active)).toEqual([true, false]);
    expect(state.cannons.filter((c) => c.owner === RIVAL && c.active)).toHaveLength(3);
    // The rival has two lives left, a continue and the life it plays.
    expect(state.teams[state.players[RIVAL]!.team]!.continuesRemaining).toBe(1);
    // The second castle's ring wants exactly the L the last piece is.
    for (const tile of TUTORIAL_LAYOUT.secondGap) {
      expect(state.structure[tileIndex(state, tile)]).toBe(Structure.Empty);
    }
  });

  it('plays through every step to your win, the rival out on its last life', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    const { steps } = playThrough(match);
    expect(steps).toEqual([
      'welcome',
      'island',
      'rules',
      'cannons',
      'fire',
      'reload',
      'firing',
      'silent',
      'firing',
      'underFire',
      'firing',
      'turn',
      'corner',
      'sealed',
      'reward',
      'second',
      'secondSealed',
      'clock',
      'points',
      'idleGun',
      'rivalFails',
      // 'resolving' comes and goes on one tick: the round resolves at once.
      'lifeLost',
      'waiting',
      'tower',
      'lastCannon',
      'bertha',
      'barrage',
      'repair',
      'countdown',
      'rivalFinal',
      'out',
      'won',
      'done',
    ]);
    const { state } = match;
    expect(state.phase).toBe('game_over');
    expect(state.winners).toEqual([YOU]);
    expect(state.players[RIVAL]!.eliminated).toBe(true);
    // Big Bertha stands among your guns.
    expect(state.cannons.some((c) => c.owner === YOU && c.kind === 'bertha')).toBe(true);
  });

  it('explains the round’s points as the resolution then banks them', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    playThrough(match, 'points');
    const card = match.director.card(match.state)!;
    expect(card.points).toBeDefined();
    const told = card.points!.total;
    // The walls, the ground and the guns each count, and the silent gun does not.
    expect(card.points!.lines.every((line) => line.count > 0 && line.each > 0)).toBe(true);
    expect(card.points!.lines[2]!.count).toBe(3);
    expect(pointsAhead(match.state).total).toBe(told);
    playThrough(match, 'lifeLost');
    expect(match.state.players[YOU]!.score).toBe(told);
    // Both your castles sealed, and three guns earned for them: two for the crowned one.
    const sealed = computeEnclosure(match.state).castleEnclosed;
    expect(match.state.castles.filter((c) => c.islandId === 1 && sealed[c.id]).length).toBe(2);
    expect(match.state.players[YOU]!.cannonsToPlace).toBe(3);
  });

  it('holds the match still while a note is read', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    expect(match.director.holding).toBe(true);
    const tick = match.state.tick;
    match.advance(5000);
    expect(match.state.tick).toBe(tick);
    match.continue();
    match.continue();
    match.continue();
    expect(match.director.step).toBe('cannons');
    match.advance(1000);
    expect(match.state.tick).toBeGreaterThan(tick);
  });

  it('is under three minutes of play for someone who does each task at once', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    const { ticks } = playThrough(match);
    expect(ticks / match.state.ruleset.tickRateHz).toBeLessThan(180);
  });

  it('lets a piece only into the gap of the moment, and a gun only as the task says', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    const { state, director } = match;
    // Nothing at all while a note is up.
    expect(director.allows(state, { kind: 'place_cannon', player: YOU, x: 9, y: 14 })).toBe(false);
    playThrough(match, 'turn');
    expect(pieceById(currentPieceId(state, YOU)).name).toBe('i2');
    // Lying down, as dealt, across the gap: refused. Elsewhere on your land: refused.
    const [top] = TUTORIAL_LAYOUT.sideGap;
    const piece = (x: number, y: number, rotation: number) =>
      director.allows(state, { kind: 'place_piece', player: YOU, x, y, rotation });
    expect(piece(top!.x, top!.y, 0)).toBe(false);
    expect(piece(4, 20, 1)).toBe(false);
    // Upright into the gap: let through, either way round.
    expect(piece(top!.x, top!.y, 1)).toBe(true);
    expect(piece(top!.x, top!.y, 3)).toBe(true);
    // A refused placement never reaches the rules.
    match.submit({ kind: 'place_piece', player: YOU, x: 4, y: 20, rotation: 1 });
    expect(state.structure[tileIndex(state, { x: 4, y: 20 })]).toBe(Structure.Empty);
    // Big Bertha first, when she is the task: an ordinary cannon is refused.
    playThrough(match, 'tower');
    expect(state.players[YOU]!.special).toBe('bertha2');
    const spot = legalCannonPlacements(state, YOU)[0]!;
    expect(director.allows(state, { kind: 'place_cannon', player: YOU, ...spot })).toBe(false);
    expect(
      director.allows(state, { kind: 'place_cannon', player: YOU, ...spot, special: true }),
    ).toBe(true);
  });

  it('breaks with the rival’s first barrage only the tiles it is meant to', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    const { state } = match;
    const before = Uint8Array.from(state.structure);
    playThrough(match, 'turn');
    const island = state.players[YOU]!.islandId;
    const lost: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if (
        state.islandId[i] === island &&
        before[i] === Structure.Wall &&
        state.structure[i] !== Structure.Wall
      )
        lost.push(i);
    }
    const expected = [...TUTORIAL_LAYOUT.sideGap, TUTORIAL_LAYOUT.cornerGap].map((t) =>
      tileIndex(state, t),
    );
    expect(lost.sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
  });

  it('shows the clock only in the second build phase’s countdown, and stops it short', () => {
    const match = new TutorialMatch(tutorialBoard(NAMES));
    const { state, director } = match;
    playThrough(match, 'countdown');
    expect(director.clockShown).toBe(true);
    const left = state.phaseEndTick - state.tick;
    expect(left / state.ruleset.tickRateHz).toBeGreaterThan(9);
    playThrough(match, 'rivalFinal');
    // Held at its end for the rival's failure to be told, the round not yet resolved.
    expect(state.phase).toBe('build');
    expect(director.clockShown).toBe(false);
  });
});
