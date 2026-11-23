import {
  HOST_TEAM,
  hostHistory,
  stepsOf,
  type Progress,
  type Save,
  type TableRow,
  type Team,
} from '@bollfort/tournament';

import { escape } from './html.js';
import { ICONS } from './icons.js';
import { formatNumber, ordinal, t } from './i18n.js';
import type { LobbyTab, TournamentTab } from './lobby.js';
import { rankMoves, roadOf, stakesOf, type RoadStop } from './tournamentRoad.js';
import { isLastStep, settingsLine, stageName } from './tournamentText.js';

/**
 * A tournament between its matches, as markup (TOURNAMENT §1.8): where it stands — the
 * league's table, or the knockout around the host's road — the match to play next and the
 * last one played; and its two endings. Pure, so it is tested without a page.
 */

/** A line of the league's table as shown, or a gap where lines are left out. */
export type TableLine = { row: TableRow; rank: number } | 'gap';

/**
 * The table cut down to what matters (TOURNAMENT §1.8): its top, the host's neighbourhood,
 * and the lines either side of the cut, in order, with a gap wherever lines are skipped.
 */
export function tableExcerpt(
  rows: readonly TableRow[],
  advance: number,
  top = 5,
  around = 2,
): TableLine[] {
  const host = rows.findIndex((r) => r.team === HOST_TEAM);
  const keep = (i: number): boolean =>
    i < top || Math.abs(i - host) <= around || i === advance - 1 || i === advance;
  const out: TableLine[] = [];
  rows.forEach((row, i) => {
    if (keep(i)) out.push({ row, rank: i + 1 });
    else if (out.at(-1) !== 'gap') out.push('gap');
  });
  return out;
}

function teamName(save: Save, id: number): string {
  return (save.teams[id] as Team).name;
}

/** The tag after a team's name: the host's, the archnemesis's, or none. */
function teamTag(save: Save, id: number): string {
  if (id === HOST_TEAM) return ` <em class="tag you">${t('tournament.yourTeamTag')}</em>`;
  return save.teams[id]?.archnemesis === true
    ? ` <em class="tag arch">${t('tournament.archTag')}</em>`
    : '';
}

/** A team's name, marked as the host's or the archnemesis's. */
function teamLabel(save: Save, id: number): string {
  return `${escape((save.teams[id] as Team).name)}${teamTag(save, id)}`;
}

/** A place as a medal's class: gold, silver and bronze for the first three, plain after. */
function medal(place: number): string {
  return place <= 3 ? ` place-${place}` : '';
}

/** A league move as an arrow and the places moved, or nothing. */
function moveMark(move: number | undefined): string {
  if (move === undefined || move === 0) return '';
  return move > 0 ? `▲${move}` : `▼${-move}`;
}

/**
 * The host's last match as a card (the menus' polish, 2026-11-23): its place as a medal, the
 * stage, the place of how many and the points, whom it was against, and in the league where
 * the table now has the team and how far it moved.
 */
function lastResult(save: Save, progress: Progress): string {
  const last = hostHistory(save).at(-1);
  if (last === undefined) return '';
  const place = last.match.order.indexOf(HOST_TEAM) + 1;
  const score = last.match.scores?.[place - 1];
  const line =
    t('tournament.placeOf', { place: ordinal(place), of: last.match.teams.length }) +
    (score === undefined ? '' : ` · ${t('tournament.points', { n: formatNumber(score) })}`);
  const others = last.match.teams
    .filter((id) => id !== HOST_TEAM)
    .map((id) => teamLabel(save, id))
    .join(' · ');
  let standing = '';
  if (last.kind.kind === 'league') {
    const rank = progress.table().findIndex((r) => r.team === HOST_TEAM) + 1;
    const moved = rankMoves(save, progress).get(HOST_TEAM);
    const move = moveMark(moved);
    standing =
      `<span class="standing">${escape(t('tournament.nowRank', { place: ordinal(rank) }))}` +
      (move === '' ? '' : ` <b class="move ${(moved ?? 0) > 0 ? 'up' : 'down'}">${move}</b>`) +
      `</span>`;
  }
  return (
    `<div class="result-card${medal(place)}">` +
    `<span class="medal" aria-hidden="true">${place}</span>` +
    `<div class="result-text"><small>${escape(t('tournament.lastMatchHead'))} · ${escape(stageName(save, last.step))}</small>` +
    `<b>${escape(line)}</b>` +
    (others === ''
      ? ''
      : `<span class="against">${t('tournament.versus', { teams: others })}</span>`) +
    `</div>${standing}</div>`
  );
}

/** A step's name, short enough for a stop on the road. */
export function shortStage(save: Save, step: number): string {
  const at = stepsOf(save)[step];
  if (at === undefined) return '';
  const fromEnd = save.plan.rounds.length - 1 - (at.kind === 'knockout' ? at.round : 0);
  switch (at.kind) {
    case 'league':
      return String(at.matchday + 1);
    case 'knockout':
      if (save.settings.knockout === 'double') {
        if (fromEnd === 0) return t('tournament.stage.winnersFinal');
        if (fromEnd === 1) return t('tournament.stage.semi');
        return t('tournament.short.round', { n: at.round + 1 });
      }
      if (fromEnd === 0) return t('tournament.stage.final');
      if (fromEnd === 1) return t('tournament.stage.semi');
      if (fromEnd === 2) return t('tournament.stage.quarter');
      return t('tournament.short.round', { n: at.round + 1 });
    case 'losers':
      return at.round === save.plan.losers.length - 1
        ? t('tournament.stage.losersFinal')
        : t('tournament.short.losers', { n: at.round + 1 });
    case 'final':
      return t('tournament.stage.final');
  }
}

/** One stop on the road, its stage and result in a hover text. */
function stopMarkup(save: Save, stop: RoadStop): string {
  const won = stop.place === 1;
  const classes = ['stop', stop.state, won ? 'won' : ''].filter((c) => c !== '').join(' ');
  const result =
    stop.place === null || stop.of === null
      ? stop.state === 'next'
        ? t('tournament.nextMatch')
        : ''
      : t('tournament.placeOf', { place: ordinal(stop.place), of: stop.of });
  const tip =
    result === '' ? stageName(save, stop.step) : `${stageName(save, stop.step)}: ${result}`;
  const mark = stop.state === 'out' ? '✕ ' : won && stop.state === 'played' ? '✓ ' : '';
  // A match played and not won carries its place, so it reads apart from one still to come.
  const place = stop.place !== null && !won ? `<small>${escape(ordinal(stop.place))}</small>` : '';
  return `<li class="${classes}" data-tip="${escape(tip)}">${mark}${escape(shortStage(save, stop.step))}${place}</li>`;
}

/**
 * The road across the top of both tabs: the league's matchdays and the knockout's stages the
 * team has played or would play on winning, the next lit, a trophy at the end — so where the
 * tournament stands is read at a glance rather than gathered from three lines.
 */
function roadStrip(save: Save, progress: Progress): string {
  const road = roadOf(save, progress);
  const part = (name: string, stops: readonly RoadStop[], end = ''): string =>
    `<div class="road-part"><span class="part-name">${escape(name)}</span>` +
    `<ol>${stops.map((s) => stopMarkup(save, s)).join('')}${end}</ol></div>`;
  const trophy =
    `<li class="stop trophy${road.won ? ' won' : ''}" data-tip="${escape(t('tournament.title'))}">` +
    `${ICONS.trophy}</li>`;
  const parts = [
    road.league.length === 0 ? '' : part(t('tournament.withLeague'), road.league),
    part(
      t('tournament.knockout'),
      road.knockout,
      road.knockout.at(-1)?.state === 'out' ? '' : trophy,
    ),
  ].filter((p) => p !== '');
  return `<div class="road-strip">${parts.join('')}</div>`;
}

/** What the next match decides, under the road: the league's cut, or where a win and a defeat lead. */
function stakesLine(save: Save, progress: Progress): string {
  const stakes = stakesOf(save, progress);
  if (stakes === null) return '';
  if (stakes.kind === 'league') {
    const cut = t(
      stakes.day === stakes.days - 1 ? 'tournament.stakes.lastDay' : 'tournament.stakes.league',
      {
        n: stakes.advance,
        of: stakes.teams,
      },
    );
    const rank =
      stakes.rank === null
        ? ''
        : ` ${t('tournament.stakes.rank', { place: ordinal(stakes.rank) })}`;
    return `<p class="stakes"><span>${escape(cut + rank)}</span></p>`;
  }
  const pair = stakes.size === 2;
  const win = stakes.win === null ? t('tournament.title') : stageName(save, stakes.win);
  const lose =
    stakes.lose === 'losers' ? t('tournament.stakes.losers') : t('tournament.stakes.out');
  return (
    `<p class="stakes">` +
    `<span class="stake win"><b>${escape(t(pair ? 'tournament.stakes.win' : 'tournament.stakes.first'))}</b> → ${escape(win)}</span>` +
    `<span class="stake lose"><b>${escape(t(pair ? 'tournament.stakes.defeat' : 'tournament.stakes.rest'))}</b> → ${escape(lose)}</span>` +
    `</p>`
  );
}

/** A tie-break no column shows, as a mark on the rank it decided, its reason on hover. */
const MARKED_TIES = new Set(['headToHead', 'placings', 'draw']);

/**
 * The league's table as markup, the lines given — an excerpt on the tournament's tab, every
 * team in the league's window: rank, how far the last matchday moved it, team, points, wins and
 * Buchholz; the teams going through tinted, a rank decided by a tie-break no column shows
 * marked, and the tie-breaks in order behind a hover text under it (the test session of
 * 2026-10-12 could not tell what "Geg" was, nor how a tie was broken; the paragraph itself
 * outweighed the table). A row that moved slides into its place as it is shown.
 */
export function leagueTableMarkup(
  save: Save,
  lines: readonly TableLine[],
  moves: ReadonlyMap<number, number> = new Map(),
): string {
  const full = save.plan.tieBreaks === 2;
  const columns = full ? 6 : 5;
  const body = lines
    .map((line) => {
      if (line === 'gap') return `<tr class="gap"><td colspan="${columns}">…</td></tr>`;
      const { row, rank } = line;
      const classes = [
        row.team === HOST_TEAM ? 'mine' : '',
        rank <= save.plan.advance ? 'through' : '',
        rank === save.plan.advance ? 'cut' : '',
      ].filter((c) => c !== '');
      const tie =
        row.tie !== null && MARKED_TIES.has(row.tie)
          ? `<td class="rank tie" data-tip="${escape(t(`tournament.tie.${row.tie as 'draw'}`))}">${rank}<sup>*</sup></td>`
          : `<td class="rank">${rank}</td>`;
      const move = moves.get(row.team);
      const moved =
        move === undefined
          ? '<td class="move"></td>'
          : `<td class="move ${move > 0 ? 'up' : 'down'}">${moveMark(move)}</td>`;
      // Capped, so a team that climbed twenty places does not fly in from off the panel.
      const slide = move === undefined ? '' : ` style="--moved:${Math.max(-6, Math.min(6, move))}"`;
      return (
        `<tr${classes.length > 0 ? ` class="${classes.join(' ')}"` : ''}${slide}>${tie}${moved}<td class="team">${teamLabel(save, row.team)}</td>` +
        `<td class="num">${row.points}</td>${full ? `<td class="num">${row.wins}</td>` : ''}<td class="num">${row.buchholz}</td></tr>`
      );
    })
    .join('');
  const head = (key: 'points' | 'wins' | 'buchholz'): string =>
    `<th class="num" data-tip="${escape(t(`tournament.${key}Title`))}">${t(`tournament.${key}Short`)}</th>`;
  const legend = escape(t(full ? 'tournament.tieLegend' : 'tournament.tieLegendOld'));
  return (
    `<table class="league-table"><thead><tr><th class="rank">#</th><th class="move"></th><th class="team">${t('tournament.team')}</th>` +
    `${head('points')}${full ? head('wins') : ''}${head('buchholz')}</tr></thead>` +
    `<tbody>${body}</tbody></table>` +
    `<p class="note tie-legend"><span class="info" data-tip="${legend}">ⓘ ${escape(t('tournament.tieHow'))}</span></p>`
  );
}

function leagueTable(save: Save, progress: Progress): string {
  return leagueTableMarkup(
    save,
    tableExcerpt(progress.table(), save.plan.advance),
    rankMoves(save, progress),
  );
}

/** Matches as small cards, the teams of each one under another; at most six, then a count. */
function matchCards(save: Save, matches: readonly (readonly number[])[]): string {
  if (matches.length === 0) return '';
  const shown = matches
    .slice(0, 6)
    .map((m) => `<li>${m.map((id) => `<span>${teamLabel(save, id)}</span>`).join('')}</li>`);
  const more =
    matches.length > shown.length
      ? `<li class="more">${escape(t('tournament.moreMatches', { n: matches.length - shown.length }))}</li>`
      : '';
  return `<h3>${t('tournament.otherMatches')}</h3><ul class="other-matches">${shown.join('')}${more}</ul>`;
}

/** The next step's matches the host's team is not in. */
function otherMatches(progress: Progress): number[][] {
  return (progress.next?.matches ?? []).filter((m) => !m.includes(HOST_TEAM));
}

/**
 * The knockout around the host as figures (the menus' polish, 2026-11-23): the teams still in
 * each bracket and the archnemesis, then the step's other matches. Where the host's team goes
 * on a win or a defeat is the stakes line's, above both tabs.
 */
function knockoutView(save: Save, progress: Progress): string {
  const fact = (figure: string, words: string, extra = ''): string =>
    `<div class="fact${extra}"><b>${escape(figure)}</b><span>${escape(words)}</span></div>`;
  const facts: string[] = [];
  if (save.settings.knockout === 'double') {
    const winners = progress.winnersBracket.length;
    const losers = progress.losersBracket.length;
    facts.push(fact(String(winners), t('tournament.fact.winners', { n: winners })));
    facts.push(fact(String(losers), t('tournament.fact.losers', { n: losers })));
  } else {
    const left = progress.winnersBracket.length;
    facts.push(fact(String(left), t('tournament.fact.stillIn', { n: left })));
  }
  const arch = save.teams.findIndex((team) => team.archnemesis);
  if (arch > 0) {
    // The archnemesis by name, and its team's too where that is another.
    const team = save.teams[arch] as Team;
    const leader = team.members[0]?.name ?? team.name;
    const name = leader === team.name ? leader : `${leader} (${team.name})`;
    const out = progress.outStep(arch) !== null;
    facts.push(
      fact(
        name,
        t(out ? 'tournament.fact.archOut' : 'tournament.fact.archIn'),
        ` arch${out ? ' gone' : ''}`,
      ),
    );
  }
  return `<div class="facts">${facts.join('')}</div>${matchCards(save, otherMatches(progress))}`;
}

/** A button opening a window, its icon and its name, beside the heading it belongs with. */
function windowButton(id: string, label: string, path: string): string {
  return (
    `<button id="${id}" class="window-button">` +
    `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">` +
    `<path d="${path}"/></svg><span>${escape(label)}</span></button>`
  );
}

/** The league's window: the whole table and every matchday. */
function leagueButton(): string {
  return windowButton(
    'league',
    t('tournament.leagueButton'),
    'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16',
  );
}

/** The knockout's tree. */
function bracketButton(): string {
  return windowButton(
    'bracket',
    t('tournament.bracket'),
    'M3 4h5v6H3M3 14h5v6H3M8 7h4v10H8M12 12h4M16 12h5',
  );
}

/** A team's form beside its name in the match: its place in the league, or its knockout seed. */
function formTag(save: Save, progress: Progress, id: number): string {
  const step = stepsOf(save)[progress.done];
  if (step?.kind === 'league') {
    if (progress.done === 0) return '';
    const table = progress.table();
    const rank = table.findIndex((r) => r.team === id);
    const row = table[rank];
    if (row === undefined) return '';
    return ` <em class="tag form">${escape(t('tournament.form', { rank: rank + 1, n: row.points }))}</em>`;
  }
  const seed = progress.seedOf(id);
  return seed === null
    ? ''
    : ` <em class="tag form">${escape(t('tournament.seed', { n: seed + 1 }))}</em>`;
}

/**
 * The tournament's tab of the lobby (TOURNAMENT §1.7, §1.8), the same on the host's page
 * and a teammate's: the last result, the standings with the league's window or the bracket
 * beside them, and the step's other matches; and above both tabs the road and the stakes.
 * The match itself is the other tab's.
 */
export function tournamentTab(save: Save, progress: Progress, open: LobbyTab): TournamentTab {
  const step = stepsOf(save)[progress.done];
  const inLeague = step?.kind === 'league';
  // Before the first matchday no table of noughts: what lies ahead, and the day's fixtures.
  const standings = inLeague
    ? progress.done === 0
      ? `<p class="note">${escape(t('tournament.leagueAhead', { days: save.plan.matchdays.length, n: save.plan.advance }))}</p>` +
        matchCards(save, otherMatches(progress))
      : leagueTable(save, progress)
    : knockoutView(save, progress);
  const markup = `
      ${lastResult(save, progress)}
      <section class="standings">
        <h2><span>${inLeague ? t('tournament.league') : t('tournament.knockout')}</span>${inLeague ? leagueButton() : bracketButton()}</h2>
        ${standings}
      </section>
      <p class="note subtitle">${escape(settingsLine(save.settings))}</p>`;
  const match = progress.next?.matches[progress.hostMatch] ?? [];
  return {
    markup,
    header: `${roadStrip(save, progress)}${stakesLine(save, progress)}`,
    open,
    lastMatch: isLastStep(save, progress.done),
    teamTags: match.map((id) => teamTag(save, id) + formTag(save, progress, id)),
  };
}

/**
 * A line for the summary of a tournament's match, as it is recorded (the menus' polish,
 * 2026-11-23): what the result did to the tournament — the league's table, through or not,
 * on to the next stage or into the losers' bracket, out, or won.
 */
export function afterMatchLine(save: Save, progress: Progress): string {
  const steps = stepsOf(save);
  const last = hostHistory(save).at(-1);
  if (last === undefined) return '';
  const status = progress.status;
  if (status.kind === 'won') return t('tournament.wonLine', { team: teamName(save, HOST_TEAM) });
  if (status.kind === 'out') {
    return steps[status.step]?.kind === 'league'
      ? t('tournament.outLeague', { n: save.plan.advance })
      : t('tournament.outLine', { stage: stageName(save, status.step) });
  }
  const next = t('tournament.next', { stage: stageName(save, progress.done) });
  if (last.kind.kind === 'league') {
    const rank = progress.table().findIndex((r) => r.team === HOST_TEAM) + 1;
    if (steps[progress.done]?.kind !== 'league') {
      return `${t('tournament.after.through', { place: ordinal(rank) })} · ${next}`;
    }
    const move = moveMark(rankMoves(save, progress).get(HOST_TEAM));
    return `${t('tournament.nowRank', { place: ordinal(rank) })}${move === '' ? '' : ` (${move})`} · ${next}`;
  }
  const dropped =
    last.kind.kind === 'knockout' &&
    save.settings.knockout === 'double' &&
    last.match.order[0] !== HOST_TEAM;
  return dropped ? `${t('tournament.after.losers')} · ${next}` : next;
}

/** The end of a tournament, won or out: the team's road through it, match by match. */
export function endingMarkup(save: Save, progress: Progress): string {
  const won = progress.status.kind === 'won';
  const out = progress.status.kind === 'out' ? progress.status.step : null;
  const headline = won ? t('tournament.wonTitle') : t('tournament.outTitle');
  const line = won
    ? t('tournament.wonLine', { team: teamName(save, HOST_TEAM) })
    : out !== null &&
        stepsOf(save)[out]?.kind === 'league' &&
        hostHistory(save).at(-1)?.step === out
      ? t('tournament.outLeague', { n: save.plan.advance })
      : t('tournament.outLine', { stage: out === null ? '' : stageName(save, out) });
  const rows = hostHistory(save)
    .map(({ step, match }) => {
      const place = match.order.indexOf(HOST_TEAM);
      const score = match.scores?.[place];
      const others = match.teams
        .filter((id) => id !== HOST_TEAM)
        .map((id) => teamLabel(save, id))
        .join(' · ');
      return (
        `<tr${place === 0 ? ' class="won"' : ''}><td>${escape(stageName(save, step))}</td><td>${others}</td>` +
        `<td>${escape(t('tournament.placeOf', { place: ordinal(place + 1), of: match.teams.length }))}</td>` +
        `<td>${score === undefined ? '' : escape(formatNumber(score))}</td></tr>`
      );
    })
    .join('');
  return `
    <div class="menu lobby tournament-ending ${won ? 'won' : 'out'}">
      <h1>${escape(headline)}</h1>
      <p class="ending-line">${escape(line)}</p>
      <p class="note subtitle">${escape(settingsLine(save.settings))}</p>
      <h2>${t('tournament.yourMatches')}${bracketButton()}</h2>
      <table class="road"><thead><tr><th>${t('tournament.stage')}</th><th>${t('tournament.against')}</th><th>${t('tournament.place')}</th><th>${t('tournament.score')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <button id="back" data-back>${t('watching.back')}</button>
    </div>`;
}
