import {
  HOST_TEAM,
  Progress,
  hostHistory,
  stepsOf,
  type MatchRecord,
  type Save,
  type Team,
} from '@bollfort/tournament';

import { escape } from './html.js';
import { formatNumber, language, ordinal, t } from './i18n.js';
import { settingsLine, stageName } from './tournamentText.js';
import { bracketButton, roadStrip, teamLabel } from './tournamentView.js';

/**
 * The end of a tournament (PLAN §11 item 13, TS4, the user's design of 2026-11-23): won, a
 * ceremony — the cup engraved with its name and the day, the champions and their members, the
 * final's teams on a podium, the tournament in figures, the road and the way back; out, the
 * same quietly, without the cup, naming who went on to win it. Pure, so it is tested without a
 * page; `finished` is the tournament rolled out to its end where the host's team went out
 * (`rollOut`), for the champion and the final.
 */

/** The cup, named after the host's team as the lobby names it: "Bastion Cup". */
export function cupName(save: Save): string {
  return t('lobby.tournament', { team: save.teams[HOST_TEAM]?.name ?? '' });
}

/** The match that decided the tournament: its final, or the single knockout's last round. */
export function finalMatch(save: Save): { step: number; match: MatchRecord } | null {
  const steps = stepsOf(save);
  const step = steps.length - 1;
  const match = save.steps[step]?.matches[0];
  return match === undefined ? null : { step, match };
}

/** What the tournament came to for the host's team, in figures. */
export interface Figures {
  played: number;
  won: number;
  /** Points over the matches played, which are the host's and all have scores. */
  points: number;
  best: { score: number; step: number } | null;
  /** Its place in the league's final table, 1 first; null without a league. */
  league: number | null;
  /** Against the archnemesis: matches met, finished ahead of him, and whether it put him out. */
  arch: { name: string; met: number; ahead: number; putOut: boolean } | null;
}

export function figuresOf(save: Save): Figures {
  const history = hostHistory(save);
  let points = 0;
  let best: Figures['best'] = null;
  for (const { step, match } of history) {
    const score = match.scores?.[match.order.indexOf(HOST_TEAM)];
    if (score === undefined) continue;
    points += score;
    if (best === null || score > best.score) best = { score, step };
  }
  const progress = new Progress(save);
  const league =
    save.plan.matchdays.length === 0 || save.steps.length < save.plan.matchdays.length
      ? null
      : progress.table().findIndex((row) => row.team === HOST_TEAM) + 1;
  const archId = save.teams.findIndex((team) => team.archnemesis);
  let arch: Figures['arch'] = null;
  if (archId > 0) {
    const team = save.teams[archId] as Team;
    const met = history.filter(({ match }) => match.teams.includes(archId));
    const ahead = met.filter(
      ({ match }) => match.order.indexOf(HOST_TEAM) < match.order.indexOf(archId),
    );
    const outAt = progress.outStep(archId);
    arch = {
      name: team.members[0]?.name ?? team.name,
      met: met.length,
      ahead: ahead.length,
      putOut: ahead.some(({ step }) => step === outAt),
    };
  }
  return {
    played: history.length,
    won: history.filter(({ match }) => match.order[0] === HOST_TEAM).length,
    points,
    best,
    league,
    arch,
  };
}

/** The cup, drawn: gold, its handles, and a plate engraved with the cup's name and the day. */
function trophySvg(save: Save): string {
  const date = new Date(save.playedAt);
  const day = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'de-DE', {
        dateStyle: 'long',
      }).format(date);
  return (
    `<svg class="cup" viewBox="0 0 200 230" aria-hidden="true">` +
    `<defs><linearGradient id="cup-gold" x1="0" x2="1" y1="0" y2="0">` +
    `<stop offset="0" stop-color="#9a6b12"/><stop offset="0.35" stop-color="#f7dc84"/>` +
    `<stop offset="0.6" stop-color="#d9a930"/><stop offset="1" stop-color="#8a5c0c"/></linearGradient>` +
    `<linearGradient id="cup-plate" x1="0" x2="0" y1="0" y2="1">` +
    `<stop offset="0" stop-color="#2b2f3d"/><stop offset="1" stop-color="#171a24"/></linearGradient></defs>` +
    // The handles behind the bowl.
    `<path d="M52 42 C14 42 14 102 66 110 M148 42 C186 42 186 102 134 110" fill="none" stroke="url(#cup-gold)" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M46 26 H154 V58 C154 100 128 124 100 124 C72 124 46 100 46 58 Z" fill="url(#cup-gold)"/>` +
    `<path class="shine" d="M62 34 V60 C62 84 72 100 84 108" fill="none" stroke="#fff7d6" stroke-width="5" stroke-linecap="round" opacity="0.55"/>` +
    `<rect x="90" y="122" width="20" height="26" fill="url(#cup-gold)"/>` +
    `<path d="M70 148 H130 L138 164 H62 Z" fill="url(#cup-gold)"/>` +
    `<rect x="38" y="164" width="124" height="58" rx="6" fill="url(#cup-plate)" stroke="url(#cup-gold)" stroke-width="3"/>` +
    `<text class="engraved" x="100" y="190" text-anchor="middle">${escape(cupName(save))}</text>` +
    `<text class="engraved small" x="100" y="209" text-anchor="middle">${escape(day)}</text>` +
    `</svg>`
  );
}

/**
 * Confetti over the champions, in the look's accent and the players' colours: a fixed scatter,
 * so the page needs no random numbers and every showing is the same. None under Reduced motion.
 */
function confetti(): string {
  const pieces = Array.from({ length: 36 }, (_, i) => {
    const left = (i * 37) % 100;
    const delay = ((i * 53) % 24) / 10;
    const spin = (i * 71) % 360;
    const hue = i % 4;
    return `<i class="c${hue}" style="left:${left}%;animation-delay:${delay}s;--spin:${spin}deg"></i>`;
  });
  return `<div class="confetti" aria-hidden="true">${pieces.join('')}</div>`;
}

/** The final's teams on a podium, the winner in the middle, the rest either side by place. */
function podium(save: Save): string {
  const final = finalMatch(save);
  if (final === null) return '';
  const { match } = final;
  const steps = match.order.map((id, place) => {
    const score = match.scores?.[place];
    return (
      `<li class="step place-${place + 1}" style="--place:${place}">` +
      `<span class="who">${teamLabel(save, id)}</span>` +
      (score === undefined ? '' : `<small>${escape(formatNumber(score))}</small>`) +
      `<span class="block">${place + 1}</span></li>`
    );
  });
  // Shown 2 1 3 4: the winner raised in the middle.
  const shown = steps.length > 1 ? [steps[1], steps[0], ...steps.slice(2)] : steps;
  return (
    `<section class="podium-box"><h2>${escape(stageName(save, final.step))}</h2>` +
    `<ol class="podium">${shown.join('')}</ol></section>`
  );
}

function figureTiles(save: Save): string {
  const f = figuresOf(save);
  const tile = (figure: string, words: string, extra = ''): string =>
    `<div class="fact${extra}"><b>${escape(figure)}</b><span>${escape(words)}</span></div>`;
  const tiles = [
    tile(`${f.won} / ${f.played}`, t('ceremony.matchesWon')),
    tile(formatNumber(f.points), t('ceremony.points')),
  ];
  if (f.best !== null) {
    tiles.push(
      tile(formatNumber(f.best.score), t('ceremony.best', { stage: stageName(save, f.best.step) })),
    );
  }
  if (f.league !== null) tiles.push(tile(ordinal(f.league), t('ceremony.league')));
  if (f.arch !== null) {
    const words =
      f.arch.met === 0
        ? t('ceremony.archNever', { name: f.arch.name })
        : f.arch.putOut
          ? t('ceremony.archOut', { name: f.arch.name })
          : t('ceremony.arch', { name: f.arch.name });
    tiles.push(
      tile(
        f.arch.met === 0 ? '–' : `${f.arch.ahead} : ${f.arch.met - f.arch.ahead}`,
        words,
        ' arch',
      ),
    );
  }
  return `<div class="facts">${tiles.join('')}</div>`;
}

/**
 * The end of a tournament, won or out. `finished` is the same tournament rolled out to its end
 * where the host's team went out before it; where the team won, the tournament itself.
 */
export function endingMarkup(
  save: Save,
  progress: Progress,
  finished: { save: Save; progress: Progress } = { save, progress },
): string {
  const won = progress.status.kind === 'won';
  const out = progress.status.kind === 'out' ? progress.status.step : null;
  const champion = finished.progress.winner;
  const cup = cupName(save);
  const team = escape(save.teams[HOST_TEAM]?.name ?? '');
  const members = (save.teams[HOST_TEAM] as Team).members.map((m) => escape(m.name));
  const line = won
    ? t('ceremony.won', { team, cup: escape(cup) })
    : out !== null &&
        stepsOf(save)[out]?.kind === 'league' &&
        hostHistory(save).at(-1)?.step === out
      ? escape(t('tournament.outLeague', { n: save.plan.advance }))
      : escape(t('tournament.outLine', { stage: out === null ? '' : stageName(save, out) }));
  const winnerLine =
    won || champion === null
      ? ''
      : `<p class="champion-line">${t('ceremony.won', { team: teamLabel(finished.save, champion), cup: escape(cup) })}</p>`;
  const head = won
    ? `<div class="ceremony-head">${trophySvg(save)}<div class="ceremony-title">` +
      `<h1>${escape(t('tournament.wonTitle'))}</h1>` +
      `<p class="ending-line">${line}</p>` +
      (members.length > 1 ? `<p class="members">${members.join(' · ')}</p>` : '') +
      `</div></div>`
    : `<div class="ceremony-title"><h1>${escape(t('tournament.outTitle'))}</h1>` +
      `<p class="ending-line">${line}</p>${winnerLine}</div>`;
  return `
    <div class="menu lobby tournament-ending ${won ? 'won' : 'out'}">
      ${won ? confetti() : ''}
      ${head}
      <div class="ceremony-body">
        ${podium(finished.save)}
        <section class="figures-box"><h2>${escape(t('ceremony.figures'))}</h2>${figureTiles(save)}</section>
      </div>
      <h2 class="road-head"><span>${escape(t('ceremony.road'))}</span>${bracketButton()}</h2>
      ${roadStrip(save, progress)}
      <p class="note subtitle">${escape(settingsLine(save.settings))}</p>
      <button id="back" class="primary" data-back>${t('watching.back')}</button>
    </div>`;
}
