import {
  applyAction,
  drainEvents,
  step,
  type Action,
  type MatchEvent,
  type MatchState,
} from '@bollfort/sim';

import { TutorialDirector } from './director.js';
import { YOU } from './board.js';

/**
 * The tutorial's match, ticked as a local match is but with no bots: the director plays the
 * rival and holds the clocks, and stands between you and the rules (docs/TUTORIAL.md §5).
 * Never recorded, and no achievement but its own is counted from it (§6): it is a lesson, not
 * a match anyone played.
 */
export class TutorialMatch {
  readonly director: TutorialDirector;
  readonly humanPlayer = YOU;
  halted = false;
  private accumulator = 0;
  private readonly tickMs: number;
  private events: MatchEvent[] = [];

  constructor(readonly state: MatchState) {
    this.director = new TutorialDirector(state);
    this.tickMs = 1000 / state.ruleset.tickRateHz;
  }

  get tickFraction(): number {
    return Math.min(1, this.accumulator / this.tickMs);
  }

  get finished(): boolean {
    return this.state.phase === 'game_over';
  }

  /** Your move, if the script lets it through: refused ones never reach the rules. */
  submit(action: Action): void {
    if (this.halted || !this.director.allows(this.state, action)) return;
    applyAction(this.state, action);
  }

  /**
   * By real time, in the match's ticks; capped, as a local match's is, so a window left in the
   * background does not come back to a rush. A note stops it on the tick that brought it.
   */
  advance(elapsedMs: number): MatchEvent[] {
    // Held still while paused, or while a note of the tutorial's is read.
    if (this.halted || this.director.holding) return [];
    this.accumulator += Math.min(elapsedMs, 250);
    while (this.accumulator >= this.tickMs && !this.director.holding) {
      this.accumulator -= this.tickMs;
      this.tick();
    }
    const events = this.events;
    this.events = [];
    return events;
  }

  /** A note read: the match goes on. */
  continue(): void {
    this.director.continue(this.state);
  }

  /** One tick: the rival's moves and the clocks, the step, and what it brought. */
  tick(): void {
    if (this.finished) return;
    for (const action of this.director.before(this.state)) applyAction(this.state, action);
    step(this.state);
    const fresh = drainEvents(this.state);
    this.events.push(...fresh);
    this.director.after(this.state, fresh);
  }
}
