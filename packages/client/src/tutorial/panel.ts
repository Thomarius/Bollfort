import { escape } from '../html.js';
import { formatNumber, t } from '../i18n.js';
import { withIcon } from '../icons.js';
import type { TutorialCard } from './director.js';

/**
 * The tutorial's words on screen (docs/TUTORIAL.md §5): a card above the board, which is fitted
 * below it — its heading large, what to do or what it means under it, the count towards a task
 * as a bar, the round's points as a sum, and for a note the Continue that lets the match go on.
 * It comes in afresh with each step, so a new one is seen. At the end, a small window with the
 * two ways on.
 */
export class TutorialPanel {
  private readonly root = document.createElement('div');
  private shown = '';
  private end: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly skip: () => void,
    private readonly next: () => void,
  ) {
    this.root.className = 'tutorial-card';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.skip') !== null) this.skip();
      else if (target.closest('.next') !== null) this.next();
    });
    parent.append(this.root);
  }

  /** The card of the moment, or none. */
  update(card: TutorialCard | null): void {
    const html = card === null ? '' : cardHtml(card);
    if (html === this.shown) return;
    // A new step comes in afresh; the same step's count only changes its figures.
    const fresh = card === null || !this.shown.includes(`data-title="${card.title}"`);
    this.shown = html;
    this.root.hidden = html === '';
    if (html === '') return;
    this.root.innerHTML = html;
    if (fresh) {
      this.root.classList.remove('arrive');
      // Read back so the animation starts again.
      void this.root.offsetWidth;
      this.root.classList.add('arrive');
    }
  }

  /** The last window: Play a match, or back to the menu. Once. */
  finish(play: () => void, menu: () => void, click: () => void): void {
    if (this.end !== null) return;
    this.update(null);
    const root = document.createElement('div');
    root.className = 'how-to-play name-ask tutorial-end';
    root.innerHTML = `
      <div class="panel">
        <h2>${t('tutorial.doneTitle')}</h2>
        <p>${t('tutorial.doneBody')}</p>
        <button class="primary" data-main>${withIcon('play', t('tutorial.play'))}</button>
        <button class="quiet menu-back">${t('tutorial.toMenu')}</button>
      </div>`;
    root.querySelector('.primary')?.addEventListener('click', () => {
      click();
      play();
    });
    root.querySelector('.menu-back')?.addEventListener('click', () => {
      click();
      menu();
    });
    this.root.parentElement?.append(root);
    this.end = root;
  }

  destroy(): void {
    this.root.remove();
    this.end?.remove();
  }
}

/** The card's markup. */
export function cardHtml(card: TutorialCard): string {
  const params = card.params ?? {};
  // No button is named: the cursor shows the mouse's or the controller's (STEAM.md §8).
  const body = escape(t(card.body, params));
  const hint = card.hint === undefined ? '' : `<p class="hint">${escape(t(card.hint, params))}</p>`;
  const kicker = t(card.kind === 'task' ? 'tutorial.kickerTask' : 'tutorial.kickerNote');
  const progress =
    card.progress === undefined
      ? ''
      : `<div class="progress"><span class="bar"><i style="width:${(
          (100 * card.progress.done) /
          Math.max(1, card.progress.of)
        ).toFixed(1)}%"></i></span><span class="count">${escape(
          t('tutorial.progress', { done: card.progress.done, of: card.progress.of }),
        )}</span></div>`;
  const points =
    card.points === undefined
      ? ''
      : `<table class="points">${card.points.lines
          .map(
            (line) =>
              `<tr><td>${escape(t(line.label))}</td><td class="sum">${escape(
                t('tutorial.pointsTimes', { n: line.count, each: line.each }),
              )}</td><td class="value">${formatNumber(line.count * line.each)}</td></tr>`,
          )
          .join('')}<tr class="total"><td>${escape(t('tutorial.pointsTotal'))}</td><td></td>` +
        `<td class="value">${formatNumber(card.points.total)}</td></tr></table>`;
  const next =
    card.kind === 'note'
      ? `<button class="primary next" data-main>${escape(t('tutorial.continue'))}</button>`
      : '';
  return (
    `<div class="head" data-title="${card.title}"><span class="kicker ${card.kind}">${escape(kicker)}</span>` +
    `<button class="quiet skip">${escape(t('tutorial.skip'))}</button></div>` +
    `<h2>${escape(t(card.title, params))}</h2><p class="body">${body}</p>${hint}` +
    (points + progress + next === '' ? '' : `<div class="foot">${points}${progress}${next}</div>`)
  );
}
