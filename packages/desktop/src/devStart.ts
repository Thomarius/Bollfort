import { pageQuery } from './steam.js';

/**
 * The client build carrying the supporter styles, beside the public `dist/` rather than in it:
 * `package.json`'s `extraResources` ships `client/dist` whole, so a supporter build left there
 * would go into the next `npm run package` (STEAM.md §6.1 — nothing built for a release may
 * carry them by accident).
 */
export const SUPPORTER_DIST = 'dist-supporter';

/** How the GitHub build's game window starts, from its command line. */
export interface GameStart {
  /** The client build under `packages/client/` the server hands out. */
  clientFolder: string;
  /** The game page's query, `''` or `?a=1&b=2`. */
  query: string;
}

/**
 * `--game-params` as the Steam build takes it (`pageQuery`), and, run from the repository only,
 * `--supporter` (`npm run desktop:supporter`): the supporter build served and its styles shown
 * (`?supporter=1`). Packaged there is no such build, and a player has no use for the switch.
 */
export function gameStart(argv: readonly string[], packaged: boolean): GameStart {
  const query = pageQuery(argv);
  if (packaged || !argv.includes('--supporter')) return { clientFolder: 'dist', query };
  const params = new URLSearchParams(query);
  params.set('supporter', '1');
  return { clientFolder: SUPPORTER_DIST, query: `?${params.toString()}` };
}
