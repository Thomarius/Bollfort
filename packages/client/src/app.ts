import { defaultConfigBundle, validateConfigBundle } from '@bollfort/config';
import { audioManifest } from './styles/data.js';

import { Audio } from './audio.js';
import { onLanguageChange, setLanguage, startingLanguage, t } from './i18n.js';
import { gameHost } from './host.js';
import { withIcon } from './icons.js';
import { installBackdrop } from './decor.js';
import { backgroundMuteSetting } from './displaySettings.js';
import { applyMotion } from './motion.js';
import { perf } from './perf.js';

/**
 * The page itself, shared by the menu, the lobby and every match: the root element, sound,
 * the query parameters, and the error box. Set up once, as the page loads.
 */

// With the tracks the styles bring themselves, so their credits are checked as the manifest's.
const problems = validateConfigBundle({ ...defaultConfigBundle, audio: audioManifest });

if (problems.length > 0) {
  throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
}

export const app = document.querySelector<HTMLElement>('#app');

if (!app) throw new Error('missing #app');

// The language before anything is written: `&lang=` for screenshots, else the saved
// choice, else the browser's own if the game speaks it (PLAN 11.20).
setLanguage(startingLanguage(new URLSearchParams(globalThis.location.search).get('lang')));

installBackdrop(defaultConfigBundle.art);

applyMotion();

/** Surfaces failures on the page: a renderer that throws otherwise looks like a black screen. */
export function showError(source: string, detail: unknown): void {
  const message =
    detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : String(detail);
  const box = document.createElement('pre');
  box.className = 'crash';
  box.textContent = `${source}\n\n${message}`;
  app?.replaceChildren(box);
}

globalThis.addEventListener('error', (event) =>
  showError(t('error.uncaught'), event.error ?? event.message),
);

globalThis.addEventListener('unhandledrejection', (event) =>
  showError(t('error.unhandled'), event.reason),
);

/**
 * Sound, shared by the menu and every match.
 *
 * A browser will not start an audio context without a user gesture, so the first
 * click or keypress anywhere is what switches it on — the menu's own buttons are
 * usually that gesture, but `?autostart=1` skips the menu entirely and then the first
 * input in the match does it instead. It is tried at once as well: a browser that lets
 * the site play sound unasked (a permission given it, the desktop app's window) starts
 * the music as the page opens; one that does not leaves the context waiting, and the
 * first gesture resumes it (the users' wish, 2026-10-09).
 */
export const audio = new Audio(audioManifest);

const unlock = (): void => audio.unlock();

globalThis.addEventListener('pointerdown', unlock, { capture: true });

globalThis.addEventListener('keydown', unlock, { capture: true });

unlock();

/**
 * Mute in background (`displaySettings.ts`): silent while the window is hidden or another has
 * the focus, asked again as either changes. Not as the setting changes: it is changed with a
 * click in this window, which is in front then.
 */
function followBackground(): void {
  const behind = document.hidden || !document.hasFocus();
  audio.setAway(backgroundMuteSetting.get() === 'on' && behind);
}

globalThis.addEventListener('blur', followBackground);
globalThis.addEventListener('focus', followBackground);
document.addEventListener('visibilitychange', followBackground);

/**
 * A sound switch on every screen, showing whether sound is on. Mute is remembered by the
 * browser, so without it a mute set once — as the old M key did whenever a name with an
 * "m" was typed in the lobby — silenced every later visit with nothing on screen to say
 * so, and nothing outside a match to undo it.
 */
function installSoundButton(): void {
  const button = document.createElement('button');
  button.id = 'sound';
  const show = (): void => {
    button.innerHTML = audio.isMuted
      ? withIcon('mute', t('sound.off'))
      : withIcon('sound', t('sound.on'));
    button.classList.toggle('off', audio.isMuted);
    button.setAttribute('aria-pressed', String(!audio.isMuted));
  };
  button.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted);
    show();
  });
  show();
  onLanguageChange(show);
  corner.append(button);
}

/**
 * The bottom left's row of switches on every screen — Sound, Full screen, and Pause during a
 * match (`pause.ts`) — laid out by their widths, which change with the language.
 */
const corner = document.createElement('div');
corner.id = 'corner';
document.body.append(corner);

installSoundButton();

/**
 * Our hover texts open above what they explain (`[data-tip]` in style.css), which put those
 * of anything near the window's top out of sight: such a one opens below, decided as the
 * pointer or the focus reaches it, wherever it is on whatever screen.
 */
const TIP_ROOM_PX = 96;
/**
 * Half the hover text at its widest, and its margin: `max-width: 17rem` in style.css, and its
 * padding (0.7rem a side) and border (1px) beside it — the `::after` is content-box, which
 * `* { box-sizing }` does not reach. Without them a favourite's heart in the looks' last column
 * opened centred and ran 9px past its grid, which scrolled sideways (2026-11-21).
 */
const tipHalfPx = (): number =>
  ((17 + 2 * 0.7) * parseFloat(getComputedStyle(document.documentElement).fontSize) + 2) / 2 + 8;
/**
 * What a hover text must fit inside: the nearest box that clips it, or the window. Inside a
 * scrolling one it had been cut off, and one overflowing it to the right or below gave it a
 * scrollbar the pointer could never use, the text gone as it moved — the looks' Random card,
 * last in its grid (the test session, 2026-11-14).
 */
function tipBounds(target: Element): { left: number; top: number; right: number; bottom: number } {
  const bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let box = target.parentElement; box !== null; box = box.parentElement) {
    const style = getComputedStyle(box);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    // Its padding box, where it clips: its outer box takes in a scrollbar's width as well.
    const rect = box.getBoundingClientRect();
    const left = rect.left + box.clientLeft;
    const top = rect.top + box.clientTop;
    bounds.left = Math.max(bounds.left, left);
    bounds.top = Math.max(bounds.top, top);
    bounds.right = Math.min(bounds.right, left + box.clientWidth);
    bounds.bottom = Math.min(bounds.bottom, top + box.clientHeight);
    break;
  }
  return bounds;
}
const placeTip = (event: Event): void => {
  const target = event.target instanceof Element ? event.target.closest('[data-tip]') : null;
  if (target === null) return;
  const rect = target.getBoundingClientRect();
  const bounds = tipBounds(target);
  const roomAbove = rect.top - bounds.top;
  target.toggleAttribute(
    'data-tip-below',
    roomAbove < TIP_ROOM_PX && bounds.bottom - rect.bottom > roomAbove,
  );
  // A side set in the markup is kept; otherwise the text opens away from an edge it would cross.
  if (target.hasAttribute('data-tip-side') && !target.hasAttribute('data-tip-auto')) return;
  const centre = rect.left + rect.width / 2;
  const half = tipHalfPx();
  const side = centre - half < bounds.left ? 'right' : centre + half > bounds.right ? 'left' : null;
  target.toggleAttribute('data-tip-auto', side !== null);
  if (side === null) target.removeAttribute('data-tip-side');
  else target.setAttribute('data-tip-side', side);
};
document.addEventListener('mouseover', placeTip);
document.addEventListener('focusin', placeTip);

/**
 * Full screen, beside Sound (PLAN §11 item 4, UP2): F11 is a key, and the game is played with
 * the mouse. The page's own, so the browser's Esc takes it back as well; left out where the
 * page may not go full screen.
 */
function installFullscreenButton(): void {
  // The Steam build switches its window, not the page: Esc, the game's pause, would leave the
  // page's (STEAM.md §3.5).
  const host = gameHost();
  if (host === null && !document.fullscreenEnabled) return;
  const button = document.createElement('button');
  button.id = 'fullscreen';
  let hostFull = false;
  const full = (): boolean => (host === null ? document.fullscreenElement !== null : hostFull);
  const show = (): void => {
    button.innerHTML = full()
      ? withIcon('shrink', t('fullscreen.leave'))
      : withIcon('expand', t('fullscreen.enter'));
  };
  button.addEventListener('click', () => {
    if (host !== null) {
      void host.setFullscreen(!hostFull).then((on) => {
        hostFull = on;
        show();
      });
    } else if (document.fullscreenElement === null) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      void document.exitFullscreen().catch(() => undefined);
    }
    // Off the button, so Space or Enter later cannot press it again unseen.
    button.blur();
  });
  if (host !== null) {
    host.onFullscreen((on) => {
      hostFull = on;
      show();
    });
    void host.fullscreen().then((on) => {
      hostFull = on;
      show();
    });
  } else document.addEventListener('fullscreenchange', show);
  onLanguageChange(show);
  show();
  corner.append(button);
}

installFullscreenButton();

export const params = new URLSearchParams(globalThis.location.search);

export const timeScale = Math.max(1, Number(params.get('speed') ?? 1));

// The frame-time readout (PLAN 11.22).
perf.enabled = params.get('perf') === '1';

// For a script driving the page, which reads the figures rather than clicking Copy.
if (perf.enabled) Object.assign(globalThis, { bollfortPerf: perf });
