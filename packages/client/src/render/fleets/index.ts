import type { FleetLook } from '../fleetLooks.js';
import { FLAT_FLEET } from './flat.js';
import { CYBERPUNK_FLEET } from './cyberpunk.js';
import { BLUEPRINT_FLEET } from './blueprint.js';
import { PARCHMENT_FLEET } from './parchment.js';
import { BRICKS_FLEET } from './bricks.js';
import { GLASS_FLEET } from './glass.js';
import { CHOCOLATE_FLEET } from './chocolate.js';
import { HALLOWEEN_FLEET } from './halloween.js';
import { SAKURA_FLEET } from './sakura.js';
import { OKTOBERFEST_FLEET } from './oktoberfest.js';
import { OPERA_FLEET } from './opera.js';
import { OFFICE_FLEET } from './office.js';
import { UNDERSEA_FLEET } from './undersea.js';
import { ELECTRIC_FLEET } from './electric.js';
import { CARTOON_FLEET } from './cartoon.js';
import { CHRISTMAS_FLEET } from './christmas.js';
import { NOIR_FLEET } from './noir.js';
import { SPORTS_FLEET } from './sports.js';
import { PIRATES_FLEET } from './pirates.js';
import { ANIME_FLEET } from './anime.js';
import { MYTHOLOGY_FLEET } from './mythology.js';

/** The look each base style's theme brings for a campaign's enemy, by its id: `Theme.fleet`. */
export const BASE_FLEETS = {
  flat: FLAT_FLEET,
  cyberpunk: CYBERPUNK_FLEET,
  blueprint: BLUEPRINT_FLEET,
  parchment: PARCHMENT_FLEET,
  bricks: BRICKS_FLEET,
  glass: GLASS_FLEET,
  chocolate: CHOCOLATE_FLEET,
  halloween: HALLOWEEN_FLEET,
  sakura: SAKURA_FLEET,
  oktoberfest: OKTOBERFEST_FLEET,
  opera: OPERA_FLEET,
  office: OFFICE_FLEET,
  undersea: UNDERSEA_FLEET,
  electric: ELECTRIC_FLEET,
  cartoon: CARTOON_FLEET,
  christmas: CHRISTMAS_FLEET,
  noir: NOIR_FLEET,
  sports: SPORTS_FLEET,
  pirates: PIRATES_FLEET,
  anime: ANIME_FLEET,
  mythology: MYTHOLOGY_FLEET,
} as const satisfies Record<string, FleetLook>;
