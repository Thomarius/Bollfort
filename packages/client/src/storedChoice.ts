import { escape } from './html.js';
import { t } from './i18n.js';
import { store, stored } from './storage.js';

/** A setting of a few named choices, kept in storage and read often. */
export interface StoredChoice<T extends string> {
  readonly choices: readonly T[];
  readonly fallback: T;
  parse(saved: string | null | undefined): T | null;
  /** The choice as stored, read once and kept, or the fallback. */
  get(): T;
  save(chosen: T): void;
  /** The choices as the menus offer them, for a `<select>`, their words under `prefix.value`. */
  options(): string;
}

/**
 * The plain setting — a key, its choices, the one given until another is chosen — as the
 * settings since 2026-11-16 are made: each of the older ones writes the same out by hand.
 * Another tab of the game changing it is read again here.
 */
export function storedChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
  prefix: string,
): StoredChoice<T> {
  let current: T | null = null;
  const parse = (saved: string | null | undefined): T | null =>
    choices.find((choice) => choice === saved) ?? null;
  globalThis.addEventListener?.('storage', (event) => {
    if (event.key === key) current = null;
  });
  return {
    choices,
    fallback,
    parse,
    get: () => (current ??= parse(stored(key)) ?? fallback),
    save: (chosen) => {
      current = chosen;
      store(key, chosen);
    },
    options: () =>
      choices
        .map(
          (value) =>
            // A prefix of the locale's keys, so not checked here: `locale.test.ts` finds a missing one.
            `<option value="${value}">${escape(t(`${prefix}.${value}` as Parameters<typeof t>[0]))}</option>`,
        )
        .join(''),
  };
}
