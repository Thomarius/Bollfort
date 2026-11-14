import type { StyleData, StyleDefinition } from './definition.js';

/*
 * The supporter styles' seam (STEAM.md §6.1, SP1b): in this repository, nothing. The styles
 * are in a private repository, checked out as `supporter/` beside `packages/` on the developer's
 * machine alone, and a build that is to carry them replaces this module with that one's entry
 * (`supporterPlugin.ts`): the dev server whenever it is there, a production build only with
 * `BOLLFORT_SUPPORTER=1`. Its entry exports these two lists, in the same shape.
 *
 * Even then they are added only in the admin mode (`admin.ts`), so a page shows them only when
 * asked to with `?supporter=1`.
 */

/** The supporter styles' data, as `OWN_STYLE_DATA` holds the Wild West's. */
export const SUPPORTER_DATA: readonly StyleData[] = [];

/** The supporter styles as the page uses them, in the order the menu offers them. */
export const SUPPORTER_STYLES: readonly StyleDefinition[] = [];
