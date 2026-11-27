import { BALANCED, defaultConfigBundle, defaultTerrainConfig } from '@bollfort/config';
import { Bot, takeBotTurns } from '@bollfort/ai';
import { campaignRuleset, levelSetup, newCampaign } from '@bollfort/campaign';
import { Rng, createMatch, drainEvents, step, type MatchState } from '@bollfort/sim';
import { describe, expect, it } from 'vitest';

import { campaignEndView } from './campaignEnd.js';
import { MatchLog } from './summary.js';

const config = defaultConfigBundle.campaign;

/** Level 1 of a Normal campaign played out by a bot, a page's log watching every event. */
function played(seed: number): { state: MatchState; log: MatchLog } {
  const save = newCampaign(config, {
    id: 'c',
    difficulty: 'normal',
    names: ['Bot'],
    seed,
    now: '',
  });
  const setup = levelSetup(config, save);
  const state = createMatch({
    seed: setup.seed,
    ruleset: campaignRuleset(config, defaultConfigBundle.ruleset, setup),
    terrainConfig: defaultTerrainConfig,
    players: [{ name: 'Bot', isBot: true }],
  });
  const bot = new Bot(0, { level: 8, personality: BALANCED });
  const rng = new Rng(seed);
  const log = new MatchLog();
  for (let i = 0; i < 100_000 && state.phase !== 'game_over'; i++) {
    takeBotTurns(state, rng, () => bot);
    step(state);
    log.note(drainEvents(state), state);
  }
  return { state, log };
}

describe('a campaign level’s end screen (CAMPAIGN CA12)', () => {
  const { state, log } = played(1);

  it('adds each player’s points up by where they came from, the bonus in them once cleared', () => {
    expect(state.endedBy).toBe('level_cleared');
    const view = campaignEndView(state, log, config)!;
    const [row] = view.rows;
    const bonus = Math.round((config.levels[0]?.clearPoints ?? 0) * 1);
    expect(row?.bonus).toBe(bonus);
    expect(row!.total).toBe(state.players[0]!.score + bonus);
    // A page that saw the whole level: its sources add up to the total.
    expect(row!.ground + row!.guns + row!.ships + row!.grunts + row!.bonus).toBe(row!.total);
    expect(row!.ships).toBeGreaterThan(0);
  });

  it('counts the ships sunk of those that came, a ship recycled at the coast once', () => {
    const view = campaignEndView(state, log, config)!;
    expect(view.sunk).toEqual(state.campaign!.sunk);
    view.sunk.forEach((n, k) => expect(n).toBeLessThanOrEqual(view.arrived[k]!));
    expect(view.arrived.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('shows what it can without a log, and nothing for a match of versus play', () => {
    const view = campaignEndView(state, null, config)!;
    expect(view.rows[0]!.total).toBe(state.players[0]!.score + view.rows[0]!.bonus);
    expect(view.arrived).toEqual(view.sunk);
    expect(campaignEndView({ ...state, campaign: null }, log, config)).toBeNull();
  });
});
