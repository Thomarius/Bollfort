import type { ArtConfig, ArtLook, ArtStyle } from '@bollfort/config';

import { Pixels } from './render/pixel/canvas.js';
import { water } from './render/pixel/generators.js';
import { motionReduced } from './motion.js';
import { styleTitle } from './styles/registry.js';
import { GAME_TITLE, TITLE_LETTERS_PX, titleLayout, titleWidth, type Title } from './titles.js';

/**
 * The menu and lobby's dressing: the title in both chosen looks at once, split by a
 * banner's line that sweeps across (the titles themselves are titles.ts), and the game's
 * own animated sea behind the panel.
 */

/** Where the line across the title is, and which look is above it. */
export interface TitleFrame {
  /** From the top of the letters, as a fraction of their height; outside 0..1 is off them. */
  split: number;
  /** The look above the line: the arriving one, as a banner crossing the board has it. */
  upper: ArtLook;
}

/**
 * How far a title's picture reaches past its letters, above and below, as fractions of their
 * height: a ribbon, a sheet, a halo or a glow round them, a tail under a stone one.
 */
export interface TitleReach {
  above: number;
  below: number;
}

/** A title drawn only on its letters. */
export const LETTERS_ONLY: TitleReach = { above: 0, below: 0 };

/** How far a title's picture reaches past its letters (`titleLayout` lays it so). */
export function titleReach(title: Title): TitleReach {
  const letters = 7 * title.cellPx;
  return { above: title.padPx / letters, below: (title.padPx + title.tailPx) / letters };
}

/** The farther reach of two titles, each way: what a line must cross to change all of both. */
export function widerReach(a: TitleReach, b: TitleReach): TitleReach {
  return { above: Math.max(a.above, b.above), below: Math.max(a.below, b.below) };
}

/** Whether the line cuts the pictures, rather than being past them, out of sight. */
export function lineShows(frame: TitleFrame, reach: TitleReach): boolean {
  return frame.split >= -reach.above && frame.split <= 1 + reach.below;
}

/**
 * At rest — motion unwelcome, so no glide — the title is split through the middle, building
 * above and combat below, both looks shown still.
 */
export const TITLE_AT_REST: TitleFrame = { split: 0.5, upper: 'build' };

/**
 * Just past the pictures, so the line enters and leaves out of sight of them — barely, so
 * its speeding up and slowing down happen where they show: at 0.12 most of the ease was
 * spent out of sight, and the line read as crossing at one even speed (2026-11-19).
 */
const BEYOND = 0.03;

/**
 * A pass's timing: the line's sweep across the letters, then the wait before the next, and
 * how sharply it speeds up and slows down (`ease`).
 */
export interface TitleTiming {
  passMs: number;
  pauseMs: number;
  ease: number;
}

/**
 * From 0 to 1, starting and ending at rest: `t^k / (t^k + (1 - t)^k)`, an even speed at
 * `k` 1, and at higher `k` slower at the ends and faster through the middle, where it moves
 * `k` times the pass's mean speed.
 */
function ease(t: number, k: number): number {
  const a = t ** k;
  const b = (1 - t) ** k;
  return a + b === 0 ? t : a / (a + b);
}

/**
 * Where the glide is `ms` in: the pass, counted from 0, and how far its line has come, 0
 * above the letters and 1 gone below. Each pass opens with its pause, the line waiting out of
 * sight above the word, which is all the look the last pass brought; so does the first, the
 * word all building, rather than a line setting off from the middle (2026-11-19).
 */
function where(ms: number, timing: TitleTiming): { pass: number; at: number } {
  const { passMs, pauseMs, ease: k } = timing;
  const cycle = passMs + pauseMs;
  const pass = Math.floor(ms / cycle);
  const into = ms - pass * cycle;
  return { pass, at: into < pauseMs ? 0 : ease((into - pauseMs) / passMs, k) };
}

/** The look a pass brings down over the word: combat first, then building, by turns. */
function brings(pass: number): ArtLook {
  return pass % 2 === 0 ? 'combat' : 'build';
}

/**
 * The title's line, `ms` into its glide: a short wait out of sight, then down across the
 * letters, speeding up and slowing down, and out of sight again below them, each pass a
 * banner bringing the other look over the whole word — combat, then building, as a round's
 * banners do. At one even speed and never still (the test session of 2026-10-08, after a line
 * that stopped at the middle) it read as mechanical; the session of 2026-10-12 asked for it
 * eased with a pause between, the pause off the letters; that ease, a cosine mostly spent out
 * of sight, still read as one even speed, so it is sharper and on the letters (2026-11-19,
 * `titleEase`). The line crosses the whole of both pictures, `reach` past the letters: crossing
 * only the letters, it left what the titles draw round them — a ribbon, a sheet, a halo, a
 * tail — to change all at once as the pause began (2026-11-19). Leaving at the foot and
 * entering at the head, the line is out of sight both times, so nothing on the word jumps.
 */
export function titleGlide(
  ms: number,
  timing: TitleTiming,
  reach: TitleReach = LETTERS_ONLY,
): TitleFrame {
  const { pass, at } = where(ms, timing);
  const top = -reach.above - BEYOND;
  const foot = 1 + reach.below + BEYOND;
  return { split: top + (foot - top) * at, upper: brings(pass) };
}

/**
 * The half of the title that may take a new style between `before` and `ms` into the glide,
 * or null: as each pause begins, the line just gone below the letters, the half the coming
 * pass brings — wholly out of sight then, since the word is all the other look — as a banner
 * on the board changes a look it is about to reveal (PLAN 11.23). Not at the glide's start:
 * the opening styles are just shown. A frame that skips past the moment still turns it.
 */
export function titleTurn(before: number, ms: number, timing: TitleTiming): ArtLook | null {
  const was = where(before, timing).pass;
  const now = where(ms, timing).pass;
  return now === was ? null : brings(now);
}

/** Where the title's looks come from: `LookRotation`, the match's own. */
export interface TitleRotation {
  opening(): Record<ArtLook, ArtStyle>;
  isRandom(look: ArtLook): boolean;
  next(look: ArtLook, beside: ArtStyle | null): ArtStyle;
}

/**
 * The menu's title as both chosen looks at once: the build look's title above a banner's
 * gold line and the combat look's below it, the letters of the two coinciding, so the
 * word reads as one cut through by the line, which glides across it without end while the
 * menu is open (`titleGlide`); the same style for both is one title and no line, as a
 * banner then changes nothing.
 */
export class SplitTitle {
  private readonly layers: Record<ArtLook, HTMLElement>;
  private readonly line: HTMLElement;
  private shown: Partial<Record<ArtLook, ArtStyle>> = {};
  private reaches: Record<ArtLook, TitleReach> = { build: LETTERS_ONLY, combat: LETTERS_ONLY };
  private same = false;
  /** When the glide began, or null while the title rests. */
  private glideStart: number | null = null;
  /** How far into the glide the last frame was. */
  private glidedTo = 0;
  private rotation: TitleRotation | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly art: ArtConfig,
  ) {
    root.style.width = `${titleWidth()}px`;
    root.style.height = `${TITLE_LETTERS_PX}px`;
    const layer = (look: ArtLook): HTMLElement => {
      const el = document.createElement('span');
      el.className = 'title-layer';
      const img = document.createElement('img');
      img.alt = look === 'build' ? GAME_TITLE : '';
      el.append(img);
      return el;
    };
    this.layers = { build: layer('build'), combat: layer('combat') };
    this.line = document.createElement('span');
    this.line.className = 'title-line';
    root.append(this.layers.build, this.layers.combat, this.line);
    this.frame(TITLE_AT_REST);
  }

  /**
   * Shows the looks a rotation opens with — a choice changed shows at once — and gives a
   * random half a new style at every pass after.
   */
  use(rotation: TitleRotation): void {
    this.rotation = rotation;
    const styles = rotation.opening();
    for (const look of ['build', 'combat'] as const) this.dress(look, styles[look]);
    if (this.glideStart === null) this.frame(TITLE_AT_REST);
    this.glide();
  }

  /** Draws one half in a style. */
  private dress(look: ArtLook, style: ArtStyle): void {
    if (style === this.shown[look]) return;
    const title = styleTitle(style, this.art);
    const { height, margin } = titleLayout(title);
    const img = this.layers[look].querySelector('img')!;
    img.src = title.src;
    img.style.height = `${height}px`;
    img.style.left = img.style.top = `${margin}px`;
    img.style.imageRendering = title.smooth ? 'auto' : 'pixelated';
    img.classList.toggle('flicker', title.flicker);
    this.shown = { ...this.shown, [look]: style };
    this.reaches = { ...this.reaches, [look]: titleReach(title) };
    this.same = this.shown.build === this.shown.combat;
  }

  /**
   * Sets the line gliding, from where the title rests, unless it already is, motion is
   * unwelcome, or one style shows both — then there is no line to move.
   */
  glide(): void {
    if (this.glideStart !== null || this.same || motionReduced()) return;
    this.glideStart = performance.now();
    this.glidedTo = 0;
    // Its first frame at once, so the title is never seen at rest, split through the middle.
    this.frame(titleGlide(0, this.timing(), this.reach()));
    requestAnimationFrame(this.tick);
  }

  /** A frame of the glide, until the title has left the page or one style shows both. */
  private readonly tick = (now: number): void => {
    if (this.glideStart === null) return;
    if (!this.root.isConnected || this.same) {
      this.glideStart = null;
      this.frame(TITLE_AT_REST);
      return;
    }
    const timing = this.timing();
    const ms = now - this.glideStart;
    const turn = titleTurn(this.glidedTo, ms, timing);
    this.glidedTo = ms;
    if (turn !== null && this.rotation?.isRandom(turn) === true) {
      const other = turn === 'build' ? 'combat' : 'build';
      this.dress(turn, this.rotation.next(turn, this.shown[other] ?? null));
    }
    // The reach after the turn: a half dressed afresh may reach farther than the one it was.
    this.frame(titleGlide(ms, timing, this.reach()));
    requestAnimationFrame(this.tick);
  };

  private reach(): TitleReach {
    return widerReach(this.reaches.build, this.reaches.combat);
  }

  private timing(): TitleTiming {
    const { titlePassMs, titlePauseMs, titleEase } = this.art.menu;
    return { passMs: titlePassMs, pauseMs: titlePauseMs, ease: titleEase };
  }

  private frame(frame: TitleFrame): void {
    const lower: ArtLook = frame.upper === 'build' ? 'combat' : 'build';
    if (this.same) {
      this.layers.build.dataset.side = 'whole';
      this.layers.combat.hidden = true;
      this.line.hidden = true;
      return;
    }
    this.layers.combat.hidden = false;
    this.layers[frame.upper].dataset.side = 'above';
    this.layers[lower].dataset.side = 'below';
    this.root.style.setProperty('--split', `${frame.split * TITLE_LETTERS_PX}px`);
    this.line.hidden = !lineShows(frame, this.reach());
  }
}

/**
 * Lays the game's sea behind the whole page and sets it drifting. Once per page: the
 * match's canvas covers it entirely, so it can stay put underneath.
 */
export function installBackdrop(art: ArtConfig): void {
  if (document.querySelector('#backdrop') !== null) return;
  const frames = 4;
  const size = art.tileSizePx;
  // Several tiles side by side, so the pattern repeats less obviously than one would.
  const sheet = new Pixels(size * frames, size);
  const ctx = sheet.canvas.getContext('2d');
  for (let f = 0; f < frames; f++) {
    ctx?.drawImage(water(art, 7, size, f, frames, f).canvas, f * size, 0);
  }
  const backdrop = document.createElement('div');
  backdrop.id = 'backdrop';
  backdrop.style.backgroundImage = `url(${sheet.canvas.toDataURL()})`;
  backdrop.style.backgroundSize = `${size * frames * 3}px ${size * 3}px`;
  document.body.prepend(backdrop);
}
