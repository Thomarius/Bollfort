import type { CampaignConfig } from '@bollfort/config';
import type { MatchState } from '@bollfort/sim';

import type { MatchLog } from './summary.js';

/** One player's points from a campaign level, by where they came from. */
export interface CampaignEndRow {
  player: number;
  ground: number;
  guns: number;
  ships: number;
  grunts: number;
  /** The level's bonus, once cleared, as `recordLevel` adds it to every player. */
  bonus: number;
  /** Everything earned in the level, the bonus in it: the score less what was carried in. */
  total: number;
}

/**
 * A campaign level's end screen (docs/CAMPAIGN.md CA12), apart from its drawing so it is tested
 * without a page: each player's points by source and the fleet's tally — ships sunk of those that
 * came by kind, grunts beaten of those that landed, castles taken.
 */
export interface CampaignEndView {
  cleared: boolean;
  rows: CampaignEndRow[];
  arrived: readonly number[];
  sunk: readonly number[];
  gruntsLanded: number;
  gruntsBeaten: number;
  castlesTaken: number;
}

/**
 * The view of a campaign level just over, or null for any other match. The sources are the log's,
 * from the events this page saw; the total is the state's, always whole — a page that came in
 * part-way shows what it saw by source, and the right total.
 */
export function campaignEndView(
  state: MatchState,
  log: MatchLog | null,
  config: CampaignConfig,
): CampaignEndView | null {
  const rules = state.ruleset.campaign;
  const fleet = state.campaign;
  if (rules === undefined || fleet === null) return null;
  const cleared = state.endedBy === 'level_cleared';
  const level = config.levels[rules.level];
  const bonus =
    cleared && level !== undefined
      ? Math.round(level.clearPoints * config.difficulties[rules.difficulty].scoreMultiplier)
      : 0;
  const rows = state.players.map((p) => {
    const from = log?.pointsFrom.get(p.id);
    const earned = p.score - (rules.carry.scores[p.id] ?? 0);
    return {
      player: p.id,
      ground: from?.ground ?? 0,
      guns: from?.guns ?? 0,
      ships: log?.shipPoints.get(p.id) ?? 0,
      grunts: log?.gruntPoints.get(p.id) ?? 0,
      bonus,
      total: earned + bonus,
    };
  });
  // Arrivals only the log saw; a ship sunk had arrived, so the tally never reads "3 of 2".
  const arrived = fleet.sunk.map((n, k) => Math.max(n, log?.arrived[k] ?? 0));
  return {
    cleared,
    rows,
    arrived,
    sunk: [...fleet.sunk],
    gruntsLanded: Math.max(fleet.gruntsKilled, log?.gruntsLanded ?? 0),
    gruntsBeaten: fleet.gruntsKilled,
    castlesTaken: fleet.castlesTaken,
  };
}
