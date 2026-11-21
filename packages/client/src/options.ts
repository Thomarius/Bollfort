import { t } from './i18n.js';
import { settingsRows } from './settingsRows.js';
import type { VolumeTarget } from './volume.js';

/**
 * The Options (2026-10-24, the user's): the settings, in their tabs (`settingsRows.ts`), in a
 * panel over the menu — or over the pause menu, which opens it too (2026-11-16) — so
 * the menu itself keeps the looks, one of the game's highlights, and the ways into a match.
 * The overlay and panel of How to play and the Credits, so the three read as one family; the
 * rows the pause menu's too (`settingsRows.ts`).
 */
export interface OptionsActions {
  /** The menu's click, and the volumes for the sliders. */
  audio: VolumeTarget;
  /** Called after the language has changed, so the menu behind is written afresh. */
  languageChanged(): void;
  /** The player's name as a row, from the menu (`SettingsActions.name`). */
  name?: boolean;
}

/**
 * Opens the panel, returning its closing without a sound, for the pause menu to take it away
 * with itself as the match resumes.
 */
export function openOptions(actions: OptionsActions): () => void {
  const root = document.createElement('div');
  root.className = 'how-to-play options';
  const click = (): void => actions.audio.play('select');
  const close = (): void => {
    click();
    root.remove();
  };

  const fill = (): void => {
    root.innerHTML = `
      <div class="panel">
        <h2>${t('menu.options')}</h2>
        <button class="close quiet" data-back>${t('credits.close')}</button>
      </div>`;
    root.querySelector('h2')?.after(
      settingsRows({
        click,
        volumes: actions.audio,
        languageChanged: () => {
          actions.languageChanged();
          // This panel too, in the new language.
          fill();
        },
        rewrite: fill,
        ...(actions.name === true ? { name: true } : {}),
      }),
    );
    root.querySelector('.close')?.addEventListener('click', close);
  };

  fill();
  document.body.append(root);
  // A click on the dimmed menu around the panel closes it too, as the Credits' does.
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  return () => root.remove();
}
