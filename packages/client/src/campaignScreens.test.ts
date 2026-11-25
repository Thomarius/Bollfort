import { defaultCampaignConfig as config } from '@bollfort/config';
import {
  levelSetup,
  newCampaign,
  recordLevel,
  retryLevel,
  type LevelOutcome,
} from '@bollfort/campaign';
import type { Seat } from '@bollfort/protocol';
import { describe, expect, it } from 'vitest';

import { setLanguage } from './i18n.js';
import { deleteCampaign, loadCampaign, savedCampaigns, writeCampaign } from './campaignSaves.js';
import {
  campaignMenuMarkup,
  campaignRoomMarkup,
  campaignStartBlocked,
  defeatMarkup,
  type CampaignRoomView,
  introMarkup,
  summaryMarkup,
  victoryMarkup,
} from './campaignScreens.js';

setLanguage('en');

const NOW = '2026-11-25T12:00:00.000Z';

/** A Storage over a map, as the browser's would hold the saves. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function campaign(difficulty: 'normal' | 'veteran' = 'normal', id = 'c-1', now = NOW) {
  return newCampaign(config, { id, difficulty, names: ['Ada'], seed: 3, now });
}

function outcome(cleared: boolean, score: number): LevelOutcome {
  return {
    cleared,
    scores: [score],
    lives: 2,
    rounds: 3,
    shape: 'coast',
    sunk: [5, 1, 0],
    grunts: 4,
  };
}

describe('the campaign screens', () => {
  it('offer the four difficulties, easiest first', () => {
    const markup = campaignMenuMarkup(config, 'veteran', [], null, null);
    const order = [...markup.matchAll(/data-difficulty="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['easy', 'normal', 'veteran', 'legend']);
    expect(markup).toContain('class="difficulty primary" data-difficulty="veteran"');
    expect(markup).toContain('One life, no retry, from level 2, points × 2');
    expect(markup).toContain('No campaign saved yet.');
  });

  it('list the saves, the one played last first, and delete them', () => {
    const area = memoryStorage();
    writeCampaign(campaign('normal', 'c-1', '2026-11-24T10:00:00.000Z'), area);
    writeCampaign(campaign('veteran', 'c-2'), area);
    area.setItem('bollfort.campaign.c-3', '{"version":9}');
    const saved = savedCampaigns(area);
    expect(saved.map((s) => [s.id, s.kind])).toEqual([
      ['c-2', 'ok'],
      ['c-1', 'ok'],
      ['c-3', 'version'],
    ]);
    const markup = campaignMenuMarkup(config, 'normal', saved, 'c-1', null);
    expect(markup).toContain('Veteran · Level 1 of 6 · 500 points');
    expect(markup).toContain('Really delete');
    expect(loadCampaign('c-2', area)?.difficulty).toBe('veteran');
    deleteCampaign('c-2', area);
    expect(loadCampaign('c-2', area)).toBeNull();
  });

  it('introduce a level: its number, its shape, the fleet it sends', () => {
    const markup = introMarkup(config, campaign(), 'coast', ['#fff', '#d9a531', '#8fd3f0'], null);
    expect(markup).toContain('Level 1 of 6');
    expect(markup).toContain('A coast');
    expect(markup).toContain('Raiders × 10');
    expect(markup).not.toContain('Transports');
    expect(markup).toContain('and another frost ship every 5 rounds');
    expect(markup).toContain('id="campaign-map"');
    expect(markup).not.toContain('one hit more');
    // The last level is the final battle.
    let save = campaign();
    for (let stage = 0; stage < 5; stage++) save = recordLevel(config, save, outcome(true, 0), NOW);
    const final = introMarkup(config, save, 'island', [], null);
    expect(final).toContain('The final battle');
    // From level 4 on, every ship takes one hit more, and the intro says so.
    expect(final).toContain('From this level on every ship takes one hit more.');
  });

  it('sum a cleared level up, and offer a lost one again while retries last', () => {
    const cleared = recordLevel(config, campaign(), outcome(true, 400), NOW);
    const summary = summaryMarkup(cleared);
    expect(summary).toContain('Level 1 cleared!');
    expect(summary).toContain('Points this level: 650');
    expect(summary).toContain('Ships sunk: 5 raiders, 1 transports, 0 frost ships');

    const veteran = recordLevel(config, campaign('veteran'), outcome(false, 0), NOW);
    expect(defeatMarkup(config, veteran)).toContain('Retries left: 2');
    expect(defeatMarkup(config, veteran)).toContain('id="retry-level"');
    let out = veteran;
    for (let i = 0; i < 2; i++)
      out = recordLevel(config, retryLevel(out, NOW), outcome(false, 0), NOW);
    expect(out.finished).toBe(true);
    expect(defeatMarkup(config, out)).toContain('The campaign is over.');
    expect(defeatMarkup(config, out)).not.toContain('retry-level');
  });

  it('show the victory with every level', () => {
    let save = campaign();
    for (let stage = 0; stage < 6; stage++)
      save = recordLevel(config, save, outcome(true, save.carry.scores[0] ?? 0), NOW);
    const markup = victoryMarkup(save);
    expect(markup).toContain('Campaign won!');
    expect(markup).toContain('5750 points in all');
    expect(markup).toContain('Level 6: 2000 points');
  });
});

describe("a co-op campaign's room (CAMPAIGN §13)", () => {
  const save = newCampaign(config, {
    id: 'c-coop',
    difficulty: 'normal',
    names: ['Ada', 'Bo'],
    seed: 3,
    now: NOW,
  });
  const seat = (playerId: number, name: string, ready: boolean, connected = true): Seat => ({
    playerId,
    name,
    isBot: false,
    connected,
    ready,
    special: null,
  });
  const view = (over: Partial<CampaignRoomView> = {}): CampaignRoomView => ({
    save,
    level: levelSetup(config, save),
    shape: 'coast',
    seats: [seat(0, 'Ada', false), seat(1, 'Bo', false)],
    playerCount: 2,
    hostId: 0,
    humanPlayer: 0,
    code: 'ABCD',
    invite: null,
    justCleared: false,
    ...over,
  });

  it('offers co-op for two and three in the campaign menu', () => {
    const html = campaignMenuMarkup(config, 'normal', [], null, null, 2);
    expect(html).toContain('data-players="1"');
    expect(html).toContain('Co-op: 2 players');
    expect(html).toMatch(/class="players primary" data-players="2"/);
  });

  it('holds the start until every seat is taken and everyone is ready', () => {
    expect(campaignStartBlocked(view({ seats: [seat(0, 'Ada', false)] }))).toContain(
      '1 more player',
    );
    expect(campaignStartBlocked(view())).toContain('1 player to be ready');
    expect(
      campaignStartBlocked(view({ seats: [seat(0, 'Ada', false), seat(1, 'Bo', true)] })),
    ).toBe(null);
    expect(
      campaignStartBlocked(view({ seats: [seat(0, 'Ada', false), seat(1, 'Bo', true, false)] })),
    ).not.toBe(null);
  });

  it("shows the host Play and the room's code, and a teammate Ready", () => {
    const host = campaignRoomMarkup(config, view(), ['#fff', '#ec3', '#9df']);
    expect(host).toContain('id="start-level"');
    expect(host).toContain('disabled');
    expect(host).toContain('ABCD');
    expect(host).toContain('Ada');
    const guest = campaignRoomMarkup(config, view({ humanPlayer: 1 }), []);
    expect(guest).toContain('id="ready"');
    expect(guest).not.toContain('id="start-level"');
  });

  it('shows a defeat with its retry to the host alone, and waits without a save', () => {
    const lost = recordLevel(config, save, { ...outcome(false, 10), scores: [10, 5] }, NOW);
    const host = campaignRoomMarkup(config, view({ save: lost, level: null, shape: null }), []);
    expect(host).toContain('id="retry-level"');
    const guest = campaignRoomMarkup(
      config,
      view({ save: lost, level: null, shape: null, humanPlayer: 1 }),
      [],
    );
    expect(guest).not.toContain('id="retry-level"');
    expect(guest).toContain('Waiting for the host');
    expect(campaignRoomMarkup(config, view({ save: null }), [])).toContain('Waiting for the host');
  });

  it("puts the level just cleared over the next one's intro", () => {
    const cleared = recordLevel(config, save, { ...outcome(true, 100), scores: [100, 80] }, NOW);
    const html = campaignRoomMarkup(
      config,
      view({ save: cleared, level: levelSetup(config, cleared), justCleared: true }),
      [],
    );
    expect(html).toContain('Level 1 cleared!');
  });
});
