import {
  CAMPAIGN_DIFFICULTIES,
  type TextKey,
  type CampaignConfig,
  type CampaignDifficulty,
  type MapShape,
} from '@bollfort/config';
import {
  continuesLeft,
  freeRetry,
  levelOrder,
  nextLevel,
  poolFor,
  teamTotal,
  won,
  type CampaignSave,
  type LevelRecord,
} from '@bollfort/campaign';

import type { CampaignSetup, Seat } from '@bollfort/protocol';

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

/** The team's continues left, and its firepower once a continue has raised it (CAMPAIGN §9). */
function standing(config: CampaignConfig, save: CampaignSave): string {
  const left = continuesLeft(config, save);
  const continues =
    left === null ? t('campaign.continuesAny') : t('campaign.continuesLeft', { n: left });
  return save.carry.firepower > 0
    ? `${continues} · ${t('campaign.firepower', { n: save.carry.firepower })}`
    : continues;
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
  // A finished campaign is kept as its record, opened on its end.
  const resume = confirming
    ? ''
    : `<button class="resume" data-id="${id}">${t(save.finished ? 'campaign.view' : 'campaign.resume')}</button>`;
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
  /** People to play it: one alone, two or three in a co-op room (CAMPAIGN §13). */
  players = 1,
): string {
  const card = (d: CampaignDifficulty): string =>
    `<button class="difficulty${d === chosen ? ' primary' : ''}" data-difficulty="${d}">` +
    `<b>${escape(difficultyName(d))}</b><small>${escape(t(DIFFICULTY_HINTS[d]))}</small></button>`;
  const cards = CAMPAIGN_DIFFICULTIES.filter((d) => config.difficulties[d].offered)
    .map(card)
    .join('');
  const done = (e: SavedCampaign): boolean => e.kind === 'ok' && e.save.finished;
  const rows = (entries: readonly SavedCampaign[]): string =>
    `<ul class="saved-list">${entries.map((e) => savedRow(config, e, e.id === confirming)).join('')}</ul>`;
  const going = saved.filter((e) => !done(e));
  const finished = saved.filter(done);
  const list =
    (going.length === 0 ? `<p class="note">${t('campaign.none')}</p>` : rows(going)) +
    (finished.length === 0 ? '' : `<h2>${t('campaign.finishedTitle')}</h2>${rows(finished)}`);
  return `
    <div class="menu campaign-menu tournament-resume">
      <h1>${t('campaign.title')}</h1>
      ${notice === null ? '' : `<p class="note warn">${escape(notice)}</p>`}
      <h2>${t('campaign.new')}</h2>
      <div class="split campaign-difficulties">${cards}</div>
      <div class="split campaign-players">${[1, 2, 3]
        .map(
          (n) =>
            `<button class="players${n === players ? ' primary' : ''}" data-players="${n}">${escape(n === 1 ? t('campaign.solo') : t('campaign.coop', { n }))}</button>`,
        )
        .join('')}</div>
      <button id="start-campaign" class="primary">${withIcon('play', t('campaign.start'))}</button>
      <h2>${t('campaign.resumeTitle')}</h2>
      ${list}
      <button id="campaign-how" class="quiet">${withIcon('help', t('menu.howToPlay'))}</button>
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
  const score = t('campaign.score', { n: teamTotal(save) });
  return `
    <div class="menu campaign-intro">
      <h1>${escape(final ? t('campaign.finalTitle') : stageLine(config, save))}</h1>
      ${notice === null ? '' : `<p class="note warn">${escape(notice)}</p>`}
      <p class="note">${escape(shapeName(shape))} · ${escape(difficultyName(save.difficulty))} · ${escape(standing(config, save))} · ${escape(score)}</p>
      <canvas id="campaign-map" class="campaign-map"></canvas>
      <h2>${t('campaign.fleet')}</h2>
      ${fleetLine(config, save, sails)}
      <div class="split">
        <button id="play-level" class="primary">${withIcon('play', t('campaign.play'))}</button>
      </div>
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** What a level brought: its points, its bonus among them, the ships and grunts. */
function recordLines(record: LevelRecord): string {
  const points = record.points.reduce((a, b) => a + b, 0);
  const [raiders, transports, frost] = record.sunk;
  return `
      <ul class="campaign-record">
        <li>${escape(t('campaign.points', { n: points }))}</li>
        <li>${escape(t('campaign.sunk', { raiders, transports, frost }))}</li>
        <li>${escape(t('campaign.grunts', { n: record.grunts }))}</li>
      </ul>`;
}

/**
 * A level just over, for its end screen (docs/CAMPAIGN.md CA12): the headline, and a line on what
 * it means for the campaign — the score, the continues left, the free try or the campaign's end.
 * `before` is the campaign as the level began, `after` with its result recorded.
 */
export function levelEndText(
  config: CampaignConfig,
  before: CampaignSave,
  after: CampaignSave,
  cleared: boolean,
): { headline: string; line: string } {
  const n = before.stage + 1;
  const headline = cleared ? t('campaign.cleared', { n }) : t('campaign.lost', { n });
  const line = after.finished
    ? won(config, after)
      ? t('campaign.victory')
      : t('campaign.over')
    : cleared
      ? t('campaign.score', { n: teamTotal(after) })
      : freeRetry(after)
        ? t('campaign.freeRetry')
        : standing(config, after);
  return { headline, line };
}

/**
 * Where the end screen's main button leads once a level is over: the next level; the level again,
 * free or for a continue; or, the campaign over or won, its end.
 */
export function levelEndButton(after: CampaignSave): TextKey {
  if (after.finished) return 'campaign.campaignEnd';
  if (after.defeated) return freeRetry(after) ? 'campaign.tryAgain' : 'campaign.continueLevel';
  return 'campaign.next';
}

/** Each level cleared and its points, for a campaign's end. */
function levelsLines(save: CampaignSave): string {
  const levels = save.history
    .filter((h) => h.result === 'cleared')
    .map(
      (h, i) =>
        `<li>${escape(t('campaign.levelPoints', { n: i + 1, points: h.points.reduce((a, b) => a + b, 0) }))}</li>`,
    )
    .join('');
  return levels === '' ? '' : `<ul class="campaign-record">${levels}</ul>`;
}

/**
 * A level lost (CAMPAIGN §9): played again from its start — free when lost in its first round,
 * else for a continue, which raises the team's firepower — or, with no continue left, the
 * campaign's end, its total and each level cleared.
 */
export function defeatMarkup(config: CampaignConfig, save: CampaignSave, host = true): string {
  const free = freeRetry(save);
  const label = free ? t('campaign.tryAgain') : t('campaign.continueLevel');
  // In a co-op room the choice is the host's, whose save it is; the others wait for it.
  const button = host
    ? `<div class="split"><button id="retry-level" class="primary">${withIcon('resume', label)}</button></div>`
    : `<p class="note">${t('campaign.waitHost')}</p>`;
  const next = save.finished
    ? `<p class="note">${t('campaign.over')}</p>` +
      `<p class="note">${escape(difficultyName(save.difficulty))} · ${escape(t('campaign.total', { n: teamTotal(save) }))}</p>` +
      levelsLines(save)
    : `<p class="note">${escape(free ? t('campaign.freeRetry') : standing(config, save))}</p>${button}`;
  return `
    <div class="menu campaign-defeat">
      <h1>${t('campaign.lost', { n: save.stage + 1 })}</h1>
      ${save.finished ? '' : `<p class="note">${escape(t('campaign.score', { n: teamTotal(save) }))}</p>`}
      ${next}
      <button id="back" class="quiet" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** The campaign won: its total, and each level's points. */
export function victoryMarkup(save: CampaignSave): string {
  return `
    <div class="menu campaign-victory">
      <h1>${t('campaign.victory')}</h1>
      <p class="note">${escape(difficultyName(save.difficulty))} · ${escape(t('campaign.total', { n: teamTotal(save) }))}</p>
      ${levelsLines(save)}
      <button id="back" class="primary" data-back>${withIcon('back', t('campaign.menu'))}</button>
    </div>`;
}

/** A co-op campaign's room as one page sees it (CAMPAIGN §13). */
export interface CampaignRoomView {
  /** The host's campaign as the room last passed it on, or null before it has. */
  save: CampaignSave | null;
  /** The level the room is set for, or null: none sent yet, or the campaign at a defeat or over. */
  level: CampaignSetup | null;
  /** The level's map's shape, from its rules. */
  shape: MapShape | null;
  seats: readonly Seat[];
  playerCount: number;
  hostId: number;
  humanPlayer: number;
  /** The room's code, to be given to the others. */
  code: string;
  /** The server's address on the internet with the code, while its port is open there. */
  invite: string | null;
  /** The level before was just cleared here: its record shown over the next one's intro. */
  justCleared: boolean;
}

/** The seats of a co-op room: who sits where, who is ready, and the seats still free. */
function seatsMarkup(view: CampaignRoomView): string {
  const rows = Array.from({ length: view.playerCount }, (_, seat) => {
    const person = view.seats.find((s) => s.playerId === seat);
    if (person === undefined) {
      return `<li class="seat empty"><b>${escape(t('campaign.seatFree'))}</b></li>`;
    }
    const tags = [
      ...(person.playerId === view.humanPlayer ? [t('lobby.tagYou')] : []),
      ...(person.playerId === view.hostId ? [t('lobby.tagHost')] : []),
      ...(!person.connected
        ? [t('lobby.tagAway')]
        : person.playerId === view.hostId
          ? []
          : [t(person.ready ? 'lobby.tagReady' : 'lobby.tagNotReady')]),
    ];
    return `<li class="seat${person.ready || person.playerId === view.hostId ? ' ready' : ''}"><b>${escape(person.name)}</b><small>${escape(tags.join(' · '))}</small></li>`;
  });
  return `<ul class="campaign-seats">${rows.join('')}</ul>`;
}

/** Why the host may not start yet, or null: a seat free, or someone not ready. */
export function campaignStartBlocked(view: CampaignRoomView): string | null {
  const free = view.playerCount - view.seats.length;
  if (free > 0) return t('campaign.waitingFor', { n: free });
  const unready = view.seats.filter(
    (s) => s.playerId !== view.hostId && (!s.ready || !s.connected),
  ).length;
  return unready > 0 ? t('lobby.waitingReady', { n: unready }) : null;
}

/**
 * A co-op campaign's room: the next level's intro with the seats, the code and the way in — Start
 * for the host once everyone is here and ready, Ready for the others — or, with no level set, the
 * defeat with its retry (the host's) or the campaign's end.
 */
export function campaignRoomMarkup(
  config: CampaignConfig,
  view: CampaignRoomView,
  sails: readonly string[],
): string {
  const { save } = view;
  const host = view.humanPlayer === view.hostId;
  if (save === null) {
    return `<div class="menu interim campaign-room"><h1>${t('campaign.title')}</h1><p class="note">${t('campaign.waitHost')}</p><button id="leave" class="quiet" data-back>${withIcon('back', t('lobby.leave'))}</button></div>`;
  }
  if (view.level === null || view.shape === null) {
    if (save.finished && won(config, save)) return victoryMarkup(save);
    if (save.finished || save.defeated) return defeatMarkup(config, save, host);
    return `<div class="menu interim campaign-room"><h1>${t('campaign.title')}</h1><p class="note">${t('campaign.waitHost')}</p><button id="leave" class="quiet" data-back>${withIcon('back', t('lobby.leave'))}</button></div>`;
  }
  const record = save.history.at(-1);
  const cleared =
    view.justCleared && record?.result === 'cleared'
      ? `<h2>${t('campaign.cleared', { n: save.stage })}</h2>${recordLines(record)}`
      : '';
  const final = save.stage === levelOrder(config, save).length - 1;
  const score = t('campaign.score', { n: teamTotal(save) });
  const me = view.seats.find((s) => s.playerId === view.humanPlayer);
  const blocked = campaignStartBlocked(view);
  const go = host
    ? `<button id="start-level" class="primary"${blocked === null ? '' : ' disabled'}>${withIcon('play', t('campaign.play'))}</button>` +
      (blocked === null ? '' : `<p class="note">${escape(blocked)}</p>`)
    : `<button id="ready" class="primary">${t(me?.ready === true ? 'lobby.notReady' : 'lobby.ready')}</button>` +
      `<p class="note">${t('campaign.waitHost')}</p>`;
  const invite =
    view.invite === null
      ? ''
      : `<div class="code-row invite-row"><span class="invite-label">${t('lobby.invite')}</span><code id="invite-link" class="invite-link">${escape(view.invite)}</code><button id="copy-invite" class="quiet">${t('lobby.copy')}</button></div>`;
  return `
    <div class="menu campaign-intro campaign-room">
      ${cleared}
      <h1>${escape(final ? t('campaign.finalTitle') : stageLine(config, save))}</h1>
      <p class="note">${escape(shapeName(view.shape))} · ${escape(difficultyName(save.difficulty))} · ${escape(standing(config, save))} · ${escape(score)}</p>
      <div class="campaign-room-body">
        <div>
          <canvas id="campaign-map" class="campaign-map"></canvas>
          <h2>${t('campaign.fleet')}</h2>
          ${fleetLine(config, save, sails)}
        </div>
        <div>
          <h2>${t('campaign.team')}</h2>
          ${seatsMarkup(view)}
          <div class="code-chip">
            <code id="room-code" class="room-code">${escape(view.code)}</code>
            <button id="copy-code" class="quiet">${t('lobby.copy')}</button>
          </div>
          ${invite}
          <div class="campaign-room-go">${go}</div>
        </div>
      </div>
      <button id="leave" class="quiet" data-back>${withIcon('back', t('lobby.leave'))}</button>
    </div>`;
}
