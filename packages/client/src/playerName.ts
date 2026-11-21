import { t } from './i18n.js';
import { store, stored } from './storage.js';

/** Where the menu remembers the player's name, as it does the looks. */
const NAME_KEY = 'bollfort.name';

export function storedName(): string {
  return stored(NAME_KEY)?.trim() || t('menu.defaultName');
}

export function saveName(name: string): void {
  store(NAME_KEY, name);
}

/** Whether somebody typed a name once, rather than playing under the default. */
export function hasTypedName(): boolean {
  return (stored(NAME_KEY)?.trim() ?? '') !== '';
}

/** Saves a name as typed: the default, or nothing, saved empty, so it follows the language. */
export function saveTypedName(typed: string): void {
  const name = typed.trim();
  saveName(name === t('menu.defaultName') ? '' : name);
}
