# The Steam checklist

Run before every Steam build goes to testers or out (STEAM.md §9.3), on the beta branch, with two
Steam accounts on two machines — one of them the host — and a third account or a phone's Steam
app for the friends list where a step asks. Tick each line; note what failed under the line, with
the build's commit. The first part is the spike's (S1, STEAM.md §3.3), run once on App ID 480.

## 0. The spike (S1, once)

Its code is on the `s1-steam-spike` branch (`spike/steam/`). Each answer goes into STEAM.md §3.3.

- [ ] **The binding builds and loads** for our Electron, on Windows and on Linux.
- [ ] **The overlay** (Shift+Tab) shows over the game's window, and its invite dialog opens.
- [ ] **The old P2P carries a match**: eight seats, people and bots, a whole match with no hash
      mismatch at the 30-tick hash rate; note the latency and anything that stalls.
- [ ] **A guest can invite**, not only the lobby's owner.
- [ ] **An invite with the game closed** starts it with `+connect_lobby <id>`; **with it
      running**, it arrives as `GameLobbyJoinRequested`.
- [ ] **`RestartAppIfNecessary`**: started outside Steam, does the game belong under Steam's start?

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
