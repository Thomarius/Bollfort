import { escape } from './html.js';
import { t } from './i18n.js';
import { hasTypedName, saveTypedName } from './playerName.js';
import { store, stored } from './storage.js';

/**
 * The name, asked once (PLAN §11 item 10, GL1; the user's, 2026-11-22): the menu had a text
 * field for it, which made the first screen read as a web form. Now a newcomer is asked in a
 * small window before the menu, once, and changes it after in Options. Never under Steam, where
 * a player is their Steam name, and never for someone who has typed a name before.
 */

const ASKED_KEY = 'bollfort.nameAsked';

export interface NameAskFacts {
  /** Playing under Steam, which names the player. */
  steam: boolean;
  /** Asked here before, answered or not. */
  asked: boolean;
  /** A name typed once, in the old menu's field or in Options. */
  typed: boolean;
  /**
   * A browser driven by a script (`navigator.webdriver`): the screenshot tools, the store's
   * art and the trailer drive the menu in a fresh profile, and a window over it would stand in
   * every shot.
   */
  automated: boolean;
  /** `?askName=1`, for looking at the window itself. */
  forced: boolean;
}

/** Whether the window is to be shown as the menu opens. */
export function shouldAskName(facts: NameAskFacts): boolean {
  if (facts.steam) return false;
  if (facts.forced) return true;
  return !facts.asked && !facts.typed && !facts.automated;
}

/** The facts as this page has them. */
export function nameAskFacts(steam: boolean, query: URLSearchParams): NameAskFacts {
  return {
    steam,
    asked: stored(ASKED_KEY) === '1',
    typed: hasTypedName(),
    automated: navigator.webdriver === true,
    forced: query.get('askName') === '1',
  };
}

/**
 * Shows the window over the menu; `click` is the menus' click, `then` what follows it (the
 * tutorial's offer, docs/TUTORIAL.md §2). Continue keeps what is typed —
 * nothing typed keeps the default, which follows the language — and either way it is not
 * asked again. Enter in the field is Continue, as a form's would be; a controller's Accept
 * opens its on-screen keyboard on the field (`padKeyboard.ts`) and its main button is Continue.
 */
export function askName(click: () => void, then: () => void = () => undefined): void {
  document.querySelector('.name-ask')?.remove();
  const root = document.createElement('div');
  root.className = 'how-to-play name-ask';
  root.innerHTML = `
    <div class="panel">
      <h2>${t('nameAsk.title')}</h2>
      <p>${t('nameAsk.body')}</p>
      <input class="name-field" type="text" maxlength="16" spellcheck="false" autocomplete="off"
        aria-label="${escape(t('menu.name'))}" placeholder="${escape(t('menu.defaultName'))}" />
      <button class="primary" data-main>${t('nameAsk.continue')}</button>
    </div>`;
  const field = root.querySelector<HTMLInputElement>('.name-field')!;
  const done = (): void => {
    click();
    saveTypedName(field.value);
    store(ASKED_KEY, '1');
    root.remove();
    then();
  };
  root.querySelector('.primary')?.addEventListener('click', done);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') done();
  });
  document.body.append(root);
  field.focus();
}
