import { t } from './i18n.js';

/**
 * The page's tab, for a game waiting in a background tab (the user's, 2026-11-16): the title
 * says what is going on — a room's code and how many people sit at it, or a match paused — and a
 * running match asks before the tab is closed or reloaded.
 */

/** What the title tells besides the game's name, or null for the name alone. */
export type TitleState =
  { kind: 'room'; code: string; people: number; seats: number } | { kind: 'paused' } | null;

export function titleFor(state: TitleState): string {
  if (state === null) return 'Bollfort';
  const detail =
    state.kind === 'room'
      ? t('title.room', { code: state.code, people: state.people, seats: state.seats })
      : t('title.paused');
  return `Bollfort · ${detail}`;
}

/** Sets the tab's title, touching the page only on a change: a match asks every frame. */
export function showTitle(state: TitleState): void {
  const title = titleFor(state);
  if (document.title !== title) document.title = title;
}

/**
 * Whether the page is the desktop or Steam app's window, which Electron marks in its user agent.
 * There a page asking before it unloads stops the window closing without a word, so it never asks.
 */
export function inApp(userAgent: string = globalThis.navigator?.userAgent ?? ''): boolean {
  return /\bElectron\//.test(userAgent);
}

const askBeforeLeaving = (event: BeforeUnloadEvent): void => {
  // Both, as browsers differ in which they heed; the words are the browser's own.
  event.preventDefault();
  event.returnValue = '';
};
let asking = false;

/**
 * Whether the browser asks before the tab is closed, reloaded or left by its Back button: while
 * a match is played, where that would end it — and online give up the seat.
 */
export function guardLeaving(on: boolean): void {
  const want = on && !inApp();
  if (want === asking) return;
  asking = want;
  if (want) globalThis.addEventListener('beforeunload', askBeforeLeaving);
  else globalThis.removeEventListener('beforeunload', askBeforeLeaving);
}
