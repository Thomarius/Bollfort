import type { LevelRow } from '@bollfort/analysis';

/**
 * Campaign levels played, people's or bots', as the console shows them (docs/CAMPAIGN.md CA12):
 * a line per level, then each level's results by difficulty and who played it.
 */
export function summariseLevels(levels: readonly LevelRow[]): void {
  if (levels.length === 0) return;
  console.log('\ncampaign levels:');
  for (const l of levels) {
    const points = l.territoryPoints + l.gunPoints + l.shipPoints + l.gruntKillPoints;
    const aim = l.shotsAtSea === 0 ? '-' : `${Math.round((100 * l.shipHits) / l.shotsAtSea)}%`;
    console.log(
      `  ${l.match}  ${l.difficulty} L${l.campaignLevel} try ${l.attempt || '?'} fp ${l.firepower}` +
        `  ${l.seats}  ${l.end} after ${l.rounds}  ${points} pts (+${l.clearPoints})` +
        `  sunk ${l.raidersSunk}/${l.transportsSunk}/${l.frostshipsSunk}` +
        ` of ${l.raidersArrived}/${l.transportsArrived}/${l.frostshipsArrived}` +
        `  grunts ${l.gruntsShot + l.gruntsWalled}/${l.gruntsLanded}` +
        `  castles taken ${l.castlesTaken}  hits ${l.shipHits}/${l.shotsAtSea} (${aim})`,
    );
  }

  const groups = new Map<string, LevelRow[]>();
  for (const l of levels) {
    const key = `${l.difficulty} L${l.campaignLevel} ${l.seats}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  if (groups.size === levels.length) return;
  console.log('\n  by level and seats: played, cleared by threat / by the round limit, lost');
  for (const [key, group] of groups) {
    const n = (end: LevelRow['end']): number => group.filter((l) => l.end === end).length;
    const rounds = group.reduce((sum, l) => sum + l.rounds, 0) / group.length;
    console.log(
      `  ${key.padEnd(28)} ${String(group.length).padStart(3)}  ${n('threat')} / ` +
        `${n('round_limit')}, ${n('lost')} lost  ${rounds.toFixed(1)} rounds`,
    );
  }
}
