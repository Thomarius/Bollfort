import type { MatchEvent } from '@bollfort/sim';

import { app, audio, showError } from '../app.js';
import { t } from '../i18n.js';
import { pads } from '../pads.js';
import { perf } from '../perf.js';
import { runSession } from '../matchScreen.js';
import { DEFAULT_SETTINGS, type Session, type Setup } from '../session.js';
import { tutorialFinished } from '../steam/achievements.js';
import { store } from '../storage.js';
import { RIVAL, YOU, tutorialBoard } from './board.js';
import { TUTORIAL_LAYOUT } from './layout.js';
import { TUTORIAL_DONE_KEY } from './offer.js';
import { TutorialPanel } from './panel.js';
import { TutorialMatch } from './session.js';

/**
 * Where the tutorial leads: the menu, and a first real match — the lobby, where the table is
 * set (docs/TUTORIAL.md §4). Passed in, since the menu is where both are.
 */
export interface TutorialWays {
  menu(): void;
  play(): void;
}

/**
 * The tutorial (docs/TUTORIAL.md), from the menu's button, the first start's offer or
 * `?tutorial=1`: Medieval for building and Night for combat, whatever the menu has chosen
 * (the user's, 2026-11-22), since they show everything plainly.
 */
export function startTutorial(ways: TutorialWays): void {
  const match = new TutorialMatch(tutorialBoard([t('local.you'), t('tutorial.rival')]));
  const { director, state } = match;
  // For driving it from a script, as the scene is (`&perf=1`).
  if (perf.enabled) Object.assign(globalThis, { bollfortTutorial: match });
  let paused: number | null = null;
  const session: Session = {
    state,
    humanPlayer: YOU,
    get tickFraction() {
      return match.tickFraction;
    },
    get finished() {
      return match.finished;
    },
    advance: (ms) => match.advance(ms),
    submit: (action) => match.submit(action),
    get pausedBy() {
      return paused;
    },
    setPaused: (on) => {
      paused = on ? YOU : null;
      match.halted = on;
    },
    status: () => '',
    network: () => null,
    leave: () => undefined,
    rematch: null,
    requestRematch: () => undefined,
    botLevels: state.players.map((p) => (p.id === RIVAL ? 1 : null)),
  };
  const setup: Setup = {
    seats: [null, 1],
    seed: TUTORIAL_LAYOUT.seed,
    styles: { build: 'pixel', combat: 'night' },
    name: t('local.you'),
    settings: DEFAULT_SETTINGS,
  };

  let panel: TutorialPanel | null = null;
  let stop: (() => void) | null = null;
  let ended = false;
  /** The step last seen, for the sound a step brings. */
  let lastStep = director.step;
  /** The end's fanfare, held back until the win is told (§4). */
  let held: MatchEvent[] = [];
  const next = (): void => {
    if (!director.holding) return;
    audio.play('select');
    match.continue();
  };
  const leave = (then: () => void): void => {
    panel?.destroy();
    panel = null;
    stop?.();
    stop = null;
    then();
  };
  void runSession(session, setup, {
    // Leaving from the pause menu: no question, nothing is lost.
    leave: () => {
      panel?.destroy();
      ways.menu();
    },
    back: () => {
      panel?.destroy();
      ways.menu();
    },
    tutorial: {
      allows: (action) => director.allows(state, action),
      marks: () => director.marks(state),
      camera: () => director.camera(),
      celebrating: () => director.celebrating,
      // Kept up after the end: the rival "Knocked out", your last points, both told then.
      bannersAtEnd: () => true,
      clockShown: () => director.clockShown,
      inputOpen: () => director.inputOpen,
      turnHint: () => director.turnHint,
      heard: (events) => {
        const now = [...held.splice(0), ...events];
        if (director.celebrating) return now;
        held = now.filter((e) => e.kind === 'game_over');
        return now.filter((e) => e.kind !== 'game_over');
      },
      frame: () => {
        if (panel === null) return;
        // A controller's Accept is Continue while a note is up (STEAM.md §8).
        if (director.holding && pads.pressed.has('accept')) next();
        if (director.step !== lastStep) {
          lastStep = director.step;
          // The rival's lost life heard as the camera shows it: no cue of the match's is its.
          if (lastStep === 'lifeLost') audio.play('enclosure_failed');
        }
        panel.update(director.card(state));
        if (director.finished && !ended) {
          ended = true;
          store(TUTORIAL_DONE_KEY, '1');
          tutorialFinished();
          panel.finish(
            () => leave(ways.play),
            () => leave(ways.menu),
            () => audio.play('select'),
          );
        }
      },
    },
  })
    .then((cleanup) => {
      stop = cleanup;
      panel = new TutorialPanel(
        app!,
        () => {
          audio.play('select');
          leave(ways.menu);
        },
        next,
      );
    })
    .catch((error: unknown) => showError(t('error.failedToStart'), error));
}
