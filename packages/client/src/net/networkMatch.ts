import { defaultArtConfig } from '@bollfort/config';
import { applySnapshot, type ServerMessage } from '@bollfort/protocol';
import {
  applyAction,
  createMatch,
  drainEvents,
  hashMatchState,
  step,
  type Action,
  type MatchEvent,
  type MatchState,
  type Rejection,
} from '@bollfort/sim';

import type { ServerConnection } from './connection.js';

/**
 * Ticks a client may trail the server's confirmed tick before catching up at once: one
 * is the commit it may always play next, the second absorbs commits arriving in pairs,
 * so the steady state still plays at its own pace rather than in bursts.
 */
export const CATCH_UP_MARGIN_TICKS = 2;

/**
 * A match played against an authoritative server.
 *
 * The client runs the same simulation the server does and replays the actions the
 * server confirms, rather than being sent the board. It never runs ahead of what has
 * been confirmed, so it cannot show something that did not happen — the cost is that
 * a player's own action appears after one round trip. At the scale of this game that
 * is well under the flight time of a cannonball, and the alternative, predicting
 * locally and rolling back, would buy very little for a great deal of complexity.
 */
export class NetworkMatch {
  state: MatchState | null = null;
  /** Highest tick the server has confirmed; the simulation may reach tick + 1. */
  private confirmed = -1;
  private buffered = new Map<number, Action[]>();
  private events: MatchEvent[] = [];
  private accumulatorMs = 0;
  private tickMs = 1000 / 30;

  humanPlayer = -1;
  /**
   * Out of sync, and no longer rejoining for a fresh start: a desync is mended by rejoining
   * (`connection.rejoin`), the server's snapshot replacing the board, up to `resyncLimit`
   * times a match; past that it stays, and says so.
   */
  desynced = false;
  /** Rejoins for a desync so far, and whether one is under way. */
  private resyncs = 0;
  private resyncing = false;
  /**
   * A snapshot has replaced a board already being shown — a rejoin — so whatever the screen
   * drew from the old one is to be drawn again (`takeResynced`).
   */
  private replaced = false;
  lastRejection: Rejection | null = null;
  /** Who paused the match, as the server last said; null while it runs. */
  pausedBy: number | null = null;

  constructor(
    private readonly connection: ServerConnection,
    private readonly resyncLimit = defaultArtConfig.hud.network.resyncLimit,
  ) {}

  /** Rejoins made so far for a desync: none, on a transport keeping its contract. */
  get resyncCount(): number {
    return this.resyncs;
  }

  /** Whether the board was replaced since last asked, as a rejoin replaces it. */
  takeResynced(): boolean {
    const replaced = this.replaced;
    this.replaced = false;
    return replaced;
  }

  get ready(): boolean {
    return this.state !== null;
  }

  get finished(): boolean {
    return this.state?.phase === 'game_over';
  }

  get tickFraction(): number {
    return Math.min(1, this.accumulatorMs / this.tickMs);
  }

  /** Ticks the client is behind the server; a rising number means it cannot keep up. */
  get behind(): number {
    return this.state === null ? 0 : Math.max(0, this.confirmed + 1 - this.state.tick);
  }

  receive(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.humanPlayer = message.playerId;
        return;

      case 'snapshot': {
        // Terrain and the piece sequence are regenerated from the seed rather than
        // sent, which is only sound because generation is deterministic.
        const base = createMatch({
          seed: message.snapshot.seed,
          ruleset: message.snapshot.ruleset,
          terrainConfig: message.snapshot.terrain,
          // With their teams: a table's team size may choose its pattern, so its map.
          players: message.snapshot.players.map((p) => ({
            name: p.name,
            isBot: p.isBot,
            team: p.team,
          })),
        });
        applySnapshot(base, message.snapshot);
        this.replaced = this.state !== null;
        this.state = base;
        this.resyncing = false;
        this.pendingHash = null;
        this.events = [];
        this.tickMs = 1000 / base.ruleset.tickRateHz;
        this.confirmed = message.snapshot.tick - 1;
        this.buffered.clear();
        return;
      }

      case 'commit': {
        this.buffered.set(message.tick, message.actions);
        this.confirmed = Math.max(this.confirmed, message.tick);
        if (message.hash !== undefined)
          this.pendingHash = { tick: message.tick, hash: message.hash };
        return;
      }

      case 'rejected':
        this.lastRejection = message.reason as Rejection;
        return;

      case 'paused':
        this.pausedBy = message.paused ? message.by : null;
        return;

      default:
        return;
    }
  }

  private pendingHash: { tick: number; hash: string } | null = null;

  submit(action: Action): void {
    this.connection.send({ type: 'action', action });
  }

  /** Asks the server to pause or resume; the match changes when it says so, for everyone. */
  requestPause(paused: boolean): void {
    this.connection.send({ type: 'pause', paused });
  }

  /**
   * Advances by elapsed time, but never past what the server has confirmed. If the
   * client has fallen behind — the board being built as the match opens, a slow frame,
   * a stalled tab — it catches up at once rather than drifting permanently.
   */
  advance(elapsedMs: number): MatchEvent[] {
    const state = this.state;
    // A board known to be wrong is held still until the server's replaces it.
    if (state === null || this.resyncing) return [];

    // Paused, the server sends no commits, so the client runs out of confirmed ticks on
    // its own; what it must not do is bank the pause as time to catch up on after.
    if (this.pausedBy !== null) this.accumulatorMs = 0;
    else this.accumulatorMs += Math.min(elapsedMs, 250);
    // Anything beyond a small margin is caught up in this frame. Played only at the
    // page's own clock, a backlog never shrank: it used to be caught up only past 60
    // ticks, so the second or so a page spends building the board as the match opens
    // stayed as a constant delay on every click for the whole match (the test sessions'
    // lag, measured at 20-28 ticks behind on both pages of a room).
    let budget = Math.max(
      Math.floor(this.accumulatorMs / this.tickMs),
      this.behind - CATCH_UP_MARGIN_TICKS,
    );

    while (budget > 0 && state.tick <= this.confirmed) {
      const actions = this.buffered.get(state.tick);
      if (actions) {
        for (const action of actions) applyAction(state, action);
        this.buffered.delete(state.tick);
      }
      const tick = state.tick;
      step(state);
      this.events.push(...drainEvents(state));
      this.accumulatorMs = Math.max(0, this.accumulatorMs - this.tickMs);
      budget--;

      if (this.pendingHash !== null && this.pendingHash.tick === tick) {
        const mismatch = hashMatchState(state) !== this.pendingHash.hash;
        this.pendingHash = null;
        if (mismatch) {
          this.resync();
          break;
        }
      }
    }

    const events = this.events;
    this.events = [];
    return events;
  }

  /** Out of step with the server: rejoined for its board while the limit allows. */
  private resync(): void {
    if (this.resyncing) return;
    if (this.resyncs >= this.resyncLimit) {
      this.desynced = true;
      return;
    }
    this.resyncs++;
    this.resyncing = true;
    this.connection.rejoin();
  }
}
