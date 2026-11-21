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
import { t } from './i18n.js';
import type { Look } from './transition.js';

/**
 * The style preview (the users' design, 2026-11-21): a style shown large over the gallery, opened
 * by the magnifier on its card — its scenes (`styleShow.ts`) drawn by a real `Scene` in the style,
 * the match screen's own board effects (`BoardEffects`: the sealed ground flooding back, the
 * breach's ground draining as the banner passes), its "Rebuild" banner and its corner piece, with
 * its music playing. No sounds, no score bar or timer. A style made for one look only shows the
 * gallery's choice for the other. Closed by its button or a click outside it, the music before it
 * back again.
 */

export interface ShowcaseOptions {
  style: ArtStyle;
  /** The gallery's looks as they stand: the other look's, for a style made for one alone. */
  choices: LookChoices;
  /** What plays the music: the page's `Audio`, asked for the track playing and to change it. */
  music: { readonly musicCue: MusicTrack | null; music(cue: MusicTrack | null): void };
  click?(): void;
}

/** The stage's size in the page's pixels, at most: the board fitted inside it. */
const STAGE = { width: 1200, height: 640 } as const;

export function openStyleShowcase(options: ShowcaseOptions): void {
  const { style } = options;
  const click = options.click ?? ((): void => undefined);
  const root = document.createElement('div');
  root.className = 'style-showcase';
  root.innerHTML =
    `<div class="panel" role="dialog" aria-label="${escape(lookName(style))}">` +
    `<div class="head"><h2>${escape(lookName(style))}</h2>` +
    `<button type="button" class="close" data-back>${withIcon('back', t('howTo.back'))}</button></div>` +
    `<div class="stage"><div class="banner-layer"></div><div class="fade"></div></div></div>`;
  const stage = root.querySelector<HTMLElement>('.stage')!;
  const bannerLayer = root.querySelector<HTMLElement>('.banner-layer')!;
  const fade = root.querySelector<HTMLElement>('.fade')!;
  const canvas = document.createElement('canvas');
  stage.prepend(canvas);

  // Its own music, where it has a track; the menu's (or the match's) goes on where it has none.
  const before = options.music.musicCue;
  if (audioManifest.styleMusic[style] !== undefined) options.music.music(styleTrack(style));

  const player = new ShowcasePlayer(
    canvas,
    stage,
    bannerLayer,
    fade,
    looksFor(style, options.choices),
  );
  const close = (): void => {
    player.destroy();
    root.remove();
    if (options.music.musicCue !== before) options.music.music(before);
  };
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === root || target.closest('.close') !== null) {
      click();
      close();
    }
  });
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

class ShowcasePlayer {
  private show = new StyleShow();
  private scene: Scene | null = null;
  private board: BoardEffects | null = null;
  private banner: HTMLElement | null = null;
  private frame = 0;
  private last = 0;
  private closed = false;
  private warmed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
    private readonly bannerLayer: HTMLElement,
    private readonly fade: HTMLElement,
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
    const box = this.stage.getBoundingClientRect();
    scene.resize(
      this.show.state,
      Math.min(STAGE.width, Math.round(box.width)),
      Math.min(STAGE.height, Math.round(box.height)),
    );
    scene.drawTerrain(this.show.state);
    this.board = this.freshBoard(scene);
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.step(now));
  }

  private step(now: number): void {
    const scene = this.scene;
    if (scene === null || this.closed) return;
    const delta = Math.min(100, now - this.last);
    this.last = now;
    const show = this.show;
    const frame = show.advance(delta);
    if (frame.reset) {
      // The board as it first stood: its effects begun afresh, as a new match's.
      this.board = this.freshBoard(scene);
    }
    const board = this.board!;
    const state = show.state;
    if (frame.began === 'banner') {
      board.startRebuild();
      this.banner = phaseBanner('build', this.styles.build);
      if (this.banner !== null) this.bannerLayer.append(this.banner);
    } else if (frame.began !== null) {
      this.banner?.remove();
      this.banner = null;
    }
    const changed = this.apply(frame.events);
    for (const piece of frame.landed) scene.noteLanding(piece.cells, piece.player);
    const landed = frame.landed.length > 0;
    board.refresh(changed || landed, changed || landed || frame.began === 'build');

    // The banner, as the match screen places it, and the look changing under its middle.
    let lineY: number | null = null;
    const progress = show.bannerProgress;
    if (this.banner !== null && progress !== null) {
      const height = this.banner.offsetHeight;
      const top = -height + progress * (this.bannerLayer.clientHeight + height);
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
    this.fade.style.opacity = String(show.darkness);
    // Both looks rendered once unseen first, so the banner's wipe has nothing left to do.
    if (!this.warmed) {
      scene.warmUp();
      this.warmed = true;
    }
    scene.render();
    this.frame = requestAnimationFrame((t) => this.step(t));
  }

  /**
   * The board's effects begun afresh, as a new match's, and the board drawn whole: its walls and
   * guns, and the ground sealed as combat begins, which the effects draw only as it changes.
   */
  private freshBoard(scene: Scene): BoardEffects {
    const board = new BoardEffects(scene, this.show);
    board.refresh(true, true);
    board.drawFloodedTerritory(performance.now());
    return board;
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
