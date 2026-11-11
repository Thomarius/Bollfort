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
controller support in five parts (2026-11-04, ARCHIVE 15zm, §8); and S4's material that needs
no account — the art, the trailer, the texts, the loops and the icon (2026-11-04 to 2026-11-06,
ARCHIVE 15zn, 15zo, `STORE_PAGE.md`); S1, the spike, every question answered, and H, the test
bench (2026-11-07 to 2026-11-09, ARCHIVE 15zq, §3.3, §3.4); no fork (§3.2); S2, the Steam build
(2026-11-09, ARCHIVE 15zr, §3.5); S3, Steam lobbies, built and passing every scenario of the
bench on the Linux machine, outage and restart included (2026-11-09, ARCHIVE 15zs, §7.3).
**Next**: S3's checks by hand with two people (S3.5): Steam's friend picker in the overlay, an
invite accepted while the invited player is in a match of their own, a guest restarted coming
back; then S4. **S3.6** (§7.3), a player who dropped coming back by an invite or the restart's
prompt, built and passing the bench (2026-11-09, ARCHIVE 15zu).

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
- **On Linux without Chromium's sandbox** (`--no-sandbox`, appended by the app under the Steam
  flag): with Steam's overlay preloaded the sandbox stalls the start for 70–80 s (§3.3).
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

**Decided: no fork** (2026-11-09, the user's, on S1's answers, §3.3). The old P2P carries a
match cleanly under delay and loss, so the newer networking is not needed; on our own App ID the
lobby list holds only our lobbies, so filters are not needed either. Without `setLobbyType` the
host chooses the lobby's type before hosting, not in the lobby screen (§7.2 follows). No Rust in
the release workflow.

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

**Answered on one machine** (2026-11-07, the packaged spike driven by `spike/steam/auto.mjs`,
every check passed, on Windows and then on Linux, Ubuntu under X11):

- **1, Windows**: `steamworks.js` 0.4.0 loads in Electron 44 and initialises on 480, the user's
  name and ID read. **Linux** the same, the spike packaged on the machine.
- **2, Windows**: the overlay's library is loaded into the process, and Shift+Tab, the friends
  dialog and both invite dialogs (`lobby.openInviteDialog`, `overlay.activateInviteDialog`) open.
  **The overlay draws in the first window made**, whichever is in front: in the spike's control
  window while it is open, over the game window once it is the only one. The Steam build must
  have one window, or make the game's first (§3.1 has one). On Linux Steam injects the overlay
  only into what it starts (`LD_PRELOAD`), so a build started from a terminal has none: the
  Steam build is started by Steam, and the spike's Linux test starts it as a non-Steam game.
  **On the Linux desktop the overlay does not draw at all** (2026-11-07, Ubuntu under X11, AMD
  Renoir): the spike started from Steam's library as a non-Steam game has the overlay's library
  in every process and Steam starts its overlay helper for it — five times in one start, about
  one per Chromium process, each inheriting `LD_PRELOAD` — and Chromium draws in hardware
  (ANGLE on OpenGL through GLX, GPU compositing on, the GPU in the main process as
  `electronEnableSteamOverlay` sets it), yet Shift+Tab and the API's dialogs show nothing, with
  no error. Tried, all without an overlay: ANGLE on Vulkan (`--use-angle=vulkan`, Steam's Vulkan
  layer is on) and on EGL (`--use-angle=gl-egl`), both of which drop Chromium to software
  compositing; `--no-zygote`; `--single-process`, which opens no window. Electron 44 ships no
  ANGLE libraries on Linux (it is linked in), so swapping them is no way either. The Deck's Game
  Mode draws the overlay in its compositor, gamescope, not inside the game, so the Deck most
  likely has it regardless _(to confirm on a Deck)_. On the Linux desktop invites still work
  from Steam's own friends list (Invite to game), which needs no overlay.
- **Chromium's sandbox stalls the start under Steam on Linux**: started by Steam, with the
  overlay's library preloaded, the window took 70–80 s to appear; with `--no-sandbox` 1 s, and
  0.5 s without the overlay at all (`--disable-gpu` changed nothing). The Steam build on Linux
  must start without the sandbox, set by the app itself (S2), as Steam's launch options are the
  player's. In a non-Steam shortcut, Steam takes `--no-sandbox` alone as launch options:
  `%command% --no-sandbox` ran `--no-sandbox` as the program. And Steam counts the spike as
  AppID 480, the ID it initialises with, so the shortcut's Play button turns back at once —
  a spike's quirk, gone with our own App ID.
- **5, in part**: `+connect_lobby <id>` is read from the command line and joined; a lobby that
  does not exist is refused without a crash. Steam's own handing over still needs two accounts.
- **6**: `false` on 480, with Steam running and without, on both systems; as expected with
  `steam_appid.txt`, so the decision stays S2's.
- **Lobbies**: Friends, Public and Invite only are made, and only the Public one is in
  `getLobbies()` — among the 50 it returns on 480, which is the list's cap, so ours was found
  by luck of distance as much as by right; a lobby left a moment ago may still be listed. The
  same on Linux.
- **Nothing listens beyond the machine** (the server and relay on 127.0.0.1): no firewall prompt.
- **Steam not running**: initialisation fails with "Cannot create IPC pipe to Steam client
  process", and the spike says so and runs on. Steam shut down and started again by the script.
  The same on Linux.
- **A whole eight-seat match** on the spike's own server (the host idle, seven bots) to the end
  screen in 10.9 minutes (10.8 on Linux), no game error and no hash mismatch: the bundled
  server under Electron is sound, so anything the two-machine test finds is the channel's.

**Answered on two machines and on the bench** (2026-11-08 and 09; the bench in §3.4):

- **The first evening joined no lobby**: every guest's page said no server answers. Steam sets
  up a P2P session between two machines in **3.8–4.1 s** (every join since), and the game's page
  waits 2 s for the server's welcome (`SERVER_WAIT_MS`), then closes its socket. The spike's
  guest now opens the game only once the host has answered a ping. S3's transport must allow
  for the same: the session first, then the page's wait.
- **3**: the old P2P carries an **eight-seat match with no hash mismatch** — both seats on the
  autopilot, 9.4–9.8 minutes, the end screens alike, no rejoin, no send failure, 9–12 ms round
  trip once connected, either machine hosting; and with 50 and 150 ms more round trip and 1%
  loss each way (measured 55 and 156 ms, 24 ms under loss, as reliable sends resend).
- **A guest cut off loses its place for good.** Its whole Steam client goes offline, and Steam
  takes it out of the lobby within 10 s; the P2P session fails after some 20 s of silence and is
  made again some 20 s after the network is back. A 10 s cut is lived through on the sockets
  already open; after 30 or 90 s the game's rejoin (ARCHIVE 15zc) is refused, since the spike
  admits lobby members only, and the refusal closes nothing, so the guest's page hangs on
  Reconnecting while a bot plays its seat. A guest whose app is restarted in a match cannot
  rejoin the lobby at all, closed to joins at the start (§7.2). **For S3**: a seat's own player
  readmitted by Steam ID, lobby or not; the lobby left joinable for its match's players, or their
  way back otherwise; a refused link closed, so the page's rejoin runs or gives up.
- **5**: an invite **with the game running** arrives as `GameLobbyJoinRequested` and seats the
  guest, accepted in Steam's friends list — Friends, Public and Invite only; and Join Game from
  the friends list for Friends and Public (Invite only offers none, as it should). **With the
  game closed** Steam starts Spacewar, 480's own game, not ours: the closed path waits for our
  App ID; `+connect_lobby` itself works (the bench joins every lobby by it).
- **2, Windows, in the game**: the overlay works without any problem (the user, 2026-11-09).
- **A controller under Steam Input** works in the spike's game without any problem.
- **One app at a time**: two spikes on one Steam client read each other's packets, and one
  crashed on a packet the other had taken ("No packet available"); an invite to the second
  joined the lobby while the first took the host's answers, so its game never opened. The spike
  now keeps one instance, a second start handing over its `+connect_lobby`; the Steam build
  must do the same.
- **4, yes**: a guest invites too (2026-11-09). The VM's arnoldex83 hosted and invited Arnoldex,
  who invited Mausica86 on the Windows machine from Steam's friends list; she was seated in the
  lobby.

### 3.4 The test bench (H)

**Approved and built** (2026-11-09, the user's): `tools/steambench`, run the same day on the S1
spike — every scenario's result is in §3.3. Its first runs found two of its own faults, kept as
comments: a function passed to the page loses tsx's `__name` helper, so its scripts go as text;
and only lines logged after a cut may answer for it.

**Why** (2026-11-08): the first two-machine evening joined no lobby. Steam took 3.9 s to set up
the P2P session between two machines, and the game page gives up after 2 s (`SERVER_WAIT_MS`);
on one machine the session is instant, so `auto.mjs` never saw it. Fixed on the spike's branch
(the guest opens the game only once the host has answered), and found again the same night on
this machine against a VM: **a second Steam account in a VM reproduces the two-machine
behaviour** (first contact 4.0 s), and a whole eight-seat match ran between them, unattended,
with no error, mismatch or rejoin. The bench makes that a tool: every multiplayer path over Steam
run by script, on one machine, as often as wanted — for S1 now, for S3's transport later, and
before every Steam release.

**The machines**

- **Host: this machine**, Steam as Arnoldex. **Guest: the VM `bollfort-guest`**, Ubuntu 24.04
  with Xfce under libvirt (2 cores, 4 GB, virgl 3D), logged in by itself, Steam as arnoldex83,
  remembered. Roles swap by a switch: the VM hosts and this machine joins.
- **The VM made by script**: cloud-init's `user-data` and `create.sh`, in the repository
  (`tools/steambench/vm/`), with no key or password in them; its SSH key made on the machine.
  Logging the account in is the one step by hand, once.
- **Reached by SSH**, its address asked of the guest agent (libvirt forgets its own leases when
  the machine restarts). The app under test is copied in with rsync, `chrome-sandbox` set to root
  and 4755 (Electron refuses to start otherwise), and started with `--remote-debugging-port`, its
  windows driven over an SSH tunnel by Playwright's `connectOverCDP` — the same calls as the
  local side's.
- **Not a measure of speed**: the VM's game draws at 10–20 fps and the host loses a few frames
  to the VM (the trial: host 53 fps, 83% of its cores busy). Frames and load are recorded as
  information only; speed is measured on real machines (`sysreq.ts`).

**The network, shaped** with `tc netem` on the VM's own interface on this machine (`vnet0`), so
only the guest's traffic is touched — Steam's relay or a direct path alike. Root is needed for
`tc` alone _(the user's decision: a sudoers line for `/usr/sbin/tc`, or run by hand)_. Every run
removes its rules as it ends, and `--reset` removes them after a crash.

**The app under test**, behind an adapter with one shape — launch with arguments, host a lobby of
a type, join by ID or by `+connect_lobby`, the control and game pages, the log, the counters,
close. **First the spike** (its control window's `window.spike` and log file), **later S3's
Steam build** (its own hooks), so S3 inherits the scenarios unchanged. Both seats played by the
**autopilot** (`&autopilot=1`), so the guest's moves cross the channel, not only the host's; the
spike passes it on to the game's address. The spike's branch takes main's client for it.

**The scenarios**, each its own run, its report in `steambench-results/<time>/`:

| Scenario | What                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| join     | Friends lobby; the guest joins by `+connect_lobby`, five times: first answer, seated, time |
| public   | Public lobby; the guest finds it with `getLobbies` or, failing that, joins by ID           |
| private  | Invite-only lobby; the guest joins by `+connect_lobby`, as for an accepted invite          |
| match    | eight seats, both people on autopilot, to the end screen: the clean figures (Q3)           |
| lag      | the same under delay and jitter, then loss: 50 ± 10 ms, 150 ± 30 ms, 2% loss               |
| outage   | in a match, the guest cut for 10 s, then 30 s, then 90 s: recovered, caught up, or lost    |
| reversed | `match` with the VM hosting                                                                |
| restart  | the guest's app killed in a match and started again with `+connect_lobby`: back in or not  |
| code     | the Steam build's alone (S3): the guest types the host's code into the menu, twice         |

**What a run counts**: the time to Steam's first answer and to the seat; round trip (mean,
highest), the host's silences, send failures, largest packet; sockets opened in a match (a
rejoin — with no outage, data lost or reordered); `P2P session … failed`; game errors and
warnings; hash mismatches; both end screens' scores, which must agree; and, as information,
frames and load on both sides. A run passes on: seated, end screen on both, scores equal, no
mismatch, no rejoin unless the network was cut, no game error.

**Not automated**, by hand with two people: the overlay and its dialogs (Q2), accepting an invite
— running and closed (Q5) — and a guest's invite to a third account (Q4), which are Steam's own
clicks; Windows itself; a controller under Steam Input.

**Where**: `tools/steambench/` on main, its own workspace package, outside `npm run check` (it
needs Steam, the VM and the desktop). `npx tsx tools/steambench/src/bench.ts [scenario...]
[--reverse] [--app DIR] [--reset] [--full]`. A full set takes about an hour, unattended, the
desktop left alone. **Only `match` plays all ten rounds** (the user's, 2026-11-09: a match of ten
blocks the machine for some 10 minutes): `reversed` plays 3, `restart` and `invite` 4, `lag` 5,
`outage` 7, each event as early as it can come with a round of play after it, through the host's
`&rounds=` (the lobby's `maxRounds` bounds now 1–20, the rounds no longer being offered there);
`--full` plays every match to ten, as before (about an hour and a half).

**The spike** stayed on its branch, frozen but kept, until S3's build passed the same scenarios:
the reference to compare S3 against. Then the branch was deleted (2026-11-09, ARCHIVE 15zt, its
last commit `185c2ae02705`).

**The Steam build as the target** (2026-11-09, S3.5): the bench runs the scenarios on
`packages/desktop/release/steam/linux-unpacked` (`SteamApp`, `steamApp.ts`, in the shape written
for the spike, `AppUnderTest`): driven through its game page — `window.bollfortHost` and the page's
own buttons, Play with the lobby's type, Join with a code, Back to the match — and read from its
`start.log`, whose lines say what the spike's did (`the host answered over Steam after …`,
`joined lobby …`, `the host answers again, after …`, `game error: …`); `--game-params
autopilot=1` reaches its page; its stats carry the lobby, the round trip (pings every 2 s) and the
links dialled, past the first a rejoin. Under it **restart** comes back by Back to the match, and
must: the spike could not. It passed every scenario on 2026-11-09 (ARCHIVE 15zs), and the
spike's target, `--target spike`, was removed from the bench with its adapter (`App`) the same
day, its local build and its folder in the VM deleted.

### 3.5 S2, the Steam build (done 2026-11-09)

**The aim**: a Steam build of the desktop app that starts straight into the game under Steam.
Lobbies, invites, names and avatars stay S3's (§7). Built and tested on App ID 480; the App ID
becomes ours once the fee is paid (S4). Some two to three sessions, S2.2 and S2.3 the bulk.

**Decided** (2026-11-09, the user's):

- **Fullscreen by default** under Steam, the player's choice remembered after that: the Deck
  wants the whole 1280 × 800 screen, and a Steam game is expected to fill it.
- **`RestartAppIfNecessary` is called** (Q6) once the App ID is ours: started outside Steam, the
  app quits and Steam starts it again, which is also how the overlay is injected on Linux. On 480
  it always says no, so it waits untested for the App ID.
- **The Deck in S5**, not S2: started as a non-Steam game the build does not run in Steam's Linux
  runtime container, so only our App ID can test it there. The user knows a Deck owner; S5
  prepares the build so that he can test it easily (§9.3).

**S2.1 The flag and the build**

- **`BOLLFORT_STEAM`**, set at build time (the desktop's `build.js` defines it), decides all of
  it. Without it the app never loads `steamworks.js`, and the GitHub builds stay as they are.
- **A third packaging target, `steam`**: a plain folder for Windows and one for Linux, as a
  Steam depot takes them, in place of the portable `.exe` and the AppImage. `steamworks.js`
  (0.4.0, no fork, §3.2) a dependency of the desktop package, its native module shipped unpacked.
- **`steam_appid.txt` for development only**: written beside the program by the development
  start, never packaged; the packaging fails if one is in a Steam folder (§3.1).
- **The App ID in one place**, 480 until S4.

**S2.2 Starting under Steam** (the main process, under the flag)

- **Steam initialised and the overlay enabled** before the app is ready
  (`electronEnableSteamOverlay`), the user's name, ID and language read.
- **One instance**: a second start hands its `+connect_lobby` to the first and quits, before it
  touches Steam (S1 crashed with two on one Steam client, §3.3). S3 does the joining; S2 only
  passes the argument on.
- **On Linux without Chromium's sandbox**, appended by the app itself (`no-sandbox`), since the
  launch options are the player's: with the overlay preloaded the sandbox held the window back
  70–80 s (§3.3).
- **The game's window the first window made**, as the overlay draws in the first one on
  Windows (§3.3).
- **Steam not running**: the app starts anyway and plays locally — bots, tournaments, the demo —
  with a notice in the menu that online play needs Steam. It never crashes; nothing tries Steam
  again until the next start.

**S2.3 No launcher under Steam** (Deck Verified refuses launchers)

- **The game's window opens directly**, fullscreen (above); the control window never.
- **The server in the background** on a free port, on 127.0.0.1 only: nothing offered to the
  network, no firewall prompt.
- **None of the launcher's switches**: no UPnP, no tunnel, no firewall check; their code is not
  reached under the flag.
- **Closing the window quits the app**, the server with it.
- **No recordings**, as in every packaged build (package R).

**S2.4 Tests**

- **How to start, as a pure function**: from the flag, whether Steam initialised, the system and
  the arguments, what the app does — window, sandbox, notice, the lobby handed on — tested in
  `npm run check`.
- **The bench's `start` scenario** (§3.4) for the packaged Steam build on Linux, started as a
  non-Steam game: no control window, the game's window first, fullscreen, one instance with a
  second start handed over, the window up within seconds without the sandbox, and Steam shut
  down — local play and the notice. The bench gains an adapter for the Steam build (§3.4); S3's
  lobby scenarios use it after.
- **By hand on Windows, once**: the overlay over the game's window, Shift+Tab, in fullscreen.

**S2.5 The release workflow**

- **Both Steam folders built** on their systems with every release and by hand, as the run's
  downloads, beside the `.exe` and the AppImage.
- **A tag's GitHub release carries them too** (the user's, 2026-11-11): packed, a zip for
  Windows and a tar for Linux, so testers on 480 download the Steam build beside the portable
  files until S4.
- **The upload to Steam waits for S4**: `steamcmd` and a depot need our App ID.

**Not testable on 480**, so left for our App ID, after the fee and before the testers' beta:
a closed game started by an invite, `RestartAppIfNecessary`, the Linux runtime container, and the
Deck.

**Built and tested** (2026-11-09, ARCHIVE 15zr). On Linux by the bench's `start` scenario, every
check passing: the page up in 1.1–1.5 s, one window, fullscreen, Steam ready, the server on
127.0.0.1 only, a second start handing its lobby over, SIGTERM ending it in 0.4 s, and with
Steam shut down local play and the menu's notice. On Windows by the user: straight into the game
fullscreen, the overlay on Shift+Tab, the Full screen button, the menu's new **Quit**, and the
notice without Steam. What the plan did not foresee:

- **Linux's sandbox is switched off by the command line only**: set from inside, it comes after
  Chromium's helper processes started, and the page's crashed. The app starts itself again with
  `--no-sandbox` (about a second); **from S4, Steamworks' launch options pass it** (ours to set,
  not the player's), which saves that.
- **SIGTERM, as Steam stops a game on Linux, left the app running** past 30 s; it now ends as a
  closed window does.
- **On Windows the window is not yet fullscreen as the page first asks**: the app answers with the
  state it set, or the button runs a click behind.
- **`start.log`** in the app's data folder holds the start's steps with their times — what a
  player can send when the game does not come up.
- **Quit** in the menu of the desktop app (the user's): the Deck has no window to close.

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
  default; the host chooses Public, Friends or Invite only in Play, before hosting (no fork,
  §3.2), fixed once the lobby is made.
- **Invite**: a button in the lobby opens Steam's friend picker in the overlay. An invite accepted
  with the game closed starts it into the lobby (`+connect_lobby`); with the game running it joins
  from wherever the player is, after asking if they are in a match.
- **Join from the friends list**, through rich presence, for Friends and Public lobbies.
- **Rich presence**: "In the lobby", "In a match, round 5 of 10", "In a tournament", in English
  and German _(the localisation file's format to confirm)_.
- **Names and avatars**: a seat's name is the Steam name, so there is no name field under Steam.
  The avatar is on the seat card, in the browser and in the match (§7.3).
- **At the start** the lobby closes to joins (`setJoinable(false)`). A match is never joined in
  progress.
- **The host leaving** ends the match, as now. Handing the server to a guest is for later.
- **Trust**: a modified host could cheat. This is accepted for a free game without rankings.
- **Versions**: the protocol version is in the lobby data. A lobby on another version is hidden.
- **The language** from Steam's (`getCurrentGameLanguage`) on first start, then the player's own
  choice.

### 7.3 S3's design (draft, 2026-11-09, for the user's approval)

**Decided** (2026-11-09, the user's, answering the draft's questions):

- **Rejoining must work in a match**, after an outage and after a restart: **by Steam ID, over
  P2P to the host directly**, never through the lobby, which drops a guest cut off for 10 s and
  is closed to joins once the match starts (§3.3).
- **Join by code stays** under Steam: some prefer it, and it is the fallback when Steam's friends
  list fails to hand a join over.
- **The lobby's type is chosen in Play, before hosting**: no new step in the lobby screen.
- **Avatars in the match too**, not only on the lobby's cards and in Find a game.
- **Every multiplayer bench run is on the user's Linux machine** with its VM (§3.4); this machine
  builds and prepares, and checks what one account can.

**S3.1 The transport: Steam's P2P behind the main process**

- **No relay socket** as the spike had: the guest's page dials through the preload (`dialSteam`,
  a `Dial` of §7.1, its address the host's Steam ID), its main process carries the text over P2P,
  reliable sends; the host's main process hands each link to the server's `Gateway` as a `Peer`
  (`steamPeer`), in-process. The host's own page stays on its WebSocket to 127.0.0.1.
- **Framing** as the spike's, `[kind][link][payload]`: open, opened, data, close, refused, ping,
  pong. A message is one packet — reliable sends take up to 1 MB, the largest message
  (`maxTournamentBytes`) is 256 KB — so nothing is split; a send over 1 MB closes the link.
- **The link opens once the host has answered** (`opened`), with its own wait (10 s, configured)
  before it fails: Steam's first contact takes 3.8–4.1 s between machines (§3.3), so the page's
  `SERVER_WAIT_MS` (2 s) starts only after it.
- **A failed session closes every link to that Steam ID** (`P2PSessionConnectFail`), on both
  sides, so the gateway's `closed` and the page's rejoin both run. Packets read every 2 ms, as the
  spike's, since a commit comes thirty times a second.
- **Tests**: a fake Steam (the P2P calls and callbacks, in memory, with a delay and cuts) under
  the same transport suite as the fake network's (`transport.test.ts`), the framing a pure
  function — in `npm run check`.

**S3.2 Identity and rejoining**

- **The server owns identity, by Steam ID**: a `Peer` may carry an identity, the sender's Steam
  ID, which the client never states — the host's main process takes it from the packet. The
  host's own WebSocket on 127.0.0.1 is given the host's (an option of `startServer`, the Steam
  build's only). The gateway uses it in place of the browser ID (§5) and the seat's token.
- **A seated player is readmitted by Steam ID**, link or none, lobby member or not, for as long as
  the match runs: a join from a Steam ID holding a seat takes that seat, closing any old link
  still thought open. The room already holds a gone player's seat for the match, a bot playing
  it (ARCHIVE 15zc); only the claim changes.
- **A refusal closes the link** (`refused`, with the reason): the page's rejoin gives up or tries
  again instead of hanging on Reconnecting (S1's guest, §3.3).
- **The page keeps trying longer under Steam**: the session is made again some 20 s after the
  network is back, so the rejoin's tries run while the match does, with Leave match on the notice
  (ARCHIVE 15zc) — not the 15 tries of about a minute a WebSocket gets.
- **After a restart**: as a guest's page joins a room, its app keeps the host's Steam ID and the
  room's code in its settings, cleared when the match ends or is left. Started again with one
  kept, the menu shows **Back to the match** (a button, as every action has one); refused, it
  says the match has ended and forgets it.
- **Remove** (§5) refuses by Steam ID, the host's lobby too (a removed member is not readmitted
  through it).
- **Admission is the host's server's alone**: anyone reaching the host may take a free seat while
  the room is in its lobby, as anyone with a code may outside Steam; Invite only means unlisted
  and with no Join in the friends list, not a check. A match in progress takes no one new.

**S3.3 Lobbies, codes and Play**

- **Play** in the menu gains a three-way choice under it, **Friends**, **Public**, **Invite only**,
  Friends by default, remembered; Find a game's Host a single match is always Public. A new
  tournament's room takes the same remembered choice. Without Steam the choice is not shown.
- **The Steam lobby is made with the room** (`createLobby`, eight members), its data the
  listing's (§4): protocol, players, team size, towers, tournament, people, the host's name —
  updated as the room changes. `setJoinable(false)` at the start, `true` again in the lobby after
  the match (Rematch).
- **The code is the host's**: its account ID (the low 32 bits of the Steam ID) in the room code's
  letters, some seven of them. Joining by it dials the host over P2P directly — no lobby call —
  and the host answers with its room's code and the lobby's ID, which the guest then joins as
  well while it is joinable, for Steam's own view of who plays together. So a code still works
  where the friends list fails, and can also bring a restarted guest back. It shows the host's
  account, which Steam profiles show anyway.
- **An invite, or Join in the friends list**, arrives as `+connect_lobby` (a start or a second
  start, S2) or `GameLobbyJoinRequested` (running): the lobby joined, its owner dialled. In a
  match it first asks "Leave this match to join Bo's game?".
- **Invite** in the lobby opens Steam's picker in the overlay (`openInviteDialog`); where the
  overlay draws nothing (the Linux desktop, §3.3) Steam's friends list still invites.
- **Find a game** lists `getLobbies()` (public only), rows from the lobby data, friends' games
  first; another protocol hidden. Joining a row is as an invite.
- **The host leaving** ends the match, as now: the guests' links close, the rejoin is refused,
  and the page says the host has gone.

**S3.4 Names, avatars, presence, language**

- **Names**: the Steam name, sent by the guest's page as now (no name field under Steam), cut to
  the protocol's 24 characters.
- **Avatars need what `steamworks.js` lacks**: it has no friends interface (no
  `GetMediumFriendAvatar`, no `GetImageRGBA`, checked in 0.4.0's `client.d.ts`). Proposed, in place
  of a fork: **a few calls of Steam's flat C API through an FFI** (`koffi`, prebuilt for Windows
  and Linux, no Rust), on the same `steam_api` library `steamworks.js` ships and has already
  initialised — the avatar's handle, then its pixels, re-asked until Steam has loaded them.
  _(To prove on 480 first, a short step; if it fails, avatars wait for a fork.)_
- **Seats carry their Steam ID** (`SeatSchema.steamId`, optional, from the server's identity, so
  never claimed by a page): each page fetches avatars itself through its preload, by ID, and
  caches them — nothing derivable is sent. A protocol bump, 36.
- **Shown** on the lobby's seat cards, in Find a game's rows, and in the match: the score bar
  beside each person's name, and the end screen's rows. Bots keep their own marks.
- **Rich presence** (`setRichPresence`): `steam_display` with "In the lobby", "In a match,
  round 5 of 10", "In a tournament"; `connect` set to `+connect_lobby <id>` while the lobby is
  joinable, so Join shows only then. Its texts are a localisation file uploaded in Steamworks,
  so they are seen only on our App ID; on 480 the keys are set and the Join tested.
- **The language**: on the first start under Steam, `german` gives Deutsch and anything else
  English; after that the player's choice. Hessian is never Steam's.

**S3.5 The bench and the order of the work**

- **The bench's adapter for the Steam build** (its hooks in place of the spike's control window),
  and its scenarios unchanged; S3 is done when the build passes all of them on the Linux machine,
  **outage and restart included**, where the spike failed — and **code**, a new one: joining by
  the code, and coming back by it after a restart.
- **The order**: S3.1 and S3.2 (the transport, identity, rejoining — the core, tested on the
  fake); then the FFI step for avatars on 480; then S3.3 and S3.4 in the client; then a bench
  run on the Linux machine. By hand with two people: the overlay's picker, an invite accepted while the invited player is in a match of their own
  (the question to leave it), a guest restarted coming back.
- **Left for our App ID** (S4): rich presence's texts, an invite starting a closed game, and the
  lobby list holding only our lobbies.

**Built so far** (2026-11-09): S3.1 and S3.2's core, in `npm run check`. The two ends and their
framing in `server/src/steamP2P.ts` (no Node, so the client's suite runs them); a seat's Steam ID
in the room (`Seat.steamId`, protocol 36) — readmission by it, an old link still held closed,
Remove refusing it; the gateway and `startServer` taking it (`accept(peer, steamId)`,
`localSteamId` for the host's own socket); in the Steam build `steamNet.ts` (the P2P calls and
callbacks, sessions accepted from anyone, link numbers from a random start) and the page's links
over IPC (`pageLinks.ts`, the preload's `linkOpen`…, `client/src/net/steamDial.ts`), and
`steamReconnectTries` (120). On a fake Steam behaving as S1 measured (`fakeSteam.ts`), whole
matches end alike on every page (`steamTransport.test.ts`): clean; a 10 s outage lived through on
the open links; a 90 s one, the session given up, the guest back by Steam ID; and an app restarted
mid-match back in its seat without its token. Nothing yet dials it: joining is S3.3.

**The avatars' FFI, proven on 480** (2026-11-09, Windows): `koffi` 3.3.7 (MIT, prebuilt per
system as optional packages, no compiling) opens `steamworks.js`'s own `steam_api64.dll` and calls
`GetMediumFriendAvatar`, `RequestUserInformation`, `GetImageSize` and `GetImageRGBA`
(`steamAvatars.ts`); in the packaged Steam build, both unpacked beside the app (`package.js`), the
page asked for avatars through its preload and had them as RGBA, 64 × 64. **An avatar is watched,
not read once**: for a player Steam does not know it returns its grey "?" picture at first — even
after the player's first `PersonaStateChange` — and the real one at a later change, 0.5–1.1 s on
(`AvatarWatch` publishes each change, read again at every `PersonaStateChange` of the player and
at 1, 3, 8 and 20 s). On Linux it ran in the bench (2026-11-09, ARCHIVE 15zs). **For S4**, the
third-party licences: done (2026-11-09, ARCHIVE 15zt), `THIRD_PARTY_LICENSES.md` beside every
desktop build's app, written by `npm run licences` from what the builds bundle.

**S3.3 built** (2026-11-09): under Play the lobby's type (Friends, Public, Invite only,
remembered); the host's Steam lobby made with the room (`steamLobby.ts`), its data the listing
(`lobbyData.ts`, tagged `bollfort` with the protocol on 480), open to joins while the table has a
free seat, rich presence's `connect` with it for Friends and Public; the lobby showing the host's
Steam code (`steamCode.ts`, the account number in seven of the codes' letters) and **Invite
friends**; joining — by code, Find a game's rows (Steam's public lobbies), an invite or Join at
start-up or while running — through one `joinSteam`: the host's app asked over P2P where its game
is (`FRAME.ask`/`here`), its lobby joined best effort, its room over P2P; asked while in a game,
the player confirms and the page loads afresh to join; **Back to the match** from the kept match
(`backToMatch.ts`, three hours at most). No name field under Steam: the Steam name. Checked with
one account in the packaged build on Windows: the menu's rows, a Friends lobby made and left, the
code and Invite in the lobby, Find a game read from Steam, no page error. Everything with two
accounts is the bench's, on the Linux machine.

**S3.4 built** (2026-11-09): avatars on the page (`steam/avatars.ts`, asked by a seat's Steam ID,
drawn again as Steam's "?" gives way) on the lobby's seat cards, the score bar and the end screen
(`Session.avatars`, from the room's seats); the language Steam's on the first start
(`languageOfSteam`: German gives Deutsch, else English), the player's choice after. Seen: the host's
avatar on its card in the packaged build. The score bar's and the end screen's need a second person
(a table of bots plays locally, without the room): the bench's first run. Rich presence's texts:
written (2026-11-09, ARCHIVE 15zv) — `steam_display` a token (`PRESENCE_TOKENS` in the config:
the lobby, a match at its round of its rounds, the opening, each also for a tournament), `round`
and `rounds` filled in, the table a `steam_player_group` with its people's count; the files
`assets/steam/rich_presence_english.vdf` and `_german.vdf`, made from `config/locale/` by
`npx tsx tools/steamworks/src/write.ts presence`, a test failing when they are stale; to upload
in Steamworks → Community → Rich Presence once the App ID is ours, and to check on
`steamcommunity.com/dev/testrichpresence`.

**The bench passed** (2026-11-09, on the Linux machine against the VM, ARCHIVE 15zs): every
scenario on the Steam build — start, join, public, private, code, match, lag, outage, reversed and
restart. The host's first answer 3.8–3.9 s every time (`OPEN_WAIT_MS` 10 s); after the 30 s and
90 s cuts the host answered again after 60 and 120 s, the session made again, and the guest's game
in the match each time; a guest killed mid-match offered Back to the match and in it again in
23 s. Avatars on both end screens, `koffi` on `libsteam_api.so` (arnoldex83 has none: Steam's
"?"). The faults were the adapter's, three, fixed. Left by hand with two people: the overlay's
picker, an invite accepted while the invited player is in a match of their own, a guest restarted coming back.

**S3.6 Nobody new joins a running match; a player who left comes back as fast as possible**
(the user's, 2026-11-09; designed and built the same day):

- **Invites and joins are for the lobby only**, before the match starts. A match under way
  takes back only those seated in it; anyone else reaching it — by code, or through its lobby,
  which is joinable while a player is away — is refused as `match_running` ("That match is
  already under way: only its players can come back to it") and leaves the Steam lobby again.
- **The lobby stays joinable while a person's seat is away** (`lobbyOpenness`): Steam's
  joinability is one switch for everyone, and only the lobby reaches a game started by an
  invite, or a player on another device — both arrive with nothing but the lobby's ID. Rich
  presence's Join follows the newcomers' openness alone (the user's: friends would only be
  refused), and the lobby data says `running`, so Find a game leaves it out.
- **The host invites back from the pause menu**: a button for each player away, Invite Bo back,
  with Steam's invite sent straight to that player (`InviteUserToLobby` through `koffi`, as the
  avatars, `steamInvite.ts`) — no overlay, so it works on the Linux desktop too; the button says
  Bo invited for 15 s. The pause menu covers the score bar's cards, so the buttons are there
  alone. Only the host's page shows them (the guests join Steam's lobby only best effort).
- **An invite from the host of the match left goes straight back** (`joinRoute`): a running game
  hears who invited (`GameLobbyJoinRequested`'s `friend_steam_id`), and the inviter being the
  kept match's host, the app dials them over P2P directly, no lobby join on the way. Without
  asking if that match is what is on screen, its link given up; an invite from the host whose
  table the page is at, its link holding, is no news. Anything else goes through the lobby.
- **The host's answer says where the asker stands** (`hereAnswer`, `Room.standing`): seated or
  not, the match started, finished, its round, and the host's Steam name. A join finding the
  asker seated skips the lobby, and the room gives the seat back by Steam ID.
- **Started again with a match kept**, and no invite: the host is asked in the background; while
  the match runs with the seat in it, a prompt over the menu — "Your match is still running: Bo's
  match is still being played (Round 5 / 10). A bot is playing your seat until you are back.",
  **Rejoin** or **Leave it**, which forgets the match (the host's invite still brings the player
  back). Over or unanswered, the match is forgotten and the menu says "That match has ended."
  Back to the match stays in the menu as before, under the prompt.
- **A lobby's seat is held 10 s for a person who dropped** (`reconnect.lobbyHoldMs`, the user's):
  a blip comes back to the seat the host gave them, and the page tries to for as long; then the
  seat is free for anyone. A held seat does not hold up the start and goes to a bot at it. It
  holds for every room, the browser's too, and for a guest who left on purpose — the server
  cannot tell the two apart.
- **A tournament's lobby is any lobby** (the user's): its room has its Steam lobby, its code and
  Invite friends, as a single match's — it had none until now, so teammates could reach it only
  by code — and its matches the same Invite back.
- **Tests**: the room's hold and standing (`room.test.ts`), the routes and the answer
  (`rejoin.test.ts`), the lobby's openness and data (`steamPlay.test.ts`, `lobbyData.test.ts`),
  the host's answer (`steamLobby.test.ts`), and a stranger refused over the fake Steam with the
  match unharmed (`steamTransport.test.ts`). **The bench**: `restart` now rejoins from the prompt;
  `invite`, new, kills the guest at 180 s, starts it again and leaves the prompt, clicks the
  host's Invite back and accepts it on the guest with `steam://joinlobby/480/<lobby>/<host>`, as
  accepting an invite does — checked: the button and Steam's send, Steam handing the running game
  the invite with the inviter, back in the match. If Steam hands nothing over, the page is given
  the invite instead, and that check fails.
- **The bench passed** (2026-11-09, ARCHIVE 15zu): `restart` back from the prompt in 20 s;
  `invite` — the button, Steam's send, Steam handing the running game the invite with its
  inviter, back in the match 22 s after the restart; `join`, `public`, `private` and `code` again.
- **Left for our App ID** (S4): an invite starting a closed game (on 480 Steam would start
  Spacewar), which then comes back through the lobby.
- **The by-hand check named "an invite accepted during a match"** means the other thing: the
  invited player is in a match of their own when the invite arrives, and is asked first whether
  to leave it (S3.3). Not joining a running match.

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
- **The store page — prepared** (2026-11-04 to 2026-11-06), all but what needs the account:
  the texts in English and German, the tags, features, languages and system requirements, ready
  to type in, in [`STORE_PAGE.md`](./STORE_PAGE.md), with what is still open there (§5). In
  `assets/store/`: the capsules and the library's art and logo, eight screenshots, the shortcut
  icon (Minimal's B, also the desktop app's), and the description's loops. The trailer, 55 s at
  half the screen's shake, is `trailer-build/half/BollfortTrailer.mp4` (not in git), made again
  by `docs/TRAILER.md`; its music credited in its description: _Music by Viacheslav Starostin
  from Pixabay_ (Pixabay Content License), linked to `https://pixabay.com/users/starostin-46826676/`.
  How each was made and chosen: ARCHIVE 15zn (the art and the trailer) and 15zo (the texts, the
  loops, the icon). Remade by `tools/storeart` against the dev server:
  `npm start -w @bollfort/storeart -- assets/store final` for the capsules, `npm run shots` for
  screenshot candidates, `npm run trailer` for the trailer and (`TRAILER_SET=loops`) the loops' clips,
  `sh tools/storeart/loops.sh` for the loops, `npm run icons` for icon candidates.
- **Coming Soon** for at least two weeks; submitted for review at least 7 working days before.
- **The depots**: Windows and Linux, the unpacked app (not the AppImage) under the Steam Linux
  Runtime, the binding's native module for each, no `steam_appid.txt`.
- **The release job — prepared** (2026-11-09, ARCHIVE 15zv): `release.yml`'s job `steam`, after
  the build job, takes the two Steam folders it packaged, writes the app build script
  (`tools/steamworks`, `write.ts app-build`: each folder whole to its depot, `SetLive` the beta
  branch — Steam never sets the default branch live from a script) and runs `steamcmd
+run_app_build`. It stays off until the repository's variables name the app and depots. **To
  switch it on** once the App ID is ours:
  1. In Steamworks: the beta branch with a password; the two depots (Windows, Linux, each marked
     for its system) in the package; a launch option for each (`bollfort.exe`, `bollfort`).
  2. A build account of its own, with only Edit App Metadata and Publish App Changes To Steam;
     on any Linux machine, `steamcmd +login <name>` once by hand, its password and Steam Guard
     code typed, then `info` and `quit`; its `config.vdf` (under `~/Steam/config/` or steamcmd's
     own `config/`) base64'd into the secret `STEAM_CONFIG_VDF`, its name into `STEAM_USERNAME`.
  3. The repository's variables `STEAM_APP_ID`, `STEAM_DEPOT_WINDOWS`, `STEAM_DEPOT_LINUX` (and
     `STEAM_BRANCH`, if not `beta`).
  4. `STEAM_APP_ID` in `packages/desktop/src/steam.ts` from 480 to ours, and the lobby tag on 480
     (`lobbyData.ts`) reconsidered.
  5. A first upload as a preview (`write.ts app-build … --preview`, steamcmd by hand) to check
     the script; then a tag. The user promotes a build by hand. The GitHub release goes on as now.
     Left to confirm at the first upload: where steamcmd on Linux reads `config.vdf` (the job writes
     both places), and that the Linux depot keeps the programs executable (the job sets them so).

### 9.3 The users' test and the launch (S5)

- **Keys** for the testers (up to 2,500 for testing, free), on the password-protected beta branch.
- **The checklist**, [`STEAM_CHECKLIST.md`](./STEAM_CHECKLIST.md) (written 2026-11-06, the spike's questions first), run before every Steam build:
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
  - the Deck: a Deck owner the user knows tests it, the build and its steps prepared so that
    he can (2026-11-09).
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
- The rich presence localisation file's shape: Valve's two pages show two (`"Language"` and
  `"Tokens"` inside `"lang"`, as written; or the language as a block holding `"tokens"`). The
  first upload settles it.
