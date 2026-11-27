import type { CampaignConfig } from '@bollfort/config';

import { rowLabel, type LevelEnd, type StatRow } from './stats.js';

/**
 * One campaign level played, summed from its rows (docs/CAMPAIGN.md CA12): how it ended, how long
 * it lasted, the team's points by source and what the fleet did. Summed across the players, so a
 * co-op level is one row as a solo one is.
 */
export interface LevelRow {
  match: string;
  seed: number;
  /** Who played it: each seat's label (`rowLabel`), joined by `+`. */
  seats: string;
  difficulty: string;
  campaignLevel: number;
  attempt: number;
  firepower: number;
  players: number;
  /** `unfinished` for a level left before its end. */
  end: LevelEnd | 'unfinished';
  rounds: number;
  /** The team's points earned in it, by source, the difficulty's factor in each. */
  territoryPoints: number;
  gunPoints: number;
  shipPoints: number;
  gruntKillPoints: number;
  /** The level's bonus to every player, as `recordLevel` adds it once cleared. */
  clearPoints: number;
  raidersArrived: number;
  transportsArrived: number;
  frostshipsArrived: number;
  raidersSunk: number;
  transportsSunk: number;
  frostshipsSunk: number;
  shipsRecycled: number;
  fleetShots: number;
  wallsShot: number;
  gruntsLanded: number;
  gruntsShot: number;
  gruntsWalled: number;
  wallsSmashed: number;
  castlesTaken: number;
  iceLaid: number;
  shotsFired: number;
  shotsAtSea: number;
  shipHits: number;
  /** The fleet's threat after the last row. */
  finalThreat: number;
}

const LEVEL_COLUMNS: (keyof LevelRow)[] = [
  'match',
  'seed',
  'seats',
  'difficulty',
  'campaignLevel',
  'attempt',
  'firepower',
  'players',
  'end',
  'rounds',
  'territoryPoints',
  'gunPoints',
  'shipPoints',
  'gruntKillPoints',
  'clearPoints',
  'raidersArrived',
  'transportsArrived',
  'frostshipsArrived',
  'raidersSunk',
  'transportsSunk',
  'frostshipsSunk',
  'shipsRecycled',
  'fleetShots',
  'wallsShot',
  'gruntsLanded',
  'gruntsShot',
  'gruntsWalled',
  'wallsSmashed',
  'castlesTaken',
  'iceLaid',
  'shotsFired',
  'shotsAtSea',
  'shipHits',
  'finalThreat',
];

/**
 * The campaign levels among a table's rows, one row each, in the order their matches first appear.
 * Versus matches' rows are passed over.
 */
export function levelRows(config: CampaignConfig, rows: readonly StatRow[]): LevelRow[] {
  const byMatch = new Map<string, StatRow[]>();
  for (const row of rows) {
    if (row.campaignLevel === 0) continue;
    const list = byMatch.get(row.match);
    if (list === undefined) byMatch.set(row.match, [row]);
    else list.push(row);
  }
  return [...byMatch.values()].map((list) => levelOf(config, list));
}

function levelOf(config: CampaignConfig, rows: readonly StatRow[]): LevelRow {
  const first = rows[0] as StatRow;
  const last = rows.at(-1) as StatRow;
  const sum = (pick: (row: StatRow) => number, of: readonly StatRow[] = rows): number =>
    of.reduce((total, row) => total + pick(row), 0);
  // The team's columns stand on every player's row of a round: counted once, from the lowest seat.
  const seat = Math.min(...rows.map((r) => r.player));
  const teamRows = rows.filter((r) => r.player === seat);
  const team = (pick: (row: StatRow) => number): number => sum(pick, teamRows);
  const seats = [...new Set(rows.map((r) => r.player))].sort((a, b) => a - b);
  const label = seats.map((p) => rowLabel(rows.find((r) => r.player === p) as StatRow)).join('+');
  const end: LevelRow['end'] = last.levelEnd === '' ? 'unfinished' : last.levelEnd;
  const cleared = end === 'threat' || end === 'round_limit';
  const level = config.levels[first.campaignLevel - 1];
  const difficulty = config.difficulties[first.difficulty as keyof typeof config.difficulties];
  const bonus =
    cleared && level !== undefined && difficulty !== undefined
      ? Math.round(level.clearPoints * difficulty.scoreMultiplier) * seats.length
      : 0;
  return {
    match: first.match,
    seed: first.seed,
    seats: label,
    difficulty: first.difficulty,
    campaignLevel: first.campaignLevel,
    attempt: first.attempt,
    firepower: first.firepower,
    players: seats.length,
    end,
    rounds: Math.max(...rows.map((r) => r.round)),
    territoryPoints: sum((r) => r.territoryPoints),
    gunPoints: sum((r) => r.gunPoints),
    shipPoints: sum((r) => r.shipPoints),
    gruntKillPoints: sum((r) => r.gruntKillPoints),
    clearPoints: bonus,
    raidersArrived: team((r) => r.teamRaidersArrived),
    transportsArrived: team((r) => r.teamTransportsArrived),
    frostshipsArrived: team((r) => r.teamFrostshipsArrived),
    raidersSunk: sum((r) => r.raidersSunk),
    transportsSunk: sum((r) => r.transportsSunk),
    frostshipsSunk: sum((r) => r.frostshipsSunk),
    shipsRecycled: team((r) => r.teamShipsRecycled),
    fleetShots: team((r) => r.teamFleetShots),
    wallsShot: team((r) => r.teamWallsShot),
    gruntsLanded: team((r) => r.teamGruntsLanded),
    gruntsShot: sum((r) => r.gruntsShot),
    gruntsWalled: sum((r) => r.gruntsWalled),
    wallsSmashed: team((r) => r.teamWallsSmashed),
    castlesTaken: team((r) => r.teamCastlesTaken),
    iceLaid: team((r) => r.teamIceLaid),
    shotsFired: sum((r) => r.shotsFired),
    shotsAtSea: sum((r) => r.shotsAtSea),
    shipHits: sum((r) => r.shipHits),
    finalThreat: (teamRows.at(-1) as StatRow).teamThreat,
  };
}

/** The level rows as CSV, a header line first. */
export function levelsCsv(rows: readonly LevelRow[]): string {
  const lines = [LEVEL_COLUMNS.join(',')];
  for (const row of rows) lines.push(LEVEL_COLUMNS.map((c) => String(row[c])).join(','));
  return `${lines.join('\n')}\n`;
}
