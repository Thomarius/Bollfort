import { owesCastleChoice, type MatchState } from '@bollfort/sim';

import { inputMode, type InputMode } from './controls.js';
import {
  Repeater,
  heading,
  moveCursor,
  nearestInDirection,
  stepTile,
  type GamepadTuning,
  type PadAction,
  type PadReading,
  type Vec,
} from './gamepad.js';

/** What the pad steers: the match's `Controls`, or a test's stand-in. */
export interface Steerable {
  hoverTile: Vec | null;
  /** The left button's action at the tile hovered. */
  accept(): void;
  /** The right button's action. */
  turn(): void;
}

/**
 * The match played with a controller (STEAM.md §8): the same moves the mouse makes, steered
 * the way a pad steers.
 *
 * - **Build and cannon phases**: no cursor; the ghost moves a grid position a press, repeating
 *   while held. Accept places, Turn turns the piece or switches to the tower.
 * - **Choosing a castle**: the direction pushed jumps to the next castle that way.
 * - **Combat**: a free reticle, faster the further the stick is pushed, faster still while
 *   Turn is held. Accept fires.
 *
 * A phase's ghost starts at the player's island's centre, where the mouse's would; the reticle
 * starts each combat over the player's own island, then stays where it was left. With the
 * mouse in use this does nothing, so whichever was touched last is the one that steers.
 */
export class PadMatch {
  private readonly repeater: Repeater;
  /** The phase and mode last seen, to know when a new one starts. */
  private key = '';
  private mode: InputMode = 'none';
  /** Whether the ghost has been put at its start for this phase. */
  private placed = false;
  /** The reticle, in tiles, fractional; kept across combat phases' ends only by `aim`. */
  private cursor: Vec | null = null;
  /** The castle chosen while choosing one, by id. */
  private castle: number | null = null;

  constructor(
    private readonly state: MatchState,
    private readonly player: number,
    /** The player's island's centre, in tiles. */
    private readonly home: Vec,
    private readonly steer: Steerable,
    private readonly tuning: GamepadTuning,
  ) {
    this.repeater = new Repeater(tuning);
  }

  /** The reticle where it stands, in tiles, for drawing it between tiles; null outside combat. */
  get reticle(): Vec | null {
    return this.mode === 'fire' || this.mode === 'aim' ? this.cursor : null;
  }

  /**
   * One frame: the pad as it stands, the actions pressed since the last frame, and whether
   * the pad rather than the mouse is in use.
   */
  update(
    reading: PadReading | null,
    pressed: ReadonlySet<PadAction>,
    elapsedMs: number,
    active: boolean,
  ): void {
    const state = this.state;
    const mode = inputMode(state, this.player);
    const key = `${state.round}:${state.phase}:${mode}`;
    if (key !== this.key) {
      const wasAiming = this.mode === 'aim' || this.mode === 'fire';
      this.key = key;
      this.mode = mode;
      this.placed = false;
      this.castle = null;
      this.repeater.reset();
      // From the announcement's aiming into combat the reticle stays where it was.
      if (!(wasAiming && (mode === 'fire' || mode === 'aim'))) this.cursor = null;
      if (active) this.start();
    }
    if (!active || reading === null) return;
    if (!this.placed) this.start(true);

    const size = { width: state.width, height: state.height };
    switch (mode) {
      case 'piece':
      case 'cannon': {
        const { dir, strength } = heading(reading);
        const steps = this.repeater.update(dir, strength, elapsedMs);
        const from = this.steer.hoverTile ?? this.homeTile();
        if (steps.x !== 0 || steps.y !== 0) this.steer.hoverTile = stepTile(from, steps, size);
        if (pressed.has('turn')) this.steer.turn();
        if (pressed.has('accept')) this.steer.accept();
        return;
      }
      case 'castle': {
        const { dir, strength } = heading(reading);
        const steps = this.repeater.update(dir, strength, elapsedMs);
        if (steps.x !== 0 || steps.y !== 0)
          this.jumpCastle({ x: Math.sign(steps.x), y: Math.sign(steps.y) });
        if (pressed.has('accept')) this.steer.accept();
        return;
      }
      case 'fire':
      case 'aim': {
        const at = this.cursor ?? this.centreOf(this.homeTile());
        // Turn held speeds the reticle up: the right button does nothing in combat.
        this.cursor = moveCursor(
          at,
          reading,
          reading.held.has('turn'),
          elapsedMs,
          this.tuning,
          size,
        );
        this.steer.hoverTile = { x: Math.floor(this.cursor.x), y: Math.floor(this.cursor.y) };
        if (pressed.has('accept')) this.steer.accept();
        return;
      }
      default:
        return;
    }
  }

  /**
   * Puts the ghost at its start for the phase: the island's centre, or a castle while one is
   * chosen. Taking over mid-phase (`keep`), the mouse's tile stays where it was.
   */
  private start(keep = false): void {
    this.placed = true;
    switch (this.mode) {
      case 'piece':
      case 'cannon':
        if (!keep || this.steer.hoverTile === null) this.steer.hoverTile = this.homeTile();
        return;
      case 'castle':
        this.jumpCastle(null);
        return;
      case 'fire':
      case 'aim': {
        const hover = this.steer.hoverTile;
        if (this.cursor === null)
          this.cursor = this.centreOf(keep && hover !== null ? hover : this.homeTile());
        this.steer.hoverTile = { x: Math.floor(this.cursor.x), y: Math.floor(this.cursor.y) };
        return;
      }
      default:
        return;
    }
  }

  private homeTile(): Vec {
    return { x: Math.floor(this.home.x), y: Math.floor(this.home.y) };
  }

  private centreOf(tile: Vec): Vec {
    return { x: tile.x + 0.5, y: tile.y + 0.5 };
  }

  /** The castles this player may choose from, at their centres. */
  private choices(): { at: Vec; item: number }[] {
    const player = this.state.players[this.player];
    if (player === undefined || !owesCastleChoice(player)) return [];
    return this.state.castles
      .filter((c) => c.islandId === player.islandId)
      .map((c) => ({ at: { x: c.x + c.w / 2, y: c.y + c.h / 2 }, item: c.id }));
  }

  /**
   * To the next castle in a direction, or with none given to the one nearest the island's
   * centre; the ghost over its middle tile.
   */
  private jumpCastle(dir: Vec | null): void {
    const choices = this.choices();
    if (choices.length === 0) return;
    const current = choices.find((c) => c.item === this.castle);
    let next: number | null = null;
    if (dir === null || current === undefined) {
      let best = Infinity;
      for (const c of choices) {
        const d = Math.hypot(c.at.x - this.home.x, c.at.y - this.home.y);
        if (d < best) {
          best = d;
          next = c.item;
        }
      }
    } else {
      next = nearestInDirection(current.at, choices, dir);
    }
    if (next === null) return;
    this.castle = next;
    const castle = this.state.castles.find((c) => c.id === next);
    if (castle !== undefined)
      this.steer.hoverTile = {
        x: castle.x + Math.floor(castle.w / 2),
        y: castle.y + Math.floor(castle.h / 2),
      };
  }
}
