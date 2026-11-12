import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  achievementsOfRecording,
  statsOfRecording,
  type SeatAchievements,
  type StatRow,
} from '@bollfort/analysis';
import {
  ACHIEVEMENT_IDS,
  defaultAchievements,
  personalityWords,
  type ConfigBundle,
} from '@bollfort/config';
import { parseRecording, setupOfRecorded } from '@bollfort/protocol';
import type { MatchState } from '@bollfort/sim';

/**
 * Replays recordings of real matches (see `recording.ts` in the protocol) through the
 * same statistics a bot soak writes, so rounds played by people land in the same table
 * as rounds played by bots, a person's seat marked `human`.
 */

/**
 * Paths as typed, which is relative to where the command was run: `npm start -w` runs
 * the harness from its own package directory, and npm passes the original one along.
 */
function asTyped(path: string): string {
  return resolve(process.env['INIT_CWD'] ?? process.cwd(), path);
}

function recordingFiles(paths: readonly string[]): string[] {
  return paths.map(asTyped).flatMap((path) =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.jsonl'))
          .sort()
          .map((name) => join(path, name))
      : [path],
  );
}

function outcomeOf(state: MatchState): string {
  if (state.phase !== 'game_over') return `unfinished, round ${state.round}`;
  if (state.draw) return 'draw';
  const who = state.winners.map((id) => state.players[id]?.name ?? `player ${id}`).join(' + ');
  return state.endedBy === 'round_cap' ? `${who} on points` : `${who} last standing`;
}

export function replayAll(bundle: ConfigBundle, paths: readonly string[]): StatRow[] {
  const rows: StatRow[] = [];
  const files = recordingFiles(paths);
  console.log(`replaying ${files.length} recording(s)\n`);
  for (const file of files) {
    let lines;
    try {
      lines = parseRecording(readFileSync(file, 'utf8'));
    } catch (error) {
      console.log(`  ${file}: not a recording (${String(error).slice(0, 80)})`);
      continue;
    }
    const header = lines[0];
    if (header?.kind !== 'header') {
      console.log(`  ${file}: no header`);
      continue;
    }
    const tierOf = (player: number): string => {
      const setup = setupOfRecorded(header.players[player]);
      return setup === null ? 'human' : `L${setup.level} ${personalityWords(setup.personality)}`;
    };
    const { rows: matchRows, replay: result } = statsOfRecording(bundle, lines);
    rows.push(...matchRows);

    const who = header.players.map((p, id) => `${p.name}(${tierOf(id)})`).join(' ');
    // Exact unless the simulation has changed since the recording was made: its rules
    // and terrain travel in the header, but the code does not.
    const exact =
      result.mismatches.length === 0 && result.refused === 0
        ? 'exact'
        : `DIVERGED at tick ${result.mismatches[0] ?? '?'}, ${result.refused} refused — ` +
          (header.commit === undefined
            ? 'recorded with different code'
            : `recorded with ${header.commit}; check that out to replay it`);
    console.log(
      `  ${header.id}  ${header.source}  ${String(result.state.round).padStart(2)} rounds  ` +
        `${outcomeOf(result.state)}  [${exact}]\n    ${who}` +
        (header.commit === undefined ? '' : `  (code ${header.commit})`),
    );
  }
  return rows;
}

/**
 * What each seat of the recordings would have earned (docs/STEAM_ACHIEVEMENTS.md, AC2), as
 * shares of seat-matches: people by name, bots by level. Only recordings that replay exactly
 * count — after a mismatch the board is another match's — and the stats as a match's average.
 * The check that the thresholds still say what ARCHIVE 15zz measured, whenever a rule changes.
 */
export function replayAchievements(paths: readonly string[]): void {
  const files = recordingFiles(paths);
  const seats: SeatAchievements[] = [];
  let exact = 0;
  for (const file of files) {
    let lines;
    try {
      lines = parseRecording(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (lines[0]?.kind !== 'header') continue;
    const { seats: found, replay } = achievementsOfRecording(defaultAchievements, lines);
    if (replay.mismatches.length > 0 || replay.refused > 0) continue;
    exact++;
    seats.push(...found);
  }
  console.log(`${exact} of ${files.length} recording(s) replayed exactly\n`);

  const groupOf = (seat: SeatAchievements): string =>
    seat.level === null
      ? seat.name
      : seat.level <= 4
        ? 'L1-4'
        : seat.level === 5
          ? 'L5'
          : seat.level <= 7
            ? 'L6-7'
            : 'L8+';
  const groups = [...new Set(seats.map(groupOf))].sort((a, b) =>
    a.startsWith('L') === b.startsWith('L') ? a.localeCompare(b) : a.startsWith('L') ? 1 : -1,
  );
  const of = (group: string): SeatAchievements[] => seats.filter((s) => groupOf(s) === group);
  const width = 22;
  console.log(
    'achievement'.padEnd(width) + groups.map((g) => `${g} (${of(g).length})`.padStart(14)).join(''),
  );
  for (const id of ACHIEVEMENT_IDS) {
    const cells = groups.map((g) => {
      const members = of(g);
      const n = members.filter((s) => s.unlocked.includes(id)).length;
      return `${Math.round((100 * n) / Math.max(1, members.length))}%`.padStart(14);
    });
    console.log(id.padEnd(width) + cells.join(''));
  }
  console.log('\na match on average');
  for (const stat of ['castles_sealed', 'walls_destroyed'] as const) {
    const cells = groups.map((g) => {
      const members = of(g);
      const sum = members.reduce((total, s) => total + s.stats[stat], 0);
      return String(Math.round(sum / Math.max(1, members.length))).padStart(14);
    });
    console.log(stat.padEnd(width) + cells.join(''));
  }
}
