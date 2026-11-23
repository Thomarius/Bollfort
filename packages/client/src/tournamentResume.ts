import { Progress, stepsOf } from '@bollfort/tournament';

import { escape } from './html.js';
import { withIcon } from './icons.js';
import { t } from './i18n.js';
import type { SavedTournament } from './tournamentSaves.js';
import { playedWhen, settingsLine, stageName } from './tournamentText.js';

/**
 * The list of saved tournaments, as markup: each with what it is, where it stands and when
 * it was last played, and its buttons — pure, so it is tested without a page.
 */

/** One saved tournament as the resume list shows it; `confirming` asks before a delete. */
function savedRow(entry: SavedTournament, confirming: boolean): string {
  const remove = confirming
    ? `<button class="confirm-delete" data-id="${escape(entry.id)}">${t('tournament.confirmDelete')}</button>` +
      `<button class="cancel-delete quiet" data-id="${escape(entry.id)}">${t('tournament.cancel')}</button>`
    : `<button class="delete quiet" data-id="${escape(entry.id)}">${t('tournament.delete')}</button>`;
  if (entry.kind !== 'ok') {
    const name = entry.name ?? '?';
    const why = entry.kind === 'version' ? t('tournament.older') : t('tournament.damaged');
    return `<li class="saved unreadable"><div class="saved-text"><b>${escape(name)}</b><small>${escape(why)}</small></div><div class="saved-buttons">${remove}</div></li>`;
  }
  const { save } = entry;
  const progress = new Progress(save);
  const next =
    progress.status.kind === 'playing'
      ? t('tournament.next', { stage: stageName(save, progress.done) })
      : t('tournament.finished');
  const when = t('tournament.lastPlayed', { date: playedWhen(save.playedAt) });
  // How far through it is, as a bar: the steps played of all it has.
  const all = stepsOf(save).length;
  const share = progress.status.kind === 'playing' ? progress.done / all : 1;
  const bar =
    `<span class="saved-progress" data-tip="${escape(t('tournament.progress', { done: progress.done, all }))}">` +
    `<i style="width:${Math.round(share * 100)}%"></i></span>`;
  return (
    `<li class="saved"><div class="saved-text"><b>${escape(save.teams[0]?.name ?? '')}</b>` +
    `<small>${escape(settingsLine(save.settings))}</small>${bar}<small>${escape(next)} · ${escape(when)}</small></div>` +
    `<div class="saved-buttons">${confirming ? '' : `<button class="resume" data-id="${escape(entry.id)}">${t('tournament.resume')}</button>`}${remove}</div></li>`
  );
}

export function resumeMarkup(
  entries: readonly SavedTournament[],
  confirming: string | null,
  notice: string | null,
): string {
  const list =
    entries.length === 0
      ? `<p class="note">${t('tournament.none')}</p>` +
        `<button id="create" class="primary">${withIcon('trophy', t('tournament.new'))}</button>`
      : `<ul class="saved-list">${entries.map((e) => savedRow(e, e.id === confirming)).join('')}</ul>`;
  return `
    <div class="menu tournament-resume">
      <h1>${t('tournament.resumeTitle')}</h1>
      ${notice === null ? '' : `<p class="note warn">${escape(notice)}</p>`}
      ${list}
      <button id="back" class="quiet" data-back>${withIcon('back', t('tournament.back'))}</button>
    </div>`;
}
