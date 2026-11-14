import type { StyleDefinition } from '../definition.js';

import { wildwestData, wildwestKeys } from './data.js';
import { wildwestTitle } from './title.js';
import stylesheet from './style.css?inline';

/**
 * The Wild West (ARCHIVE 14y), the first style whose every part is in its own folder (SP1a):
 * the registry adds it with this, and nothing in the shared code names it.
 */
export const wildwest: StyleDefinition = {
  ...wildwestData,
  name: wildwestKeys.name,
  banner: 'banner-wildwest',
  skin: 'hud-wildwest',
  flavour: wildwestKeys.flavour,
  stylesheet,
  title: wildwestTitle,
  theme: () => import('./theme.js').then((m) => (seed) => new m.WildWestTheme(seed)),
};
