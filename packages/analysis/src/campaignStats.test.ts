import { defaultConfigBundle, defaultTerrainConfig } from '@bollfort/config';
import { campaignRuleset, levelSetup, newCampaign } from '@bollfort/campaign';
import { createMatch, drainEvents, step, type MatchEvent, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { levelRows } from './levels.js';
import { NO_CAMPAIGN, RoundStats, parseStatsCsv, statsCsv, type StatRow } from './stats.js';

const config = defaultConfigBundle.campaign;

/** A campaign's first level for one person who does nothing, played to its end. */
function idleLevel(seed: number): { state: MatchState; rows: StatRow[]; events: MatchEvent[] } {
  const save = newCampaign(config, {
    id: 'c-test',
    difficulty: 'normal',
    names: ['You'],
    seed,
    now: '2026-11-27T00:00:00Z',
  });
  const state = createMatch({
    seed: levelSetup(config, save).seed,
    ruleset: campaignRuleset(config, defaultConfigBundle.ruleset, levelSetup(config, save)),
    terrainConfig: defaultTerrainConfig,
    players: [{ name: 'You', isBot: false }],
  });
  const stats = new RoundStats(defaultConfigBundle, 'm', seed, () => 'human', 1);
  const events: MatchEvent[] = [];
  for (let i = 0; i < 200_000 && state.phase !== 'game_over'; i++) {
    step(state);
    const drained = drainEvents(state);
    events.push(...drained);
    stats.observe(state, drained);
  }
  return { state, rows: stats.rows, events };
}

describe('a campaign level’s statistics', () => {
  const { state, rows, events } = idleLevel(3);
  const count = (kind: MatchEvent['kind']): number => events.filter((e) => e.kind === kind).length;
  const total = (pick: (row: StatRow) => number): number =>
    rows.reduce((sum, row) => sum + pick(row), 0);

  it('names the level, the difficulty and the try on every row', () => {
    expect(state.phase).toBe('game_over');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.campaignLevel).toBe(1);
      expect(row.difficulty).toBe('normal');
      expect(row.attempt).toBe(1);
      expect(row.firepower).toBe(0);
    }
  });

  it('marks how the level ended on its last row alone', () => {
    const ends = rows.map((r) => r.levelEnd);
    expect(ends.at(-1)).not.toBe('');
    expect(ends.slice(0, -1).every((end) => end === '')).toBe(true);
    expect(ends.at(-1) === 'lost').toBe(state.endedBy === 'level_lost');
  });

  it('counts every ship, shot and grunt of the level once, the last battle’s too', () => {
    expect(count('fleet_fired')).toBeGreaterThan(0);
    expect(total((r) => r.teamFleetShots)).toBe(count('fleet_fired'));
    const arrived = total(
      (r) => r.teamRaidersArrived + r.teamTransportsArrived + r.teamFrostshipsArrived,
    );
    expect(arrived).toBe(count('ship_arrived'));
    expect(total((r) => r.teamGruntsLanded)).toBe(count('grunt_landed'));
    expect(total((r) => r.teamWallsSmashed)).toBe(count('wall_smashed'));
    const cleared = events.filter((e) => e.kind === 'fleet_landed' && e.destroyed !== null);
    expect(total((r) => r.teamWallsShot)).toBe(cleared.length);
  });

  it('reads back from its CSV as written', () => {
    expect(parseStatsCsv(statsCsv(rows))).toEqual(rows);
  });

  it('sums into one level row', () => {
    const [level, ...more] = levelRows(config, rows);
    expect(more).toEqual([]);
    expect(level?.end).toBe(rows.at(-1)?.levelEnd);
    expect(level?.rounds).toBe(Math.max(...rows.map((r) => r.round)));
    expect(level?.fleetShots).toBe(count('fleet_fired'));
    expect(level?.seats).toBe('human');
  });
});

describe('a level row', () => {
  const row = (player: number, round: number, extra: Partial<StatRow>): StatRow => ({
    match: 'm',
    seed: 1,
    round,
    player,
    level: 6,
    personality: '',
    enclosedCastles: 1,
    cannonsAwarded: 1,
    eliminated: false,
    cannonsOwned: 2,
    cannonsActive: 2,
    cannonRoom: 0,
    pockets: 0,
    wallTiles: 40,
    piecesPlaced: 5,
    piecesBudget: 10,
    shotsFired: 4,
    territoryPoints: 10,
    gunPoints: 10,
    damagePoints: 0,
    score: 0,
    repairAtBuild: 0,
    repairLeft: 0,
    repairStuck: 0,
    special: '',
    towersOwned: 0,
    wallsRepaired: 0,
    frozenAtBuild: 0,
    repairFrozen: 0,
    sleepDealt: 0,
    ...NO_CAMPAIGN,
    difficulty: 'veteran',
    campaignLevel: 3,
    attempt: 2,
    firepower: 1,
    teamFleetShots: 7,
    shipHits: 1,
    ...extra,
  });

  it('counts the team’s columns once and each player’s for each, the bonus to everyone', () => {
    const rows = [
      row(0, 1, {}),
      row(1, 1, {}),
      row(0, 2, { levelEnd: 'threat', teamThreat: 5 }),
      row(1, 2, { levelEnd: 'threat', teamThreat: 5 }),
    ];
    const [level] = levelRows(config, rows);
    expect(level?.fleetShots).toBe(14);
    expect(level?.shipHits).toBe(4);
    expect(level?.players).toBe(2);
    expect(level?.seats).toBe('L6+L6');
    expect(level?.rounds).toBe(2);
    expect(level?.finalThreat).toBe(5);
    const bonus = Math.round(
      (config.levels[2]?.clearPoints ?? 0) * config.difficulties.veteran.scoreMultiplier,
    );
    expect(level?.clearPoints).toBe(bonus * 2);
  });

  it('gives no bonus for a level lost or left, and passes versus matches over', () => {
    expect(levelRows(config, [row(0, 1, { levelEnd: 'lost' })])[0]?.clearPoints).toBe(0);
    expect(levelRows(config, [row(0, 1, {})])[0]?.end).toBe('unfinished');
    expect(levelRows(config, [{ ...row(0, 1, {}), ...NO_CAMPAIGN }])).toEqual([]);
  });
});
