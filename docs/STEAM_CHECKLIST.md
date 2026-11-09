# The Steam checklist

Run before every Steam build goes to testers or out (STEAM.md §9.3), on the beta branch, with two
Steam accounts on two machines — one of them the host — and a third account or a phone's Steam
app for the friends list where a step asks. Tick each line; note what failed under the line, with
the build's commit. The first part is the spike's (S1, STEAM.md §3.3), run once on App ID 480.

## 0. The spike (S1, once)

Its code was on the branch `s1-steam-spike` (`spike/steam/`), its steps by hand in its
`spike/steam/README.md`; the branch was deleted once S3 passed the bench (2026-11-09, its last
commit `185c2ae02705`), with the steps' copies on `main`. Each answer went into STEAM.md §3.3. Everything one account can show
was checked by `spike/steam/auto.mjs` on both machines (Windows and Linux, 2026-11-07, all
passed), so only the tests by hand are left:

- [x] **The overlay on Linux**, the spike started from Steam's library as a non-Steam game, with
      `--no-sandbox` alone as its launch options (2026-11-07): **it does not draw** on the Linux
      desktop (STEAM.md §3.3). Where the Linux machine invites, try the spike's invite button
      (a dialog may open in Steam's own window) and else Steam's friends list (right-click a
      friend → Invite to game); the spike's README says so at each step.
- [ ] **The overlay on a Steam Deck** in Game Mode, if one is at hand: Shift+Tab's equivalent
      (the Steam button) and the invite dialog over the game.
- [ ] **The old P2P carries a match**: eight seats, people and bots, a whole match with no hash
      mismatch at the 30-tick hash rate, each machine hosting once; note the latency and anything
      that stalls, and how a 10 s and a 30 s outage on the guest recover.
- [ ] **An invite with the game running** arrives as `GameLobbyJoinRequested` and seats the guest;
      **Join Game** from the friends list does the same.
- [ ] **An invite with the game closed**: what Steam does on 480 (it starts Spacewar, not ours —
      the real test needs our App ID).
- [ ] **A Public lobby seen from the other account** in `getLobbies()`, and joined.
- [ ] **An Invite-only lobby** joined by invite.
- [ ] **A guest can invite**, not only the lobby's owner (needs a third account).
- [ ] **A controller under Steam Input**: the pad's name in the page, and the game played with it;
      **Steam's gamepad keyboard** in Big Picture.

## 1. Hosting and joining

For each lobby type — **Public**, **Friends** (the default), **Invite only**:

- [ ] The host opens a lobby of the type; the lobby shows it.
- [ ] A friend is invited from the overlay; the invite arrives and the friend lands in the lobby.
- [ ] Public: the lobby is listed in Find a game on the other machine; Friends: only for friends;
      Invite only: listed nowhere.

Joining:

- [ ] From an invite with the game **closed**: Steam starts it and it goes straight to the lobby.
- [ ] From an invite with the game **running**, in the menu and in another window of the game.
- [ ] From the **friends list** (Join Game), and from **Find a game**.
- [ ] Names and avatars are the players' Steam ones, in the lobby and in the match.

## 2. The host's rights and leaving

- [ ] The host **removes** a guest: the guest goes back to the menu, told why.
- [ ] The removed guest tries to **rejoin** the same lobby — by invite, the friends list and the
      browser — and is refused each time.
- [ ] The **host quits** mid-match: every guest is told, and nobody is left on a dead board.
- [ ] A **guest drops** mid-match (network cut, or the game killed) and **comes back**: the seat
      is played by a bot meanwhile, and the guest rejoins it with the board right.

## 3. Play

- [ ] **Eight seats** with bots filling the empty ones, a whole match, every phase.
- [ ] **A tournament** across several matches, a friend in the host's team, saved and resumed.
- [ ] **The overlay** over a running match: it opens, the match goes on behind it, nothing hangs.
- [ ] **Special towers** switched on: a match with towers bought by people and bots.
- [ ] **Sound and music** play, in a match and in the menus.

## 4. Without Steam, and the controls

- [ ] **Steam not running** (Steam closed, the game started directly): the game opens, plays
      locally — bots, tournaments — and says online play needs Steam. No crash.
- [ ] **A controller** through every window — the menu, Options, How to play, the lobby, a
      tournament's screens, the pause menu, the end screen — and a whole match, with no mouse.
- [ ] The **on-screen keyboard** for a name and a room's code, from the controller.
- [ ] The **mouse** alone still plays everything, and Esc pauses.

## 5. The Deck, if one is at hand

- [ ] Starts from the Deck's library in Game Mode, with no launcher window.
- [ ] Every text readable at 1280 × 800; the controls show the Deck's glyphs.
- [ ] A match against bots from start to end; suspend and resume mid-match.

## 6. The build itself

- [ ] **No `steam_appid.txt`** in either depot.
- [ ] The **icon** shows in Steam's library, on the taskbar or dock, and on the window.
- [ ] The build is the **commit** meant: the one the Steam job packaged, noted with the results.
- [ ] **No recordings** are written by the packaged build.
