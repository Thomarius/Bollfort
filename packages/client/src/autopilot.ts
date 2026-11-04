import { Bot } from '@bollfort/ai';
import { Rng, type Action, type MatchState } from '@bollfort/sim';

import type { Vec } from './gamepad.js';

/** What the autopilot moves: the match's `Controls`. */
export interface Puppet {
  hoverTile: Vec | null;
  setRotation(rotation: number): void;
  setTowerChosen(chosen: boolean): void;
}

/** How long the ghost or the reticle takes to reach the bot's tile, and rests on it, by move. */
const MOVE_MS: Record<Action['kind'], number> = {
  select_castle: 600,
  place_piece: 260,
  place_cannon: 320,
  fire: 200,
};
/** How long it rests on the tile before the move is made: long over a castle, as people ponder. */
const DWELL_MS: Record<Action['kind'], number> = {
  select_castle: 2500,
  place_piece: 650,
  place_cannon: 450,
  fire: 160,
};

/**
 * The person's seat played by a bot, shown as a person plays it (`&autopilot=1`, dev only): for
 * the store's screenshots and trailer (STEAM.md §9.2), which want a player's view — the piece in
 * hand, the cannon's ghost, the reticle — rather than a watched match. The bot decides; the ghost
 * glides to its tile, turned as the bot turned it, rests a moment, and only then is the move made,
 * through the same `submit` a click uses.
 */
export class Autopilot {
  private readonly bot: Bot;
  private readonly rng: Rng;
  private move: {
    action: Action;
    from: Vec;
    to: Vec;
    startedAt: number;
  } | null = null;
  /** The tick thought on last, and the tick before which no new thought: a move landing. */
  private thought = -1;
  private quietUntil = -1;

  constructor(
    private readonly state: MatchState,
    player: number,
    private readonly puppet: Puppet,
    private readonly submit: (action: Action) => void,
  ) {
    this.bot = new Bot(player);
    this.rng = new Rng(state.seed ^ 0x5eed);
  }

  update(now: number): void {
    const move = this.move;
    if (move !== null) {
      const span = MOVE_MS[move.action.kind];
      const t = Math.min(1, (now - move.startedAt) / span);
      // Eased, as a hand slows onto its spot.
      const e = 1 - (1 - t) * (1 - t);
      this.puppet.hoverTile = {
        x: Math.round(move.from.x + (move.to.x - move.from.x) * e),
        y: Math.round(move.from.y + (move.to.y - move.from.y) * e),
      };
      // Said on the page, so the screenshot tool can take a piece in hand, at rest on its spot.
      this.mark(t < 1 ? 'moving' : `resting:${move.action.kind}`);
      if (now - move.startedAt >= span + DWELL_MS[move.action.kind]) {
        this.submit(move.action);
        this.move = null;
        // A few ticks for the move to land before the bot looks again, or it chooses it twice.
        this.quietUntil = this.state.tick + 3;
        this.mark('idle');
      }
      return;
    }
    const state = this.state;
    if (state.tick === this.thought || state.tick < this.quietUntil) return;
    this.thought = state.tick;
    const action = this.bot.think(state, this.rng);
    if (action === null) return;
    const to = this.tileOf(action);
    if (to === null) {
      this.submit(action);
      return;
    }
    if (action.kind === 'place_piece') this.puppet.setRotation(action.rotation);
    if (action.kind === 'place_cannon') this.puppet.setTowerChosen(action.special === true);
    this.move = { action, from: this.puppet.hoverTile ?? to, to, startedAt: now };
  }

  private marked = '';
  private mark(what: string): void {
    if (what === this.marked) return;
    this.marked = what;
    document.documentElement.dataset['autopilot'] = what;
  }

  private tileOf(action: Action): Vec | null {
    if (action.kind !== 'select_castle') return { x: action.x, y: action.y };
    const castle = this.state.castles.find((c) => c.id === action.castleId);
    return castle === undefined
      ? null
      : { x: castle.x + Math.floor(castle.w / 2), y: castle.y + Math.floor(castle.h / 2) };
  }
}
