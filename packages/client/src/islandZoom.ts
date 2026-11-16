import { owesCastleChoice, type MatchState } from '@bollfort/sim';

import type { BuildZoom } from './buildZoomSetting.js';
import { placeShot, type CameraPlacement, type CameraShot, type FittedView } from './camera.js';
import { bannerProgress } from './transition.js';

/**
 * The island zoom (the user's design, 2026-11-16, after a tester asked to see their walls
 * closer): two states, the whole map or the player's own island fitted to the screen, switched
 * by a magnifier beside the island or a controller's Zoom. Never another island's — a teammate
 * helped is helped from the whole map, which one click brings back.
 *
 * - Only from the first build phase on: the opening and a continue's castle choice are about
 *   where the island stands among the others, so the map is shown whole until the player has
 *   built again.
 * - Each build phase opens zoomed in or out as the setting says (`buildZoomSetting.ts`), the
 *   move made behind its "Rebuild" banner; the cannon phase after it keeps whatever the build
 *   phase ended on; the barrage is always seen whole, the move out made as the cannon phase
 *   closes.
 * - The one camera move while something is playable (PLAN 11.11 W6's exception), and only
 *   when the player asks. Under reduced motion it is a cut.
 *
 * Pure, so tested rather than watched: headless Chrome cannot drive anything timed.
 */

/** A rectangle on screen, in pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tiles from `min` to `max`, both inclusive. */
export interface TileBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The tiles an island covers, as a box; null for an island with none. */
export function islandBox(
  state: Pick<MatchState, 'width' | 'islandId'>,
  island: number,
): TileBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < state.islandId.length; i++) {
    if (state.islandId[i] !== island) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** The part of a round the zoom belongs to, or null where the whole map is shown. */
export type ZoomStage = 'build' | 'cannon' | null;

/**
 * The build phase from the moment its banner starts across (the last shots landed), and the
 * cannon phase after it with its banner — but not while a castle is owed, after a continue.
 */
export function zoomStage(state: MatchState, playerId: number, tickFraction: number): ZoomStage {
  const player = state.players[playerId];
  if (player === undefined || player.eliminated) return null;
  const choosing = owesCastleChoice(player);
  switch (state.phase) {
    case 'build':
      return 'build';
    case 'cannon_place':
      return choosing ? null : 'cannon';
    case 'intermission':
      if (state.pendingPhase === 'build')
        return bannerProgress(state, tickFraction) === null ? null : 'build';
      if (state.pendingPhase === 'cannon_place') return choosing ? null : 'cannon';
      return null;
    default:
      return null;
  }
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** One player's zoom through a match: what they asked for, and how far it has gone. */
export class IslandZoom {
  /** Zoomed in, as asked for; shown only where `available`. */
  private wanted = false;
  /** How far in, 0 to 1, before easing. */
  private shown = 0;
  /** Whether a build phase has opened since the last castle chosen, at the start or after a continue. */
  private built = false;
  private stage: ZoomStage = null;
  private setting: BuildZoom | null = null;
  private open = false;
  /** Where the camera is headed, 1 the island, 0 the whole map. */
  private target = 0;
  /** Asked for since the last frame: the magnifier, a controller's Zoom, the setting changed. */
  private asked = false;
  /** Whether the move under way was asked for, and so quick, or made by the phase, and so calm. */
  private manual = false;

  /** Whether the player may zoom now: the button shown, a controller's Zoom taken. */
  get available(): boolean {
    return this.open;
  }

  /** Zoomed in, or on the way. */
  get zoomedIn(): boolean {
    return this.open && this.wanted;
  }

  /**
   * One frame: the board, the setting as it stands, the time since the last frame. Returns
   * how far in the camera is, eased, 0 being the whole map.
   *
   * A move the player asks for takes `pace.manualMs`, quick, since it is made under the build
   * clock; one the phases make — in behind "Rebuild", out before "Fire!" or for a castle to
   * choose — takes `pace.autoMs`, calm as the opening's pull out (the user's, 2026-11-16).
   */
  update(
    state: MatchState,
    playerId: number,
    setting: BuildZoom,
    tickFraction: number,
    elapsedMs: number,
    pace: { manualMs: number; autoMs: number },
    instant: boolean,
  ): number {
    const player = state.players[playerId];
    if (player === undefined || owesCastleChoice(player)) this.built = false;
    const stage = zoomStage(state, playerId, tickFraction);
    if (stage === 'build') {
      this.built = true;
      if (this.stage !== 'build') this.wanted = setting === 'in';
    }
    // Chosen anew in the pause menu: taken at once.
    if (this.setting !== null && setting !== this.setting) {
      this.wanted = setting === 'in';
      this.asked = true;
    }
    this.setting = setting;
    this.stage = stage;
    this.open = setting !== 'off' && stage !== null && this.built;
    const target = this.zoomedIn ? 1 : 0;
    if (target !== this.target) {
      this.target = target;
      this.manual = this.asked;
    }
    this.asked = false;
    const durationMs = this.manual ? pace.manualMs : pace.autoMs;
    if (instant || durationMs <= 0) this.shown = target;
    else {
      const step = elapsedMs / durationMs;
      this.shown =
        target > this.shown
          ? Math.min(target, this.shown + step)
          : Math.max(target, this.shown - step);
    }
    return smoothstep(this.shown);
  }

  /**
   * The mouse wheel, where it zooms (`mouseWheelSetting.ts`): in or out, whichever it is
   * turned towards. True only where that changed something, so a run of a wheel's or a
   * touchpad's events makes one move and one sound.
   */
  zoomTo(zoomIn: boolean): boolean {
    if (!this.open || this.wanted === zoomIn) return false;
    this.wanted = zoomIn;
    this.asked = true;
    return true;
  }

  /** The magnifier or a controller's Zoom: in or out, where the zoom is open. */
  toggle(): boolean {
    if (!this.open) return false;
    this.wanted = !this.wanted;
    this.asked = true;
    return true;
  }
}

/** Where a box of tiles stands on screen under a camera. */
export function screenRect(view: FittedView, camera: CameraPlacement, box: TileBox): Rect {
  const { tile, originX, originY } = view;
  const { zoom, x, y } = camera;
  return {
    x: x + (originX + box.minX * tile) * zoom,
    y: y + (originY + box.minY * tile) * zoom,
    w: (box.maxX - box.minX + 1) * tile * zoom,
    h: (box.maxY - box.minY + 1) * tile * zoom,
  };
}

function inside(inner: Rect, outer: Rect, slack = 0.5): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  );
}

/**
 * The shot that fits the island, with `marginTiles` of sea round it, into `free` — the screen
 * the HUD leaves — no closer than `maxZoom`. The camera keeps the board's edges on screen
 * (`placeShot`), which pushes an island on the board's edge off the middle; the zoom is eased
 * back until the island is whole inside `free` all the same. Null where it would be no closer
 * than the whole map.
 */
export function islandShot(
  view: FittedView,
  board: { width: number; height: number },
  box: TileBox,
  free: Rect,
  marginTiles: number,
  maxZoom: number,
): CameraShot | null {
  const w = (box.maxX - box.minX + 1 + 2 * marginTiles) * view.tile;
  const h = (box.maxY - box.minY + 1 + 2 * marginTiles) * view.tile;
  let zoom = Math.min(free.w / w, free.h / h, maxZoom);
  const focusX = (box.minX + box.maxX + 1) / 2;
  const focusY = (box.minY + box.maxY + 1) / 2;
  const at = { x: free.x + free.w / 2, y: free.y + free.h / 2 };
  while (zoom > 1.01) {
    const shot = { zoom, focusX, focusY, at };
    if (inside(screenRect(view, placeShot(view, board, shot), box), free)) return shot;
    zoom = 1 + (zoom - 1) * 0.95;
  }
  return null;
}

/**
 * Between the whole map (0) and the island's shot (1), eased: the island's middle moving
 * steadily from where the map shows it to where the shot puts it, as the zoom grows in
 * proportion — so the island grows in place rather than swinging round.
 */
export function towardsIsland(view: FittedView, shot: CameraShot, t: number): CameraShot | null {
  if (t <= 0) return null;
  if (t >= 1) return shot;
  const fromX = view.originX + shot.focusX * view.tile;
  const fromY = view.originY + shot.focusY * view.tile;
  const to = shot.at ?? { x: fromX, y: fromY };
  return {
    zoom: shot.zoom ** t,
    focusX: shot.focusX,
    focusY: shot.focusY,
    at: { x: fromX + (to.x - fromX) * t, y: fromY + (to.y - fromY) * t },
  };
}

/**
 * The magnifier's middle: on the island's bottom-right corner, where its box's rounded corner
 * leaves sea, kept wholly inside `free` (`size` its width and height).
 */
export function buttonSpot(island: Rect, free: Rect, size: number): { x: number; y: number } {
  const half = size / 2;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(island.x + island.w, free.x + half, free.x + free.w - half),
    y: clamp(island.y + island.h, free.y + half, free.y + free.h - half),
  };
}

/**
 * The big timer's middle while zoomed in, the island filling the screen: in the sea beside it,
 * on the side with the most room, close in to the shore — out in the middle of that strip it
 * sat on the neighbour's island — or above or below it on a tall screen. Null where no strip is
 * wide enough for it, `sizePx` across.
 */
export function timerBeside(
  island: Rect,
  free: Rect,
  sizePx: number,
): { x: number; y: number } | null {
  const left = island.x - free.x;
  const right = free.x + free.w - (island.x + island.w);
  const top = island.y - free.y;
  const bottom = free.y + free.h - (island.y + island.h);
  const midY = island.y + island.h / 2;
  const midX = island.x + island.w / 2;
  const off = (room: number): number => Math.min(room / 2, sizePx * 0.75);
  if (Math.max(left, right) >= sizePx)
    return left > right
      ? { x: island.x - off(left), y: midY }
      : { x: island.x + island.w + off(right), y: midY };
  if (Math.max(top, bottom) >= sizePx * 0.8)
    return top > bottom
      ? { x: midX, y: island.y - off(top) }
      : { x: midX, y: island.y + island.h + off(bottom) };
  return null;
}
