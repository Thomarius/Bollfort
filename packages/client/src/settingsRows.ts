import {
  buildZoomOptions,
  parseBuildZoom,
  saveBuildZoom,
  storedBuildZoom,
} from './buildZoomSetting.js';
import {
  mouseWheelOptions,
  parseMouseWheel,
  saveMouseWheel,
  storedMouseWheel,
} from './mouseWheelSetting.js';
import { backgroundMuteSetting, frameLimitSetting, shakeSetting } from './displaySettings.js';
import { graphicsOptions, parseGraphics, saveGraphics, storedGraphics } from './graphics.js';
import { openController } from './controllerWindow.js';
import { escape } from './html.js';
import { enhanceChoices } from './choices.js';
import { isLanguage, languageOptions, saveLanguage, setLanguage, t } from './i18n.js';
import { motionOptions, parseMotion, saveMotion, storedMotion } from './motion.js';
import {
  parseStyleMusic,
  saveStyleMusic,
  storedStyleMusic,
  styleMusicOptions,
} from './styleMusicSetting.js';
import {
  parseTowerBadges,
  saveTowerBadges,
  storedTowerBadges,
  towerBadgesOptions,
} from './towerBadgesSetting.js';
import { volumeSliders, type VolumeTarget } from './volume.js';

/**
 * The player's settings — the language, the Graphics, the Motion, the screen's shake, the frame
 * rate's cap, the two volumes, how often the styles' own music plays, the mute in background, the towers' emblems by the cursor, the island zoom, the mouse
 * wheel and the controller — in three tabs, built here for the menu's Options, which the pause
 * menu opens too, so the two look and order them the same (2026-10-28: the pause menu's had been
 * smaller, dimmer and in another order). Tabs since 2026-11-16 (the user's): one column of ten
 * rows had grown taller than the Deck's screen with the pause menu's buttons round it.
 */
export interface SettingsActions {
  /** The menus' click. */
  click(): void;
  /** The volumes, for the sliders. */
  volumes: VolumeTarget;
  /** Called once a new language is in use, for whatever holds the rows to be written afresh. */
  languageChanged(): void;
  /** Called after Reset to defaults, for the rows to be written afresh as the settings now stand. */
  rewrite(): void;
}

/** The tabs, in order: what is seen, what is heard, how it is played. */
export const SETTINGS_TABS = ['display', 'sound', 'controls'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tab last shown, opened again next time — the volume's, for someone who keeps changing it. */
let lastTab: SettingsTab = 'display';

/** A row: a label, its tip where it has one, and its choice. */
function row(name: string, select: string, tip?: string): string {
  return `<label${tip === undefined ? '' : ` data-tip="${escape(tip)}"`}>${name} ${select}</label>`;
}

/** The rows, their controls wired, each setting saved and taken as it is chosen. */
export function settingsRows(actions: SettingsActions): HTMLElement {
  const node = document.createElement('div');
  node.className = 'settings-rows';
  const pages: Record<SettingsTab, string> = {
    display:
      row(
        t('settings.language'),
        `<select class="language" data-ui="seg">${languageOptions()}</select>`,
      ) +
      row(
        t('settings.graphics'),
        `<select class="graphics" data-ui="seg">${graphicsOptions()}</select>`,
        t('settings.graphicsTitle'),
      ) +
      row(
        t('settings.motion'),
        `<select class="motion" data-ui="seg">${motionOptions()}</select>`,
      ) +
      row(
        t('settings.shake'),
        `<select class="shake" data-ui="seg">${shakeSetting.options()}</select>`,
        t('settings.shakeTitle'),
      ) +
      row(
        t('settings.frameLimit'),
        `<select class="frame-limit" data-ui="seg">${frameLimitSetting.options()}</select>`,
        t('settings.frameLimitTitle'),
      ),
    // The volumes' sliders first, put in below.
    sound:
      row(
        t('settings.styleMusic'),
        `<select class="style-music" data-ui="seg">${styleMusicOptions()}</select>`,
        t('settings.styleMusicTitle'),
      ) +
      row(
        t('settings.backgroundMute'),
        `<select class="background-mute" data-ui="seg">${backgroundMuteSetting.options()}</select>`,
        t('settings.backgroundMuteTitle'),
      ),
    controls:
      row(
        t('settings.buildZoom'),
        `<select class="build-zoom" data-ui="seg">${buildZoomOptions()}</select>`,
        t('settings.buildZoomTitle'),
      ) +
      row(
        t('settings.mouseWheel'),
        `<select class="mouse-wheel" data-ui="seg">${mouseWheelOptions()}</select>`,
        t('settings.mouseWheelTitle'),
      ) +
      row(
        t('settings.towerBadges'),
        `<select class="tower-badges" data-ui="seg">${towerBadgesOptions()}</select>`,
        t('settings.towerBadgesTitle'),
      ) +
      // A window of its own (`controllerWindow.ts`): its rows here would make the panel taller
      // than the Deck's screen.
      row(
        t('settings.controller'),
        `<button type="button" class="controller-open quiet">${t('controller.setUp')}</button>`,
        t('settings.controllerTitle'),
      ),
  };
  node.innerHTML =
    `<div class="tabs settings-tabs" role="tablist">${SETTINGS_TABS.map(
      (tab) =>
        `<button type="button" class="tab" role="tab" data-tab="${tab}">${t(`settings.tab.${tab}`)}</button>`,
    ).join('')}</div>` +
    // Every tab in one cell, the others only unseen, so the panel keeps the tallest one's height
    // and its Close stays where it is as the tabs change (`.tab-panels`, as the lobby's).
    `<div class="tab-panels">${SETTINGS_TABS.map(
      (tab) =>
        `<div class="tab-panel settings-page" role="tabpanel" data-panel="${tab}">${pages[tab]}</div>`,
    ).join('')}</div>` +
    // Under every tab, as it resets them all; asked once more, as Leave match is.
    `<button type="button" class="settings-reset quiet" data-tip="${escape(t('settings.resetTitle'))}">${t('settings.reset')}</button>`;
  node.querySelector('[data-panel="sound"]')?.prepend(volumeSliders(actions.volumes));

  const tabs = [...node.querySelectorAll<HTMLButtonElement>('.settings-tabs .tab')];
  const show = (shown: SettingsTab): void => {
    lastTab = shown;
    for (const tab of tabs) {
      const on = tab.dataset.tab === shown;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
      // Where a controller's focus starts as the panel opens (`padMenus.ts`): on the tab last
      // shown, which the first in reading order would otherwise replace by being focused.
      tab.toggleAttribute('data-main', on);
    }
    for (const panel of node.querySelectorAll<HTMLElement>('.settings-page'))
      panel.hidden = panel.dataset.panel !== shown;
  };
  for (const tab of tabs) {
    const shown = tab.dataset.tab as SettingsTab;
    tab.addEventListener('click', () => {
      if (shown !== lastTab) actions.click();
      show(shown);
    });
    // Shown as soon as it is focused: a controller walking along the tabs sees each in turn,
    // without pressing every one.
    tab.addEventListener('focus', () => {
      if (shown !== lastTab) actions.click();
      show(shown);
    });
  }
  show(lastTab);

  const language = node.querySelector<HTMLSelectElement>('.language')!;
  language.addEventListener('change', () => {
    actions.click();
    if (!isLanguage(language.value)) return;
    saveLanguage(language.value);
    setLanguage(language.value);
    actions.languageChanged();
  });
  // Both taken at once in a match: it redraws at the level's resolution (`onGraphics`), its
  // bloom put on or taken off (`render/bloom.ts`), and the motion read every frame.
  const graphics = node.querySelector<HTMLSelectElement>('.graphics')!;
  graphics.addEventListener('change', () => {
    actions.click();
    saveGraphics(parseGraphics(graphics.value) ?? 'medium');
  });
  const motion = node.querySelector<HTMLSelectElement>('.motion')!;
  motion.addEventListener('change', () => {
    actions.click();
    saveMotion(parseMotion(motion.value) ?? 'full');
  });
  // Taken at the next look's start, the track playing left to finish (`matchScreen.ts`).
  const styleMusic = node.querySelector<HTMLSelectElement>('.style-music')!;
  styleMusic.addEventListener('change', () => {
    actions.click();
    saveStyleMusic(parseStyleMusic(styleMusic.value) ?? 'always');
  });
  // Taken at the next frame the cursor is drawn.
  const badges = node.querySelector<HTMLSelectElement>('.tower-badges')!;
  badges.addEventListener('change', () => {
    actions.click();
    saveTowerBadges(parseTowerBadges(badges.value) ?? 'next');
  });
  // Taken at once in a match, in a build or cannon phase (`islandZoom.ts`).
  const zoom = node.querySelector<HTMLSelectElement>('.build-zoom')!;
  zoom.addEventListener('change', () => {
    actions.click();
    saveBuildZoom(parseBuildZoom(zoom.value) ?? 'out');
  });
  // Asked at each turn of the wheel.
  const wheel = node.querySelector<HTMLSelectElement>('.mouse-wheel')!;
  wheel.addEventListener('change', () => {
    actions.click();
    saveMouseWheel(parseMouseWheel(wheel.value) ?? 'turn');
  });
  // Taken at the next shake.
  const shake = node.querySelector<HTMLSelectElement>('.shake')!;
  shake.addEventListener('change', () => {
    actions.click();
    shakeSetting.save(shakeSetting.parse(shake.value) ?? shakeSetting.fallback);
  });
  // Taken at the next frame of a match.
  const frames = node.querySelector<HTMLSelectElement>('.frame-limit')!;
  frames.addEventListener('change', () => {
    actions.click();
    frameLimitSetting.save(frameLimitSetting.parse(frames.value) ?? frameLimitSetting.fallback);
  });
  // Taken as the window next goes behind another (`app.ts`).
  const background = node.querySelector<HTMLSelectElement>('.background-mute')!;
  background.addEventListener('change', () => {
    actions.click();
    backgroundMuteSetting.save(
      backgroundMuteSetting.parse(background.value) ?? backgroundMuteSetting.fallback,
    );
  });
  const reset = node.querySelector<HTMLButtonElement>('.settings-reset')!;
  reset.addEventListener('click', () => {
    actions.click();
    if (!reset.classList.contains('confirm')) {
      reset.classList.add('confirm');
      reset.textContent = t('settings.resetConfirm');
      return;
    }
    resetSettings(actions.volumes);
    actions.rewrite();
  });
  node.querySelector('.controller-open')?.addEventListener('click', (event) => {
    // Not the label's: a click inside a label goes to its first control too.
    event.preventDefault();
    openController(actions.click);
  });
  showStored(node);
  // Each choice a row of buttons in front of its select, now the selects stand as stored.
  enhanceChoices(node);
  return node;
}

/** The selects as the settings are stored. */
function showStored(node: HTMLElement): void {
  node.querySelector<HTMLSelectElement>('.graphics')!.value = storedGraphics();
  node.querySelector<HTMLSelectElement>('.motion')!.value = storedMotion();
  node.querySelector<HTMLSelectElement>('.style-music')!.value = storedStyleMusic();
  node.querySelector<HTMLSelectElement>('.tower-badges')!.value = storedTowerBadges();
  node.querySelector<HTMLSelectElement>('.build-zoom')!.value = storedBuildZoom();
  node.querySelector<HTMLSelectElement>('.mouse-wheel')!.value = storedMouseWheel();
  node.querySelector<HTMLSelectElement>('.shake')!.value = shakeSetting.get();
  node.querySelector<HTMLSelectElement>('.frame-limit')!.value = frameLimitSetting.get();
  node.querySelector<HTMLSelectElement>('.background-mute')!.value = backgroundMuteSetting.get();
}

/**
 * Reset to defaults (the user's, 2026-11-16): every setting in the tabs as the game comes, but
 * the language — someone who reset into a language they cannot read could not find it again —
 * and the controller's buttons, which have their own Restore in their window.
 */
export function resetSettings(volumes: VolumeTarget): void {
  saveGraphics('medium');
  saveMotion('full');
  shakeSetting.save(shakeSetting.fallback);
  frameLimitSetting.save(frameLimitSetting.fallback);
  volumes.setVolume('music', 1);
  volumes.setVolume('sounds', 1);
  saveStyleMusic('always');
  backgroundMuteSetting.save(backgroundMuteSetting.fallback);
  saveBuildZoom('out');
  saveMouseWheel('turn');
  saveTowerBadges('next');
}
