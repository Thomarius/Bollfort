# Bollfort on Steam — the design and its packages

**Decided** (2026-11-02, the user's, in three rounds of questions): Bollfort goes to Steam as a
**free game**, after the first feature-ready version (PLAN §11 item 5): **the whole game, every
style, free from the start** (2026-11-03, the user's, in place of a supporter DLC; §6). The
browser game, the portable builds on GitHub and the desktop app's link stay as they are, and
Steam is one more way to play. This file is the design; once built, it is retired into the
ARCHIVE, as `SPECIAL_TOWERS.md` will be.

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
  is left off the Steam page. Similar paid games stand closer to the original; Bollfort's changes
  and additions are substantial.
- **No DLC** (2026-11-03, the user's): the full game is free, all 24 styles with Halloween and
  Christmas among them, as in every other build. A small paid DLC of new things may follow if the
  game is received well; it is not planned (§6, §10).

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
  Medieval are tried first, as the most basic and iconic styles.
- **Updates**: every `v*` tag uploads to a password-protected beta branch, and the user promotes
  it to the public branch by hand in Steamworks. There is no Steam Playtest; testers get keys for
  the beta branch.

## 2. The packages, in order

| Package | What                                                    | Needs Steam | Before paying |
| ------- | ------------------------------------------------------- | ----------- | ------------- |
| **S1**  | The spike on App ID 480, two accounts, two machines     | 480         | yes           |
| **S2**  | The Steam build: the flag, the binding, no launcher     | 480         | yes           |
| **S3**  | Steam lobbies, invites, presence, names and avatars     | 480         | yes           |
| **S4**  | The store: fee, store page, capsules, depots, release   | the app     | it is paying  |
| **S5**  | The users' test on the beta branch, Deck review, launch | the app     | —             |

S1 comes before the fee is paid, and its answers decide S3's binding work.

**Done**: N, the name — Bollfort, the rename everywhere (2026-11-03, ARCHIVE 15zh; the search
in §9.1); R, no recordings in packaged builds (2026-11-03, ARCHIVE 15zi); K, the host's Remove,
and B, Find a game (2026-11-03, ARCHIVE 15zj, protocol 35); T, the transport interface at both
ends, the fake network and whole matches over it (2026-11-04, ARCHIVE 15zl, §7.1); C, native
controller support in five parts (2026-11-04, ARCHIVE 15zm, §8).

## 3. The Steam build (S1, S2)

### 3.1 The flag and the binding

- **`steamworks.js`** (MIT, Rust) in the desktop app's **main process**, behind the preload, as
  every other desktop feature is; never in the page, which would need `contextIsolation: false`
  and `nodeIntegration: true`. `electronEnableSteamOverlay()` for the overlay.
- **A build flag** (`BOLLFORT_STEAM`, set by the Steam depot's packaging) decides whether the app
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

**Decided** (2026-11-03, the user's, with K): one window in every build, **Find a game**, its
source by build — the rooms of the server the page came from (`/api/rooms`) in the browser game
and the GitHub builds, Steam's public lobbies in the Steam build. A row's data is one shape
whichever the source, so the window, its filters and its tests do not know the source.

- **Outside Steam there is no shared list**, and that is accepted: the window lists the games on
  the server the page came from — a LAN party, or friends sent the host's address or link, as
  now. No LAN discovery and no directory (a hosted one is declined for budget, PLAN §12).
- **Its own window**, opened by a **Find a game** button in the menu, in place of the menu's
  list of open games; the menu shows no count. Joining by code stays in the menu.
- **A row**: the host's name (and avatar under Steam), the team mode (free-for-all, teams of two,
  …), free seats against all seats, special towers on or off, a tournament's team where it is
  one, and Join. No map preview, no rounds (the config's, no longer chosen).
- **Filters, kept simple**: free-for-all or teams (or either), special towers on / off / either,
  remembered between visits. Under Steam also distance, nearest first and worldwide by default,
  with friends' games always at the top. Player count, match or tournament, free seats and
  "more people than the host" were weighed and left out: few players online would mostly see an
  empty list, and every room listed has its host and a free seat anyway.
- **Hidden always**: games on another protocol, games that have started, and full games.
- **Empty**: "No open games", with one button, **Host a single match**, beneath it a line that
  it is public — anyone can find it here and join. It does what the menu's Single match does,
  with the lobby public (always so outside Steam; under Steam the lobby's type is set to Public
  rather than the default Friends): the host waits in a lobby with bots in the other seats. A
  match once started takes nobody new; taking over a bot's seat mid-match was weighed and left
  as an idea (§10).
- **The listing** gains `towers: boolean` and drops `maxRounds`; the free seats are
  `playerCount − people`, as now. Under Steam the same fields travel as lobby data: protocol,
  players, team size, towers, tournament and people. One protocol bump with K.
- **Filtering** is on the client, a pure function over the rows (`browser.ts`, tested as now).
  Steam's own filters are used only once the fork has them and lobbies are many.

## 5. The kick (K)

**Decided** (2026-11-03, the user's):

- In the lobby, the host's seat card for each guest gains **Remove**, confirmed by a second click
  ("Remove Bo?"). The guest removed is sent back to the menu with a notice — "The host removed
  you from this game." — and their seat becomes a bot's again. In a tournament's room the same:
  the host's teammate becomes a bot of the host's team.
- **Lobby only**: once the match starts, there is no kick; the lobby after a match, before a
  rematch, is a lobby. A guest who leaves mid-match is handled as now.
- **No rejoin**, for the room's life: under Steam by Steam ID (the host also refuses the lobby's
  join); elsewhere by a **browser ID** — a random ID kept in the browser's storage
  (`bollfort.browserId`) and sent with every join. The seat's rejoin token lasts only the tab,
  so a new tab would get round it; an address is unusable, since every guest through the
  tunnel arrives from Cloudflare's and a household shares one. Outside Steam this is a deterrent,
  not security: clearing the browser's data or another browser gets round it.
- In the server (`room.ts`), so every room has it; a protocol message, so a protocol bump (one
  with B). The server checks the sender is the host, as it owns identity.

## 6. No DLC at launch

**Decided** (2026-11-03, the user's), replacing the plan of 2026-11-02: Bollfort goes to Steam whole
and free, every style available, Halloween and Christmas included — the same game as the browser
and the GitHub builds. Nothing is hidden, locked or seasonal, so the packages D1 (styles by
entitlement, the two shown only in their seasons) and D2 (a supporter DLC with a badge) are
dropped, and with them `availableStyles`, the seasons and the supporter's badge.

If the game is received well and the feedback is good, a small paid DLC may come later — of new
things, never of what the free game has now. It is not planned, and nothing is built towards it.

## 7. Steam lobbies (T, S3)

### 7.1 The transport (T)

The host's app runs Bollfort's authoritative server as now (`packages/server`, `room.ts`). Only
the transport changes: Steam's peer-to-peer channel in place of a WebSocket, with the host found
as the lobby's owner. The protocol, the seats, Ready, the snapshot, the hashes, the rejoin
(ARCHIVE 15zc) and tournaments stay as they are.

- **A transport interface** at both ends (`client/src/net/connection.ts`, the server's connection
  handling), with the WebSocket behind it unchanged.
- **An in-memory fake** that delays, reorders, drops and disconnects. One suite of tests runs
  over every transport: a match that ends with no hash mismatch, and whose input log matches the
  server's, has passed.
- **Without Steam**: built and tested in `npm run check`, before S1.

**Built** (2026-11-04, ARCHIVE 15zl). The contract every transport keeps: whole messages as text,
**reliably and in order**, or the link closes — as a WebSocket and Steam's reliable sends give.
The protocol leans on it, so a carrier that can lose or reorder is not a transport until
something restores the order. The page's end is `Link` and `Dial` (`client/src/net/transport.ts`),
`ServerConnection` taking a `Dial`, the WebSocket's `dialWebSocket`; the server's is `Peer` and
`Session` on a `Gateway` (`server/src/gateway.ts`), which holds everything `server.ts` did with a
client's messages — the limits, the protocol check, create, join, routing — so S3's transport is
a new `Peer` and a new `Dial`. The fake (`client/src/net/fakeNetwork.ts`) delays with jitter
keeping the order, cuts links, and — breaking the contract on purpose — drops or holds back a
message; whole two-round matches over it, people played by bots on their own pages, end with every
page's board the server's, no resync, and each page's commits since its last snapshot the
server's recording (`transport.test.ts`). A lost or overtaken commit is caught by the next hash
and mended by one rejoin. The WebSocket itself stays covered by `server.test.ts`: the suite lives
in the client package, whose types have no Node, so it cannot start the real server.

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
  text legible at arm's length: no character under 9 px tall at 1280 × 800, 12 px recommended
  (Valve's compatibility page, read 2026-11-04).
- **Deck review** is asked for in S5, aiming at Verified: every window and phase reached with the
  controller, no launcher, no text entry under Steam.

**In five parts** (2026-11-04; C5 added the same day, the user's), each checked on its own:

| Part   | What                                                                         | State |
| ------ | ---------------------------------------------------------------------------- | ----- |
| **C1** | The pure mapping, the pads read, the match steered, Menu as Esc, the pointer | built |
| **C2** | The menus: focus moved spatially, Accept and Back, every window walked       | built |
| **C3** | Options' Controller section: rebinding, the cursor's speed, Restore defaults | built |
| **C4** | Button glyphs in the hints and How to play; the HUD and menus at 1280 × 800  | built |
| **C5** | An on-screen keyboard for the name and the room code, last                   | built |

**C5, to do last** (the user's, 2026-11-04, after trying C2 with a real pad): the name and the room
code are the only things a pad cannot reach — the walker leaves text fields to the mouse and the
keyboard. Outside Steam they are filled with a small on-screen keyboard of our own, opened by
Accept on the focused field and closed by Back: for the room code a picker over the code's
alphabet (`rooms.codeAlphabet`, 32 characters, no lookalikes), for the name a compact letter grid with Space, Delete and
Done, both walked by the same focus walker. Under Steam the fields are gone (§7.2), so it is for
the browser and the GitHub builds — and for Deck Verified wherever a field stays: Valve requires
a game needing text to open an on-screen keyboard itself, or to have its own entry a controller
alone can use; a player opening the system's by hand earns Playable, not Verified (the
compatibility page, read 2026-11-04).

**C1, built** (2026-11-04): `gamepad.ts` the pure part — a pad read into Accept, Turn and Menu
through the bindings (A, B and Start in the standard mapping by default), the stick's radial dead
zone, a held direction into grid steps (`Repeater`), the reticle's motion, the nearest thing in a
direction (castles now, buttons in C2); `pads.ts` the Gamepad API read once a frame, the last
pad touched the one read, the page's class `pad` hiding the pointer until the mouse moves;
`padMatch.ts` the match steered through `Controls`' own `accept` and `turn`, so the mouse and the
pad share one path; `padLoop.ts` sending Menu as an Esc. The tunables in the art config's
`gamepad` (dead zone 0.25, a step then 260 ms, then every 110 ms down to 45 at a full push, the
reticle 14 tiles a second, 9 under the d-pad, Turn's boost 2.5) are first guesses, to tune in
play. Checked with Playwright and a pad faked over `navigator.getGamepads`: the ghost from the
island's centre, a piece turned and placed, a castle jumped to and chosen, the reticle steered and
fired, Start opening and closing the pause menu. Played by the user with a real pad (2026-11-04): working very well. While paused or with the match over the pad
leaves the board alone.

**C2, built** (2026-11-04): one walker for every window (`padMenus.ts`), so no window has code of
its own for the pad. What it may focus is what the mouse could click — a button, a link, a
`summary`, a slider, a heart — enabled and topmost at its own centre, so a window over another
holds the focus as it holds the mouse; a control scrolled out of its list counts while the list is
in reach, and is scrolled to. Up, down, left and right go to the nearest control beyond that edge,
measured by the boxes' gaps, any sideways overlap counting as straight on; a control's own
controls first, measured centre to centre (a look's heart inside its card). Rows of options,
switches and sliders change with left and right and are left by pushing past their end, so a
second column is in reach; a stepper is its − and + buttons, as two steppers share a row. Accept
clicks; Back clicks the window's way back, marked `data-back` (Close, Done, Leave, Back), or is Esc
where there is none — the pause menu, the demo. The focus starts on the control that opened the
window once it is back in reach (found again where it stood if the page drew it afresh), else the
window's main button (`.primary` or `data-main`: Resume, Ready, How to play's ›, the chosen look
and tower, the end screen's way on), else the first in reading order; a control replaced by a
redraw — the lobby redraws at every change — hands the focus to whatever now stands where it
stood, after a fade's grace. The corner's row is chosen only with nothing else on screen, and
left for the window that appears. Ringed by the class `pad-focus` in the look's accent, its hover
text shown, since Chromium gives a script's focus `:focus-visible` only after a key. While the
board has the pad the walker waits; knocked out and watching, it has the strip's way back.
Walked with Playwright and a faked pad through the menu, Options, How to play, the gallery,
Credits, Find a game, the local lobby, a guest's room on a real server, the tower menu, the
tournament's setup, lobby and League, the pause menu with Leave match, and the end screen.

**C3, built** (2026-11-04): the settings column's **Controller** row opens a window of its own
(`controllerWindow.ts`), in Options and the pause menu alike — its five rows in the column would
have made the pause menu taller than the Deck's 800 pixels. Accept, Turn / Back and Menu each show
their button; choosing one, the next button pressed is taken (`pads.capture`, nothing else hearing
it), until a press, a second choice, the window closing or six seconds. Each action has one
button, and a button another action had swaps with this one's old one (`rebind`), so every action
keeps a button and the pad cannot lock itself out; the d-pad and the guide button are never
taken. Beside them the reticle's speed, Slow, Normal or Fast (0.7, 1, 1.4 of the config's), and
Restore defaults. Saved as the page's own (`bollfort.padBindings`, `bollfort.padCursor`,
`padSettings.ts`), a saved set refused unless whole and valid. Buttons named as an Xbox pad and
the Deck print them (A, B, X, Y, LB, RB, LT, RT, Select, Start, LS, RS); C4 draws the glyphs.
Walked with Playwright and a faked pad: Accept moved to X and A then inert, a swap, Restore
defaults, the window from the pause menu, and the focus back on Set up as it closes — which found
a bug in C2's walker, a closed window's successor found in the window beneath, now looked for
only inside a window still on the page.

**C4, built** (2026-11-04): while a pad is in use, every text that spoke of the mouse or of Esc
names the pad's button instead, drawn as the pad prints it (`glyphs.ts`): How to play's three
captions on the buttons, the cannon phase's tower line, the pause menu's way to resume and both
"click again" confirmations, the demo's way back — each a text of its own (`…Pad`), `{accept}`,
`{turn}` and `{menu}` in it standing for the buttons bound, so a remapped one shows as bound. Xbox's
lettered buttons in its colours by default, which is how Steam Input presents the Deck; PlayStation's
shapes when the pad's name says Sony (vendor 054c, DualShock, DualSense); the Controller window shows
its buttons as glyphs too, in place of C3's names. The texts change the moment the pad or the mouse
takes over (`pads.onChange`), as Valve asks: no mouse words while a pad is the input. Found on the
way: the pause menu wrote its hint before finding its Leave button and threw as a match opened —
caught by the PlayStation walk, before any commit.

**At 1280 × 800** (Playwright, every window and the match at eight players, each scanned for
text under 12 px and for text off screen): everything fits — the menu, Options, the Controller
window, How to play, Credits, Find a game, the eight-seat lobby in English and German, the
tournament's setup and lobby, the HUD at eight players, the German pause menu with its Controller
row, the end screen at eight. The gallery's last row scrolls, as it should. Two things fixed, the user's wish: a dozen small
labels had been 10–11 px (the menu's "Inspired by" line and Credits link, the looks' card
headings, the gallery's badges, the lobby's Host, Level and You tags, notes, the pause menu's Esc
hint, the HUD's names at eight players), now 12 px, Valve's recommended least — on screens of the
Deck's size and smaller only (a media query at 1280 × 800), the HUD's names everywhere; and in
the bar at eight players four-digit scores pushed each player's third life pip out of sight at
1280 pixels, so the score is now sized by the largest score's digits as well (`--digits`, set by
the HUD), 18 px for four there.

**C5, built** (2026-11-04): every text field is in the walker's reach, and Accept on one opens an
on-screen keyboard of our own (`padKeyboard.ts`) over the page: for the room code its alphabet,
eight to a row, with Delete and Done; for a name — the menu's, a tournament's team, teammates and
archnemesis — figures, letters in a German QWERTZ order with ä, ö, ü and ß, a row of marks and
accents, Shift, Space, Delete and Done, Shift on at the start of the name and of each word, as a
phone's is. What is typed goes into the field as it is typed (its `input` events, and `change` as
the keyboard closes); the field's length is kept to, a room code typed in capitals. Its keys are
buttons the walker walks; Done is the way back, so Back closes it too, and the focus returns to
the field. Walked with Playwright and a faked pad: a name typed in English and German, a room
code (the field enabled by hand, the dev server having no game server to join), a tournament's
team name. With this, package C is finished. Tested and approved by the user with a real pad (2026-11-04).

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
- **Before S4**, since the store page and the capsules need it.

### 9.2 The store page (S4)

- **The Steamworks account**: onboarding, the fee, the tax form (W-8BEN or its equivalent, so the
  US withholding is not 30%), and the waiting period (30 or 21 days, Valve's pages disagree).
- **The store page**: the description in the game's own words, English and German; tags; free; the
  screenshots only of play, made by `tools/screenshots.sh`; no links in the description; the
  content survey (no AI content ships in the game; the code's assistance is not what the survey
  asks about); the IARC rating.
- **The capsules and logo — chosen** (2026-11-04, the user's, in two rounds): the set is in
  `assets/store/` under Steam's names. Made by `tools/storeart` from the game itself: the
  client's store-art mode (`client/src/storeArt.ts`, `?storeArt=scene|logo`) shows only the board
  of a watched match — round 3, mid-combat, top-level bots, seed 7 — with the title in a style's own
  lettering over it, and the tool takes the picture at each size, with a contact sheet to choose
  from. The direction: the **Medieval board under Minimal's rainbow lettering**, the letters
  outlined dark so they read on any board, and the game's **change of look mid-match held still**
  across the picture (`&split=`), **Cyberpunk above the line** and Medieval below, the same moment
  of one match on both sides. The small capsule plain on a band ruled in gold, as the game's
  announcements run, so its title nearly fills it; the library's logo the rainbow title alone,
  transparent. Tried and dropped: Minimal's board (too plain for the game's range of looks) and
  Medieval's stone lettering (grey on grey). `final` renders the chosen set again, should a look
  change:
  `npm start -w @bollfort/storeart -- assets/store final`, with the dev server running.

  Valve's sizes (its pages, read 2026-11-04; the main and vertical capsules' from a summary, to
  check on the live page before upload): header capsule 920 × 430, also the library header;
  small 462 × 174, the logo nearly filling it; main 1232 × 706; vertical 748 × 896; library
  capsule 600 × 900; library hero 3840 × 1240, no text at all, the middle 860 × 380 always shown;
  library logo 1280 wide on transparency, nothing but the title. On every capsule the title is the
  only text, legible. Still to make: the community icons (their page not yet read).

- **The screenshots — chosen** (2026-11-04, the user's, in three rounds): eight in
  `assets/store/screenshots/`, numbered in the order Steam is to show them — the change of look
  Medieval to Cyberpunk under "Fire!", a Noir duel, a close-up of building in Sakura, the Lightning
  Tower's chain, eight players late in Oktoberfest, the Allerdickste Bertha's explosion, the Laser's
  beam, and placing cannons close up in Christmas. All a player's view at 1920 × 1080: the person's
  seat played by a bot and shown as a person plays it (`&autopilot=1`, `client/src/autopilot.ts`:
  the ghost glides to the bot's tile, turned as it turned it, rests, and the move is made as a
  click makes it), the corner's buttons left out (`&clean=1`), the camera held close in play where
  wanted (`&cameraZoom=1.9&cameraOn=you|duel`), and a tower's effect caught as it fires (the match
  screen marks each on the page, `data-effect`). `npm run shots -w @bollfort/storeart` renders the
  candidates and a contact sheet. Two players and close-ups show far more than four islands do,
  the user's finding; a tower shot starts from the cannon phase before, or none is bought.

- **The trailer — final** (2026-11-04, the user's, after four cuts): 55 seconds, **without the
  screen's shake** — many people dislike it, in videos above all (the user's). Made again by
  `TRAILER_SHAKE=0 npm run trailer -w @bollfort/storeart -- record`, then `captions` and
  `assemble`, into `trailer-build/still/BollfortTrailer.mp4` (git-ignored, some 76 MB; also as
  `trailer-build/BollfortTrailer-noshake.mp4`); the version with the shake is kept beside it. On
  `BollfortTrailer.mp3` (`assets/trailer/`), shortened by the user; for the trailer's description:
  _Music by Viacheslav Starostin from Pixabay_ (Pixabay Content License), linked to
  `https://pixabay.com/users/starostin-46826676/`. The game does not play the track, so it is not
  in the game's Credits.

  The cut, against the music's sections: **Ready… Aim…** as the "Fire!" banner sweeps four
  Medieval islands into Cyberpunk, the shooting in step with the countdown (0–6 s); the loop —
  _Fire at their walls._, _Rebuild yours._, _Seal your castles._ — close on a duel and on the
  player's island (to 14.5); **24 styles** over seven looks cut on the beat, a change of look
  among them (to 28.5); **Up to 8 players** as the camera pulls out over eight islands, **Online
  multiplayer and bots** over a team match, **Special towers** over the lightning, the wave, the
  laser and the Bertha's crater, **Tournaments** over a team match's end, the camera pushing onto
  the winners (to 43); half-second cuts of the most action (to 46.8, the music's climax); then the
  rainbow title over the Cyberpunk split, the shooting running on through the fade, **Free on
  Steam** held in the silence (to 55). H.264 High and AAC at 48 kHz, 1920 × 1080 at 60 frames.

  **Filmed again on the user's gaming PC** (2026-11-05: the development machine's integrated
  graphics left it a little laggy; an RTX 3070, filmed by DirectX's desktop duplication and NVENC,
  the steps in `docs/TRAILER.md`), with two changes, the user's: no aiming cursor nor the towers'
  emblems in combat (`&reticle=0`; the building ghosts stay), and **two castles sealed** close up —
  Cartoon's, its castle coming alive and dancing, under _Seal your castles._, and Pirates', the
  Jolly Roger going up, among the styles. Cartoon's is round 1, the main castle's starting ring
  breached in the first combat and closed round its three sleeping cannons, which wake as the
  ground fills: round 5's outlying castle, with no room for a gun beside a crowd of them, was not
  the game's core (the user's). Repeated frames 0–9% a clip, the heavy moments 0–3%.

  **Two versions, the choice still open** (the user's): without the shake
  (`trailer-build/still/`) and at half of it (`TRAILER_SHAKE=0.5`, `&shake=0.5` — half as far over
  the same 260 ms, `trailer-build/half/`).

  Filmed first live from a browser window on the user's screen with ffmpeg's x11grab and x264, the
  person's seat on the autopilot, the camera moved in the game, the captions in Rubik. What the
  making found: the graphics card's encoder (VAAPI) stuttered more on this machine, whose graphics
  share memory with the processor; heavy moments — a change of look, the eight-island pull-out, the
  fireworks, the end card — are filmed slowed (the page's clock at a half or a quarter, sped up
  again in the cut), which leaves no repeated frames; slowing CSS animations through the DevTools
  protocol as well slowed the frame times twice and froze the game; and the game's banner eases in
  from the top for seconds, so a change of look is timed to the banner crossing the middle.

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
  - the Deck, if one is at hand.
- **Deck review** requested, then Coming Soon, then release.

## 10. Later, perhaps

A small paid DLC of new things, if the game is received well (§6); not planned. Achievements.
Steam Cloud for tournament saves. Quick match (still PLAN §12). The host handed to a guest when
the host leaves. Joining a running match by taking over a bot's seat, so the browser could list
games already under way (§4).

## 11. Still to confirm on the live pages

- The revenue share in the Steam Distribution Agreement, and the German side of any income (a
  Gewerbe, the Kleinunternehmer rule) — only before a paid DLC, if one ever comes.
- Whether Valve's relay is free, if the newer networking is needed.
- Steam Input passing the pad through to the Gamepad API.
- `ShowGamepadTextInput` in the binding.
- The rich presence localisation format.
