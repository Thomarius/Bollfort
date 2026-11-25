import {
  defaultConfigBundle,
  type CampaignDifficulty,
  type CampaignLevelRules,
  type Ruleset,
} from '@bollfort/config';
import {
  campaignRuleset,
  levelSetup,
  newCampaign,
  recordLevel,
  retryLevel,
  won,
  type CampaignSave,
} from '@bollfort/campaign';
import { PHASES, type Phase } from '@bollfort/sim';

import { app, audio, params, showError } from './app.js';
import {
  deleteCampaign,
  loadCampaign,
  newCampaignId,
  savedCampaigns,
  writeCampaign,
} from './campaignSaves.js';
import {
  campaignMenuMarkup,
  defeatMarkup,
  introMarkup,
  summaryMarkup,
  victoryMarkup,
} from './campaignScreens.js';
import { t } from './i18n.js';
import { drawMapPreview } from './campaignMap.js';
import { outcomeOf } from './campaignRoom.js';
import { openCampaignRoom } from './lobbyFlow.js';
import { readCommon } from './menu.js';
import { runSession, type MatchExits } from './matchScreen.js';
import { preferredStyles, storedName } from './prefs.js';
import { DEFAULT_SETTINGS, localMatchFor, localSession, type Setup } from './session.js';

/**
 * Playing a campaign (docs/CAMPAIGN.md §2, §14.1, CA8): the campaign menu, a level's intro, the
 * level as a match, and what comes after it — the summary of a level cleared, a defeat with its
 * retry, the victory. The save is written the moment a level is over, before its summary shows,
 * so nothing after it can lose the result; a level left before its end is played again from its
 * start, the save as it was.
 */

/** Where the campaign's screens lead out to. */
export interface CampaignExits {
  menu: () => void;
}

const config = defaultConfigBundle.campaign;

/** The campaign menu: a new campaign by its difficulty, or a saved one to go on with. */
export function openCampaignMenu(exits: CampaignExits, notice: string | null = null): void {
  audio.music('music_menu');
  let chosen: CampaignDifficulty = 'normal';
  let players = 1;
  let confirming: string | null = null;
  const draw = (): void => {
    app!.innerHTML = campaignMenuMarkup(
      config,
      chosen,
      savedCampaigns(),
      confirming,
      notice,
      players,
    );
  };
  draw();
  const root = app!;
  const onClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null || !root.contains(button) || button.disabled) return;
    audio.play('select');
    const id = button.dataset.id ?? null;
    if (button.classList.contains('players')) {
      players = Number(button.dataset.players ?? 1);
    } else if (button.classList.contains('difficulty')) {
      chosen = (button.dataset.difficulty as CampaignDifficulty | undefined) ?? chosen;
    } else if (button.id === 'start-campaign') {
      leave();
      const now = new Date();
      const save = newCampaign(config, {
        id: newCampaignId(now),
        difficulty: chosen,
        // The others' names are labels until they take their seats (CAMPAIGN §12).
        names: [
          storedName(),
          ...Array.from({ length: players - 1 }, (_, i) => t('campaign.player', { n: i + 2 })),
        ],
        seed: Math.floor(Math.random() * 0x100000000),
        now: now.toISOString(),
      });
      const saved = writeCampaign(save);
      showCampaign(save, exits, saved ? null : t('campaign.couldNotSave'));
      return;
    } else if (button.classList.contains('resume') && id !== null) {
      leave();
      playCampaign(id, exits);
      return;
    } else if (button.classList.contains('delete')) {
      confirming = id;
    } else if (button.classList.contains('confirm-delete') && id !== null) {
      deleteCampaign(id);
      confirming = null;
    } else if (button.classList.contains('cancel-delete')) {
      confirming = null;
    } else if (button.id === 'back') {
      leave();
      exits.menu();
      return;
    }
    notice = null;
    draw();
  };
  const leave = (): void => root.removeEventListener('click', onClick);
  root.addEventListener('click', onClick);
}

/** Opens a saved campaign where it stands. */
export function playCampaign(id: string, exits: CampaignExits): void {
  const save = loadCampaign(id);
  if (save === null) {
    openCampaignMenu(exits, t('campaign.gone'));
    return;
  }
  showCampaign(save, exits, null);
}

/**
 * The campaign where it stands: its end once it has one — won, or lost with no retry left, the
 * save going as the end is shown — its defeat while a lost level waits to be retried, and the next
 * level's intro otherwise.
 */
function showCampaign(save: CampaignSave, exits: CampaignExits, notice: string | null): void {
  audio.music('music_menu');
  // A co-op campaign is played in a room, opened by its host, where it is shown (CAMPAIGN §13).
  if (save.players.length > 1 && !save.finished) {
    void openCampaignRoom(readCommon(), save, () =>
      openCampaignMenu(exits, t('campaign.noServer')),
    );
    return;
  }
  if (save.finished) {
    deleteCampaign(save.id);
    app!.innerHTML = won(config, save) ? victoryMarkup(save) : defeatMarkup(config, save);
    wire({ back: () => exits.menu() });
    return;
  }
  if (save.defeated) {
    app!.innerHTML = defeatMarkup(config, save);
    wire({
      'retry-level': () => {
        const retried = retryLevel(save, new Date().toISOString());
        const saved = writeCampaign(retried);
        showCampaign(retried, exits, saved ? null : t('campaign.couldNotSave'));
      },
      back: () => exits.menu(),
    });
    return;
  }
  const ruleset = rulesetFor(save);
  const rules = ruleset.campaign as CampaignLevelRules;
  const sails = Object.values(defaultConfigBundle.art.campaign.sails);
  app!.innerHTML = introMarkup(config, save, rules.shape, sails, notice);
  drawMapPreview(rules, levelSetup(config, save).seed);
  wire({
    'play-level': () => playLevel(save, ruleset, exits),
    back: () => exits.menu(),
  });
}

/** The summary of a level just cleared, then on to the next. */
function showSummary(save: CampaignSave, exits: CampaignExits, notice: string | null): void {
  audio.music('music_menu');
  if (save.finished) {
    showCampaign(save, exits, notice);
    return;
  }
  app!.innerHTML = summaryMarkup(save);
  wire({
    'next-level': () => showCampaign(save, exits, notice),
    back: () => exits.menu(),
  });
}

/** The buttons of a campaign screen, by id; each plays the click before it goes. */
function wire(handlers: Record<string, () => void>): void {
  for (const [id, go] of Object.entries(handlers)) {
    app!.querySelector(`#${id}`)?.addEventListener('click', () => {
      audio.play('select');
      go();
    });
  }
}

function rulesetFor(save: CampaignSave): Ruleset {
  return campaignRuleset(config, defaultConfigBundle.ruleset, levelSetup(config, save));
}

/** The next level as a match on this computer, and what its end does to the campaign. */
function playLevel(save: CampaignSave, ruleset: Ruleset, exits: CampaignExits): void {
  const setup: Setup = {
    seats: [null],
    seed: levelSetup(config, save).seed,
    styles: preferredStyles(),
    name: storedName(),
    settings: DEFAULT_SETTINGS,
    ruleset,
  };
  let after = save;
  let saved = true;
  const matchExits: MatchExits = {
    // Recorded and saved the moment the level is over, before its summary shows.
    finished: (state) => {
      after = recordLevel(config, save, outcomeOf(state), new Date().toISOString());
      saved = writeCampaign(after);
      return state.endedBy === 'level_cleared' ? t('campaign.cleared', { n: save.stage + 1 }) : '';
    },
    // Left before the end: nothing recorded, the level played again from its start.
    leave: () => showCampaign(save, exits, t('campaign.replayNote')),
    leaveConfirm: 'campaign.leaveConfirm',
    next: {
      label: 'campaign.continue',
      go: () => {
        const notice = saved ? null : t('campaign.couldNotSave');
        if (after.defeated || after.finished) showCampaign(after, exits, notice);
        else showSummary(after, exits, notice);
      },
    },
    back: () => exits.menu(),
  };
  // `&snapshot=PHASE` (and `&round=`, `&idle=1`) as a tournament's match has them: `game_over`
  // plays the level out at once, its result counted, for looking at what follows.
  const phase = params.get('snapshot');
  const match = localMatchFor(setup, phase === null, phase === null);
  if (phase !== null && PHASES.includes(phase as Phase)) {
    match.fastForwardTo(
      phase as Phase,
      Number(params.get('round') ?? 0),
      params.get('idle') === '1',
    );
  }
  void runSession(localSession(match, null), setup, matchExits).catch((error: unknown) =>
    showError(t('error.failedToStart'), error),
  );
}
