import {
  CAMPAIGN_DIFFICULTIES,
  type TextKey,
  type CampaignConfig,
  type CampaignDifficulty,
  type MapShape,
} from '@bollfort/config';
import {
  levelOrder,
  nextLevel,
  poolFor,
  retriesLeft,
  teamTotal,
  type CampaignSave,
  type LevelRecord,
} from '@bollfort/campaign';

import { escape } from './html.js';
import { withIcon } from './icons.js';
import { t } from './i18n.js';
import type { SavedCampaign } from './campaignSaves.js';
import { playedWhen } from './tournamentText.js';

/**
 * The campaign's screens as markup (docs/CAMPAIGN.md §14.1): the campaign menu, a level's intro,
 * a cleared level's summary, a defeat and the victory — pure, so they are tested without a page.
 * In the menus' frame, as the tournament's screens are; their polish waits for the users' play.
 */

const DIFFICULTY_NAMES: Record<CampaignDifficulty, TextKey> = {
  easy: 'campaign.easy',
  normal: 'campaign.normal',
  veteran: 'campaign.veteran',
  legend: 'campaign.legend',
};

const DIFFICULTY_HINTS: Record<CampaignDifficulty, TextKey> = {
  easy: 'campaign.easyHint',
  normal: 'campaign.normalHint',
  veteran: 'campaign.veteranHint',
  legend: 'campaign.legendHint',
};

const SHAPE_NAMES: Record<MapShape, TextKey> = {
  coast: 'campaign.shapeCoast',
  corner: 'campaign.shapeCorner',
  strip: 'campaign.shapeStrip',
  island: 'campaign.shapeIsland',
  bay: 'campaign.shapeBay',
};

export function difficultyName(difficulty: CampaignDifficulty): string {
  return t(DIFFICULTY_NAMES[difficulty]);
}

export function shapeName(shape: MapShape): string {
  return t(SHAPE_NAMES[shape]);
}

/** The levels' numbers as the players count them: the place in the run, from 1. */
function stageLine(config: CampaignConfig, save: CampaignSave): string {
  return t('campaign.levelOf', {
    level: Math.min(save.stage + 1, levelOrder(config, save).length),
    levels: levelOrder(config, save).length,
  });
}

function savedRow(config: CampaignConfig, entry: SavedCampaign, confirming: boolean): string {
  const id = escape(entry.id);
  const remove = confirming
    ? `<button class="confirm-delete" data-id="${id}">${t('campaign.confirmDelete')}</button>` +
      `<button class="cancel-delete quiet" data-id="${id}">${t('campaign.cancel')}</button>`
    : `<button class="delete quiet" data-id="${id}">${t('campaign.delete')}</button>`;
  if (entry.kind !== 'ok') {
    const why = entry.kind === 'version' ? t('tournament.older') : t('tournament.damaged');
    return `<li class="saved unreadable"><div class="saved-text"><b>${t('campaign.title')}</b><small>${escape(why)}</small></div><div class="saved-buttons">${remove}</div></li>`;
  }
  const { save } = entry;
  const where = save.finished ? t('campaign.finishedLine') : stageLine(config, save);
  const line = t('campaign.savedLine', {
    difficulty: difficultyName(save.difficulty),
    where,
    score: teamTotal(save),
  });
  const when = t('tournament.lastPlayed', { date: playedWhen(save.playedAt) });
  const resume = confirming
    ? ''
    : `<button class="resume" data-id="${id}">${t('campaign.resume')}</button>`;
  return (
    `<li class="saved"><div class="saved-text"><b>${escape(save.players.map((p) => p.name).join(', '))}</b>` +
    `<small>${escape(line)}</small><small>${escape(when)}</small></div>` +
    `<div class="saved-buttons">${resume}${remove}</div></li>`
  );
}

/** The campaign menu: a new campaign by its difficulty, and the saved ones to go on with. */
export function campaignMenuMarkup(
  config: CampaignConfig,
  chosen: CampaignDifficulty,
  saved: readonly SavedCampaign[],
  confirming: string | null,
  notice: string | null,
): string {
  const card = (d: CampaignDifficulty): string =>
    `<button class="difficulty${d === chosen ? ' primary' : ''}" data-difficulty="${d}">` +
    `<b>${escape(difficultyName(d))}</b><small>${escape(t(DIFFICULTY_HINTS[d]))}</small></button>`;
  const cards = CAMPAIGN_DIFFICULTIES.filter((d) => config.difficulties[d].offered)
    .map(card)
    .join('');
  const list =
    saved.length === 0
      ? `<p class="note">${t('campaign.none')}</p>`
      : `<ul class="saved-list">${saved.map((e) => savedRow(config, e, e.id === confirming)).join('')}</ul>`;
  return `
    <div class="menu campaign-menu tournament-resume">
      <h1>${t('campaign.title')}</h1>
      ${notice === null ? '' : `<p class="note warn">${escape(notice)}</p>`}
      <h2>${t('campaign.new')}</h2>
      <div class="split campaign-difficulties">${cards}</div>
      <button id="start-campaign" class="primary">${withIcon('play', t('campaign.start'))}</button>
      <h2>${t('campaign.resumeTitle')}</h2>
      ${list}
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.back'))}</button>
    </div>`;
}

/** The fleet a level is expected to send, kind by kind, its sail's colour beside each. */
function fleetLine(config: CampaignConfig, save: CampaignSave, sails: readonly string[]): string {
  const level = nextLevel(config, save);
  const pool = poolFor(config, save.difficulty, level, save.players.length);
  const names: TextKey[] = ['campaign.raiders', 'campaign.transports', 'campaign.frostships'];
  const kinds = pool
    .map((n, k) =>
      n === 0
        ? ''
        : `<li><i class="sail" style="background:${escape(sails[k] ?? '#fff')}"></i>${escape(t(names[k] as TextKey))} × ${n}</li>`,
    )
    .join('');
  const every = config.difficulties[save.difficulty].frostshipEvery[level];
  const extra =
    every === null || every === undefined
      ? ''
      : `<li class="note">${escape(t('campaign.frostEvery', { n: every }))}</li>`;
  // From this level ships take a hit more (CAMPAIGN §5.1): said where the fleet is shown (the
  // user's, 2026-11-25).
  const tougher =
    level >= config.fleet.toughFromLevel && config.fleet.extraHits > 0
      ? `<li class="note">${escape(t('campaign.tougher'))}</li>`
      : '';
  return `<ul class="campaign-fleet">${kinds}${extra}${tougher}</ul>`;
}

/** A level's intro: its number, its map's shape over a preview, the fleet, and the way in. */
export function introMarkup(
  config: CampaignConfig,
  save: CampaignSave,
  shape: MapShape,
  sails: readonly string[],
  notice: string | null,
): string {
  const final = save.stage === levelOrder(config, save).length - 1;
  const lives = t('campaign.lives', { n: save.carry.lives });
  const score = t('campaign.score', { n: teamTotal(save) });
  return `
    <div class="menu campaign-intro">
      <h1>${escape(final ? t('campaign.finalTitle') : stageLine(config, save))}</h1>
      ${notice === null ? '' : `<p class="note warn">${escape(notice)}</p>`}
      <p class="note">${escape(shapeName(shape))} · ${escape(difficultyName(save.difficulty))} · ${escape(lives)} · ${escape(score)}</p>
      <canvas id="campaign-map" class="campaign-map"></canvas>
      <h2>${t('campaign.fleet')}</h2>
      ${fleetLine(config, save, sails)}
      <div class="split">
        <button id="play-level" class="primary">${withIcon('play', t('campaign.play'))}</button>
      </div>
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** What a level brought: its points, its bonus among them, the ships and grunts, the lives left. */
function recordLines(record: LevelRecord, save: CampaignSave): string {
  const points = record.points.reduce((a, b) => a + b, 0);
  const [raiders, transports, frost] = record.sunk;
  return `
      <ul class="campaign-record">
        <li>${escape(t('campaign.points', { n: points }))}</li>
        <li>${escape(t('campaign.sunk', { raiders, transports, frost }))}</li>
        <li>${escape(t('campaign.grunts', { n: record.grunts }))}</li>
        <li>${escape(t('campaign.lives', { n: save.carry.lives }))}</li>
      </ul>`;
}

/** A level cleared: its record, and on to the next. */
export function summaryMarkup(save: CampaignSave): string {
  const record = save.history[save.history.length - 1];
  if (record === undefined) return '';
  return `
    <div class="menu campaign-summary">
      <h1>${t('campaign.cleared', { n: save.stage })}</h1>
      ${recordLines(record, save)}
      <p class="note">${escape(t('campaign.score', { n: teamTotal(save) }))}</p>
      <div class="split">
        <button id="next-level" class="primary">${withIcon('play', t('campaign.next'))}</button>
      </div>
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** A level lost: a retry while any is left, else the campaign's end. */
export function defeatMarkup(config: CampaignConfig, save: CampaignSave): string {
  const left = retriesLeft(config, save);
  const retries = left === null ? t('campaign.retriesAny') : t('campaign.retriesLeft', { n: left });
  const retry =
    save.finished || left === 0
      ? `<p class="note">${t('campaign.over')}</p>`
      : `<p class="note">${escape(retries)}</p><div class="split"><button id="retry-level" class="primary">${withIcon('resume', t('campaign.retry'))}</button></div>`;
  return `
    <div class="menu campaign-defeat">
      <h1>${t('campaign.lost', { n: save.stage + 1 })}</h1>
      <p class="note">${escape(t('campaign.score', { n: teamTotal(save) }))}</p>
      ${retry}
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** The campaign won: its total, and each level's points. */
export function victoryMarkup(save: CampaignSave): string {
  const levels = save.history
    .filter((h) => h.result === 'cleared')
    .map(
      (h, i) =>
        `<li>${escape(t('campaign.levelPoints', { n: i + 1, points: h.points.reduce((a, b) => a + b, 0) }))}</li>`,
    )
    .join('');
  return `
    <div class="menu campaign-victory">
      <h1>${t('campaign.victory')}</h1>
      <p class="note">${escape(difficultyName(save.difficulty))} · ${escape(t('campaign.total', { n: teamTotal(save) }))}</p>
      <ul class="campaign-record">${levels}</ul>
      <button id="back" class="primary" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}
