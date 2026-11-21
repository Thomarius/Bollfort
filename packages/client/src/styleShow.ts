import { defaultArtConfig, defaultRuleset, defaultTerrainConfig } from '@bollfort/config';
import {
  applyAction,
  applyEnclosure,
  createMatch,
  drainEvents,
  fire,
  inFlight,
  legalCannonPlacements,
  resolveImpacts,
  step,
  Structure,
  Terrain,
  type MatchEvent,
  type MatchState,
} from '@bollfort/sim';

import { crossing } from './transition.js';

/**
 * The style preview's scenes (the users' design, 2026-11-21), played on a real board with no
 * drawing here — `styleShowcase.ts` draws it in the style. Two players on a real map, each with a
 * castle walled and three guns placed by the rules themselves; then, round and round:
 *
 * 1. **The barrage**, in the combat look: each fires at the other's ring, a breach opened in both
 *    and a shot into the channel for its splash.
 * 2. **The "Rebuild" banner**, sweeping down as the look changes to the build look under it, and
 *    the ground the breach lost draining away.
 * 3. **Building and sealing**, in the build look: the breaches closed piece by piece, the first
 *    player's each shown first as the piece in hand, until both castles are sealed again and the
 *    sealed ground floods back.
 *
 * A fade, then the barrage again from the board as it first stood. The shots are the sim's own,
 * fired and landed by `fire` and `resolveImpacts`; the pieces are laid by hand, as wall where the
 * breach was, since a match's pieces are dealt and a breach's shape is not theirs to choose.
 */

/** The map: a seed whose weather is clear and whose light is noon's, as the gallery's stills. */
const SEED = 5;

/** The scenes' timings, in milliseconds. */
export const SHOW_MS = {
  /** From the barrage's start to its first shots. */
  aim: 500,
  /** Between one player's shots, each waiting on a loaded gun as a click would. */
  between: 700,
  /** After the barrage's last shot lands, before the banner. */
  settle: 900,
  /** The banner's crossing: the game's own. */
  banner: defaultRuleset.phases.transitionBannerMs,
  /** After building begins, before the first piece is shown. */
  firstPiece: 700,
  /** A piece held in hand before it is set down. */
  held: 650,
  /** Between one piece set down and the next shown. */
  betweenPieces: 450,
  /** Both sealed, before the fade. */
  sealed: 2600,
  /** The fade out to the next barrage, and in again. */
  fade: 350,
} as const;

export type ShowStage = 'barrage' | 'banner' | 'build' | 'fade';

/** A piece of a breach's repair: its cells, and who sets it down. */
interface Piece {
  player: number;
  cells: { x: number; y: number }[];
  /** Into the build stage, when it is shown in hand and when it is set down. */
  showAt: number;
  landAt: number;
}

interface PlannedShot {
  player: number;
  x: number;
  y: number;
  at: number;
}

/** One frame's news for the drawing. */
export interface StyleShowFrame {
  events: MatchEvent[];
  /** Pieces set down this frame, as wall: their cells and whose. */
  landed: { player: number; cells: { x: number; y: number }[] }[];
  /** The stage begun this frame, if one was. */
  began: ShowStage | null;
  /** The board put back as it first stood, for the next barrage. */
  reset: boolean;
}

export class StyleShow {
  /** The board as it stands. Replaced, not changed, when a loop begins again. */
  state: MatchState;
  /** The board as the barrage begins: both castles sealed, every gun loaded. */
  private readonly start: MatchState;
  /** The barrage's shots, the same every loop. */
  private readonly shots: readonly PlannedShot[];
  stage: ShowStage = 'barrage';
  /** Milliseconds into the stage. */
  private ms = 0;
  private ticks = 0;
  private plan: PlannedShot[] = [];
  private pieces: Piece[] = [];
  /** When the barrage's last shot landed; null while one is still to land. */
  private quietAt: number | null = null;
  /** When the last piece was set down; null while one is still to come. */
  private sealedAt: number | null = null;
  /** The fade's half: out to black, then in to the next barrage. */
  private fadedIn = false;

  constructor() {
    this.start = openingBoard();
    this.shots = barrageOf(this.start);
    this.state = structuredClone(this.start);
    // The show's clock from the board's, which setting it up moved on.
    this.ticks = this.state.tick;
    this.plan = [...this.shots];
  }

  /**
   * Plays on by `deltaMs` of real time: shots fly at the rules' tick rate, and the stages follow
   * one another by their timings.
   */
  advance(deltaMs: number): StyleShowFrame {
    const frame: StyleShowFrame = { events: [], landed: [], began: null, reset: false };
    const state = this.state;
    this.ms += deltaMs;
    this.ticks += (deltaMs * state.ruleset.tickRateHz) / 1000;
    while (state.tick < Math.floor(this.ticks)) {
      state.tick++;
      resolveImpacts(state);
    }
    switch (this.stage) {
      case 'barrage':
        this.barrage(frame);
        break;
      case 'banner':
        if (this.ms >= SHOW_MS.banner) this.begin('build', frame);
        break;
      case 'build':
        this.build(frame);
        break;
      case 'fade':
        // Out to black, the board put back unseen, then in again to the barrage.
        if (!this.fadedIn && this.ms >= SHOW_MS.fade) {
          this.fadedIn = true;
          this.restart(frame);
        } else if (this.fadedIn && this.ms >= 2 * SHOW_MS.fade) {
          this.begin('barrage', frame);
        }
        break;
    }
    frame.events.push(...drainEvents(this.state));
    return frame;
  }

  /** How far into its tick the show is, 0 to 1, for shots to glide between ticks. */
  get tickFraction(): number {
    return this.ticks - Math.floor(this.ticks);
  }

  /** How far the banner has crossed, 0 to 1, eased as the game's is; null with none showing. */
  get bannerProgress(): number | null {
    if (this.stage !== 'banner') return null;
    return crossing(
      Math.min(1, this.ms / SHOW_MS.banner),
      defaultArtConfig.effects.bannerMiddleSpeed,
    );
  }

  /** How dark the stage is, 0 to 1: the fade between one loop and the next. */
  get darkness(): number {
    if (this.stage !== 'fade') return 0;
    const out = Math.min(1, this.ms / SHOW_MS.fade);
    return this.fadedIn ? Math.max(0, 2 - this.ms / SHOW_MS.fade) : out;
  }

  /** The first player's next piece, held in hand before it is set down; null at other times. */
  get held(): { x: number; y: number }[] | null {
    if (this.stage !== 'build') return null;
    const next = this.pieces.find((p) => p.player === 0 && this.ms >= p.showAt);
    return next === undefined ? null : next.cells;
  }

  private barrage(frame: StyleShowFrame): void {
    const state = this.state;
    // A gun fires once one is loaded: a plan waits on its barrel, as a click would.
    for (const player of [0, 1]) {
      const next = this.plan.find((p) => p.player === player);
      if (next === undefined || this.ms < next.at) continue;
      if ('rejection' in fire(state, next.player, next.x, next.y)) continue;
      this.plan.splice(this.plan.indexOf(next), 1);
    }
    if (this.plan.length > 0 || inFlight(state)) return;
    this.quietAt ??= this.ms;
    if (this.ms >= this.quietAt + SHOW_MS.settle) this.begin('banner', frame);
  }

  private build(frame: StyleShowFrame): void {
    const state = this.state;
    for (const piece of [...this.pieces]) {
      if (this.ms < piece.landAt) continue;
      const island = state.players[piece.player]!.islandId;
      for (const { x, y } of piece.cells) {
        const i = y * state.width + x;
        state.structure[i] = Structure.Wall;
        state.owner[i] = island;
      }
      frame.landed.push({ player: piece.player, cells: piece.cells });
      this.pieces.splice(this.pieces.indexOf(piece), 1);
    }
    if (frame.landed.length > 0) applyEnclosure(state);
    if (this.pieces.length > 0) return;
    this.sealedAt ??= this.ms;
    if (this.ms >= this.sealedAt + SHOW_MS.sealed) this.begin('fade', frame);
  }

  private begin(stage: ShowStage, frame: StyleShowFrame): void {
    const state = this.state;
    this.stage = stage;
    this.ms = 0;
    frame.began = stage;
    if (stage === 'banner') {
      // The game's intermission before building, the banner bringing it.
      state.phase = 'intermission';
      state.pendingPhase = 'build';
    } else if (stage === 'build') {
      state.phase = 'build';
      state.pendingPhase = null;
      applyEnclosure(state);
      this.pieces = repairOf(this.start, state);
      this.sealedAt = null;
    } else if (stage === 'fade') {
      this.fadedIn = false;
    } else {
      this.plan = [...this.shots];
      this.quietAt = null;
    }
  }

  /** The board as it first stood, for the next barrage, put back while the stage is dark. */
  private restart(frame: StyleShowFrame): void {
    this.state = structuredClone(this.start);
    this.ticks = this.state.tick;
    frame.reset = true;
  }
}

/**
 * Two players on the map for `SEED`, each with the castle nearest the middle of the map walled and
 * three guns placed nearest the rival's castle, by the rules' own actions; then into combat, held
 * there.
 */
export function openingBoard(): MatchState {
  const ruleset = { ...defaultRuleset, specials: { ...defaultRuleset.specials, enabled: false } };
  const state = createMatch({
    seed: SEED,
    ruleset,
    terrainConfig: defaultTerrainConfig,
    players: [
      { name: 'A', isBot: false },
      { name: 'B', isBot: false },
    ],
  });
  const until = (phase: MatchState['phase']): void => {
    for (let k = 0; k < 20_000 && state.phase !== phase; k++) step(state);
    if (state.phase !== phase) throw new Error(`the style preview's board never reached ${phase}`);
  };
  until('castle_select');
  const middle = { x: state.width / 2, y: state.height / 2 };
  for (const player of state.players) {
    const castle = nearest(
      state.castles.filter((c) => c.islandId === player.islandId),
      middle,
      // Level with the middle counts double: the rings face each other across the channel.
      2,
    );
    applyAction(state, { kind: 'select_castle', player: player.id, castleId: castle.id });
  }
  until('cannon_place');
  const castleOf = (player: number): { x: number; y: number } => {
    const id = state.players[player]!.startingCastleId;
    const c = state.castles.find((k) => k.id === id)!;
    return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  };
  for (const player of state.players) {
    const rival = castleOf(player.id === 0 ? 1 : 0);
    while (player.cannonsToPlace > 0) {
      const spots = legalCannonPlacements(state, player.id);
      if (spots.length === 0) break;
      const spot = nearest(spots, rival, 1);
      applyAction(state, { kind: 'place_cannon', player: player.id, x: spot.x, y: spot.y });
    }
  }
  until('combat');
  state.phaseEndTick = Number.MAX_SAFE_INTEGER;
  drainEvents(state);
  return state;
}

function nearest<T extends { x: number; y: number }>(
  among: readonly T[],
  to: { x: number; y: number },
  levelWeight: number,
): T {
  let best = among[0]!;
  let far = Number.POSITIVE_INFINITY;
  for (const c of among) {
    const d = Math.abs(c.x - to.x) + levelWeight * Math.abs(c.y - to.y);
    if (d < far) {
      far = d;
      best = c;
    }
  }
  return best;
}

/**
 * The barrage: each player's three shots at the middle of the rival's wall facing them, its two
 * middle blocks and the one beside, and one into the channel between, for its splash.
 */
function barrageOf(state: MatchState): PlannedShot[] {
  const out: PlannedShot[] = [];
  for (const player of [0, 1]) {
    const rival = player === 0 ? 1 : 0;
    const wall = facingWall(state, rival, player === 0 ? 'west' : 'east');
    const mid = Math.floor(wall.length / 2);
    const targets = [wall[mid - 1], wall[mid], wall[mid + 1]].filter((t) => t !== undefined);
    const water = channelWater(state, wall[mid]!);
    const order = water === null ? targets : [targets[0]!, water, ...targets.slice(1)];
    order.forEach((t, k) => {
      out.push({ player, ...t, at: SHOW_MS.aim + player * 250 + k * SHOW_MS.between });
    });
  }
  return out;
}

/** A player's ring wall on one side, its blocks top to bottom. */
function facingWall(
  state: MatchState,
  player: number,
  side: 'west' | 'east',
): { x: number; y: number }[] {
  const island = state.players[player]!.islandId;
  const walls: { x: number; y: number }[] = [];
  for (let i = 0; i < state.structure.length; i++) {
    if (state.structure[i] !== Structure.Wall || state.owner[i] !== island) continue;
    walls.push({ x: i % state.width, y: Math.floor(i / state.width) });
  }
  const xs = walls.map((w) => w.x);
  const edge = side === 'west' ? Math.min(...xs) : Math.max(...xs);
  // Its corners left out: a breach there is closed by a block out of line.
  const ys = walls.filter((w) => w.x === edge).map((w) => w.y);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  return walls.filter((w) => w.x === edge && w.y > top && w.y < bottom).sort((a, b) => a.y - b.y);
}

/** The water nearest a wall block, along its row, for a shot's splash. */
function channelWater(
  state: MatchState,
  from: { x: number; y: number },
): { x: number; y: number } | null {
  for (let d = 1; d < state.width; d++) {
    for (const x of [from.x - d, from.x + d]) {
      if (x < 0 || x >= state.width) continue;
      if (state.terrain[from.y * state.width + x] === Terrain.Water) return { x, y: from.y };
    }
  }
  return null;
}

/**
 * The repair: each player's wall the barrage took, set down again in pieces of at most two blocks
 * along the wall — the first player's each held in hand a moment first, the second's beside them.
 */
function repairOf(start: MatchState, now: MatchState): Piece[] {
  const pieces: Piece[] = [];
  for (const player of [0, 1]) {
    const island = now.players[player]!.islandId;
    const lost: { x: number; y: number }[] = [];
    for (let i = 0; i < start.structure.length; i++) {
      if (start.structure[i] !== Structure.Wall || start.owner[i] !== island) continue;
      if (now.structure[i] === Structure.Wall) continue;
      lost.push({ x: i % now.width, y: Math.floor(i / now.width) });
    }
    lost.sort((a, b) => a.y - b.y || a.x - b.x);
    let at = SHOW_MS.firstPiece + player * 400;
    for (let k = 0; k < lost.length;) {
      const a = lost[k]!;
      const b = lost[k + 1];
      const joined = b !== undefined && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
      const cells = joined ? [a, b] : [a];
      pieces.push({ player, cells, showAt: at, landAt: at + SHOW_MS.held });
      at += SHOW_MS.held + SHOW_MS.betweenPieces;
      k += cells.length;
    }
  }
  return pieces.sort((p, q) => p.landAt - q.landAt);
}
