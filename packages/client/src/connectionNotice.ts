import { onLanguageChange, t } from './i18n.js';
import type { NetworkReading } from './network.js';

/** What the notice shows: nothing, a drop being mended, or the connection lost for good. */
export type NoticeState = 'none' | 'retrying' | 'gone';

/**
 * Whether to cover the board, and with what. Only while the match is on: a drop over the
 * summary is the badge's to say, the summary's way back to the menu still there.
 */
export function noticeFor(link: NetworkReading['link'], finished: boolean): NoticeState {
  if (finished || link === 'open') return 'none';
  return link === 'lost' ? 'gone' : 'retrying';
}

/**
 * Over the board while an online match's connection is down (ARCHIVE 15zc): the board
 * stands still with no commits coming, and with only the badge to say why it read as the
 * game having frozen. Retrying it says a bot holds the seat; given up, it offers the menu.
 */
export class ConnectionNotice {
  private readonly overlay = document.createElement('div');
  private shown: NoticeState = 'none';
  private readonly stopListening: () => void;

  constructor(private readonly back: () => void) {
    this.overlay.className = 'pause-overlay connection-overlay';
    this.overlay.hidden = true;
    document.body.append(this.overlay);
    this.stopListening = onLanguageChange(() => this.fill());
  }

  private fill(): void {
    if (this.shown === 'none') return;
    const gone = this.shown === 'gone';
    this.overlay.innerHTML =
      `<div class="panel"><strong>${t('connection.title')}</strong>` +
      `<p>${t(gone ? 'connection.gone' : 'connection.retrying')}</p>` +
      (gone
        ? `<button class="resume">${t('connection.back')}</button>`
        : `<span class="blocks"><i></i><i></i><i></i></span>`) +
      `</div>`;
    this.overlay.querySelector('.resume')?.addEventListener('click', () => this.back());
  }

  /** Called every frame; touches the page only when what it shows changes. */
  update(state: NoticeState): void {
    if (state === this.shown) return;
    this.shown = state;
    this.overlay.hidden = state === 'none';
    this.fill();
  }

  destroy(): void {
    this.stopListening();
    this.overlay.remove();
  }
}
