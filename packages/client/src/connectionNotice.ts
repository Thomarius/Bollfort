import type { TextKey } from '@bollfort/config';
import { onLanguageChange, t } from './i18n.js';
import type { NetworkReading } from './network.js';

/**
 * What the notice shows: nothing, a drop being mended, the connection lost for good, or the
 * match ended by its host leaving (STEAM.md §7.3).
 */
export type NoticeState = 'none' | 'retrying' | 'gone' | 'hostLeft' | 'serverClosed';

/**
 * Whether to cover the board, and with what. Only while the match is on: a drop over the
 * summary is the badge's to say, the summary's way back to the menu still there.
 */
export function noticeFor(link: NetworkReading['link'], finished: boolean): NoticeState {
  if (finished || link === 'open') return 'none';
  if (link === 'hostLeft' || link === 'serverClosed') return link;
  return link === 'lost' ? 'gone' : 'retrying';
}

/**
 * Over the board while an online match's connection is down (ARCHIVE 15zc): the board
 * stands still with no commits coming, and with only the badge to say why it read as the
 * game having frozen. Retrying it says a bot holds the seat; given up, or the host gone, it
 * offers the menu. The menu is offered while retrying too, quietly: a host whose game crashed
 * is never coming back, and the tries outlast any patience (the two-person test, 2026-11-11).
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
    const state = this.shown;
    const [title, text]: [TextKey, TextKey] =
      state === 'hostLeft'
        ? ['connection.hostLeftTitle', 'connection.hostLeft']
        : state === 'serverClosed'
          ? ['connection.serverClosedTitle', 'connection.serverClosed']
          : ['connection.title', state === 'gone' ? 'connection.gone' : 'connection.retrying'];
    this.overlay.innerHTML =
      `<div class="panel"><strong>${t(title)}</strong>` +
      `<p>${t(text)}</p>` +
      (state === 'retrying'
        ? `<span class="blocks"><i></i><i></i><i></i></span>` +
          `<button class="quiet back">${t('connection.back')}</button>`
        : `<button class="resume back">${t('connection.back')}</button>`) +
      `</div>`;
    this.overlay.querySelector('.back')?.addEventListener('click', () => this.back());
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
