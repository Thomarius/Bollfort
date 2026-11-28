import { writeFileSync } from 'node:fs';

import {
  RoundStats,
  levelRows,
  levelsCsv,
  statsCsv,
  type LevelRow,
  type StatRow,
} from '@bollfort/analysis';
import { Bot, PlanningSlots, takeBotTurns } from '@bollfort/ai';
import {
  campaignRuleset,
  continueLevel,
  levelOutcome,
  levelSetup,
  newCampaign,
  newCarry,
  recordLevel,
  recordingTag,
  type CampaignLevelSetup,
  type CampaignSave,
} from '@bollfort/campaign';
import {
  BALANCED,
  type BotSetup,
  type CampaignDifficulty,
  type ConfigBundle,
} from '@bollfort/config';
import { Rng, createMatch, drainEvents, step, streamFor, type MatchState } from '@bollfort/sim';

/** What `--campaign` plays with bots (docs/CAMPAIGN.md CA12). */
export interface CampaignRun {
  /** A level, 1 to 6, played alone from a fresh start; or `all`, whole campaigns. */
  campaign: number | 'all';
  difficulty: CampaignDifficulty;
  /** Bot levels, each played through the same seeds: a sweep, never seats. */
  levels: readonly number[];
  matches: number;
  seed: number;
  /** A single level's firepower, as continues would have raised it. */
  firepower: number;
  maxTicks: number;
  stats: string | null;
  levelTable: string | null;
}

/** A bot's counts of where its build phases left their plan, summed over a level. */
interface BotCounts {
  /** Build phases played from a plan made in advance. */
  planned: number;
  diverged: number;
  gaveUp: number;
}

/**
 * Plays one level with one bot (solo only: a teammate's pieces turn grunts in ways no plan of the
 * other's can see, CA12), its own stream drawn from `botSeed`, which changes with each try: a
 * continue replays the level's seed, and a bot drawing the same would lose it the same way.
 */
function playLevel(
  bundle: ConfigBundle,
  setup: CampaignLevelSetup,
  bot: BotSetup,
  botSeed: number,
  sampler: RoundStats,
  maxTicks: number,
  counts: BotCounts,
): MatchState {
  const state = createMatch({
    seed: setup.seed,
    ruleset: campaignRuleset(bundle.campaign, bundle.ruleset, setup),
    terrainConfig: bundle.terrain,
    players: [{ name: 'Bot', isBot: true }],
  });
  const rng = new Rng(botSeed);
  const slots = new PlanningSlots(bundle.ai.plansPerTick, bundle.ai.planning.stepsPerTick);
  const bots = [new Bot(0, bot, bundle.ai, slots)];
  const plans = new Set<unknown>();
  while (state.phase !== 'game_over' && state.tick < maxTicks) {
    takeBotTurns(state, rng, (player) => bots[player]);
    for (const b of bots) if (b.lastPlan !== null) plans.add(b.lastPlan);
    step(state);
    sampler.observe(state, drainEvents(state));
  }
  counts.planned += plans.size;
  for (const b of bots) {
    counts.diverged += b.diverged;
    counts.gaveUp += b.gaveUp;
  }
  return state;
}

/**
 * The rounds a campaign has played before a level, as if each earlier level of the difficulty's
 * order went to its round limit — what the grunts' allowance, the waves and the ice are reckoned
 * by. From level 3 on everything it drives is at its ceiling anyway.
 */
/** `--campaign N|all` with bots: single levels from a fresh start, or whole campaigns. */
export function runCampaigns(bundle: ConfigBundle, run: CampaignRun): void {
  const rows: StatRow[] = [];
  const counts: BotCounts = { planned: 0, diverged: 0, gaveUp: 0 };
  const runs: { level: number; seed: number; save: CampaignSave }[] = [];
  const started = performance.now();

  for (const botLevel of run.levels) {
    const bot: BotSetup = { level: botLevel, personality: BALANCED };
    for (let m = 0; m < run.matches; m++) {
      const seed = run.seed + m;
      if (run.campaign === 'all') {
        const save = playCampaign(bundle, run, bot, seed, rows, counts);
        runs.push({ level: botLevel, seed, save });
        console.log(`  L${botLevel} seed ${seed}: ${campaignLine(bundle, save)}`);
      } else {
        const level = run.campaign - 1;
        const carry = newCarry(bundle.campaign, run.difficulty, 1);
        const setup: CampaignLevelSetup = {
          difficulty: run.difficulty,
          level,
          players: 1,
          seed: streamFor(seed, `campaign-level:${level}`).nextU32(),
          carry: {
            ...carry,
            firepower: run.firepower,
            roundsPlayed: 0,
          },
          continued: false,
        };
        const id = `sim-L${botLevel}-${seed}`;
        const sampler = new RoundStats(bundle, id, seed, () => bot, 1);
        playLevel(bundle, setup, bot, seed, sampler, run.maxTicks, counts);
        rows.push(...sampler.rows);
      }
    }
  }

  const levels = levelRows(bundle.campaign, rows);
  if (run.campaign !== 'all') summariseLevels(levels);
  else summariseCampaigns(bundle, runs, levels);
  console.log(
    `\n  build phases planned ${counts.planned}, left mid-phase ${counts.diverged}, ` +
      `given up ${counts.gaveUp}` +
      `  (${((performance.now() - started) / 1000).toFixed(0)} s)`,
  );
  if (run.stats !== null) {
    writeFileSync(run.stats, statsCsv(rows), 'utf8');
    console.log(`  ${rows.length} row(s) written to ${run.stats}`);
  }
  if (run.levelTable !== null) {
    writeFileSync(run.levelTable, levelsCsv(levels), 'utf8');
    console.log(`  ${levels.length} level(s) written to ${run.levelTable}`);
  }
}

/**
 * A whole campaign played by one bot through `run.ts`, as a page plays it: a level lost is played
 * again from its start, free in its first round or for a continue, until the campaign is won or
 * out of continues.
 */
function playCampaign(
  bundle: ConfigBundle,
  run: CampaignRun,
  bot: BotSetup,
  seed: number,
  rows: StatRow[],
  counts: BotCounts,
): CampaignSave {
  const config = bundle.campaign;
  let save = newCampaign(config, {
    id: `sim-L${bot.level}-${seed}`,
    difficulty: run.difficulty,
    names: ['Bot'],
    seed,
    now: '',
  });
  // Bounded, should a rule ever let a campaign go round for good (Easy has no limit of continues).
  for (let tries = 0; tries < 60 && !save.finished; tries++) {
    if (save.defeated) save = continueLevel(config, save, '');
    const tag = recordingTag(save);
    const id = `${save.id}-s${tag.stage}-t${tag.attempt}`;
    const sampler = new RoundStats(bundle, id, seed, () => bot, tag.attempt);
    const botSeed = streamFor(seed, `campaign-bot:${tag.stage}:${tag.attempt}`).nextU32();
    const state = playLevel(
      bundle,
      levelSetup(config, save),
      bot,
      botSeed,
      sampler,
      run.maxTicks,
      counts,
    );
    rows.push(...sampler.rows);
    if (state.phase !== 'game_over') break;
    save = recordLevel(config, save, levelOutcome(state), '');
  }
  return save;
}

/** How far a campaign got: won, or the stage it ended on, with its continues and points. */
function campaignLine(bundle: ConfigBundle, save: CampaignSave): string {
  const order = bundle.campaign.difficulties[save.difficulty].levelOrder;
  const won = save.finished && save.history.at(-1)?.result === 'cleared';
  const reached = won ? 'WON' : `ended at stage ${save.stage + 1}/${order.length}`;
  const score = save.carry.scores.reduce((a, b) => a + b, 0);
  return (
    `${reached}${save.finished ? '' : ' (unfinished)'}, ${save.carry.continuesUsed} continue(s), ` +
    `${save.history.length} level(s) played, ${score} pts`
  );
}

/** Whole campaigns by bot level: won, stages reached, continues, and then their levels. */
function summariseCampaigns(
  bundle: ConfigBundle,
  runs: readonly { level: number; save: CampaignSave }[],
  levels: readonly LevelRow[],
): void {
  summariseLevels(levels);
  const stages = (save: CampaignSave): number =>
    save.finished && save.history.at(-1)?.result === 'cleared'
      ? bundle.campaign.difficulties[save.difficulty].levelOrder.length
      : save.stage;
  console.log('\ncampaigns by bot level: won, stages cleared (mean, each), continues (mean)');
  for (const level of [...new Set(runs.map((r) => r.level))]) {
    const mine = runs.filter((r) => r.level === level).map((r) => r.save);
    const won = mine.filter((s) => s.finished && s.history.at(-1)?.result === 'cleared').length;
    const cleared = mine.map(stages);
    const mean = (xs: number[]): string =>
      (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);
    console.log(
      `  L${level}  ${won}/${mine.length} won  stages ${mean(cleared)} [${cleared.join(' ')}]` +
        `  continues ${mean(mine.map((s) => s.carry.continuesUsed))}`,
    );
  }
}

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
