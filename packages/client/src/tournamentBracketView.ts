import { HOST_TEAM, stepsOf, type Progress, type Save } from '@bollfort/tournament';

import { escape } from './html.js';
import { formatNumber, t } from './i18n.js';
import { bracketLayout, type BracketNode } from './tournamentBracket.js';
import { stageName } from './tournamentText.js';

/**
 * The knockout's tree in a window of its own over the tournament screen (the test session's
 * request, 2026-10-08): drawn as an SVG from `bracketLayout`, every match a box listing its
 * teams — by place once played, with their scores (the menus' polish, 2026-11-23: a box's teams
 * on hover only were not seen with a controller, and the tree read as empty) — and a champion's
 * box at its end. A match's stage and how it was decided show for the box the mouse is on, and a
 * click pins them. Mouse only: Close is a button, and a click beside the panel closes it too.
 */

/** Wide enough for the longest stage heading, "Winners' bracket, round 1". */
const COLUMN = 210;
const BOX_W = 170;
/** A team's line in a box, and the box's padding above and below its lines. */
const LINE = 17;
const BOX_PAD = 5;
/** Between boxes stacked in a column. */
const GAP = 12;
const PAD = 40;
/** Names cut to fit a box beside a place and a score. */
const NAME_CHARS = 15;

function teamName(save: Save, id: number): string {
  return save.teams[id]?.name ?? '?';
}

function clip(name: string): string {
  return name.length > NAME_CHARS ? `${name.slice(0, NAME_CHARS - 1)}…` : name;
}

/** A match's stage and how it was decided, for the box the mouse is on. */
function details(save: Save, n: BracketNode): string {
  const head = `<b>${escape(stageName(save, n.step))}</b>`;
  const how =
    n.teams === null
      ? t('bracket.later')
      : n.order === null
        ? t('bracket.toPlay')
        : n.scores === null
          ? t('bracket.rolled')
          : t('bracket.played');
  return `${head}<p>${escape(how)}</p>`;
}

/** Teams a match of a step holds, as the plan has it, for a box whose teams are not known yet. */
function plannedSize(save: Save, step: number): number {
  const at = stepsOf(save)[step];
  if (at === undefined) return 2;
  switch (at.kind) {
    case 'knockout':
      return save.plan.rounds[at.round] ?? 2;
    case 'losers':
      return save.plan.losers[at.round]?.size ?? 2;
    default:
      return 2;
  }
}

/** A box's team lines: placed with scores once played, listed while to be played, none before. */
function teamLines(save: Save, n: BracketNode, x: number, top: number): string {
  const line = (id: number, i: number, place: string, score: string): string => {
    const y = top + BOX_PAD + LINE * i + LINE / 2 + 4;
    const who = id === HOST_TEAM ? ' you' : save.teams[id]?.archnemesis === true ? ' arch' : '';
    const first = place === '1' ? ' first' : '';
    return (
      `<g class="team${who}${first}">` +
      (place === '' ? '' : `<text class="place" x="${x + 8}" y="${y}">${place}</text>`) +
      `<text class="name" x="${x + (place === '' ? 10 : 24)}" y="${y}">${escape(clip(teamName(save, id)))}</text>` +
      (score === '' ? '' : `<text class="score" x="${x + BOX_W - 8}" y="${y}">${score}</text>`) +
      `</g>`
    );
  };
  if (n.order !== null) {
    return n.order
      .map((id, i) => {
        const score = n.scores?.[i];
        return line(id, i, String(i + 1), score === undefined ? '' : escape(formatNumber(score)));
      })
      .join('');
  }
  return (n.teams ?? []).map((id, i) => line(id, i, '', '')).join('');
}

export function bracketSvg(save: Save, progress: Progress): string {
  const layout = bracketLayout(save, progress);
  const sizeOf = (n: BracketNode): number => n.teams?.length ?? plannedSize(save, n.step);
  const boxH = (n: BracketNode): number => sizeOf(n) * LINE + BOX_PAD * 2;
  // Rows as tall as the boxes in them need, column by column: a column's tallest box over the
  // rows between its two closest boxes. Every row as tall as the largest match spaced a first
  // round of pairs out to fit a final of four, and the tree read as empty.
  const columns = new Map<string, BracketNode[]>();
  for (const n of layout.nodes) {
    const key = `${n.section}:${n.x}`;
    columns.set(key, [...(columns.get(key) ?? []), n]);
  }
  let row = 2 * LINE + BOX_PAD * 2 + GAP;
  for (const column of columns.values()) {
    const ys = column.map((n) => n.y).sort((a, b) => a - b);
    const apart = Math.min(
      ...ys.slice(1).map((y, i) => y - (ys[i] as number)),
      Number.POSITIVE_INFINITY,
    );
    // A box alone in its column sits between rows it has to itself.
    if (!Number.isFinite(apart)) continue;
    row = Math.max(row, (Math.max(...column.map(boxH)) + GAP) / apart);
  }
  // A column more for the champion, at the end of the last match.
  const width = (layout.columns + 1) * COLUMN + PAD * 2;
  const height = layout.rows * row + PAD * 2;
  const cx = (n: BracketNode): number => PAD + n.x * COLUMN;
  const cy = (n: BracketNode): number => PAD + n.y * row + row / 2;
  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const path = (x1: number, y1: number, x2: number, y2: number, host: boolean): string => {
    const mid = (x1 + x2) / 2;
    return `<path class="edge${host ? ' host' : ''}" d="M${x1} ${y1} H${mid} V${y2} H${x2}"/>`;
  };
  const lines = layout.edges
    .map((e) => {
      const a = byKey.get(e.from);
      const b = byKey.get(e.to);
      if (a === undefined || b === undefined) return '';
      return path(cx(a) + BOX_W, cy(a), cx(b), cy(b), e.host);
    })
    .join('');
  const boxes = layout.nodes
    .map((n) => {
      const classes = ['match', n.state, n.host ? 'host' : '', n.arch ? 'arch' : '']
        .filter((c) => c !== '')
        .join(' ');
      const top = cy(n) - boxH(n) / 2;
      return (
        `<g class="${classes}" data-key="${n.key}">` +
        `<rect x="${cx(n)}" y="${top}" width="${BOX_W}" height="${boxH(n)}" rx="6"/>` +
        `${teamLines(save, n, cx(n), top)}</g>`
      );
    })
    .join('');

  // The champion's box, beside the match that decides the tournament.
  const last = layout.nodes.reduce<BracketNode | null>(
    (best, n) =>
      best === null || n.x > best.x || (n.x === best.x && n.section === 'final') ? n : best,
    null,
  );
  let champion = '';
  if (last !== null) {
    const x = PAD + (last.x + 1) * COLUMN;
    const y = cy(last);
    const winner = progress.winner;
    const name = winner === null ? t('bracket.champion') : clip(teamName(save, winner));
    const mine = winner === HOST_TEAM;
    champion =
      path(cx(last) + BOX_W, y, x, y, mine) +
      `<g class="champion${winner === null ? ' open' : ''}${mine ? ' you' : ''}">` +
      `<rect x="${x}" y="${y - 18}" width="${BOX_W}" height="36" rx="18"/>` +
      `<g transform="translate(${x + 12} ${y - 9}) scale(0.75)"><path class="cup" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></g>` +
      `<text x="${x + 36}" y="${y + 5}">${escape(name)}</text></g>` +
      `<text class="heading" x="${x}" y="${PAD - 14}">${escape(t('bracket.champion'))}</text>`;
  }

  // Each column named as its stage is, the winners' over the top and the losers' over its band.
  const heads = new Map<string, { x: number; y: number; text: string }>();
  for (const n of layout.nodes) {
    const key = `${n.section}:${n.x}`;
    if (heads.has(key)) continue;
    const y = n.section === 'losers' ? PAD + (layout.losersTop ?? 0) * row - 8 : PAD - 14;
    heads.set(key, { x: cx(n), y, text: stageName(save, n.step) });
  }
  const headings = [...heads.values()]
    .map((h) => `<text class="heading" x="${h.x}" y="${h.y}">${escape(h.text)}</text>`)
    .join('');
  return (
    // At its own size, never shrunk to fit: a knockout of 64 matches a round scrolls instead.
    `<svg class="bracket-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `${headings}${lines}${boxes}${champion}</svg>`
  );
}

/**
 * A window over whatever is on screen, in How to play's frame, as every other window is (the
 * league's and the bracket's were drawn before the menus' panels, and looked it): a click on
 * Close or beside the panel closes it. Returns the window, for its own listeners.
 */
export function openTournamentWindow(kind: string, inner: string, click: () => void): HTMLElement {
  const root = document.createElement('div');
  root.className = `how-to-play tournament-window ${kind}`;
  root.innerHTML =
    `<div class="panel">${inner}` +
    `<button class="close quiet" data-back>${escape(t('howTo.close'))}</button></div>`;
  document.body.append(root);
  root.querySelector('.close')?.addEventListener('click', () => {
    click();
    root.remove();
  });
  root.addEventListener('click', (event) => {
    if (event.target === root) root.remove();
  });
  return root;
}

/** Opens the bracket over whatever is on screen; `click` sounds as the menu's buttons do. */
export function openBracket(save: Save, progress: Progress, click: () => void): void {
  const layout = bracketLayout(save, progress);
  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const overlay = openTournamentWindow(
    'bracket-window',
    `<h2>${escape(t('bracket.title'))}</h2>` +
      `<p class="note">${escape(t('bracket.hint'))}</p>` +
      `<div class="bracket-scroll">${bracketSvg(save, progress)}</div>` +
      `<div class="bracket-tip" hidden></div>`,
    click,
  );
  const tip = overlay.querySelector<HTMLElement>('.bracket-tip')!;
  let pinned: string | null = null;
  const show = (key: string | null, event: MouseEvent): void => {
    const n = key === null ? undefined : byKey.get(key);
    if (n === undefined) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = details(save, n);
    tip.hidden = false;
    const panel = overlay.querySelector<HTMLElement>('.panel')!.getBoundingClientRect();
    tip.style.left = `${Math.min(event.clientX - panel.left + 14, panel.width - 260)}px`;
    tip.style.top = `${event.clientY - panel.top + 14}px`;
  };
  const keyAt = (event: MouseEvent): string | null =>
    (event.target as Element).closest('g.match')?.getAttribute('data-key') ?? null;
  overlay.addEventListener('mousemove', (event) => {
    if (pinned === null) show(keyAt(event), event);
  });
  overlay.addEventListener('click', (event) => {
    const key = keyAt(event);
    if (key === null) return;
    click();
    // A click pins a match's details, and a second click on it lets them go.
    pinned = pinned === key ? null : key;
    show(key, event);
    for (const g of overlay.querySelectorAll('g.match.pinned')) g.classList.remove('pinned');
    if (pinned !== null)
      overlay.querySelector(`g.match[data-key="${pinned}"]`)?.classList.add('pinned');
  });
}
