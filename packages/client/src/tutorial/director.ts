import type { TextKey } from '@bollfort/config';
import {
  computeEnclosure,
  currentPieceId,
  findReadyCannon,
  holdingOf,
  legalCannonPlacements,
  pieceCells,
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
 * task is done — but for the second build phase's countdown, which is the clock shown.
 */

export type TutorialStep =
  // Before anything is asked: the stage set.
  | 'welcome'
  | 'island'
  | 'rules'
  // Round 1.
  | 'cannons'
  | 'fire'
  | 'reload'
  | 'firing'
  | 'silent'
  | 'underFire'
  | 'turn'
  | 'corner'
  | 'sealed'
  | 'reward'
  | 'second'
  | 'secondSealed'
  | 'clock'
  | 'points'
  | 'idleGun'
  | 'rivalFails'
  | 'resolving'
  | 'lifeLost'
  | 'waiting'
  // Round 2: Big Bertha.
  | 'tower'
  | 'lastCannon'
  | 'bertha'
  | 'barrage'
  | 'repair'
  | 'countdown'
  | 'rivalFinal'
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
  /** The body for a controller, where the words name a button. */
  padBody?: TextKey;
  params?: Record<string, string | number>;
  /** A count towards the task. */
  progress?: { done: number; of: number };
  /** The round's points, line by line, and their total. */
  points?: { lines: readonly PointsLine[]; total: number };
}

interface StepSpec {
  kind: 'note' | 'task' | 'none';
  camera: TutorialCamera;
  /** Whether its words name a button, and so have a controller's version. */
  pad?: boolean;
}

const STEPS: Record<TutorialStep, StepSpec> = {
  welcome: { kind: 'note', camera: 'board' },
  island: { kind: 'note', camera: 'you' },
  rules: { kind: 'note', camera: 'board' },
  cannons: { kind: 'task', camera: 'board' },
  fire: { kind: 'task', camera: 'board', pad: true },
  reload: { kind: 'note', camera: 'board' },
  firing: { kind: 'task', camera: 'board' },
  silent: { kind: 'note', camera: 'board' },
  underFire: { kind: 'note', camera: 'board' },
  turn: { kind: 'task', camera: 'board', pad: true },
  corner: { kind: 'task', camera: 'board' },
  sealed: { kind: 'note', camera: 'board' },
  reward: { kind: 'note', camera: 'board' },
  second: { kind: 'task', camera: 'board' },
  secondSealed: { kind: 'note', camera: 'board' },
  clock: { kind: 'note', camera: 'board' },
  points: { kind: 'note', camera: 'you' },
  idleGun: { kind: 'note', camera: 'you' },
  rivalFails: { kind: 'note', camera: 'rival' },
  resolving: { kind: 'none', camera: 'rival' },
  lifeLost: { kind: 'note', camera: 'rival' },
  waiting: { kind: 'none', camera: 'board' },
  tower: { kind: 'task', camera: 'board', pad: true },
  lastCannon: { kind: 'task', camera: 'board' },
  bertha: { kind: 'note', camera: 'board' },
  barrage: { kind: 'task', camera: 'board' },
  repair: { kind: 'task', camera: 'board' },
  countdown: { kind: 'task', camera: 'board' },
  rivalFinal: { kind: 'note', camera: 'rival' },
  out: { kind: 'note', camera: 'rival' },
  won: { kind: 'note', camera: 'you' },
  done: { kind: 'none', camera: 'you' },
};

/** Where each note leads once read; the notes not here go back to the task they interrupted. */
const AFTER: Partial<Record<TutorialStep, TutorialStep>> = {
  welcome: 'island',
  island: 'rules',
  rules: 'cannons',
  reload: 'firing',
  sealed: 'reward',
  reward: 'second',
  secondSealed: 'clock',
  clock: 'points',
  points: 'idleGun',
  idleGun: 'rivalFails',
  rivalFails: 'resolving',
  lifeLost: 'waiting',
  bertha: 'barrage',
  rivalFinal: 'resolving',
  out: 'won',
  won: 'done',
};

/** How far ahead of the match the clocks are held: well clear of the countdown's five seconds. */
const HELD_SECONDS = 60;

export class TutorialDirector {
  /** The step the tutorial is at. */
  step: TutorialStep = 'welcome';
  /** The task a note interrupted, to go back to once it is read. */
  private resume: TutorialStep = 'firing';
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
  /** Whether a shot of the rival's has broken a wall of yours. */
  private hitBack = false;
  /** Every step reached so far. */
  private readonly seen = new Set<TutorialStep>(['welcome']);
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
    if (STEPS[this.step].kind === 'task' && STEPS[step].kind === 'note') this.resume = this.step;
    this.step = step;
    this.since = this.now;
    this.seen.add(step);
  }

  /** Whether the tutorial has played through, its last window due. */
  get finished(): boolean {
    return this.step === 'done';
  }

  /** Whether the match is held still for a note to be read. */
  get holding(): boolean {
    return STEPS[this.step].kind === 'note';
  }

  /** A note read: on to what follows it. */
  continue(state: MatchState): void {
    if (!this.holding) return;
    const next = AFTER[this.step] ?? this.resume;
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
    const release = (): void => {
      state.phaseEndTick = state.tick;
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
        if (this.rivalFired < shots.length && this.now >= this.rivalDue) {
          const target = shots[this.rivalFired]!;
          if (findReadyCannon(state, RIVAL, target.x, target.y) !== null) {
            actions.push({ kind: 'fire', player: RIVAL, x: target.x, y: target.y });
            this.rivalFired++;
            this.rivalDue = this.now + this.ticks(this.timing.rivalShotGapMs);
          }
        }
        const rivalDone =
          this.rivalFired >= shots.length && !state.shots.some((s) => s.owner === RIVAL);
        const broken = this.hits >= (this.timing.wallsToBreak[this.barrage] ?? 0);
        const told = this.barrage > 0 || (this.seen.has('silent') && this.seen.has('underFire'));
        const working = this.step === 'firing' || this.step === 'barrage';
        if (working && broken && rivalDone && told) release();
        else hold();
        break;
      }
      case 'build':
        if (this.step === 'resolving') release();
        else if (this.step === 'countdown') {
          // The clock shown runs down, and stops a moment short of its end for the rival's
          // failure to be told before the round resolves.
          if (state.phaseEndTick - state.tick <= 2) {
            state.phaseEndTick = state.tick + 2;
            this.go('rivalFinal');
          }
        } else hold();
        break;
      default:
        break;
    }
    return actions;
  }

  /** After each tick, with its events: what they finish, and what follows on time. */
  after(state: MatchState, events: readonly MatchEvent[]): void {
    this.now++;
    const yours = state.players[YOU]!.islandId;
    const theirs = state.players[RIVAL]!.islandId;
    for (const event of events) {
      switch (event.kind) {
        case 'shot_impact':
          for (const i of event.destroyed) {
            if (state.islandId[i] === theirs) this.hits++;
            else if (state.islandId[i] === yours) this.hitBack = true;
          }
          break;
        case 'shot_fired':
          if (event.shot.owner === YOU && this.step === 'fire') this.go('reload');
          break;
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
            this.rivalDue = this.now + this.ticks(this.timing.rivalFirstShotMs);
            this.go(this.barrage === 0 ? 'fire' : 'bertha');
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
    // In the first barrage, the rival's hit as soon as it has landed, and the silent gun once
    // you have been firing a while.
    if (this.step === 'fire' || this.step === 'firing') {
      if (this.hitBack && !this.seen.has('underFire')) this.go('underFire');
      else if (
        this.step === 'firing' &&
        !this.seen.has('silent') &&
        this.now - this.since >= this.ticks(this.timing.silentAfterMs)
      ) {
        this.go('silent');
      }
    }
    // The second build phase: the clock runs from the first castle of yours sealed.
    if (this.step === 'repair' && state.castles.some((c) => c.islandId === yours && c.enclosed)) {
      state.phaseEndTick = state.tick + this.ticks(this.timing.countdownMs);
      this.go('countdown');
    }
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
    if (STEPS[this.step].kind !== 'task') return false;
    switch (action.kind) {
      case 'fire':
        return state.phase === 'combat';
      case 'place_cannon':
        if (this.step === 'tower') return action.special === true;
        return this.step === 'cannons' || this.step === 'lastCannon';
      case 'place_piece': {
        if (this.step === 'repair' || this.step === 'countdown') return true;
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
    if (this.step === 'silent' || this.step === 'idleGun') {
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
      ...(spec.pad === true ? { padBody: `${key}.padBody` as TextKey } : {}),
      ...(params === null ? {} : { params }),
      ...(progress === null ? {} : { progress }),
      ...(this.step === 'points' && this.points !== null ? { points: this.points } : {}),
    };
  }

  private progress(state: MatchState): { done: number; of: number } | null {
    if (this.step === 'cannons') {
      return { done: Math.max(0, 2 - state.players[YOU]!.cannonsToPlace), of: 2 };
    }
    if (this.step === 'fire' || this.step === 'firing' || this.step === 'barrage') {
      const of = this.timing.wallsToBreak[Math.max(0, this.barrage)] ?? 0;
      return { done: Math.min(of, this.hits), of };
    }
    return null;
  }

  private params(state: MatchState): Record<string, string | number> | null {
    switch (this.step) {
      case 'fire':
      case 'firing':
      case 'barrage':
        return { n: this.timing.wallsToBreak[Math.max(0, this.barrage)] ?? 0 };
      case 'clock':
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
