import { defaultConfigBundle } from '@bollfort/config';

import { audio } from './app.js';
import { SplitTitle } from './decor.js';
import { escape } from './html.js';
import { t } from './i18n.js';
import { LookRotation } from './looks.js';
import { motionReduced } from './motion.js';
import { preferredStyles } from './prefs.js';

/**
 * The title screen before the first menu (PLAN §11 item 11, PG1), where a loading dialog stood
 * (ARCHIVE 14b): every sound and music file fetched once, before anything else opens — the
 * user's choice of waiting for all of it, so the game never waits on a file later. From the
 * player's own disk it is a moment; from a host the first time, as long as the host's upload
 * takes; after that the browser has them and the host only says they have not changed.
 *
 * The title large in the build look the player has chosen (one drawn for Random), a thin bar
 * under it, the corner's buttons not yet shown, and the menu faded in under it. In a browser that
 * holds sound back until a first gesture, the screen waits once loaded for a click — "Click to
 * start" — so the menu's music begins with the menu rather than at some later click.
 */

/** How long the screen takes to fade off the menu (`.loading-screen.done` in style.css). */
const FADE_MS = 450;

export interface LoadingOptions {
  /**
   * Whether a click may be asked for once loaded: only on the way to the menu, never on a
   * route a script or a link opens straight into a match or a lobby.
   */
  askClick: boolean;
}

/** Whether the screen is to wait for a click once loaded. */
export function wantsClick(
  askClick: boolean,
  waitsForGesture: boolean,
  automated: boolean,
): boolean {
  return askClick && waitsForGesture && !automated;
}

export async function showLoading(options: LoadingOptions): Promise<void> {
  document.body.classList.add('booting');
  const root = document.createElement('div');
  root.className = 'loading-screen';
  root.innerHTML =
    `<span class="title-split"></span>` +
    `<div class="bar" role="progressbar" aria-label="${escape(t('loading.audio'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fill"></div></div>` +
    `<p class="words">${escape(t('loading.audio'))}</p>` +
    `<button class="start-click" data-main hidden>${escape(t('loading.clickToStart'))}</button>`;
  const title = root.querySelector<HTMLElement>('.title-split')!;
  const opening = new LookRotation(preferredStyles()).opening();
  new SplitTitle(title, defaultConfigBundle.art).still({
    build: opening.build,
    combat: opening.build,
  });
  const bar = root.querySelector<HTMLElement>('.bar')!;
  const fill = root.querySelector<HTMLElement>('.fill')!;
  document.body.append(root);
  let shown = -1;
  try {
    await audio.load((done) => {
      const percent = Math.round(done * 100);
      if (percent <= shown) return;
      shown = percent;
      fill.style.width = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(percent));
    });
    if (wantsClick(options.askClick, audio.waitsForGesture, navigator.webdriver === true)) {
      await clickToStart(root);
    }
  } finally {
    document.body.classList.remove('booting');
    leave(root);
  }
}

/** Waits for a click anywhere on the screen, or any button of a controller. */
function clickToStart(root: HTMLElement): Promise<void> {
  root.classList.add('ready');
  const button = root.querySelector<HTMLButtonElement>('.start-click')!;
  button.hidden = false;
  return new Promise((resolve) => {
    let polling = true;
    const go = (): void => {
      polling = false;
      root.removeEventListener('pointerdown', go);
      resolve();
    };
    // The page's own listener has resumed the audio by now (`app.ts`, captured).
    root.addEventListener('pointerdown', go);
    // A controller's press is no gesture to the browser, so the music may wait for the next
    // click; it still goes on, as a pad in the menus would.
    const poll = (): void => {
      if (!polling) return;
      const pressed = [...(navigator.getGamepads?.() ?? [])].some(
        (pad) => pad?.buttons.some((b) => b.pressed) === true,
      );
      if (pressed) go();
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

/** Faded off the menu drawn under it, then taken away. */
function leave(root: HTMLElement): void {
  if (motionReduced()) {
    root.remove();
    return;
  }
  root.classList.add('done');
  setTimeout(() => root.remove(), FADE_MS);
}
