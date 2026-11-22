import { t } from '../i18n.js';
import { withIcon } from '../icons.js';
import { store, stored } from '../storage.js';

/**
 * The tutorial offered once, as the game is first started (docs/TUTORIAL.md §2; the user's,
 * 2026-11-22): after the name window where there is one, at once under Steam, which asks for
 * no name. Answered either way, it is not asked again; the menu's Tutorial button stays.
 */

const OFFERED_KEY = 'bollfort.tutorialOffered';

/** Kept once the tutorial has been played to its end: the menu's button is marked until then. */
export const TUTORIAL_DONE_KEY = 'bollfort.tutorialDone';

export interface TutorialOfferFacts {
  /** Offered here before, answered either way. */
  offered: boolean;
  /** Played to its end before, from the menu. */
  done: boolean;
  /** A browser driven by a script, whose screenshots a window would stand in (`namePrompt.ts`). */
  automated: boolean;
  /** `?tutorialOffer=1`, for looking at the window itself. */
  forced: boolean;
}

export function shouldOfferTutorial(facts: TutorialOfferFacts): boolean {
  if (facts.forced) return true;
  return !facts.offered && !facts.done && !facts.automated;
}

export function tutorialOfferFacts(query: URLSearchParams): TutorialOfferFacts {
  return {
    offered: stored(OFFERED_KEY) === '1',
    done: stored(TUTORIAL_DONE_KEY) === '1',
    automated: navigator.webdriver === true,
    forced: query.get('tutorialOffer') === '1',
  };
}

/** Whether the tutorial has been played to its end, for the menu's mark on its button. */
export function tutorialDone(): boolean {
  return stored(TUTORIAL_DONE_KEY) === '1';
}

/**
 * The window over the menu: the tutorial, or not now. Once open it is not opened twice — the
 * menu is written again as Steam arrives, and the window stays over it.
 */
export function offerTutorial(play: () => void, click: () => void): void {
  if (document.querySelector('.tutorial-offer') !== null) return;
  const root = document.createElement('div');
  root.className = 'how-to-play name-ask tutorial-offer';
  root.innerHTML = `
    <div class="panel">
      <h2>${t('tutorial.offerTitle')}</h2>
      <p>${t('tutorial.offerBody')}</p>
      <button class="primary" data-main>${withIcon('play', t('tutorial.offerPlay'))}</button>
      <button class="quiet not-now">${t('tutorial.offerSkip')}</button>
    </div>`;
  const answered = (): void => {
    click();
    store(OFFERED_KEY, '1');
    root.remove();
  };
  root.querySelector('.primary')?.addEventListener('click', () => {
    answered();
    play();
  });
  root.querySelector('.not-now')?.addEventListener('click', answered);
  document.body.append(root);
}
