# S1 — the Steam spike (App ID 480)

The test's steps, copied from `spike/steam/README.md` on the `s1-steam-spike` branch (commit
0e1ffda) so they are at hand on `main`; the spike's code stays on that branch, and this copy and
the README are kept alike. Removed with the spike once S1's answers are in STEAM.md.

The spike is a throwaway (docs/STEAM.md §3.3), never merged. Each machine runs a
packaged spike; the host's spike runs Bollfort's own server inside itself, and every message
between the machines goes through Steam's P2P channel. The game itself is unchanged.

Two machines, two Steam accounts that are friends:

- **A** — Linux
- **B** — Windows

| Question | What it asks                                                             | Where                             |
| -------- | ------------------------------------------------------------------------ | --------------------------------- |
| Q1       | Does the Steam binding work in our Electron, on Windows and on Linux?    | Part 1                            |
| Q2       | Does Steam's overlay show over the game window, and its invite dialog?   | Part 2                            |
| Q3       | Does Steam's P2P channel carry a whole eight-seat match without desyncs? | Parts 4, 5                        |
| Q4       | May a guest, not only the host, invite?                                  | not tested: needs a third account |
| Q5       | Does an invite reach a running game, and start a closed one?             | Parts 2, 3, 6                     |
| Q6       | Does `RestartAppIfNecessary` belong in our start-up?                     | Part 1, a note only               |

Q6 cannot really be answered on 480: with `steam_appid.txt` beside the program, Steam always
says no restart is needed. Note the value; the decision is S2's.

Steps are written as **Do**, **Expect** and **Note**. Fill in the results sheet at the end as you go.

---

## The automated part, one machine at a time

Everything that needs only one Steam account is checked by `auto.mjs`, which drives the packaged
spike through its control window with Playwright and writes a report, logs and screenshots to
`spike/steam/auto-results/<time>/`. **Done on both machines** (2026-11-07, every check passed;
STEAM.md §3.3 has the answers), so the evening need not repeat it. To run it again, from a
checkout of this branch, Steam running and logged in, at the desktop (it moves windows, presses
Shift+Tab and takes screenshots — hands off for a few minutes; the match takes longer):

```bash
git fetch && git checkout s1-steam-spike
npm ci && npm run build                       # the game's client, which the spike serves
cd spike/steam && npm ci && npm run package   # release/linux-unpacked, as the CI build
sudo apt install xdotool gnome-screenshot     # Shift+Tab and the screenshots (X11; on Wayland, grim)
npm run auto                                  # start, sockets, lobbies, overlay, connect, match
npm run auto -- --only nosteam                # shuts Steam down, starts the spike, starts Steam again
```

Or point it at the CI download with `--app ~/spike/BollfortSteamSpike-linux`. `--only` and
`--skip` take any of `start,sockets,lobbies,overlay,connect,match,nosteam`. Send the results
folder.

**The overlay on Linux does not draw**, not even with the spike started from Steam's library
(STEAM.md §3.3, 2026-11-07): Steam cannot hook Chromium's drawing. So on A there is no
Shift+Tab, and an invite dialog opens, if at all, in Steam's own window. Where a step has A
invite, use the invite button and, if no dialog appears, **Steam's friends list on A: right-click
B → Invite to game**. A is started from the terminal as below; if it is ever started from
Steam's library instead, its launch options must be `--no-sandbox` alone (with `%command%`
Steam runs the switch as the program), or the window takes 70–80 s to appear.

What it checks, so the evening need not:

| Check   | What                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| start   | Steam initialised, name and ID (Q1); `restartAppIfNecessary` (Q6); the overlay's library in the process                              |
| sockets | the server on 127.0.0.1 only, nothing listening beyond the machine: no firewall prompt                                               |
| lobbies | Friends, Public, Invite only each made, the game window in Bollfort's lobby, the room published; only the Public one in `getLobbies` |
| overlay | Shift+Tab and the API's friends dialog, `openInviteDialog`, `activateInviteDialog`: screenshots                                      |
| connect | `+connect_lobby <id>` taken from the command line and tried, a bad lobby refused without a crash                                     |
| match   | a whole eight-seat match on the spike's server (the host idle, seven bots), no game error                                            |
| nosteam | Steam shut down: the spike says so and runs on; Steam started again and logged in                                                    |

**Found on B**: the overlay draws in the **first window made** — the control window — whichever
window is in front; with the control window closed it draws over the game window, the invite
dialog too. So in Parts 2b and 2e, look for the overlay in the control window. The Steam build has
one window (STEAM.md §3.1), where this does not arise.

---

## Before the evening

1. **Download the newest builds.** On GitHub: **Actions** → **Steam spike** → the newest run with a
   green tick → **Artifacts** at the bottom. A gets `bollfort-steam-spike-linux`, B gets
   `bollfort-steam-spike-windows`. Replace any older download: the old builds lack the buttons
   below.
2. **Unpack on A (Linux).** The download is a zip holding a `.tar.gz`:
   ```bash
   rm -rf ~/spike && mkdir -p ~/spike && cd ~/spike
   unzip ~/Downloads/bollfort-steam-spike-linux.zip
   tar xzf BollfortSteamSpike-linux.tar.gz
   ```
   The program is `~/spike/BollfortSteamSpike-linux/bollfort-steam-spike`.
3. **Unpack on B (Windows).** The download is a zip holding a second zip. Right-click it →
   **Extract All…**, then right-click `BollfortSteamSpike-windows.zip` inside → **Extract All…**
   into an empty folder such as `C:\Spike`. Never start it from inside a zip.
4. **Check Steam, on both:**
   - logged in, online, the two accounts friends of each other;
   - **Steam → Settings → In Game → Enable the Steam Overlay while in-game** switched on;
   - each Steam name **24 characters or fewer** (the game's limit; a longer one is cut to 24);
   - no Bollfort game or desktop app running.
5. **A controller** at hand for Part 7, if you have one.

## The control window

Each spike opens a **control window**; the game opens in a second window as soon as you host or
join. In the control window:

- **Notes** at the top:
  - **Mark in log** — type the step's number (e.g. `4`) and press Enter or click. It writes the
    step and the whole State table into the log. **Mark at the end of every step**: then the log
    file holds every step's figures and nothing has to be copied by hand.
  - **Copy state and log** — puts both on the clipboard, to paste into a chat or the sheet.
  - **Restart clean** — quits and starts the spike again with nothing left over (no lobby, no
    server, no game window, counters at zero). Use it wherever a step says _restart_.
- **State** — who you are, the lobby, the room, and the connection's figures:
  - **Round trip over Steam** (guest only): now, highest and mean.
  - **Host silent > 3 s**: how often the host stopped answering, and the longest silence.
  - **Sent / Read**: packets, size, send failures.
  - **Sockets opened (in a match: N)**: N must stay **0**. A socket opened during a match is the
    guest's game rejoining, which without a lost connection means Steam lost or reordered data.
  - **Log file**: where this run's log is written.
- **Log** — everything that happened. Red lines are failures. The game window's own warnings and
  errors appear here too, as `game warning:` or `game error:`.

**The log files** are in a `logs` folder beside the program — `~/spike/BollfortSteamSpike-linux/logs/`
on A, `C:\Spike\logs\` on B — one file per start. Every restart starts a new file.

---

## Part 1 — Start (Q1, Q6)

**Do:** Start the spike on both.

- **A:** `cd ~/spike/BollfortSteamSpike-linux && ./bollfort-steam-spike`
- **B:** double-click `C:\Spike\BollfortSteamSpike.exe`. SmartScreen warns of an unknown
  publisher: **More info → Run anyway**.

**Expect:** the control window. **Steam user** shows your Steam name and a long ID. No firewall
prompt (nothing listens beyond the machine).

**Note:**

- Steam user shown: yes / no, on A and on B → **Q1**. If it says _not initialised_, Steam is not
  running or not logged in: start Steam, then **Restart clean**.
- `restartAppIfNecessary` on each (expected `false`) → **Q6**.
- Any firewall prompt.

These notes come from `auto.mjs` already: on B (2026-11-07) Steam user shown, `false`, no
listening socket beyond the machine; on A from its own run. Starting is still needed for what
follows.

**Mark** `1` on both.

## Part 2 — A hosts a Friends lobby; overlay and invite (Q2, Q5)

**2a. Host.**
**Do:** on A, **Host: Friends lobby**.
**Expect:** within a few seconds the game window opens in Bollfort's lobby with eight seats. A's
log: `lobby … made (friends)`, then `room … published in the lobby`.
**Note:** game window opened: yes / no.

**2b. The overlay on A.** Done: it does not draw on the Linux desktop (above). Skip.

**2c. The invite dialog.**
**Do:** in A's control window, **Invite (lobby.openInviteDialog)**.
**Expect:** no overlay; perhaps Steam's invite dialog in a Steam window of its own.
**Note:** opens: yes / no, and where. If nothing opens, try **Invite
(overlay.activateInviteDialog)** and note whether that one works.

**2d. Invite B, B running (Q5).**
**Do:** in the dialog, invite B's account — or, with no dialog, in Steam's friends list on A,
right-click B → **Invite to game**. Note which way it went. On B, accept the invite (Steam's
chat window or the notification).
**Expect:** B's log `GameLobbyJoinRequested: …`, then `joined lobby …`; a game window opens on B
and B's name appears on a seat in A's game window.
**Note:** `GameLobbyJoinRequested` in B's log: yes / no. B seated in A's room: yes / no.

**2e. The overlay on B.** Done by `auto.mjs` on 2026-11-07: the overlay and both invite dialogs
open on Windows, in the control window while it is open, over the game window once it is alone.
Skip.

**Mark** `2` on both.

## Part 3 — Joining from the friends list (Q5)

**Do:** on B, **Restart clean**. When B's control window is back, open Steam's **Friends** list on
B, right-click A's name → **Join Game**. (A's lobby from Part 2 is still open.)
**Expect:** B's log `GameLobbyJoinRequested`, a game window on B, B seated in A's room.
**Note:** "Join Game" offered in the menu: yes / no. B seated: yes / no.

**Mark** `3` on both.

## Part 4 — The match, A hosts (Q3)

**Do:** in A's game window the six empty seats are bots. B clicks **Ready**, A clicks **Start
match**. Play the **whole** match normally, both of you. Do not disturb the network.

**Watch, on B's control window** from time to time: round trip, _Host silent_, _Sockets opened
in a match_.

**Expect:** sockets in a match stays **0**; no red lines; _Host silent_ 0 times.

**Note, at the end of the match** (before anything else):

- round trip: mean and highest;
- _Host silent_: count and longest;
- sockets opened in a match (must be 0);
- send failures, and the largest packet;
- any red line or `game error` in either log;
- how it felt against a LAN match: delays after a click, jumps, stutters.

**Mark** `4` on both, straight after the match.

## Part 5 — B hosts a Public lobby; the lobby list; the match the other way (Q3)

**5a. B hosts, A finds it.**
**Do:** **Restart clean** on both. On B, **Host: Public lobby**. On A, **List our lobbies**.
**Expect:** A's log `getLobbies: N lobbies on 480, M of ours`. Every Spacewar developer shares
App 480's list and the binding cannot filter it, so _none of ours found_ is a finding, not a
mistake.
**Do:** if B's lobby is listed, click it. If not, copy the **Lobby** number from B's State into
A's _lobby id_ field and click **Join by id**.
**Note:** the `getLobbies` line (N and M); B's lobby listed: yes / no; joined by list or by id.

**5b. The match.**
**Do:** A clicks **Ready**, B **Start match**. Play the match normally, **A** now watching its
own control window, until **two rounds before the end**.
**Do:** **Mark** `5b` on A and B — this keeps the clean part's figures, before the outage below.
**Note:** as in Part 4 (round trip mean and highest, Host silent, sockets in a match, failures).

**5c. A network outage on the guest.**
**Do:** on A, cut the network for **10 seconds** (unplug the cable or switch off Wi-Fi), then
reconnect. Keep playing.
**Expect:** A's log `the host has not answered for 3 s`, and later `the host answers again, after
N s`. The game on A probably freezes and then catches up. (The game's own connection notice will
_not_ appear: A's game talks to the spike on A's own machine, which never loses that connection.)
**Note:** did the host answer again (N seconds)? Did A's game catch up and play on? A
`P2P session … failed` line in either log? Sockets in a match still 0?
**Do:** if it recovered, the same again for **30 seconds**, and note the same.
**Do:** play the match to its end. **Mark** `5c` on both.

## Part 6 — An invite with the game closed (Q5)

**Do:** **Restart clean** on A; on A, **Host: Friends lobby**. Quit B's spike entirely (close its
windows). On A, **Invite (lobby.openInviteDialog)** and invite B — or, with no dialog, Steam's
friends list on A, right-click B → **Invite to game**. On B, accept.
**Expect:** on App 480 Steam starts **Spacewar**, not our spike — that is expected; the real test
needs our own App ID.
**Note:** what Steam did on B: offered to install Spacewar / started it / nothing / something else.

Start B's spike again afterwards. **Mark** `6` on A.

## Part 7 — Controller and Steam's keyboard

**Do:** plug a controller into B (or A), click into the **control** window and press any button
on the pad.
**Note:** the name under _Controllers this page sees_. `Xbox 360 Controller`, `Steam Virtual
Gamepad` or similar means Steam Input passes the pad through. Steam applies Spacewar's own
controller setup to the spike, so this may differ for our App ID.
**Do:** **Restart clean**, host a lobby, and in the game window go through the menus and a few
rounds against bots with the pad only.
**Note:** does the pad work in the game window under Steam?
**Do (only in Steam's Big Picture mode, or on a Steam Deck):** **Steam's gamepad keyboard**.
**Note:** does it open, and what does the log say it returned?

**Mark** `7`.

## Part 8 — Optional: an Invite-only lobby

**Do:** **Restart clean** on both. On A, **Host: Invite only**, then **Invite
(lobby.openInviteDialog)** and invite B — or, with no dialog, Steam's friends list on A,
right-click B → **Invite to game**; B accepts.
**Note:** B seated in A's room: yes / no. No match needed. **Mark** `8` on both.

---

## Afterwards

Send:

- the **logs folders** of both machines (every file in them);
- the **results sheet** below.

They decide S3's binding work (STEAM.md §3.2: whether we fork `steamworks.js`, and whether the
old P2P is enough) and are recorded in STEAM.md. The spike and its branch are then thrown away.

## Results sheet

| Step | What                                          | A (Linux) | B (Windows) |
| ---- | --------------------------------------------- | --------- | ----------- |
| 1    | Steam user shown (Q1)                         |           |             |
| 1    | `restartAppIfNecessary` value (Q6)            |           |             |
| 1    | Firewall prompt                               |           |             |
| 2a   | Game window opened as host                    |           | —           |
| 2b   | Overlay over the game window (Q2)             | no (done) | —           |
| 2c   | Invite dialog: which button, where; else list |           | —           |
| 2d   | `GameLobbyJoinRequested`; seated (Q5)         | —         |             |
| 2e   | Overlay over the game window (Q2)             | —         |             |
| 3    | Join Game from the friends list; seated       | —         |             |
| 4    | Round trip, mean / highest (guest)            | —         |             |
| 4    | Host silent: count / longest                  | —         |             |
| 4    | Sockets in a match (must be 0)                |           |             |
| 4    | Send failures; red lines; felt like LAN?      |           |             |
| 5a   | `getLobbies` N / M; listed; joined by         |           | —           |
| 5b   | Round trip, mean / highest (guest)            |           | —           |
| 5b   | Host silent; sockets in a match; failures     |           |             |
| 5c   | 10 s outage: recovered after N s; caught up   |           |             |
| 5c   | 30 s outage: recovered after N s; caught up   |           |             |
| 5c   | `P2P session … failed`; sockets in a match    |           |             |
| 6    | What Steam did with the game closed (Q5)      | —         |             |
| 7    | Controller name; pad works in the game        |           |             |
| 7    | Steam's keyboard (Big Picture / Deck only)    |           |             |
| 8    | Invite only: seated                           | —         |             |
