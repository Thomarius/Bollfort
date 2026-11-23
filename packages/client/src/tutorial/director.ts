import type { TextKey } from '@bollfort/config';
import {
  computeEnclosure,
  currentPieceId,
  findReadyCannon,
  holdingOf,
  legalCannonPlacements,
  pieceCells,
  streamFor,
  Structure,
  type Action,
  type MatchEvent,
  type MatchState,
} from '@bollfort/sim';

import { RIVAL, YOU, tileIndex } from './board.js';
import {
  TUTORIAL_LAYOUT,
  TUTORIAL_TIMING,
  TUTORIAL_TOWER,
  type Tile,
  type TutorialLayout,
} from './layout.js';

/**
 * The tutorial's script (docs/TUTORIAL.md §4–5): which step it is at, what its card says,
 * what is pointed at, the rival's moves, and which of yours are let through. Pure — the match
 * in, actions and cards out — so the whole tutorial is played through in a test
 * (`director.test.ts`) with no page.
 *
 * Two kinds of step. A **note** explains, and holds the match still until it is read and
 * Continue pressed (`holding`); a **task** lets the match run until it is done. On rails: a
 * move other than the task's is refused before it reaches the rules, and no phase ends on its
 * clock — the clocks are held well ahead and let go, the phase's end set to now, once the
 * task is done — but for the second build phase's, which runs out and into its overtime as in
 * any match. A task never stops for a note: what helps with it is a hint on its card.
 */

export type TutorialStep =
  // Before anything is asked: the stage set.
  | 'welcome'
  | 'island'
  | 'rules'
  // Round 1.
  | 'cannons'
  | 'fire'
  | 'turn'
  | 'corner'
  | 'sealed'
  | 'second'
  | 'secondSealed'
  | 'points'
  | 'resolving'
  | 'lifeLost'
  | 'waiting'
  // Round 2: Big Bertha.
  | 'tower'
  | 'lastCannon'
  | 'barrage'
  | 'repair'
  | 'countdown'
  | 'overtime'
  | 'out'
  | 'won'
  | 'done';

/** Where the camera should be: the whole board, or close on an island. */
export type TutorialCamera = 'board' | 'you' | 'rival';

/** One line of the round's points, worked out as the resolution will (`pointsAhead`). */
export interface PointsLine {
  label: TextKey;
  count: number;
  each: number;
}

export interface TutorialCard {
  kind: 'note' | 'task';
  title: TextKey;
  body: TextKey;
  /** A smaller line under a task: what helps with it. */
  hint?: TextKey;
  params?: Record<string, string | number>;
  /** A count towards the task. */
  progress?: { done: number; of: number };
  /** The round's points, line by line, and their total. */
  points?: { lines: readonly PointsLine[]; total: number };
}

interface StepSpec {
  kind: 'note' | 'task' | 'none';
  camera: TutorialCamera;
  /** Whether the card has a hint line. */
  hint?: boolean;
}

const STEPS: Record<TutorialStep, StepSpec> = {
  welcome: { kind: 'note', camera: 'board' },
  island: { kind: 'note', camera: 'you' },
  rules: { kind: 'note', camera: 'board' },
  cannons: { kind: 'task', camera: 'board' },
  fire: { kind: 'task', camera: 'board', hint: true },
  turn: { kind: 'task', camera: 'board' },
  corner: { kind: 'task', camera: 'board' },
  sealed: { kind: 'note', camera: 'board' },
  second: { kind: 'task', camera: 'board' },
  secondSealed: { kind: 'note', camera: 'board' },
  points: { kind: 'note', camera: 'you' },
  resolving: { kind: 'none', camera: 'rival' },
  lifeLost: { kind: 'note', camera: 'rival' },
  waiting: { kind: 'none', camera: 'board' },
  tower: { kind: 'task', camera: 'board', hint: true },
  lastCannon: { kind: 'task', camera: 'board' },
  barrage: { kind: 'task', camera: 'board', hint: true },
  repair: { kind: 'task', camera: 'board' },
  countdown: { kind: 'task', camera: 'board' },
  overtime: { kind: 'task', camera: 'board' },
  out: { kind: 'note', camera: 'rival' },
  won: { kind: 'note', camera: 'you' },
  done: { kind: 'none', camera: 'you' },
};

/** Where each note leads once read. */
const AFTER: Partial<Record<TutorialStep, TutorialStep>> = {
  welcome: 'island',
  island: 'rules',
  rules: 'cannons',
  sealed: 'second',
  secondSealed: 'points',
  points: 'resolving',
  lifeLost: 'waiting',
  out: 'won',
  won: 'done',
};

/** The tasks in which a piece is turned, for the hint by the cursor. */
const TURNING: ReadonlySet<TutorialStep> = new Set([
  'turn',
  'second',
  'repair',
  'countdown',
  'overtime',
]);

/** How far ahead of the match the clocks are held: well clear of the countdown's five seconds. */
const HELD_SECONDS = 60;

export class TutorialDirector {
  /** The step the tutorial is at. */
  step: TutorialStep = 'welcome';
  /** Ticks the match has taken under the director, its clock for what follows on time. */
  private now = 0;
  private since = 0;
  /** The rival's walls broken in this barrage. */
  private hits = 0;
  /** Which barrage it is: 0 the first, 1 the second. */
  private barrage = -1;
  /** The rival's shots fired in this barrage, and when the next is due. */
  private rivalFired = 0;
  private rivalDue = -1;
  /** The scripted shots' ids, as they are fired: the barrage waits for these to land. */
  private readonly scripted = new Set<number>();
  /** Where the rival's further shots go: the same every time, for the tests' sake. */
  private readonly aim = streamFor(TUTORIAL_LAYOUT.seed, 'tutorial:rival');
  /** The round's points as they will be banked, worked out as the clock runs out. */
  private points: { lines: PointsLine[]; total: number } | null = null;
  private readonly tickRate: number;

  constructor(
    state: MatchState,
    private readonly layout: TutorialLayout = TUTORIAL_LAYOUT,
    private readonly timing: typeof TUTORIAL_TIMING = TUTORIAL_TIMING,
  ) {
    this.tickRate = state.ruleset.tickRateHz;
  }

  private ticks(ms: number): number {
    return Math.ceil((ms * this.tickRate) / 1000);
  }

  private go(step: TutorialStep): void {
    this.step = step;
    this.since = this.now;
  }

  /** Whether the tutorial has played through, its last window due. */
  get finished(): boolean {
    return this.step === 'done';
  }

  /** Whether the match is held still for a note to be read. */
  get holding(): boolean {
    return STEPS[this.step].kind === 'note';
  }

  /** Whether the person's moves are open: only in a task, so no ghost hangs under a note. */
  get inputOpen(): boolean {
    return STEPS[this.step].kind === 'task';
  }

  /** Whether the cursor shows how a piece is turned, by mouse or controller. */
  get turnHint(): boolean {
    return TURNING.has(this.step);
  }

  /** A note read: on to what follows it. */
  continue(state: MatchState): void {
    if (!this.holding) return;
    const next = AFTER[this.step];
    if (next === undefined) return;
    if (next === 'points') this.points = pointsAhead(state);
    this.go(next);
  }

  /**
   * Before each tick the match takes: the rival's moves when they are due, and the phase's
   * clock held or let go.
   */
  before(state: MatchState): Action[] {
    const actions: Action[] = [];
    const hold = (): void => {
      state.phaseEndTick = Math.max(state.phaseEndTick, state.tick + HELD_SECONDS * this.tickRate);
    };
    switch (state.phase) {
      case 'cannon_place': {
        // The rival, after the life it lost: its castle again, and its guns wherever they go.
        const rival = state.players[RIVAL]!;
        if (!rival.eliminated && rival.startingCastleId === null) {
          const { x, y } = this.layout.rivalCastle;
          const castle = state.castles.find((c) => c.x === x && c.y === y);
          if (castle !== undefined) {
            actions.push({ kind: 'select_castle', player: RIVAL, castleId: castle.id });
          }
        } else if (rival.cannonsToPlace > 0) {
          const spot = legalCannonPlacements(state, RIVAL)[0];
          if (spot !== undefined) actions.push({ kind: 'place_cannon', player: RIVAL, ...spot });
        }
        hold();
        break;
      }
      case 'combat': {
        const shots = this.barrage === 0 ? this.layout.rivalShots : this.layout.rivalShotsAgain;
        // The script's shots first; then the rival keeps firing until the barrage ends (the
        // user's: a rival falling silent felt wrong), at random — in the first barrage only
        // where no wall stands, so the gaps the lesson needs are the only ones.
        if (this.now >= this.rivalDue) {
          const target = shots[this.rivalFired] ?? this.randomTarget(state);
          if (findReadyCannon(state, RIVAL, target.x, target.y) !== null) {
            actions.push({ kind: 'fire', player: RIVAL, x: target.x, y: target.y });
            this.rivalFired++;
            this.rivalDue = this.now + this.ticks(this.timing.rivalShotGapMs);
          }
        }
        const rivalDone =
          this.rivalFired >= shots.length &&
          this.scripted.size >= shots.length &&
          !state.shots.some((s) => this.scripted.has(s.id));
        const broken = this.hits >= (this.timing.wallsToBreak[this.barrage] ?? 0);
        if (rivalDone && broken) state.phaseEndTick = state.tick;
        else hold();
        break;
      }
      case 'build':
        this.building(state, hold);
        break;
      default:
        break;
    }
    return actions;
  }

  /**
   * The build phase's clock. Held while a task is open; the second's let run once a castle of
   * yours is sealed, into its overtime as in any match, and that held a moment short of its end.
   * Then, with the camera gone to the rival, let go: the round resolves where it is watched.
   */
  private building(state: MatchState, hold: () => void): void {
    if (this.step === 'countdown') return;
    if (this.step === 'overtime') {
      if (state.phaseEndTick - state.tick <= 1) {
        state.phaseEndTick = state.tick + 2;
        this.go('resolving');
      }
      return;
    }
    if (this.step === 'resolving') {
      if (this.now - this.since < this.ticks(this.timing.lookMs)) {
        state.phaseEndTick = state.tick + 2;
        return;
      }
      // The first round has had no overtime, and none is wanted now: the round resolves.
      state.overtime = true;
      state.phaseEndTick = state.tick;
      return;
    }
    hold();
  }

  /** After each tick, with its events: what they finish, and what follows on time. */
  after(state: MatchState, events: readonly MatchEvent[]): void {
    this.now++;
    const yours = state.players[YOU]!.islandId;
    const theirs = state.players[RIVAL]!.islandId;
    for (const event of events) {
      switch (event.kind) {
        case 'shot_impact':
          for (const i of event.destroyed) if (state.islandId[i] === theirs) this.hits++;
          break;
        case 'shot_fired': {
          const shots = this.barrage === 0 ? this.layout.rivalShots : this.layout.rivalShotsAgain;
          if (event.shot.owner === RIVAL && this.scripted.size < shots.length) {
            this.scripted.add(event.shot.id);
          }
          break;
        }
        case 'piece_placed':
          if (event.player !== YOU) break;
          if (this.step === 'turn') this.go('corner');
          else if (this.step === 'corner') this.go('sealed');
          else if (this.step === 'second') this.go('secondSealed');
          break;
        case 'cannon_placed':
          if (event.player === YOU && this.step === 'tower') this.go('lastCannon');
          break;
        case 'phase_changed':
          if (event.phase === 'combat') {
            this.barrage++;
            this.hits = 0;
            this.rivalFired = 0;
            this.scripted.clear();
            this.rivalDue = this.now + this.ticks(this.timing.rivalFirstShotMs);
            this.go(this.barrage === 0 ? 'fire' : 'barrage');
          }
          if (event.phase === 'build') this.go(this.barrage === 0 ? 'turn' : 'repair');
          if (event.phase === 'cannon_place' && this.step === 'waiting') this.go('tower');
          break;
        case 'player_continued':
          if (event.player !== RIVAL) break;
          this.go('lifeLost');
          // Big Bertha handed over for the cannon phase to come, and not before: the HUD speaks
          // of a player's tower in every cannon phase (§4, round 2).
          state.players[YOU]!.special = TUTORIAL_TOWER;
          break;
        case 'player_eliminated':
          if (event.player === RIVAL) this.go('out');
          break;
        default:
          break;
      }
    }
    // The second build phase: the clock runs from the first castle of yours sealed, and its
    // overtime follows it as in any match.
    if (this.step === 'repair' && state.castles.some((c) => c.islandId === yours && c.enclosed)) {
      state.phaseEndTick = state.tick + this.ticks(this.timing.countdownMs);
      this.go('countdown');
    }
    if (this.step === 'countdown' && state.overtime) this.go('overtime');
  }

  /**
   * A tile of your island for the rival's next shot beyond the script. In the first barrage one
   * where no wall stands, so the gaps the lesson needs are the only ones; in the second a wall
   * now and then (`rivalWallShare`), the repair being yours, though never so many that a new
   * player's island is wrecked: hitting at random, they took most of the main ring.
   */
  private randomTarget(state: MatchState): Tile {
    const island = state.players[YOU]!.islandId;
    const wall = this.barrage > 0 && this.aim.nextFloat() < this.timing.rivalWallShare;
    for (let tries = 0; tries < 400; tries++) {
      const i = this.aim.nextInt(state.islandId.length);
      if (state.islandId[i] !== island) continue;
      if ((state.structure[i] === Structure.Wall) !== wall) continue;
      return { x: i % state.width, y: Math.floor(i / state.width) };
    }
    return this.layout.mainCastle;
  }

  /** The tiles the next placement must fill, while a placement is the task. */
  private target(): readonly Tile[] | null {
    if (this.step === 'turn') return this.layout.sideGap;
    if (this.step === 'corner') return [this.layout.cornerGap];
    if (this.step === 'second') return this.layout.secondGap;
    return null;
  }

  /**
   * Whether one of your moves is let through to the rules: only the task's, and nothing while
   * a note is up. A piece goes into the gap of the moment, or anywhere once the repair is
   * yours; a gun where the rules allow it, and the tower alone where it is the task.
   */
  allows(state: MatchState, action: Action): boolean {
    if (!this.inputOpen) return false;
    switch (action.kind) {
      case 'fire':
        return state.phase === 'combat';
      case 'place_cannon':
        if (this.step === 'tower') return action.special === true;
        return this.step === 'cannons' || this.step === 'lastCannon';
      case 'place_piece': {
        if (this.step === 'repair' || this.step === 'countdown' || this.step === 'overtime') {
          return true;
        }
        const target = this.target();
        if (target === null) return false;
        const cells = pieceCells(currentPieceId(state, action.player), action.rotation).map(
          ([dx, dy]) => (action.y + dy) * state.width + action.x + dx,
        );
        const wanted = new Set(target.map((tile) => tileIndex(state, tile)));
        return cells.length === wanted.size && cells.every((i) => wanted.has(i));
      }
      default:
        return false;
    }
  }

  /** What the board points at: the gap to fill, or the gun outside the walls. */
  marks(state: MatchState): readonly Tile[] {
    const target = this.target();
    if (target !== null) return target;
    if (this.step === 'points') {
      const { x, y } = this.layout.idleCannon;
      const gun = state.cannons.find((c) => c.owner === YOU && c.x === x && c.y === y);
      if (gun === undefined) return [];
      const tiles: Tile[] = [];
      for (let oy = 0; oy < gun.h; oy++) {
        for (let ox = 0; ox < gun.w; ox++) tiles.push({ x: gun.x + ox, y: gun.y + oy });
      }
      return tiles;
    }
    return [];
  }

  /** The card for the moment, or none: while a phase's banner has the screen, or between. */
  card(state: MatchState): TutorialCard | null {
    const spec = STEPS[this.step];
    if (spec.kind === 'none') return null;
    if (spec.kind === 'task' && state.phase === 'intermission') return null;
    const key = `tutorial.${this.step}`;
    const params = this.params(state);
    const progress = this.progress(state);
    return {
      kind: spec.kind,
      title: `${key}.title` as TextKey,
      body: `${key}.body` as TextKey,
      ...(spec.hint === true ? { hint: `${key}.hint` as TextKey } : {}),
      ...(params === null ? {} : { params }),
      ...(progress === null ? {} : { progress }),
      ...(this.step === 'points' && this.points !== null ? { points: this.points } : {}),
    };
  }

  private progress(state: MatchState): { done: number; of: number } | null {
    if (this.step === 'cannons') {
      return { done: Math.max(0, 2 - state.players[YOU]!.cannonsToPlace), of: 2 };
    }
    if (this.step === 'fire' || this.step === 'barrage') {
      const of = this.timing.wallsToBreak[Math.max(0, this.barrage)] ?? 0;
      return { done: Math.min(of, this.hits), of };
    }
    return null;
  }

  private params(state: MatchState): Record<string, string | number> | null {
    switch (this.step) {
      case 'fire':
      case 'barrage':
        return { n: this.timing.wallsToBreak[Math.max(0, this.barrage)] ?? 0 };
      case 'secondSealed':
        return { seconds: Math.round(state.ruleset.phases.buildMs / 1000) };
      case 'tower':
        return { n: state.players[YOU]!.cannonsToPlace };
      case 'won':
        return { rounds: state.ruleset.scoring.maxRounds ?? 10 };
      default:
        return null;
    }
  }

  /** Where the camera should be for the moment. */
  camera(): TutorialCamera {
    return STEPS[this.step].camera;
  }

  /** Whether the win may be celebrated — fireworks and music: only once it is told. */
  get celebrating(): boolean {
    return this.step === 'won' || this.step === 'done';
  }

  /** Whether the clock is shown: only in the second build phase's countdown. */
  get clockShown(): boolean {
    return this.step === 'countdown';
  }
}

/**
 * The points your round is about to bank, line by line, as `scoreRound` will count them at the
 * resolution: the rival's walls broken, the ground sealed, the guns on it. Worked out before
 * the resolution, so they are explained while the board still holds still (§4).
 */
export function pointsAhead(state: MatchState): { lines: PointsLine[]; total: number } {
  const { scoring } = state.ruleset;
  const holding = holdingOf(state, YOU, computeEnclosure(state));
  const sealed = holding.castles > 0;
  const lines: PointsLine[] = [
    {
      label: 'tutorial.pointsWalls',
      count: state.players[YOU]!.wallsDestroyed,
      each: sealed || scoring.scoreDamageOnFailedRound ? scoring.wallPoints : 0,
    },
    { label: 'tutorial.pointsGround', count: sealed ? holding.tiles : 0, each: scoring.tilePoints },
    { label: 'tutorial.pointsGuns', count: sealed ? holding.guns : 0, each: scoring.gunPoints },
  ];
  return { lines, total: lines.reduce((sum, line) => sum + line.count * line.each, 0) };
}
