import type { TextKey } from '@bollfort/config';

import { escape } from './html.js';
import { onLanguageChange, t } from './i18n.js';
import { pads, padText } from './pads.js';

/** "Click again" in a controller's words. */
const LEAVE_PAD: Partial<Record<TextKey, TextKey>> = {
  'pause.leaveConfirm': 'pause.leaveConfirmPad',
  'tournament.leaveConfirm': 'tournament.leaveConfirmPad',
};
import { withIcon } from './icons.js';
import { refreshSettingsRows, settingsRows } from './settingsRows.js';
import type { VolumeTarget } from './volume.js';

/**
 * Pausing a match: a button beside the Sound switch, Esc, and an overlay saying who
 * paused. For the test sessions anyone at the table may pause and anyone resume, with no
 * limit (PLAN 11.12 F2). Esc is the one keyboard shortcut the game keeps beyond the listed
 * controls, being what games use for this; everything it does also has something on
 * screen to click.
 *
 * The overlay is the match's menu (PLAN 11.18 Y2): Resume, the settings as the menu's Options has
 * them (`settingsRows.ts`), the looks, How to play, and Leave match, in the warning colour, which
 * asks once more before it goes — one stray click should not end somebody's match. No Sound
 * button of its own: the corner's is beside it, and the volumes' speakers silence each.
 */

/** The overlay's line: who paused, from the viewer's side. */
export function pauseText(pausedBy: number, humanPlayer: number, names: readonly string[]): string {
  if (pausedBy === humanPlayer || pausedBy < 0) return t('pause.you');
  const name = names[pausedBy];
  return name === undefined ? t('pause.anyone') : t('pause.by', { name });
}

/**
 * Whether a match pauses as its window loses focus (PLAN §11 item 4, UP1): a local one a
 * person plays, still running — never online, where a pause stops everyone, nor a bot match
 * only watched. A hidden page already stood still, its frames stopped and the time on return
 * capped (`LocalMatch.advance`), but came back straight into play; a window left for another
 * in view played on.
 */
export function pausesOnBlur(match: {
  online: boolean;
  humanPlayer: number;
  pausedBy: number | null;
  over: boolean;
}): boolean {
  return !match.online && match.humanPlayer >= 0 && match.pausedBy === null && !match.over;
}

/** What the pause menu does, given by the match it belongs to. */
export interface PauseActions {
  /** Pauses or resumes, for everyone once a server agrees. */
  toggle(paused: boolean): void;
  /** Leaves the match for the main menu. */
  leave(): void;
  /** What Leave match asks before it goes, where leaving means more than leaving. */
  leaveConfirm?: TextKey;
  /** The menu's click. */
  click(): void;
  /** The music and sounds volumes, for the sliders. */
  volumes: VolumeTarget;
  /** Opens the gallery of looks, to change them mid-match (ARCHIVE 12b). */
  looks?(): void;
  /** Opens How to play at the phase being played, returning its closing (ARCHIVE 14zq). */
  howToPlay?(): () => void;
  /**
   * The players whose seat is away and who can be invited back, each by an ID and name — the
   * Steam host's, online (STEAM.md §7.3, S3.6); absent anywhere else.
   */
  invitable?(): readonly Invitable[];
  /** Invites one of them back. */
  inviteBack?(id: string): void;
}

/** A player the pause menu offers to invite back. */
export interface Invitable {
  id: string;
  name: string;
}

/** How long a player's button says they were invited, before it offers again. */
const INVITED_MS = 15_000;

export class PauseControls {
  private readonly button: HTMLButtonElement;
  private readonly overlay: HTMLDivElement;
  private line!: HTMLParagraphElement;
  private leaving!: HTMLButtonElement;
  private settings!: HTMLElement;
  /** How to play, while it is open over this menu: it goes as the match resumes. */
  private closeHowTo: (() => void) | null = null;
  /** What the line says, so the DOM is touched only when it changes. */
  private shown: string | null = null;
  /** The Invite back row, and what it shows, so it is written only when that changes. */
  private invites!: HTMLDivElement;
  private invitesShown = '';
  /** When each player was last invited back, by ID. */
  private readonly invitedAt = new Map<string, number>();
  private paused = false;
  private over = false;
  private readonly stopListening: () => void;
  private readonly key = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.over) return;
    event.preventDefault();
    this.actions.toggle(!this.paused);
  };

  constructor(private readonly actions: PauseActions) {
    this.button = document.createElement('button');
    this.button.id = 'pause';
    this.button.addEventListener('click', () => {
      actions.click();
      actions.toggle(!this.paused);
      // Off the button, so Space or Enter later cannot press it again unseen.
      this.button.blur();
    });

    // Built once and kept: rewriting it while open would replace a control under the mouse —
    // except when the language changes, which is chosen in it, and fills it afresh.
    this.overlay = document.createElement('div');
    this.overlay.className = 'pause-overlay';
    this.overlay.hidden = true;
    this.fill();
    this.stopListening = onLanguageChange(() => {
      this.fill();
      // The line and the settings are written again at the next frame, as on opening.
      this.shown = null;
    });

    // In the corner's row beside Sound and Full screen (`app.ts`), where there is one.
    (document.querySelector('#corner') ?? document.body).append(this.button);
    document.body.append(this.overlay);
    globalThis.addEventListener('keydown', this.key);
  }

  /** The overlay's contents, in the language in use, its controls wired. */
  private fill(): void {
    const actions = this.actions;
    this.showButton(true);
    this.button.dataset.tip = t('pause.buttonTitle');
    this.button.dataset.tipSide = 'right';
    this.overlay.innerHTML =
      `<div class="panel"><strong>${t('pause.title')}</strong><p class="who"></p>` +
      `<button class="resume" data-main>${t('pause.resume')}</button>` +
      // The buttons in a row of their own under the settings and volumes, which are a column
      // as the menu's Options lays them out: in one long row they nearly filled the screen.
      `<div class="actions">` +
      (actions.looks === undefined
        ? ''
        : `<button class="looks quiet">${t('pause.looks')}</button>`) +
      (actions.howToPlay === undefined
        ? ''
        : `<button class="how-to quiet">${t('menu.howToPlay')}</button>`) +
      `</div>` +
      // Invite back, a button for each player away (S3.6): written as they come and go.
      `<div class="actions invites" hidden></div>` +
      `<button class="leave-match quiet">${t('pause.leave')}</button>` +
      `<small class="esc-hint"></small></div>`;
    this.line = this.overlay.querySelector<HTMLParagraphElement>('.who')!;
    this.leaving = this.overlay.querySelector<HTMLButtonElement>('.leave-match')!;
    this.invites = this.overlay.querySelector<HTMLDivElement>('.invites')!;
    this.invitesShown = '';
    this.invites.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-invite]');
      const id = button?.dataset.invite;
      if (id === undefined || button?.disabled === true) return;
      actions.click();
      actions.inviteBack?.(id);
      this.invitedAt.set(id, performance.now());
      this.writeInvites();
    });
    this.writeHints();
    // The language, mid-match, is written into this menu by `onLanguageChange`, the HUD's at
    // the next frame.
    this.settings = settingsRows({
      click: () => actions.click(),
      volumes: actions.volumes,
      languageChanged: () => undefined,
    });
    this.overlay.querySelector('.resume')?.after(this.settings);

    this.overlay.querySelector('.resume')?.addEventListener('click', () => {
      actions.click();
      actions.toggle(false);
    });
    this.overlay.querySelector('.looks')?.addEventListener('click', () => {
      actions.click();
      actions.looks?.();
    });
    this.overlay.querySelector('.how-to')?.addEventListener('click', () => {
      actions.click();
      this.closeHowTo?.();
      this.closeHowTo = actions.howToPlay?.() ?? null;
    });
    this.leaving.addEventListener('click', () => {
      actions.click();
      if (this.leaving.classList.contains('confirm')) {
        actions.leave();
        return;
      }
      this.leaving.classList.add('confirm');
      this.writeHints();
    });
  }

  /**
   * The words that speak of the mouse and the keyboard — Esc to resume, click again to leave —
   * or, with a pad in use, of its buttons (STEAM.md §8, C4).
   */
  private writeHints(): void {
    const hint = this.overlay.querySelector('.esc-hint');
    if (hint !== null)
      hint.innerHTML =
        padText((marks) => t('pause.escHintPad', marks)) ?? escape(t('pause.escHint'));
    if (this.leaving.classList.contains('confirm')) {
      const key = this.actions.leaveConfirm ?? 'pause.leaveConfirm';
      this.leaving.textContent = t(pads.active ? (LEAVE_PAD[key] ?? key) : key);
    }
  }

  private readonly stopPad = pads.onChange(() => this.writeHints());

  /** The corner's button, its icon and words for the state: written only on a change, every frame. */
  private buttonLabel = '';
  private showButton(force = false): void {
    const label = this.paused ? t('pause.resume') : t('pause.button');
    if (!force && label === this.buttonLabel) return;
    this.buttonLabel = label;
    this.button.innerHTML = withIcon(this.paused ? 'play' : 'pause', label);
  }

  /** Called every frame with the match as it stands. */
  update(pausedBy: number | null, humanPlayer: number, names: readonly string[], over: boolean) {
    this.over = over;
    this.paused = pausedBy !== null;
    // Written only on a change: this runs every frame.
    if (this.button.hidden !== over) this.button.hidden = over;
    this.showButton();
    const text = pausedBy === null || over ? null : pauseText(pausedBy, humanPlayer, names);
    // Players come and go while the menu is open: asked each frame, written on a change.
    if (text !== null) this.writeInvites();
    if (text === this.shown) return;
    const opening = this.shown === null && text !== null;
    this.shown = text;
    this.overlay.hidden = text === null;
    if (text === null) this.hideHowTo();
    this.line.textContent = text ?? '';
    if (opening) {
      // As the menu opens: the settings as they stand, and the leave asked for afresh.
      refreshSettingsRows(this.settings, this.actions.volumes);
      this.leaving.classList.remove('confirm');
      this.leaving.textContent = t('pause.leave');
    }
  }

  /**
   * The Invite back row as it stands: a button for each player away, saying for a while that
   * they were invited once clicked. Written only when that changes, as it is asked each frame.
   */
  private writeInvites(): void {
    const now = performance.now();
    const people = this.actions.invitable?.() ?? [];
    const rows = people.map((p) => {
      const at = this.invitedAt.get(p.id);
      return { ...p, invited: at !== undefined && now - at < INVITED_MS };
    });
    const key = rows.map((r) => `${r.id}:${r.name}:${r.invited}`).join('|');
    if (key === this.invitesShown) return;
    this.invitesShown = key;
    this.invites.hidden = rows.length === 0;
    this.invites.innerHTML = rows
      .map((r) =>
        r.invited
          ? `<button class="quiet" data-invite="${escape(r.id)}" disabled>${escape(t('pause.invited', { name: r.name }))}</button>`
          : `<button class="quiet" data-invite="${escape(r.id)}" data-tip="${escape(t('pause.inviteBackTip', { name: r.name }))}">${withIcon('join', escape(t('pause.inviteBack', { name: r.name })))}</button>`,
      )
      .join('');
  }

  private hideHowTo(): void {
    this.closeHowTo?.();
    this.closeHowTo = null;
  }

  destroy(): void {
    this.stopPad();
    this.hideHowTo();
    globalThis.removeEventListener('keydown', this.key);
    this.stopListening();
    this.button.remove();
    this.overlay.remove();
  }
}
