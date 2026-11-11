import { defaultConfigBundle, type ArtLook } from '@bollfort/config';

import { howToPlaySeen, openHowToPlay } from './howToPlay.js';
import { withIcon } from './icons.js';
import { openCredits } from './credits.js';
import { openOptions } from './options.js';
import { gameHost } from './host.js';
import { lookName, lookPicture, LookRotation, openLookGallery, type LookChoices } from './looks.js';
import { escape } from './html.js';
import { parseRoomList } from './browser.js';
import { openFindGames } from './findGames.js';
import { t } from './i18n.js';
import { SplitTitle } from './decor.js';
import { app, showError, audio } from './app.js';
import { preferredStyles, saveStyles, storedName, saveName } from './prefs.js';
import { joinSteam, openLobby } from './lobbyFlow.js';
import { forgetMatch, keptMatch } from './steam/backToMatch.js';
import { joinRoute, readHostAnswer, stillPlaying } from './steam/rejoin.js';
import { listingOfLobby, lobbyFilter } from './steam/lobbyData.js';
import { LOBBY_KINDS, guestAt, lobbyKind, setLobbyKind, steamPlay } from './steam/steamPlay.js';
import { enhanceChoices } from './choices.js';
import { demoRunning, endDemo } from './demo.js';
import type { RoomListing } from '@bollfort/protocol';
import { openNewTournament, openResumeList, type TournamentExits } from './tournamentMenu.js';
import { savedTournaments } from './tournamentSaves.js';
import { playTournament } from './tournamentFlow.js';

/** The menu: who you are and how the game looks. */

/** What the menu gathers before a table is set: who you are and how it looks. */
export interface Common {
  name: string;
  styles: LookChoices;
  /** Whether a table this player opens is listed in the games browser. */
  isPublic: boolean;
}

/**
 * How long the looks' pictures wait as the menu opens: building them takes a moment, which
 * once waited for the title's first sweep; the title glides without end now, so this is
 * only for the menu to be on screen first.
 */
const PICTURES_AFTER_MS = 600;

/** The menu's two looks as they stand, or null with no menu shown. */
let menuChoices: LookChoices | null = null;

/** The menu's two look choices, saved for next time as they are read. */
function readStyles(): LookChoices {
  const styles = menuChoices ?? preferredStyles();
  saveStyles(styles);
  return styles;
}

/**
 * A look's card in the menu, one button opening the gallery: which look, its picture, the
 * style's name and a Change chip, so it reads as something to click before the pointer is
 * on it. No arrows stepping in place: every player chose from the gallery anyway, and the
 * menu had too many controls (the user's, 2026-10-28).
 */
function lookCard(look: ArtLook): string {
  const build = look === 'build';
  return (
    `<button class="look" data-look="${look}" data-tip="${t(build ? 'menu.pickBuild' : 'menu.pickCombat')}">` +
    `<span class="look-label">${t(build ? 'menu.buildLook' : 'menu.combatLook')}</span>` +
    `<img class="style-preview" alt="" />` +
    `<span class="look-foot"><span class="look-name"></span>` +
    `<span class="look-change">${withIcon('gallery', t('menu.changeLook'))}</span></span>` +
    `</button>`
  );
}

function readCommon(): Common {
  // Under Steam a player is their Steam name: there is no name field (STEAM.md §7.2).
  const steam = steamPlay();
  if (steam !== null) return { styles: readStyles(), name: steam.name, isPublic: true };
  const typed = document.querySelector<HTMLInputElement>('#name')?.value.trim() ?? '';
  const name = typed || t('menu.defaultName');
  // The default is a text in the reader's language, not a name anyone chose: saved as one,
  // it stayed English after a change to German. Saved empty, the next visit shows the
  // default in whichever language it is read.
  saveName(name === t('menu.defaultName') ? '' : name);
  // Every table is listed in the open games (the user's, 2026-10-28): the game is only ever
  // served among friends, and a room leaves the list once its match starts or it is full,
  // so a switch for it was one control too many. `&private=1` keeps one unlisted for tests.
  const isPublic = new URLSearchParams(location.search).get('private') !== '1';
  return { styles: readStyles(), name, isPublic };
}

/**
 * Whether a server answers, asked once as the menu opens: without one, or with one this page
 * cannot join, the room code's field and Join are disabled — joining by code needs it. Find a
 * game stays, and says so in its window (STEAM.md §4).
 */
function checkServer(): void {
  const joining = document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    '.join-row input, .join-row button',
  );
  void fetch('/api/rooms', { cache: 'no-store' })
    .then(async (response) => parseRoomList(await response.json()))
    .catch(() => null)
    .then((rooms) => {
      for (const control of joining) {
        if (!control.isConnected) return;
        control.disabled = rooms === null;
        if (rooms === null) control.dataset.tip = t('menu.noServer');
      }
    });
}

/** Find a game over the menu: joining a room, or hosting a public single match. */
function findGames(notice: string | null = null): void {
  openFindGames({
    click: () => audio.play('select'),
    notice,
    join: (code) =>
      void openLobby(readCommon(), code).catch((e: unknown) =>
        showError(t('error.couldNotJoin'), e),
      ),
    // The menu's Single match, public: always so outside Steam (STEAM.md §4).
    host: () =>
      void openLobby(readCommon(), null, undefined, 'public').catch((e: unknown) =>
        showError(t('error.couldNotOpen'), e),
      ),
    // Under Steam, Steam's public lobbies of ours, as rows (STEAM.md §4).
    ...(steamPlay() === null ? {} : { list: steamGames }),
  });
}

/** Steam's public lobbies as Find a game's rows: ours, on this protocol, not this player's. */
async function steamGames(): Promise<RoomListing[] | null> {
  const steam = steamPlay();
  if (steam === null) return null;
  const lobbies = await steam.host.lobbyList(lobbyFilter());
  return lobbies
    .filter((lobby) => lobby.owner !== steam.steamId)
    .map((lobby) => listingOfLobby(lobby.owner, lobby.data))
    .filter((row): row is RoomListing => row !== null);
}

/** Under Steam, who may join the table Play opens, and Back to the match (STEAM.md §7.3). */
function steamRows(): string {
  if (steamPlay() === null) return '';
  const kind = lobbyKind();
  const kept = keptMatch();
  const options = LOBBY_KINDS.map(
    (k) => `<option value="${k}"${k === kind ? ' selected' : ''}>${t(`steam.kind.${k}`)}</option>`,
  ).join('');
  return (
    (kept === null
      ? ''
      : `<div class="split back-row"><button id="back-to-match" class="primary" data-tip="${escape(t('steam.backToMatchTip'))}">${withIcon('resume', t('steam.backToMatch'))}</button></div>`) +
    `<div class="split lobby-kind-row" data-tip="${escape(t(`steam.kind.${kind}Tip`))}">` +
    `<select id="lobby-kind" data-ui="seg" aria-label="${escape(t('steam.lobbyKind'))}">${options}</select></div>`
  );
}

/** The Steam rows' controls, once the menu is drawn. */
function wireSteamRows(): void {
  const kindSelect = document.querySelector<HTMLSelectElement>('#lobby-kind');
  if (kindSelect !== null) {
    enhanceChoices(kindSelect.parentElement!);
    kindSelect.addEventListener('change', () => {
      audio.play('select');
      const kind = LOBBY_KINDS.find((k) => k === kindSelect.value) ?? 'friends';
      setLobbyKind(kind);
      kindSelect.parentElement!.dataset.tip = t(`steam.kind.${kind}Tip`);
    });
  }
  document.querySelector('#back-to-match')?.addEventListener('click', () => {
    audio.play('select');
    const kept = keptMatch();
    if (kept === null) {
      showMenu(t('steam.matchOver'));
      return;
    }
    void joinSteam(readCommon(), kept.host, true).catch((e: unknown) =>
      showError(t('error.couldNotJoin'), e),
    );
  });
}

/** Where the tournament screens lead: back to the menu, or on into a tournament. */
export function tournamentExits(isPublic: boolean): TournamentExits {
  const exits: TournamentExits = {
    isPublic,
    menu: () => showMenu(),
    play: (id) =>
      void playTournament(id, exits).catch((e: unknown) => showError(t('error.couldNotOpen'), e)),
    list: (notice) => openResumeList(exits, notice),
  };
  return exits;
}

/**
 * The menu: only who you are and how the game looks — the ways into a game on the left, the
 * two looks as cards on the right (PLAN §11 item 4, MS3). Everything about the table —
 * players, teams, bots, rounds — is set in the lobby, which is one screen whether or
 * not a server is there. `findGame` opens Find a game over it at once, with the notice there:
 * a game chosen from its list that filled or closed meanwhile.
 */
export function showMenu(notice: string | null = null, findGame = false): void {
  audio.music('music_menu');
  app!.innerHTML = `
    <div class="menu home">
      <section class="home-main">
      <h1 class="title"><span class="title-split" id="title"></span></h1>
      <p class="inspired">${escape(t('credits.inspiredBy'))} · <button id="credits" class="link">${t('menu.credits')}</button></p>
      ${steamPlay() === null ? `<label>${t('menu.name')} <input id="name" type="text" maxlength="16" placeholder="${escape(t('menu.defaultName'))}" /></label>` : ''}
      <div class="split play-row">
        <button id="play" class="primary">${withIcon('play', t('menu.singleMatch'))}</button>
      </div>
      ${steamRows()}
      <div class="split tournament-row">
        <button id="new-tournament">${withIcon('trophy', t('menu.newTournament'))}</button>
        <button id="resume-tournament"${savedTournaments().length === 0 ? ' disabled' : ''}>${withIcon('resume', t('menu.resumeTournament'))}</button>
      </div>
      <div class="split">
        <button id="how-to-play" class="quiet${howToPlaySeen() ? '' : ' fresh'}">${withIcon('help', t('menu.howToPlay'))}</button>
        <button id="options" class="quiet">${withIcon('gear', t('menu.options'))}</button>
      </div>
      <div class="split join-row">
        <input id="code" type="text" maxlength="8" placeholder="${t('menu.codePlaceholder')}" />
        <button id="join">${withIcon('join', t('menu.join'))}</button>
      </div>
      <div class="split find-row">
        <button id="find-game">${withIcon('search', t('menu.findGame'))}</button>
      </div>
      ${gameHost() === null ? '' : `<div class="split quit-row"><button id="quit" class="quiet">${withIcon('power', t('menu.quit'))}</button></div>`}
      ${notice === null || findGame ? '' : `<p class="notice menu-notice">${escape(notice)}</p>`}
      </section>
      <section class="home-looks">
        <h2>${t('looks.title')}</h2>
        ${lookCard('build')}
        ${lookCard('combat')}
      </section>
    </div>
  `;
  checkServer();
  wireSteamRows();
  // The desktop app's own way out (2026-11-09, the user's): a Steam game, on the Deck above
  // all, has no window to close. Absent in a browser, which has its own.
  document.querySelector('#quit')?.addEventListener('click', () => {
    audio.play('select');
    void gameHost()?.quit();
  });
  document.querySelector('#find-game')?.addEventListener('click', () => {
    audio.play('select');
    findGames();
  });
  if (findGame) findGames(notice);
  // The banners either side of combat swap one look for the other as they cross the
  // board, as the original did; the same style for both switches nothing.
  const styles = preferredStyles();
  // Set as a property rather than written into the markup, so a saved name needs no escaping;
  // the default only as the field's placeholder, so it does not read as a name somebody typed.
  const nameField = document.querySelector<HTMLInputElement>('#name');
  const saved = storedName();
  if (nameField) nameField.value = saved === t('menu.defaultName') ? '' : saved;
  menuChoices = { ...styles };
  // Options (2026-10-24): the language, the Graphics, the Motion and the volumes, in a panel
  // over the menu. A name typed is read as it opens, while the default name is still the old
  // language's, since only a name somebody typed is kept.
  const typedBefore = (): string | null => {
    const typed = document.querySelector<HTMLInputElement>('#name')?.value.trim();
    return typed && typed !== t('menu.defaultName') ? typed : null;
  };
  document.querySelector('#options')?.addEventListener('click', () => {
    audio.play('select');
    const typed = typedBefore();
    openOptions({
      audio,
      // The language changed: the menu written afresh, keeping a name typed but not yet saved.
      languageChanged: () => {
        if (typed !== null) saveName(typed);
        showMenu(notice);
      },
    });
  });

  // The title in both chosen looks at once, split by a banner's line that sweeps across
  // as either choice changes — what the two choices mean, shown rather than said. A random
  // half takes a new style at every sweep, as a match's look does at every banner.
  const titleRoot = document.querySelector<HTMLElement>('#title');
  const title = titleRoot ? new SplitTitle(titleRoot, defaultConfigBundle.art) : null;
  if (title) {
    title.use(new LookRotation(styles));
    title.glide();
  }

  // A picture of each chosen look with its name, the gallery of them all behind a click on its
  // card (ARCHIVE 12b). The pictures wait a moment, so the menu is on screen before building
  // them holds it.
  let picturesShown = false;
  const showPicture = (look: ArtLook): void => {
    const choice = menuChoices?.[look];
    const row = document.querySelector<HTMLElement>(`.look[data-look="${look}"]`);
    if (choice === undefined || row === null) return;
    const name = row.querySelector<HTMLElement>('.look-name');
    if (name) name.textContent = lookName(choice);
    row.dataset.tip =
      choice === 'random'
        ? t('looks.randomHint')
        : t(look === 'build' ? 'menu.pickBuild' : 'menu.pickCombat');
    const image = row.querySelector<HTMLImageElement>('img');
    if (image === null || !picturesShown) return;
    image.classList.remove('ready');
    void lookPicture(choice).then(
      (url) => {
        // Only if the choice still stands: a slow picture must not replace a newer one.
        if (menuChoices?.[look] !== choice) return;
        image.src = url;
        image.classList.add('ready');
      },
      () => undefined,
    );
  };
  const choose = (next: LookChoices): void => {
    const changed = (['build', 'combat'] as const).filter(
      (look) => next[look] !== menuChoices?.[look],
    );
    menuChoices = { ...next };
    saveStyles(next);
    for (const look of changed) showPicture(look);
    if (changed.length > 0) title?.use(new LookRotation(next));
  };
  for (const look of ['build', 'combat'] as const) {
    const card = document.querySelector<HTMLElement>(`.look[data-look="${look}"]`);
    showPicture(look);
    card?.addEventListener('click', () => {
      audio.play('select');
      if (!menuChoices) return;
      openLookGallery({
        choices: menuChoices,
        active: look,
        onChange: choose,
        click: () => audio.play('select'),
      });
    });
  }
  setTimeout(() => {
    picturesShown = true;
    showPicture('build');
    showPicture('combat');
  }, PICTURES_AFTER_MS);

  // Tournaments (ARCHIVE 13w): a new one set up, or a saved one to go on with.
  const exits = (): TournamentExits => tournamentExits(readCommon().isPublic);
  document.querySelector('#new-tournament')?.addEventListener('click', () => {
    audio.play('select');
    openNewTournament(readCommon(), exits());
  });
  document.querySelector('#resume-tournament')?.addEventListener('click', () => {
    audio.play('select');
    openResumeList(exits());
  });

  document.querySelector('#play')?.addEventListener('click', () => {
    audio.play('select');
    void openLobby(readCommon(), null).catch((e: unknown) => showError(t('error.couldNotOpen'), e));
  });
  // How to play (PLAN 11.16 H1): pages of pictures over the menu, marked until first opened.
  const howTo = document.querySelector<HTMLButtonElement>('#how-to-play');
  howTo?.addEventListener('click', () => {
    audio.play('select');
    howTo.classList.remove('fresh');
    howTo.blur();
    openHowToPlay(undefined, () => audio.play('select'));
  });
  document.querySelector('#credits')?.addEventListener('click', () => {
    audio.play('select');
    openCredits(defaultConfigBundle.audio, () => audio.play('select'));
  });
  document.querySelector('#join')?.addEventListener('click', () => {
    audio.play('select');
    const code = document.querySelector<HTMLInputElement>('#code')?.value.trim() ?? '';
    if (code.length === 0) return;
    void openLobby(readCommon(), code).catch((e: unknown) => showError(t('error.couldNotJoin'), e));
  });
}

/**
 * Invites and Join in Steam's friends list (STEAM.md §7.3): a lobby the app was started for,
 * or asked to join while it runs. On the menu it is joined at once; anywhere else the player
 * is asked first, and the page loaded afresh to join, which takes down whatever game was on
 * it — a room left, a match given up — as cleanly as leaving does.
 *
 * Coming back (S3.6): an invite from the host of the match this player left goes straight
 * back to it, no lobby on the way — without asking, if that match is what is on screen, its
 * link lost; an invite from the host whose table this page is at is no news. And started
 * with no invite but a match kept, the host is asked whether it still runs, and the player
 * offered to rejoin it.
 */
export function startSteamJoins(): void {
  const steam = steamPlay();
  if (steam === null) return;
  const query = new URLSearchParams(location.search);
  const askedLobby = query.get('steamLobby');
  const askedFrom = query.get('steamFrom');
  const go = async (asked: { lobby: string; from: string | null }): Promise<void> => {
    const route = joinRoute(asked, keptMatch(), null);
    // Straight to the host who invited, the lobby skipped: the room gives the seat back by
    // Steam ID, or seats a newcomer if its next match is being set — whatever it now hosts.
    if (route.kind === 'back') {
      await joinSteam(readCommon(), route.host);
      return;
    }
    const owner = await steam.host.lobbyJoin(asked.lobby);
    if (owner === null) showMenu(t('steam.noGame'));
    else await joinSteam(readCommon(), owner);
  };
  const reloadFor = (asked: { lobby: string; from: string | null }): void => {
    const url = new URL(location.href);
    url.searchParams.set('steamLobby', asked.lobby);
    if (asked.from !== null) url.searchParams.set('steamFrom', asked.from);
    location.replace(url.toString());
  };
  const take = async (): Promise<void> => {
    const lobbies = await steam.host.lobbies();
    const asked = lobbies.at(-1);
    if (asked === undefined) return;
    const guest = guestAt();
    const route = joinRoute(asked, keptMatch(), guest?.linked === true ? guest.host : null);
    if (route.kind === 'here') return;
    if (demoRunning()) await endDemo();
    if (document.querySelector('.menu.home') !== null) {
      void go(asked).catch((e: unknown) => showError(t('error.couldNotJoin'), e));
      return;
    }
    // The match left, on screen with its link given up: back to it without asking.
    if (route.kind === 'back' && guest !== null && guest.host === route.host) {
      reloadFor(asked);
      return;
    }
    askToLeave(() => reloadFor(asked));
  };
  if (askedLobby !== null && /^\d{1,20}$/.test(askedLobby)) {
    // Once only: a reload of the page later must not join it again.
    const url = new URL(location.href);
    url.searchParams.delete('steamLobby');
    url.searchParams.delete('steamFrom');
    history.replaceState(null, '', url.toString());
    const from = askedFrom !== null && /^\d{1,20}$/.test(askedFrom) ? askedFrom : null;
    void go({ lobby: askedLobby, from }).catch((e: unknown) =>
      showError(t('error.couldNotJoin'), e),
    );
  } else {
    void steam.host
      .lobbies()
      .then((lobbies) => {
        const asked = lobbies.at(-1);
        if (asked !== undefined) return go(asked);
        offerKeptMatch();
        return undefined;
      })
      .catch((e: unknown) => showError(t('error.couldNotJoin'), e));
  }
  steam.host.onJoinAsked(() => void take());
}

/**
 * Started again with a match kept (S3.6): its host asked whether it still runs with this
 * player's seat in it — and if so, while the menu is still what is on screen, the player is
 * offered to rejoin it; if not, the match is forgotten, and the menu says so.
 */
function offerKeptMatch(): void {
  const steam = steamPlay();
  const kept = keptMatch();
  if (steam === null || kept === null) return;
  void steam.host.find(kept.host).then((answer) => {
    const found = readHostAnswer(answer);
    if (keptMatch()?.host !== kept.host) return; // left or joined meanwhile
    const onMenu = document.querySelector('.menu.home') !== null;
    if (!stillPlaying(found)) {
      forgetMatch();
      if (onMenu) showMenu(t('steam.matchOver'));
      return;
    }
    if (!onMenu) return;
    askToRejoin(found.host ?? '?', roundText(found.you.round, found.you.maxRounds), () => {
      void joinSteam(readCommon(), kept.host, true).catch((e: unknown) =>
        showError(t('error.couldNotJoin'), e),
      );
    });
  });
}

/** The round a running match is at, as the HUD's label says it. */
function roundText(round: number, cap: number | null): string {
  if (round === 0) return t('round.opening');
  return cap === null ? t('round.label', { round }) : t('round.labelOf', { round, cap });
}

/** Offers to rejoin a match still running; Leave it forgets it. */
function askToRejoin(host: string, round: string, rejoin: () => void): void {
  document.querySelector('.steam-join-asked')?.remove();
  const root = document.createElement('div');
  root.className = 'how-to-play steam-join-asked';
  root.innerHTML = `
    <div class="panel">
      <h2>${t('steam.rejoinAsked.title')}</h2>
      <p>${escape(t('steam.rejoinAsked.body', { host, round }))}</p>
      <div class="split">
        <button class="primary" data-join>${withIcon('resume', t('steam.rejoinAsked.rejoin'))}</button>
        <button class="quiet" data-stay>${t('steam.rejoinAsked.leave')}</button>
      </div>
    </div>`;
  root.querySelector('[data-join]')?.addEventListener('click', () => {
    audio.play('select');
    root.remove();
    rejoin();
  });
  root.querySelector('[data-stay]')?.addEventListener('click', () => {
    audio.play('select');
    root.remove();
    forgetMatch();
    showMenu();
  });
  document.body.append(root);
}

/** Asks before leaving the game on screen for another; `join` if the player says so. */
function askToLeave(join: () => void): void {
  document.querySelector('.steam-join-asked')?.remove();
  const root = document.createElement('div');
  root.className = 'how-to-play steam-join-asked';
  root.innerHTML = `
    <div class="panel">
      <h2>${t('steam.joinAsked.title')}</h2>
      <p>${t('steam.joinAsked.body')}</p>
      <div class="split">
        <button class="primary" data-join>${withIcon('join', t('steam.joinAsked.join'))}</button>
        <button class="quiet" data-stay>${t('steam.joinAsked.stay')}</button>
      </div>
    </div>`;
  root.querySelector('[data-join]')?.addEventListener('click', () => {
    audio.play('select');
    join();
  });
  root.querySelector('[data-stay]')?.addEventListener('click', () => {
    audio.play('select');
    root.remove();
  });
  document.body.append(root);
}
