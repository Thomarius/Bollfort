# Bollwerk on Steam — the design and its packages

**Decided** (2026-11-02, the user's, in three rounds of questions): Bollwerk goes to Steam as a
**free game**, after the first feature-ready version (PLAN §11 item 5). A small **supporter DLC**
comes later, once the game works and people play it. The supporter DLC is only a way for people
to give a small donation, not a store. The browser game, the portable builds on GitHub and the
desktop app's link stay as they are, and Steam is one more way to play. This file is the design;
once built, it is retired into the ARCHIVE, as `SPECIAL_TOWERS.md` will be.

What Valve's documentation says was checked against its live pages on 2026-11-02
(partner.steamgames.com, `steamworks.js` on GitHub). Some long pages came back summarised rather
than verbatim; those points are marked _(to confirm)_ and are read on the live page before
anything is built on them. Our own reasoning or memory is marked _(unchecked)_.

---

## 1. The decisions

**Scope and money**

- **When**: after the online session (PLAN §11 item 5), as the game's 1.0 on Steam.
- **The Steam Direct fee** (US$100, one-off) is accepted: a one-off cost, not a running one.
- **The rights**: a private project; no employer has a claim.
- **The trademark**: Rampart is named nowhere on Steam — not in the store page, its tags or its
  art. The "inspired by" line stays in the game's Credits, the README and the release notes, and
  is left off the Steam page. Similar paid games stand closer to the original; Bollwerk's changes
  and additions are substantial.
- **The supporter DLC**: Halloween and Christmas, their music, and a supporter's badge by the name.
  Wallpapers perhaps, if they turn out to work. The price is decided later (€1.99 in mind). It
  ships later than the game (§6).

**Builds**

- **One codebase, one desktop app**, with Steam switched on by a flag at packaging for the Steam
  depots only (§3). The GitHub builds never start Steam, even with Steam running and the game
  owned. They keep the link, UPnP, the LAN and every style.
- **The Steam build has only Steam's online services**: Steam lobbies, no link, no UPnP, no LAN,
  so that nothing competes with Steam's own services.
- **No recordings in any packaged build**, Steam or GitHub. Recordings are for tuning and are not
  part of a release. `npm start` on the user's own server still records test sessions.
- **Windows and Linux** depots; no macOS (PLAN §12).
- **Native controller support**, for the Steam Deck (§8): native, by grid positions and buttons,
  a cursor only in combat; one button for everything the left button does, one for everything
  the right does (in combat, held, it speeds the cursor up), Start for Esc, all reconfigurable. The mouse-only rule is amended to
  "mouse, or a controller through the same actions" (the user's, 2026-11-02). There are still no
  keyboard shortcuts.

**Lobbies and the browser**

- **Three lobby types** under Steam: **Public** (in the games list), **Friends** (friends join
  from their friends list, not listed) and **Invite only**. Friends is the default.
- **Outside Steam rooms stay public**, as now. This was the easier option, and the protocol's
  unused `public: false` is left as it is.
- **The host can kick** a guest in the lobby, never during a match. A kicked player cannot rejoin
  that lobby or room (§5). There is no chat.
- **One games browser**, its source set by the build: Steam's lobbies in the Steam build, the
  server's rooms everywhere else. The two are never mixed (§4).
- **No quick match**, for now.
- **Steam extras at launch**: Steam names and avatars on the seat cards, rich presence with Join
  from the friends list, and the game's language from Steam's. English and German are the listed
  languages; Hessian stays an in-game joke. Achievements and Steam Cloud come later, perhaps.

**The store**

- **The name**: another game called BOLLWERK (BOLLWERK Games, a new indie studio, planned for
  2027), and five live marks of the word in classes 9 and 41, make ours **Bollfort**, everywhere
  (2026-11-03, the user's). The search and the rename are package N (§9.1), before the store page.
- **The capsules and logo** are composed from the game's own art, rendered by a tool. Pixel and
  Medieval are tried first, as the most basic and iconic styles. The DLC's two styles never
  appear in the store's art.
- **Updates**: every `v*` tag uploads to a password-protected beta branch, and the user promotes
  it to the public branch by hand in Steamworks. There is no Steam Playtest; testers get keys for
  the beta branch.

## 2. The packages, in order

| Package | What                                                    | Needs Steam | Before paying |
| ------- | ------------------------------------------------------- | ----------- | ------------- |
| **N**   | The name: searched, Bollfort; the rename everywhere     | no          | yes           |
| **R**   | No recordings in packaged builds                        | no          | yes           |
| **K**   | The host's kick, every room                             | no          | yes           |
| **B**   | The games browser with filters, every build             | no          | yes           |
| **T**   | The transport interface, the fake, the tests            | no          | yes           |
| **C**   | Native controller support                               | no          | yes           |
| **S1**  | The spike on App ID 480, two accounts, two machines     | 480         | yes           |
| **S2**  | The Steam build: the flag, the binding, no launcher     | 480         | yes           |
| **S3**  | Steam lobbies, invites, presence, names and avatars     | 480         | yes           |
| **D1**  | Styles by entitlement: the DLC's two hidden, seasons    | no          | yes           |
| **S4**  | The store: fee, store page, capsules, depots, release   | the app     | it is paying  |
| **S5**  | The users' test on the beta branch, Deck review, launch | the app     | —             |
| **D2**  | Later: the supporter DLC itself                         | the app     | —             |

N, R, K, B, T, C and D1 need no Steam and can be built in any order, each tested in
`npm run check`. S1 comes before the fee is paid, and its answers decide S3's binding work.

## 3. The Steam build (S1, S2)

### 3.1 The flag and the binding

- **`steamworks.js`** (MIT, Rust) in the desktop app's **main process**, behind the preload, as
  every other desktop feature is; never in the page, which would need `contextIsolation: false`
  and `nodeIntegration: true`. `electronEnableSteamOverlay()` for the overlay.
- **A build flag** (`BOLLWERK_STEAM`, set by the Steam depot's packaging) decides whether the app
  calls Steam at all. Without it, the binding is never loaded. With it, the app initialises Steam
  as it starts.
- **Steam not running** under the Steam build: Steam normally starts the game itself. If
  initialisation fails anyway, the app plays locally — bots, tournaments — with a notice that
  online play needs Steam. It never crashes. Whether to call `RestartAppIfNecessary` is S1's
  question _(to confirm)_.
- **No launcher under Steam**: the desktop app's control window (start, stop, ports, the link,
  UPnP, the firewall) is a launcher, which Deck Verified refuses. The Steam build opens the game's
  window directly, its server started in the background on a free local port, never offered to
  the network.
- **`steam_appid.txt`** with 480 while developing only. It is never shipped, and the release job
  checks this.

### 3.2 What `steamworks.js` lacks, and the fork

From its `client.d.ts`: no `ISteamNetworkingMessages` or `ISteamNetworkingSockets` (only the old
P2P: `sendP2PPacket`, `readP2PPacket`, `acceptP2PSession`), no `setLobbyType`, and no filters on
`getLobbies()`. Each is a small extension in its Rust code. **If S1 shows we need them, we fork**
(the user's), offer the changes upstream, and add Rust to the release workflow for Windows and
Linux.

- `setLobbyType` is needed for the type to be changeable in the lobby screen. Without it, the type
  is fixed when the lobby is made, and changing it means making a new lobby.
- Filters are not needed while lobbies are few, since the browser filters on the client (§4).
- The newer networking (Valve's relay, `FakePacket*` for testing bad networks) is needed only if
  the old P2P does not carry a match well. That is S1's main question. Whether the relay is free
  is not stated _(to confirm)_.

### 3.3 S1, the spike

A day or two on App ID 480 (Spacewar), nothing paid, two accounts on two machines (the user's).
It answers:

1. Does the binding build for our Electron, on Windows and on Linux?
2. Does the overlay show over the game's window, and its invite dialog?
3. Does the old P2P carry an eight-seat match with no hash mismatch, at the 30-tick hash rate?
4. May a guest, not only the owner, invite (`InviteUserToLobby`)?
5. Does an invite with the game closed start it with `+connect_lobby <id>`, and with the game
   running arrive as `GameLobbyJoinRequested`?
6. Does `RestartAppIfNecessary` belong in our start-up?

Our lobbies on 480 are tagged with a lobby data key, since every developer shares that App ID.
The spike's code is thrown away. S2 and S3 build the real thing on what it found.

## 4. The games browser (B)

One screen in every build, its source by build: the server's rooms at `/api/rooms` in the
browser game and the GitHub builds, Steam's public lobbies in the Steam build. A row's data is
one shape whichever the source, so the screen, its filters and its tests do not know the source.

- **A row**: the host's name (and avatar under Steam), the team mode (free-for-all, teams of two,
  …), free seats against all seats, special towers on or off, and Join. No map preview.
- **Filters**: players (2–8), at least N free seats, free-for-all or teams, special towers
  on / off / either, match or tournament, and "has people" (more than the host among bots). Under
  Steam there is also distance, nearest first and worldwide by default, with friends' games
  always at the top.
- **Hidden always**: games on another protocol, games that have started, and full games.
- **Empty**: "No open games", with one button that hosts a **public table full of bots** that
  people may join. A small player base never meets an empty screen with nothing to do.
- **The listing** gains `towers: boolean`; the free seats are `playerCount − people`, as now.
  Under Steam the same fields travel as lobby data: protocol, players, team size, towers,
  tournament and people.
- **Filtering** is on the client, a pure function over the rows (`browser.ts`, tested as now).
  Steam's own filters are used only once the fork has them and lobbies are many.

## 5. The kick (K)

- In the lobby, the host's seat card for each guest gains **Remove**. A guest removed is told so,
  sent back to the menu, and their seat becomes a bot's again.
- **Lobby only**: once the match starts, there is no kick. A guest who leaves mid-match is
  handled as now.
- **No rejoin**: the server keeps the removed for the room's life — by the connection's rejoin
  token everywhere, and by Steam ID under Steam, where the host also refuses the lobby's join.
- In the server (`room.ts`), so every room has it; a protocol message, so a protocol bump. The
  server checks the sender is the host, as it owns identity.

## 6. Styles by entitlement (D1, D2)

### 6.1 D1, at launch

- **One function decides which styles a page may show**: `availableStyles(build, owned, date)`.
  It is pure and tested. In the browser game and the GitHub builds, it returns every style. In the
  Steam build, it returns every style but Halloween and Christmas, plus each one that is owned or
  in its season.
- **The seasons**, by the player's own clock: **Halloween October 1–31**, **Christmas December 1
  to January 6**. In its season a style is like any other: in the gallery, in Random, among the
  favourites.
- **Hidden before the DLC exists**: until D2, the two styles appear on Steam only in their
  seasons. Nothing is shown locked, and nothing is taken away after launch.
- **Everything that draws from the styles** asks the function: the gallery, Random every round,
  the favourites, each window in the next look (`menuLook.ts`), the styles' music, the tower
  preview, the end screen's and pause menu's looks, a `&style=` parameter, and a style saved in
  prefs that is no longer available (it falls back to Random).
- **The demo never shows the two**, in season or owned.

### 6.2 D2, later

- **The DLC** on Steam: a separate App ID with no Steam Direct fee _(to confirm)_. Valve's support
  is asked first whether a supporter DLC is acceptable (nothing read forbids or names it).
- **The gallery shows the two styles locked**, with a supporter badge and a button that opens the
  DLC's store page in the overlay. Owned, they are like any other style all year.
- **Ownership** via `isDlcInstalled` in the main process, passed to the page. It works offline,
  since Steam caches licences _(to confirm)_.
- **The supporter's badge**, a small heart by the name on the seat card, in the score bar and on
  the end screen. Each player's app reports its own ownership, **unverified**: faking a badge harms
  no one, and verifying it would need Steam's auth tickets. It travels with the seat, so it needs a
  protocol field.
- **Wallpapers**, if they work: renders of the 24 looks, made by the same tool as the capsules.
- **The music**: Halloween's and Christmas's tracks are Pixabay's, licensed for use in a work, not
  for sale alone. Inside a style they are part of the work. No soundtrack DLC.

## 7. Steam lobbies (T, S3)

### 7.1 The transport (T)

The host's app runs Bollwerk's authoritative server as now (`packages/server`, `room.ts`). Only
the transport changes: Steam's peer-to-peer channel in place of a WebSocket, with the host found
as the lobby's owner. The protocol, the seats, Ready, the snapshot, the hashes, the rejoin
(ARCHIVE 15zc) and tournaments stay as they are.

- **A transport interface** at both ends (`client/src/net/connection.ts`, the server's connection
  handling), with the WebSocket behind it unchanged.
- **An in-memory fake** that delays, reorders, drops and disconnects. One suite of tests runs
  over every transport: a match that ends with no hash mismatch, and whose input log matches the
  server's, has passed.
- **Without Steam**: built and tested in `npm run check`, before S1.

### 7.2 What the players see (S3)

- **Play** opens a table with bots, as now. Under Steam it is also a lobby, **Friends** by
  default; the host chooses Public, Friends or Invite only in the lobby screen until the start.
- **Invite**: a button in the lobby opens Steam's friend picker in the overlay. An invite accepted
  with the game closed starts it into the lobby (`+connect_lobby`); with the game running it joins
  from wherever the player is, after asking if they are in a match.
- **Join from the friends list**, through rich presence, for Friends and Public lobbies.
- **Rich presence**: "In the lobby", "In a match, round 5 of 10", "In a tournament", in English
  and German _(the localisation file's format to confirm)_.
- **Names and avatars**: a seat's name is the Steam name, so there is no name field under Steam.
  The avatar is on the seat card and in the browser.
- **At the start** the lobby closes to joins (`setJoinable(false)`). A match is never joined in
  progress.
- **The host leaving** ends the match, as now. Handing the server to a guest is for later.
- **Trust**: a modified host could cheat. This is accepted for a free game without rankings.
- **Versions**: the protocol version is in the lobby data. A lobby on another version is hidden.
- **The language** from Steam's (`getCurrentGameLanguage`) on first start, then the player's own
  choice.

## 8. Controller support (C)

Native, through the browser's **Gamepad API** in the page — Electron's Chromium has it — for every
build, not only Steam. Under Steam the default Steam Input configuration presents the Deck and any
controller as an Xbox pad, which the Gamepad API reads _(to confirm in S1 or the beta: whether
Steam Input must be set to pass the pad through)_. The mouse stays first: every action a
controller does is an action the mouse already has, and a controller is noticed the moment it is
touched, the mouse the moment it moves.

**Two buttons, the mouse's two** (the user's, 2026-11-02): the controller's actions are the
mouse buttons' actions, one button each, but it moves the way a controller does. It moves by
grid positions in the build and cannon phases, by buttons in the menus, and with a free cursor
only in combat, as in the original arcade game.

- **Accept** (default **A**) is everything the left button does: place a piece or a cannon, fire,
  choose a castle, and press the focused button in a menu.
- **Turn / Back** (default **B**) is everything the right button does: turn the piece, switch
  between a cannon and the special tower in the cannon phase, and go back in a menu (the window's
  Back or Close). In combat, where the right button does nothing, **holding it speeds the cursor
  up**.
- **Menu** (default **Start**) is Esc: the pause menu, and back out of it.
- **Movement**: the d-pad and the left stick, in every phase and every window.

**In the match**

- **The build phase, no cursor**: the piece in hand moves a grid position a press, repeating
  while held (a delay, then a rate, both in the client's config). The stick moves it the same way,
  stepping faster the further it is pushed. Accept places and Turn turns, and the ghost shows red
  or green where it stands, as now.
- **The cannon phase, no cursor**: the cannon ghost, or the tower's, moves by grid positions in
  the same way. Turn switches to the tower where one may be bought.
- **Choosing a castle**: the d-pad and stick jump from castle to castle in the direction pushed,
  the castle chosen marked as the mouse's hover marks it, and Accept chooses.
- **Combat, a cursor**: the reticle moves freely, its speed following how far the stick is
  pushed, and the d-pad moves it at a fixed speed. Holding Turn multiplies the speed (a factor in
  the config, 2.5 to start, tuned in play), so the cursor can cross the map and still aim finely.
  Accept fires as the left click does, a ready impact tower first.
- **Where it starts**: the ghost starts each phase where the mouse's would, at the island's
  centre. The reticle starts each combat phase over the player's own island, then stays where it
  was left.
- **The same actions**: a pure mapping from pad state and the board to the moves the mouse makes
  (`gamepad.ts`, tested with ASCII boards): a grid position to hover, a commit, a turn, a switch.
  So `controls.ts` keeps one path for both, and the sim and the protocol never know.

**In the menus**

- **Focus moves between buttons**: the d-pad and stick move it spatially to the nearest enabled
  control in that direction. Accept presses it; Turn / Back goes back. The focused control is
  ringed in the look's colour, and its hover text shows, as `:focus-visible` already does (PR4).
- **No cursor**: the mouse's pointer hides while the pad is in use, and is back the moment the
  mouse moves.
- **The controls that are not buttons**: the steppers, switches and choice rows (`choices.ts`)
  take left and right on the pad to change, up and down to leave. The volume sliders do the same.
  The looks' cards and the seat cards are buttons in a grid.
- **Every window** is walked through with a pad in the package: menu, Options, How to play, the
  gallery, the lobby, the browser, the tower menu, the tournament screens, the pause menu and the
  end screen. A window opening focuses its main button; a window closing returns focus to what
  opened it.
- **Text entry**: under Steam there is none, since names are Steam's. Elsewhere, the name field
  opens Steam's on-screen keyboard where it can (`ShowGamepadTextInput`) _(the binding's support
  to confirm)_, or is left to the mouse.

**Reconfigurable**

- **Options gains a Controller section**, in the settings column (`settingsRows.ts`): Accept,
  Turn / Back and Menu, each showing the buttons bound to it. Choosing an action, then pressing a
  button, binds it. A button may be bound to only one action, so binding it elsewhere moves it;
  Accept and Menu always keep one button, so the pad cannot lock itself out.
- **Beside them**: the combat cursor's speed, and Restore defaults. Saved in prefs, the page's own.
- **The d-pad and stick** move and are not rebound.

**Glyphs and the Deck**

- **Button glyphs** for the bound buttons, shown in the hints and in How to play while a pad is
  in use, a remapped button shown as bound; Xbox's shapes by default, PlayStation's when the pad
  says so.
- **1280 × 800**: the HUD, the menus and the hover texts checked at the Deck's resolution, with
  text legible at arm's length (Valve's minimum size _to confirm_).
- **Deck review** is asked for in S5, aiming at Verified: every window and phase reached with the
  controller, no launcher, no text entry under Steam.

## 9. The store (N, S4)

### 9.1 The name (N)

**Decided** (2026-11-03, the user's): the game is renamed **Bollfort**, everywhere — the browser
game, the desktop app, GitHub and Steam — not only on Steam. Written _Bollfort_ in text and
BOLLFORT where a logo is in capitals; eight letters, as Bollwerk had.

#### The search (2026-11-03)

- **Bollwerk had to go everywhere, not only on Steam.** TMview (which also holds the USPTO, WIPO,
  Canada, Australia and China) lists 29 marks containing it; five are live in class 9 or 41: DE
  2021 (Leidel, Milussis; 7, 8, 9, 18, 35), DE 2022 (RE Ring Event GmbH; 25, 41), CH 2023
  (QuantX Analytics AG; 9, 16, 35, 36, 38, 41, 42), DE 2025 (ID Buhl 2020 GbR; 36, 41, 43), AT
  2023 "Bollwerk Revival" (MFG Marketing; 16, 19, 35, 41, 43). The two in class 9 name no
  computer games (read by the user). BOLLWERK Games has registered nothing; its game, announced for
  2027, has a German work title's protection (MarkenG §5) without one. The search of October
  (ARCHIVE 11zw) looked for games of the name, not at the registers.
- **A subtitle was set aside**: the other studio's name is the word itself, a work title is
  compared by its main word, and two games called Bollwerk would be confused in the store.
- **Candidates weighed** (besides 11zw's): German fortification words (Trutzburg, Ringwall,
  Bastei, Schanze, Zinne; Bergfried is a castle game in playtest on Steam, Wanderburg one due in
  2026), plays on the build phase's pieces (Flickwerk, Klotzwerk, Blockwerk; Brixade, the user's,
  sounds as _Brickade_, a brick-breaker on Steam since 2024; Brickbat beside _Brick Battalion_),
  Latin (Vallum, near _Vellum_) and others. Nothing built on Tetris's name ("‑tris", "Tetr‑"),
  which its owner enforces; the store page says "pieces", never "Tetris-like".
- **The user's shortlist**: _Wallwerk_ (a building firm WallWerk in the Westerwald, .com and .de
  taken), _Wallfort_ (Wallfort Financial Services, wallfort.com theirs), _Blockwerk_ (a graphic
  designer, every domain taken), _Blockfort_ (_Block Fortress 2_ on Steam since April 2025 —
  blocks, a fortress, artillery — and a blockchain firm; dropped).
- **Bollfort**: no mark in TMview, nor for Bolfort or Boll Fort; nothing on the web, in Steam's
  store search or on itch.io; on SteamDB only _Bellfortis_ and _Hillforts_, which share the
  common word and nothing more; .com, .de, .net and .io unregistered. Its one risk is its nearness
  to BOLLWERK — the first syllable, both a fortification, both games — judged low, since a work
  title of an everyday word is protected narrowly and ‑fort is not ‑werk (our reading, not a
  lawyer's). With German gamers "Boll" may call up Uwe Boll; harmless.
- **Not done**, the user's choice: the domains are not registered, and no mark is filed.

#### The rename (N)

As the Rampart rename (ARCHIVE 11zw), everything, with **no migration**: only internal testers
have the game, so a tester's saved settings, name, favourite looks, last table and a tournament
in progress are lost once, and the desktop app's old data folder stays behind.

- **What players see**: `GAME_TITLE` and the title's 5x7 bitmaps (`titles.ts`), which lack **F**
  and **T** and draw nothing for a letter they lack — two letters designed in the bitmaps' hand,
  then the title checked in all 24 looks (Cartoon's O's eyes now fall on the first and the second
  O; Blueprint's title block, `titleBlock.ts`, spells BOLLFORT); the page's `<title>`, the loading
  screen, the `&perf=1` readout; every locale's disclaimer and desktop texts (en, de, hes); the
  disclaimer's emphasis in `credits.ts`, and `CREDITS.md` written again; the UPnP description;
  the desktop window's titles, its control page and `app.setName`.
- **Inside**: `@bollwerk/*` → `@bollfort/*` (every `package.json`, the imports, the lockfile by
  `npm install`, eslint's config); `BOLLWERK_COMMIT`, `BOLLWERK_VERSION`, `BOLLWERK_EXE`,
  `BOLLWERK_REQUIRE_CREDITS` and `__BOLLWERK_COMMIT__` → `BOLLFORT_…` (the Dockerfile, CI, the
  release workflow, the desktop build); `window.bollwerk` → `window.bollfort`; the browser's keys
  `bollwerk.*` → `bollfort.*`; the test folders' prefixes; this file's `BOLLWERK_STEAM`.
- **The desktop app**: `appId` `io.github.thomarius.bollfort`, `productName`, `executableName`,
  `unpackDirName`, `desktopName`; the release's files `Bollfort-<version>-windows.exe` and
  `Bollfort-<version>-linux.AppImage`, the release's title and notes, the CI image's tag.
- **Documents**: README, CLAUDE.md, PLAN, SPECIAL_TOWERS and this file; the ARCHIVE's history keeps
  the old name, with a new entry for the rename and this search, as 11zw.
- **The repository**: renamed on GitHub by the user, `Thomarius/Bollfort` (GitHub forwards the
  old address); the README's links and the local remote follow.
- **Unchanged**: the protocol, the recording format and the rules — recordings replay as before.
  The local folder stays `RampartRemake`, as after 11zw.
- **The user's answers** (2026-11-03): F with a middle bar as long as E's and T with a full top
  bar (`#####/#..../#..../####./#..../#..../#....` and `#####/..#../..#../..#../..#../..#../..#..`);
  no release of its own — the rename ships with the next one.
- **Done when** `git grep -i bollwerk` finds only the ARCHIVE's history and this section's search;
  `npm run check` passes; the desktop app packaged and started on Windows shows the new name in
  its window, its control page and its data folder; and the user has approved the title in every
  look from screenshots.
- **Before S4**, since the store page, the capsules and the DLC need it.

### 9.2 The store page (S4)

- **The Steamworks account**: onboarding, the fee, the tax form (W-8BEN or its equivalent, so the
  US withholding is not 30%), and the waiting period (30 or 21 days, Valve's pages disagree).
- **The store page**: the description in the game's own words, English and German; tags; free; the
  screenshots only of play, made by `tools/screenshots.sh`; no links in the description; the
  content survey (no AI content ships in the game; the code's assistance is not what the survey
  asks about); the IARC rating.
- **The capsules and logo**: a tool renders them from the game's own art at Steam's sizes — the
  menu's title lettering over a board scene in Pixel, then Medieval. Several tried, the user
  choosing. A readable title on every capsule (Valve's review checks it).
- **Coming Soon** for at least two weeks; submitted for review at least 7 working days before.
- **The depots**: Windows and Linux, the unpacked app (not the AppImage) under the Steam Linux
  Runtime, the binding's native module for each, no `steam_appid.txt`.
- **The release job**: `release.yml` gains a job that packages the Steam build and uploads it with
  `steamcmd` to the beta branch, its credentials as repository secrets. The user promotes it by
  hand. The GitHub release goes on as now.

### 9.3 The users' test and the launch (S5)

- **Keys** for the testers (up to 2,500 for testing, free), on the password-protected beta branch.
- **The checklist** in the repo (`docs/STEAM_CHECKLIST.md`), run before every Steam build:
  - host and invite, in each lobby type;
  - join from an invite with the game closed and with it running;
  - join from the friends list, and from the browser;
  - kick, and the kicked player trying to rejoin;
  - the host quits; a guest drops and comes back;
  - the overlay over the match;
  - eight seats with bots;
  - a tournament across matches;
  - Steam not running;
  - a controller through every window and a whole match;
  - the Deck, if one is at hand;
  - the seasons, by the system clock.
- **Deck review** requested, then Coming Soon, then release.

## 10. Later, perhaps

The supporter DLC (D2), once people play. Achievements. Steam Cloud for tournament saves. Quick
match (still PLAN §12). The host handed to a guest when the host leaves.

## 11. Still to confirm on the live pages

- Whether DLC costs a Steam Direct fee, and whether a supporter DLC is acceptable (Valve's support).
- The revenue share in the Steam Distribution Agreement, and the German side of any income (a
  Gewerbe, the Kleinunternehmer rule), before D2.
- Whether Valve's relay is free, if the newer networking is needed.
- Steam Input passing the pad through to the Gamepad API, and the Deck's minimum text size.
- `ShowGamepadTextInput` and `isDlcInstalled` in the binding; licences cached offline.
- The rich presence localisation format.
