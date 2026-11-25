import type { TextKey } from '@bollfort/config';
import type { MatchEvent, MatchState } from '@bollfort/sim';

/**
 * What a campaign calls out over the board (docs/CAMPAIGN.md §14.1): ships approaching as each
 * wave begins to arrive, troops landing as the first of a build phase come ashore, and the first
 * frost ship of a level sighted — each once, so a busy phase is not a stream of words. Pure, for
 * the tests; the match screen shows what it returns (`Hud.callout`).
 */
export class CampaignCallouts {
  /** The phase each callout was last made in, so each is made once a phase. */
  private shipsIn = '';
  private troopsIn = '';
  private frostSeen = false;

  /** The callout an event calls for, if any. */
  note(event: MatchEvent, state: MatchState): TextKey | null {
    if (state.campaign === null) return null;
    const phase = `${state.round}:${state.phase}`;
    if (event.kind === 'ship_arrived') {
      if (event.ship.kind === 'frostship' && !this.frostSeen) {
        this.frostSeen = true;
        this.shipsIn = phase;
        return 'campaign.frostSighted';
      }
      if (this.shipsIn === phase) return null;
      this.shipsIn = phase;
      return 'campaign.shipsApproaching';
    }
    if (event.kind === 'grunt_landed' && this.troopsIn !== phase) {
      this.troopsIn = phase;
      return 'campaign.troopsLanding';
    }
    return null;
  }
}
