import { describe, expect, it } from 'vitest';
import { campaignLevelRuleset, stateFromAscii, type MatchEvent, type Ship } from '@bollfort/sim';

import { CampaignCallouts } from './campaignCallouts.js';

function arrived(kind: Ship['kind'], id: number): MatchEvent {
  const ship: Ship = {
    id,
    kind,
    x: 0,
    y: 0,
    hits: 0,
    heading: 0,
    run: null,
    runs: 0,
    restUntilTick: -1,
    arrivedTick: 0,
    shotId: null,
    nextLandTick: 0,
  };
  return { kind: 'ship_arrived', tick: 0, ship };
}

describe("a campaign's callouts", () => {
  it('call each thing out once a phase, the first frost ship once a level', () => {
    const state = stateFromAscii(',,,,', campaignLevelRuleset());
    const callouts = new CampaignCallouts();
    state.phase = 'build';
    expect(callouts.note(arrived('raider', 0), state)).toBe('campaign.shipsApproaching');
    expect(callouts.note(arrived('transport', 1), state)).toBeNull();
    expect(callouts.note(arrived('frostship', 2), state)).toBe('campaign.frostSighted');
    const landed = { kind: 'grunt_landed', tick: 0, grunt: { id: 0 } } as unknown as MatchEvent;
    expect(callouts.note(landed, state)).toBe('campaign.troopsLanding');
    expect(callouts.note(landed, state)).toBeNull();
    // The next build phase, the next wave: called out again, but no frost ship twice.
    state.round = 2;
    expect(callouts.note(arrived('frostship', 3), state)).toBe('campaign.shipsApproaching');
    expect(callouts.note(landed, state)).toBe('campaign.troopsLanding');
  });

  it('call out every castle the grunts take', () => {
    const state = stateFromAscii(',,,,', campaignLevelRuleset());
    const callouts = new CampaignCallouts();
    state.phase = 'combat';
    const castle = { id: 0, islandId: 1, x: 0, y: 0, w: 2, h: 2, enclosed: false };
    const taken: MatchEvent = { kind: 'castle_taken', tick: 0, gruntId: 0, castle };
    expect(callouts.note(taken, state)).toBe('campaign.castleTaken');
    expect(callouts.note(taken, state)).toBe('campaign.castleTaken');
  });

  it('call nothing out in versus play', () => {
    const state = stateFromAscii(',,,,');
    expect(new CampaignCallouts().note(arrived('raider', 0), state)).toBeNull();
  });
});
