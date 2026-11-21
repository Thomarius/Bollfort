import { audioManifest } from './styles/data.js';
import { defaultArtConfig, styleTrack, type ArtStyle, type MusicTrack } from '@bollfort/config';
import { strikesOnFiring, type MatchEvent } from '@bollfort/sim';

import { BoardEffects } from './boardEffects.js';
import { escape } from './html.js';
import { phaseBanner } from './hud.js';
import { withIcon } from './icons.js';
import { lookName, type LookChoices } from './looks.js';
import { createTheme, Scene, type SceneLook } from './render/scene.js';
import type { Ghost } from './render/theme.js';
import { styleArt, styleServes, stylesFor } from './styles/registry.js';
import { StyleShow } from './styleShow.js';
import { holdPreviews } from './stylePreview.js';
import { t } from './i18n.js';
import type { Look } from './transition.js';

/**
 * The style preview (the users' design, 2026-11-21): a style shown large over the gallery, opened
 * by the magnifier on its card — its scenes (`styleShow.ts`) drawn by a real `Scene` in the style,
 * the match screen's own board effects (`BoardEffects`: the sealed ground flooding back, the
 * breach's ground draining as the banner passes), its "Rebuild" banner and its corner piece, with
 * its music playing, over the whole window. No sounds, no score bar or timer. A style made for one
 * look only shows the gallery's choice for the other. Closed by a click anywhere, the music before
 * it back again.
 */

/** Previews open: a match paused under one need not render a board nobody sees. */
let open = 0;

/** Whether a style preview covers the window, so a paused match's board under it is unseen. */
export function showcaseOpen(): boolean {
  return open > 0;
}

export interface ShowcaseOptions {
  style: ArtStyle;
  /** The gallery's looks as they stand: the other look's, for a style made for one alone. */
  choices: LookChoices;
  /** What plays the music: the page's `Audio`, asked for the track playing and to change it. */
  music: { readonly musicCue: MusicTrack | null; music(cue: MusicTrack | null): void };
  click?(): void;
}

export function openStyleShowcase(options: ShowcaseOptions): void {
  const { style } = options;
  const click = options.click ?? ((): void => undefined);
  const root = document.createElement('div');
  root.className = 'style-showcase';
  // The whole window, as a match's board is, to see the style's details (the users', 2026-11-21);
  // its name and the way back over it.
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', lookName(style));
  root.innerHTML =
    `<div class="banner-layer"></div>` +
    `<h2>${escape(lookName(style))}</h2>` +
    `<button type="button" class="close" data-back>${withIcon('back', t('howTo.back'))}</button>`;
  const bannerLayer = root.querySelector<HTMLElement>('.banner-layer')!;
  const canvas = document.createElement('canvas');
  root.prepend(canvas);

  // Its own music, where it has a track; the menu's (or the match's) goes on where it has none.
  const before = options.music.musicCue;
  if (audioManifest.styleMusic[style] !== undefined) options.music.music(styleTrack(style));

  // The gallery's pictures still to make wait while it plays: each is a renderer of its own.
  const release = holdPreviews();
  open++;
  const player = new ShowcasePlayer(canvas, bannerLayer, looksFor(style, options.choices));
  const fit = (): void => player.fit();
  const close = (): void => {
    release();
    open--;
    globalThis.removeEventListener('resize', fit);
    player.destroy();
    root.remove();
    if (options.music.musicCue !== before) options.music.music(before);
  };
  // A click anywhere on it goes back to the gallery, its Back button too (the users', 2026-11-21).
  root.addEventListener('click', () => {
    click();
    close();
  });
  globalThis.addEventListener('resize', fit);
  document.body.append(root);
  player.start();
}

/** The style in the looks it is made for, the gallery's choice (or the first made) in another. */
export function looksFor(style: ArtStyle, choices: LookChoices): Record<Look, ArtStyle> {
  const pick = (look: Look): ArtStyle => {
    if (styleServes(style, look)) return style;
    const chosen = choices[look];
    if (chosen !== 'random' && styleServes(chosen, look)) return chosen;
    return stylesFor(look)[0] as ArtStyle;
  };
  return { build: pick('build'), combat: pick('combat') };
}

/**
 * The show's clock waits as the preview first draws (`ShowcasePlayer.settled`): until a frame
 * comes in this many milliseconds, after at least `WARM_FRAMES` and at most `WARM_MAX_FRAMES`.
 */
const SETTLED_MS = 25;
const WARM_FRAMES = 3;
const WARM_MAX_FRAMES = 30;

class ShowcasePlayer {
  private show = new StyleShow();
  private scene: Scene | null = null;
  private board: BoardEffects | null = null;
  /**
   * The "Rebuild" banner, made as the preview opens and kept, hidden above the window between its
   * crossings: made as it was needed, its first layout — the style's banner, its font — took a
   * frame of 70 ms as it came in (Minimal, 2026-11-21). Its height and the window's as measured
   * then, and again as the window changes, not read at every frame.
   */
  private banner: HTMLElement | null = null;
  private bannerHeight = 0;
  private screenHeight = 0;
  private frame = 0;
  private last = 0;
  private closed = false;
  private warmed = false;
  /**
   * Frames drawn, and whether they have settled: the first few, as the style is drawn and rendered
   * for the first time, are long (Electric's 83, 33 and 117 ms), so the show's clock waits them
   * out rather than jumping the barrage's opening.
   */
  private frames = 0;
  private settled = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bannerLayer: HTMLElement,
    private readonly styles: Record<Look, ArtStyle>,
  ) {}

  start(): void {
    void this.open().catch((error: unknown) => console.warn('style preview', error));
  }

  destroy(): void {
    this.closed = true;
    cancelAnimationFrame(this.frame);
    // Not `destroy(true)`, which releases what every renderer on the page shares, a paused
    // match's included (ARCHIVE 12b).
    this.scene?.app.destroy({ removeView: true });
    this.scene = null;
  }

  private async look(style: ArtStyle): Promise<SceneLook> {
    return {
      theme: await createTheme(style, this.show.state.seed),
      art: styleArt(defaultArtConfig, style),
    };
  }

  private async open(): Promise<void> {
    // One look for both where the style draws both, as the match screen has it.
    const build = await this.look(this.styles.build);
    const looks = {
      build,
      combat:
        this.styles.combat === this.styles.build ? build : await this.look(this.styles.combat),
    };
    if (this.closed) return;
    const scene = new Scene();
    await scene.init(this.canvas, looks, defaultArtConfig);
    if (this.closed) {
      scene.app.destroy({ removeView: true });
      return;
    }
    this.scene = scene;
    scene.resize(this.show.state, globalThis.innerWidth, globalThis.innerHeight);
    scene.drawTerrain(this.show.state);
    this.board = new BoardEffects(scene, this.show);
    this.board.refresh(true, true);
    // The ground sealed as combat begins, which the effects draw only as it changes.
    this.board.drawFloodedTerritory(performance.now());
    // The banner made and laid out now, hidden above the window until it crosses.
    this.banner = phaseBanner('build', this.styles.build);
    if (this.banner !== null) {
      this.banner.style.visibility = 'hidden';
      this.bannerLayer.append(this.banner);
    }
    this.measure();
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.step(now));
  }

  private step(now: number): void {
    const scene = this.scene;
    if (scene === null || this.closed) return;
    const elapsed = now - this.last;
    this.last = now;
    this.frames++;
    this.settled ||=
      (this.frames > WARM_FRAMES && elapsed < SETTLED_MS) || this.frames > WARM_MAX_FRAMES;
    const delta = this.settled ? Math.min(100, elapsed) : 0;
    const show = this.show;
    const frame = show.advance(delta);
    const board = this.board!;
    const state = show.state;
    if (frame.began === 'banner') board.startRebuild();
    if (frame.began !== null && this.banner !== null) {
      this.banner.style.visibility = frame.began === 'banner' ? 'visible' : 'hidden';
    }
    const changed = this.apply(frame.events);
    for (const piece of frame.landed) scene.noteLanding(piece.cells, piece.player);
    const landed = frame.landed.length > 0;
    // Counted afresh as building begins, and held as combat does (`BoardEffects.refresh`).
    const phased = frame.began === 'build' || frame.began === 'barrage';
    board.refresh(changed || landed, changed || landed || phased);

    // The banner, as the match screen places it, and the look changing under its middle.
    let lineY: number | null = null;
    const progress = show.bannerProgress;
    if (this.banner !== null && progress !== null) {
      const height = this.bannerHeight;
      const top = -height + progress * (this.screenHeight + height);
      this.banner.style.transform = `translateY(${top.toFixed(1)}px)`;
      lineY = top + height / 2;
    }
    const shown: Look = state.phase === 'combat' ? 'combat' : 'build';
    scene.showLooks(
      lineY === null
        ? { from: shown, to: shown, lineY: null }
        : { from: 'combat', to: 'build', lineY },
    );
    board.underBanner(lineY);

    scene.drawEffects(
      state,
      show.tickFraction,
      delta,
      {
        build: board.enclosureFor('build').castleEnclosed,
        combat: board.enclosureFor('combat').castleEnclosed,
      },
      board.advanceFloods(),
      0,
      [],
      [],
      board.advanceDrains(now),
    );
    scene.drawOverlay(state, ghostOf(show.held), 0);
    // Both looks rendered once unseen first, so the banner's wipe has nothing left to do.
    if (!this.warmed) {
      scene.warmUp();
      this.warmed = true;
    }
    scene.render();
    this.frame = requestAnimationFrame((t) => this.step(t));
  }

  /** The window resized: the board fitted to it again and drawn at its new size, as a match's. */
  fit(): void {
    const scene = this.scene;
    const board = this.board;
    if (scene === null || board === null) return;
    scene.resize(this.show.state, globalThis.innerWidth, globalThis.innerHeight);
    scene.drawTerrain(this.show.state);
    board.drawFloodedTerritory(performance.now());
    board.drawBoard();
    this.measure();
  }

  /** The banner's height and the window's, for placing it: read once, and as the window changes. */
  private measure(): void {
    this.bannerHeight = this.banner?.offsetHeight ?? 0;
    this.screenHeight = this.bannerLayer.clientHeight;
  }

  /** The sim's events as a match screen takes them: shots leaving, and landing. */
  private apply(events: readonly MatchEvent[]): boolean {
    const scene = this.scene!;
    const state = this.show.state;
    let changed = false;
    for (const event of events) {
      if (event.kind === 'shot_fired') {
        if (!strikesOnFiring(event.shot.kind)) scene.noteShot(event.shot, state);
      } else if (event.kind === 'shot_impact') {
        const debris = event.destroyed.map((i) => ({
          x: i % state.width,
          y: Math.floor(i / state.width),
          owner: (state.islandId[i] as number) - 1,
        }));
        scene.noteImpact(event.x, event.y, debris);
        changed ||= debris.length > 0;
      }
    }
    return changed;
  }
}

/** The first player's piece in hand, as the build phase's ghost; nothing at other times. */
function ghostOf(cells: readonly { x: number; y: number }[] | null): Ghost {
  const anchor = cells?.[0] ?? null;
  return {
    tile: anchor,
    cells:
      anchor === null || cells === null
        ? []
        : cells.map((c) => [c.x - anchor.x, c.y - anchor.y] as const),
    valid: true,
    footprint: null,
    selectable: [],
    unsealed: [],
    aiming: false,
  };
}
