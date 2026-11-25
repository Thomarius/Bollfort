# Bollfort

A multiplayer-only castle siege game, in TypeScript, after a 1990 arcade game ("the
original" in these docs). Shoot down opponents' castle walls, then race to rebuild your own
before the next barrage. Fail to seal a castle and you spend a life; run out of lives and
you are out.

**The name is Bollfort, never Bollwerk nor the original's** (renamed Bollwerk 2026-10-02,
ARCHIVE 11zw; Bollfort 2026-11-03, ARCHIVE 15zh, since another game of that name is coming and
the word is a live mark in games' classes; the repository is `Thomarius/Bollfort`, the local
folder still `RampartRemake`). **The original's name is a trademark of another company and is
named in two places only** (a lawyer's advice, 2026-11-11, ARCHIVE 15zx): the in-game Credits'
disclaimer (`credits.disclaimer` in `config/locale/`) and the README's. Not in the menu, the
desktop window, the release notes, `CREDITS.md`, anything on Steam nor new docs — write "the
original". Nothing of the original is used — no code, graphics or sound.

**Every audio file must be credited** in `config/audio.manifest.json` (`credits`, by path:
title where known, author, licence, source, changes), or by its folder's credit — a key
ending in `/`, which is how the sound effects, all CC0, are one line (`sfx/`). `npm run
credits` writes `CREDITS.md` from it, and a test fails when that file is stale or any file
is uncredited. Every sound is from OpenGameArt.org, but three music tracks and the styles' 21 from
Pixabay (Pixabay Content License, credited to their authors as they ask). **Every npm package a
build ships has its licence** in `THIRD_PARTY_LICENSES.md`, written by `npm run licences`
(`tools/licences`) from what the builds actually bundle and carried beside the desktop app; a
test fails when it is stale, so run it after adding or updating a dependency.

**Who made it** is credited in one place, `config/src/credits.ts` (`GAME_AUTHOR`, `PLAY_TESTERS`
by the nicknames they chose, `COPYRIGHT_YEAR`), read by the in-game Credits and `CREDITS.md`; a new
tester goes there and into the README's first line. The code is MIT, © 2026 Thomas Arnold, in
`LICENSE`, which the desktop app carries beside it.

**`docs/PLAN.md` is the design and the open work** — read it before changing rules,
terrain or bots; a design of its own lives beside it until built, then is retired into the
ARCHIVE — except **`docs/SPECIAL_TOWERS.md`**, finished but kept as the towers' reference (the
user's, 2026-11-09): their rules, costs and balance, which the code cites by section. **`docs/ARCHIVE.md`** records how each decision
was reached, with the measurements and the reverted attempts; consult it before re-trying
something. This file is the orientation.

## Commands

```bash
npm install
npm start                           # build, then serve the game at http://localhost:8080
npm run check                       # format, lint, typecheck, test — must pass before committing
npm run credits                     # CREDITS.md, from the audio manifest's credits
npm run licences                    # THIRD_PARTY_LICENSES.md, from what the builds bundle
npm run supporter:check             # the private supporter package, where checked out (npm run check runs it)
npx tsx tools/steamworks/src/write.ts presence   # rich presence's files for Steamworks, from config/locale/
npm run soak                        # the weekend soak again (ARCHIVE 12h), resumable; --list, --trial, --summary
npm run build                       # client + server bundles, both needed by the image
npm run dev   -w @bollfort/client   # play offline at http://localhost:5173
npm start     -w @bollfort/server   # serves the built client at http://localhost:8080
npm start     -w @bollfort/headless -- --matches 8 --players 3 --level 5 --stats out.csv
npm start     -w @bollfort/headless -- --map --players 3 --seed 2   # print a map as ASCII
npm start     -w @bollfort/headless -- --map --campaign 6 --players 1 --seed 2   # a campaign level's map
npm start     -w @bollfort/headless -- --replay recordings/ --stats human.csv   # recorded human play
npm start     -w @bollfort/headless -- --replay recordings/ --achievements   # the Steam achievements each seat would have earned
npm start     -w @bollfort/headless -- --matches 4 --level 6 --record /tmp/rec   # bot matches as recordings
npx tsx tools/headless/src/placements.ts [/tmp/rec]   # where each piece's cells ended, people or bots
npm start     -w @bollfort/headless -- --tournament --count 400 --league --double  # tournaments by rolls
npx tsx tools/headless/src/shotStats.ts recordings/   # every shot: accuracy, misses, guns' tempo, range
npx tsx tools/headless/src/shotStats.ts --bots 1,5,10 --matches 4 --players 4  # the same for bot tables
npx tsx tools/headless/src/towerSoak.ts --out soaks/x --pairs architect3:none --levels 3,5,8  # tower balance, resumable
npx tsx tools/headless/src/buildStats.ts recordings/ --alias You=Thomas  # castles, ground, guns firing, pieces, by round
npx tsx tools/headless/src/botReplay.ts recordings/<id>.jsonl --watch 2 --rounds 4-7  # a local match again, live bots
tools/screenshots.sh /tmp/shots [scene...]   # client in fixed states, against the dev server
npm start     -w @bollfort/storeart -- /tmp/art [asset...]   # Steam's store art candidates and a contact sheet; `final` the chosen set
npm run shots -w @bollfort/storeart -- /tmp/shots [shot...]   # Steam's screenshot candidates, a player's view, and a contact sheet
npm run trailer -w @bollfort/storeart -- calibrate|record [clip...]|captions|assemble   # the trailer, filmed live (docs/TRAILER.md); TRAILER_SHAKE=0.5 is Steam's
TRAILER_SET=loops npm run trailer -w @bollfort/storeart -- record   # the store description's scenes (TRAILER_LANG=de for the banners')
sh tools/storeart/loops.sh          # the store description's loops, cut from those scenes into assets/store/description/
npm run wallpapers -w @bollfort/storeart -- /tmp/wp [design...] [--all-splits --supporter]   # desktop wallpapers, 2560x1440 (ARCHIVE 16zg)
npm run icons -w @bollfort/storeart -- /tmp/icons [castle|ring|letter|keep|bare...]   # app icon candidates in every style, at 184 and 32 px
npx tsx tools/storeart/src/sysreq.ts NAME [--fullscreen] [--affinity 0x5] [--round 8]   # the packaged app's memory, processor and frames, eight bots (Windows, Linux)
npx tsx tools/steambench/src/bench.ts [join public private match lag outage reversed restart]   # multiplayer over Steam against the VM (STEAM.md 3.4)
npm start     -w @bollfort/desktop  # the desktop app, after npm run build
npm run package -w @bollfort/desktop # its portable file for this system, into packages/desktop/release/
```

`npm run check` takes a few minutes, mostly bot matches. Run it in the background and
wait rather than assuming it hung.

Client dev query parameters: `?autostart=1&players=3&seed=7` (a random seed without it),
`&snapshot=build` to jump to a phase (`&round=N` for one deep in a match, `&idle=1` to
leave your seat undriven on the way, so you are soon knocked out), `&speed=10`,
`&perf=1` for the frame-time readout (ARCHIVE 12n: a fixed 30 s window, Copy for the figures),
`&bots=thread` to keep a local match's bots off their worker (ARCHIVE 13k),
`&style=flat|pixel|night|cyberpunk|blueprint|parchment|bricks|glass|chocolate|halloween|sakura|oktoberfest|opera|office|undersea|electric|cartoon|christmas|noir|sports|pirates|anime|mythology|wildwest` for both looks (a one-look style sets only its own)
(`&buildStyle=`, `&combatStyle=` for one), `&watch=1&level=8` to observe a bot match (`&personality=offensive` fixes every bot's),
`?campaign=1&level=N&difficulty=normal|veteran|easier|harder` a campaign level alone (CA1), `?demo=1` the demo at once (`&speed=10` to cycle its matches), `?tutorial=1` the tutorial at once
(`?tutorialOffer=1` the first start's offer of it again, `docs/TUTORIAL.md`),
`&rounds=12` for the round cap, `&specials=1` for special towers (`&tower=bertha3`, a tower at its cost, the person's),
`&teams=2` for teams of two in seat order, `&storeArt=scene` the board alone with the title over it (`&title=`, `&titleWidth=`, `&shade=1|band`, `&split=0.5` a change of look held still; `?storeArt=logo` the title alone, transparent), `&autopilot=1` a bot plays the person's seat, shown as a person plays it (the ghost, the reticle), `&clean=1` without the corner's buttons, `&labels=0` no words on the screen but a phase banner's (`&timer=0` without the big countdown too), `&reticle=0` no aiming cursor nor towers' emblems, `&shake=0.5` the screen's shake at a strength (`0` none), `&cameraZoom=1.9&cameraOn=you|duel` the camera held close in play, `?icons=sheet` every style's cannon icon side by side, `?icons=app&kind=castle|ring|letter|keep|bare` the app's icon candidates
(`?icons=boards` each style's board, for checking a refactor pixel for pixel), `?gaps=preview`
the corner gaps' ping in every style, `?shots=preview` every style's cannon and Bertha shots in flight, `?drones=preview` every style's Drone Tower drones, enlarged and on its board, parked and in orbit, `&lang=de` (or `hes`) for a
language (not saved), `?askName=1` the first visit's name window again, `?supporter=1` the supporter styles where the private package is checked out
(not saved). `?tournament=new` and `?tournament=resume` open the tournament screens,
`?tournament=demo&seed=N` a tournament of teams of two between matches (saved as `t-demo`), and
`&snapshot=game_over` plays a tournament's match out at once, its result counted. `?host=8` opens
the lobby at eight seats — a room if a server answers, a local table if not —
`?join=CODE` joins one, `&name=Bo` sets the name, `&seed=N` the map, `&private=1` keeps
the room unlisted (every room is public otherwise). The menu's Play, its Find a game window
and Join reach the same lobby, which sets the map, players, teams and bot levels; the
rounds and lives are the config's, no longer offered in a lobby or a new tournament (2026-10-28).

## Layout

| Package          | Contents                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| `config`         | Zod schemas, typed defaults, cross-file validation. Reads `config/*.json`. |
| `sim`            | The deterministic game core. No DOM, no Node, no I/O.                      |
| `protocol`       | Wire messages and validators.                                              |
| `ai`             | Bots: min-cut sealing, 0-1 BFS attack, skill levels and personalities.     |
| `analysis`       | Per-round match statistics, for bot soaks and recorded human play alike.   |
| `tournament`     | Tournament mode's core: schedule, brackets, quick rolls, saves. No DOM.    |
| `campaign`       | Campaign mode's core: a level's ruleset from the campaign config. No DOM.  |
| `server`         | Authoritative match server, rooms, WebSocket, match recordings.            |
| `client`         | Pixi renderer, 24 visual styles, controls, HUD, netcode client.            |
| `desktop`        | Electron app for releases: the game, its server's panel on request (PG2).  |
| `tools/headless` | Bot-vs-bot soak runs and map dumps.                                        |

Internal packages export TypeScript source directly, so there is no build step between
them. The production image bundles the server with esbuild; development never does.

## Four things that are not negotiable

**The simulation is deterministic.** `(seed, ruleset, ordered input log)` must always
produce one identical match. The server sends _actions and the tick they landed on_, not
board state, and every client replays them — so any nondeterminism is a desync, not a
cosmetic bug. `Math.random`, `Date.now` and `performance` are banned in `sim` and `ai` by
lint rule. `Math.sin/cos/sqrt` are implementation-approximated per spec, so `trig.ts` and
`math.ts` provide exact replacements. Anything the sim must choose for a player comes
from `streamFor(seed, name)`. Every 30 ticks the server sends a state hash and clients
check it.

**Nothing derivable is transmitted.** Terrain and the piece queue are regenerated from
the seed. The ruleset travels in the snapshot, because a client on different rules would
desync rather than merely look wrong.

**No rule is hardcoded.** Every tunable lives in `config/*.json` behind a strict schema —
an unknown key is an error, not a silent default.

**The server owns identity.** It overwrites the `player` field of every incoming action
with the sender's seat, so a client cannot act for someone else.

## The rules, where they differ from expectation

Full detail in PLAN.md §1. The parts that surprise people:

- **One island, copied into a pattern.** An island is drawn in a box with rounded
  corners, trimmed to its land, then stamped by translation and mirroring — both exact, so
  every island is pixel-identical at every player count. 2–8 players; grids at every count
  but 3, which is a ring (a short last row is centred), and three teams of two, who play on
  a compact hex of six, wide rather than fair (`teamSize` patterns, ARCHIVE 12zs, 13c). **The map's size is measured from the island and the pattern, not
  configured.**
- **A wall must turn its corners.** The escape flood is 8-connected while the wall is
  not, so a diagonal join does not seal. The coastline is worth nothing.
- **Only walls are destructible**, and a shot removes exactly the tile it hits — and only
  an opponent's. `fire()` refuses your own island, and an eliminated player's rubble is
  indestructible.
- **The main castle** — the one chosen, afresh after a continue — earns the first
  castle's reward only while it is sealed; every other castle earns one. It wears a crown.
- **You see where only your own shots will land**, and bots know no more: they avoid
  tiles their own shots are headed for, not anyone else's.
- **Cannons go inert outside sealed territory.** This is the game's main corrective and
  the source of most bot trouble.
- **A pocket counts.** Sealed ground with no castle is territory — guns, points — while
  its player holds a sealed castle anywhere, as in the original; it never saves a round
  on its own (`enclosure.castlelessRegionsCount`, PLAN §1.3).
- **Ground and guns score, not castles** (2026-10-14, ARCHIVE 13zd): a tile of sealed
  territory is a point however many castles hold it, and each gun firing after the
  resolution earns `gunPoints` — so a castle pays through its guns. The old rule, tiles ×
  castles, is still the schema's default (`castleMultiplier`, `gunPoints` 0) so old
  recordings replay; the default ruleset sets the new one. One formula, `heldPoints`.
- **Flight time _is_ the reload** — a cannon cannot fire again until its shot lands.
- **The starting ring is 8x8 around a 6x6 interior.** A castle sits centred in it, so the
  free band is two tiles wide and a 2x2 cannon spans it: opening cannons must touch the
  wall. Geometry, not a bot failing.
- **Continues**: failing to seal spends a life, wipes the island, and hands back a fresh
  castle and ring. It also rewinds that player's piece schedule to round 1, which is why
  `build.sharedPieceSequence` is false. The rewind is required, the user's decision
  (2026-10-05, ARCHIVE 12k): it is not to be measured or questioned again.
- **Orphaned wall is swept in one pass**: blocks with fewer than two orthogonal wall
  neighbours are marked against the board as it stands, then go together. A run of three
  keeps its middle. Stranded wall stays as an obstacle.
- **The piece set widens by round**, and one-cell pieces stop being dealt after the early
  rounds — so a one-tile gap with no free neighbour can never be filled.
- **Overtime**: when the build clock runs out, everyone may still place the piece they
  hold, within three seconds, and no more.
- **Special towers** (a table's switch, off by default): a tower is bought in the cannon phase
  for 2 or 3 of the cannons a round earns, never at the opening, once a round, three at most on
  the island, and nothing is saved towards one — so cost 3 needs a second castle held. A ready
  impact tower (Big Bertha) always fires first, whatever the click aims at. `docs/SPECIAL_TOWERS.md`.
- **Every match is a team match**; free-for-all is teams of one. Teams share a score (the
  sum of their members') and a pool of lives, and a member failing with the pool empty
  takes the whole team out. Teammates may build on each other's islands — people only by
  default. A placed block belongs to the island, not to whoever placed it.
- **Seats are shuffled onto islands at the start**, server and local alike — except three
  and four teams of two, dealt onto one of the pattern's fair `teamLayouts`, drawn by
  weight, so every team stands alike (`seatOrder`, ARCHIVE 12zs). Player p still
  owns island p + 1; the room tells each connection which player it has become, so never
  assume the first seat is player 0. **Teams belong to seats**, and the host chooses who
  sits where; the seed is fixed when the table is set, so the lobby shows the real map.

## Status

The latest release is **v0.11.2** (2026-11-20): protocol 37, recording format 4 — a test session
needs the server rebuilt and every page reloaded after either changes. Releases before v0.10.3
were deleted with their tags, since their notes and menu named the original (ARCHIVE 15zx); the
history was rewritten without AI attribution lines before v0.10.0, the old hashes in
`recordings/commit-map.txt`. **What is built, and how each decision was reached, is in
`docs/ARCHIVE.md`** — read its entry before reworking anything below. In brief:

- **The game** (ARCHIVE 10u–12zk): its rules, online rooms, Find a game, pause, recordings, team
  matches, bots of levels 1–10 with personalities, tournaments (`packages/tournament`, ARCHIVE
  12ze–12zr), a demo behind the menu (15m, never recorded), a tutorial on rails (PLAN §11 item 12,
  `docs/TUTORIAL.md`, approved by the user 2026-11-23), How to play (14zq), the end screen
  (15k), achievements' detector (16a), the island zoom (16j: the player's own island fitted to the
  screen in the build and cannon phases, by a magnifier on its corner or a pad's RB; a setting
  Off / Start out / Start in, applied as each build phase opens; never in combat; the wheel may
  zoom instead, a setting).
- **Bots** (ARCHIVE 12x–13zi, 16d): build phases played out in advance (13zf), misses as people
  miss (13r), people's building pace (13v). Thomas plays at about Level 6, Mausica at 2–3 — the
  yardstick bots are tuned against. The learning work is closed (13zg).
- **Balance** (ARCHIVE 12h): the weekend soak found the points game on target. **Change no rule
  without a very good reason**; `npm run soak` reruns it.
- **Special towers** (ARCHIVE 13zk–15u, `docs/SPECIAL_TOWERS.md`): ten, **off by default for
  good** — a wacky addition, not the base game. The Drone Tower, firing by itself near its owner's
  last shot, replaced the Rapid Cannon (16r, 2026-11-20); the Rapid's rules stay for old
  recordings, never offered (`RETIRED_KINDS`). The Fortified Tower, wall no shot clears that
  fires, was tried and kept as the tenth (16z, 2026-11-22). A new tower is balanced at Level 5
  only, its variants against each other and against no tower (the user's).
- **The looks** (ARCHIVE 11zy–14y, 16g): 24 styles, each with its own corner piece, climax,
  banner, HUD skin, title, finish, cannon icon and (all but Minimal, Medieval, Night) music
  (14za); every style in one registry (`client/src/styles/registry.ts`), the Wild West the model
  of a self-contained one. 58–60 fps at eight players on an integrated GPU (12n) is the bar.
- **Languages**: English, German and Hessian (`hes`, the user's joke after Badesalz, its
  disclaimer German; ARCHIVE 15z). A text is a key until shown (`t` in `client/src/i18n.ts`); a
  new text goes into every locale file, or `locale.test.ts` fails.
- **Releases and networking**: the desktop app (ARCHIVE 11zp–11zt); UPnP (12j) and a Cloudflare
  quick tunnel (14zk) as switches in the desktop app, never in the image; Docker deployment
  verified by CI only, since there is no Docker here.
- **The supporter styles** (ARCHIVE 16g, 16h; STEAM.md §6.1): new styles kept out of every public
  build in the private repository `Thomarius/bollfort-supporter`, checked out as `supporter/`
  (git-ignored; not under `packages/`, every folder of which is a workspace). The public stub
  `styles/supporter.ts` is answered by `client/supporterPlugin.ts` on the dev server and in
  tests when the package is there, in a production build only with `BOLLFORT_SUPPORTER=1`, and
  the styles are shown only with `?supporter=1`; `supporter/assets/` is served at the public
  URLs, and `?supporter=1&page=NAME` opens a page of the package's. Each style's design and record
  are in `supporter/docs/`, never in this repository. Free game or paid pack is decided later.

**Next** — PLAN §11, towards a first feature-ready version:

- **The users' play of the first supporter style** (2026-11-14), then the next styles (SP4).
- **Campaign mode** (PLAN §11 item 14; `docs/CAMPAIGN.md`, approved 2026-11-25): one to three
  people against an enemy fleet over six levels, co-op online, saved between levels; being built,
  CA1–CA2 done (a solo level on its own generated map, `?campaign=1`), CA3 next. A mode of its own: never a change to versus rules or
  hashes. Where the design lacks a number, the local reference notes it names are the fallback.
- **An online session** (PLAN §11 item 5, to be scheduled with the users): the open games
  listed and a room's code with the real server, a tournament match's end and a person's Rematch.
- **Steam** (PLAN §11 item 8; `docs/STEAM.md`): a free release, the whole game and every style,
  no DLC (the user's, 2026-11-03). Done: N, R, K, B, T, C, S1–S3.6 (ARCHIVE 15zh–15zw), the store's
  material (15zn, 15zo, `docs/STORE_PAGE.md`), and achievements AC1–AC4 (15zz–16c,
  `docs/STEAM_ACHIEVEMENTS.md`). **Waiting on Valve's answer to the Steamworks registration**
  (2026-11-11) for S4 — the fee, the App ID, the release job's Steam upload switched on (STEAM.md
  §9.2), the store page typed in — and AC5. Until then everything runs on App ID 480:
  `BOLLFORT_STEAM=1` builds the Steam app (`steamMain.ts`, into `release/steam/`);
  `BOLLFORT_ACHIEVEMENTS=spacewar` tries the achievements (an `autostart=1` match never counts:
  drive the menu); the Steam bench (STEAM.md §3.4, `tools/steambench`) plays this machine
  against the VM `bollfort-guest` and its second account. Under Steam on Linux the app must
  start without Chromium's sandbox.

Closed for good: the bot learning work (ARCHIVE 13zg) and French (the user's decisions). Signing
the Windows app was explained (PLAN §12) and is not pursued for now.

**Declined for budget** (PLAN §12): macOS builds (Apple's paid signing) and a hosted public
server. This is a fan project with no budget: propose nothing that costs money to run.

**Working with the user**: every match they play is recorded in `recordings/`; they send
compiled feedback, which is triaged with them before anything is built, and design
questions are asked before coding. Commits and pushes are theirs to approve, each time.
**Mouse, or a controller through the same actions** (their rule, amended 2026-11-02 for
the Steam Deck, STEAM.md §8): everything is played with the two mouse buttons and the
wheel — the right button or the wheel turns the piece — and every other action has
something on screen to click (the island zoom its magnifier; the wheel may zoom instead of
turning, a setting, the right button still turning); a controller only ever does what the mouse already can. No
keyboard shortcuts; Esc for pause is the one agreed exception, beside its button.

## Making a release

The desktop app (`packages/desktop`, ARCHIVE 11zp–11zt) is built for major versions only,
never for every change.
`.github/workflows/release.yml` builds the Windows portable `.exe` and the Linux `.AppImage`
on their own systems: run it by hand from the Actions tab with a version to get the two
files as the run's artifacts, to try first; push a tag `v1.2.3` to build them and publish
a GitHub release of that version. Locally, `npm run build` then
`npm run package -w @bollfort/desktop` makes the file for this machine. Both are unsigned:
Windows warns of an unknown publisher on first start, and an AppImage must be marked
executable. Electron's own binary, for `npm start -w @bollfort/desktop`, is fetched by
`node node_modules/electron/install.js` when `npm install` has not; CI and the image skip
it (`ELECTRON_SKIP_BINARY_DOWNLOAD`).

## Measuring the bots

`npm start -w @bollfort/headless -- --stats FILE` writes a row per player per round,
sampled at the resolution that ends each build phase — castles sealed, cannons owned and
active, cannon room, pockets, wall tiles, pieces placed against the pieces the level had
time for; each row names the seat's `level` and `personality`.
A summary goes to the console. `--level 8,5,2` sets each seat
separately (old tiers: recruit 2, gunner 5, marshal 8, baron 8 offensive),
`--personality offensive` (trait values joined by `-`, one per seat by comma) fixes
personalities and `dealt` deals them from the seed as a match does — soaks are balanced
unless asked, so they measure what they say — and `--max-rounds N|none` overrides the cap. Rows also carry points banked and,
for diagnosing failed rounds, `repairAtBuild`, `repairLeft` and `repairStuck`: what the
tightest seal needed as the phase opened, what was still missing at its end, and how much
of that no piece in the bag could fill. Prefer this to watching; watching is for forming
the hypothesis.

**Human play is recorded** into `recordings/` (git-ignored): every match the server runs,
and every local match a page served by it plays, one `<id>.jsonl` each — header, the
actions of each tick, end (`protocol/src/recording.ts`). A dev-server page has nowhere to
send them and records nothing, as does `&snapshot=`. When a match ends the server writes
its statistics beside it, `<id>.stats.csv`, the same table a bot soak's `--stats` writes,
a person's seat labelled `human`. `--replay` does the same for any recordings by hand — an
abandoned match, or new columns over old sessions — and says whether each replay was
exact. One switch turns all of it off: `recordings.enabled` in `config/server.default.json`.
**A packaged desktop app never records** (`record: !app.isPackaged`, STEAM.md package R), the
GitHub builds and the Steam build alike: test sessions are recorded on `npm start`.
The statistics code is `packages/analysis`, shared by the server and the harness. A
recording replays exactly only against the code that made it, since the rules travel in
its header but the simulation does not — so the server stamps each header with its commit
(`-dirty` if the tree had changes), and `--replay` names it.

## What has already been tried, so it is not tried again

- **Scaling fire rate with cannon count** made matches _longer_ and flattened the skill
  ordering. Reverted.
- **Ambition is a liability for survival**: a marshal walling three castles lost to a
  gunner walling two, so it is bounded at two. Points scoring did _not_ invert this:
  lifting marshal to three changed nothing, because bots rarely hold two.
- **A wider room band** (`ROOM_RADIUS` 3 -> 4) is badly worse under points too: one win in
  twelve, rounds forfeited 26% -> 43%.
- **Making gunner purely defensive** produced six draws in eighteen — a turtle is very
  hard to kill.
- **Three castles per island rather than four, closer together.** Measured and reverted:
  gunner went from one unfinished match in eight to five in six. Fewer castles means
  fewer candidate walls and the survivors are tighter.
- **Widening the starting ring to 10x10** fixed opening cannon clearance and was reverted
  for fidelity to the original; continues absorb the early knockouts it guarded against.
- **Dropping wall thickening from a bot's priorities** changed nothing on its own (13
  wins of 20 against two gunners, then 12), and dropping it while expanding eagerly did
  worse (9). Eager expansion with thickening kept looked best at 14 of 20, but at forty
  matches it tied marshal (28 against 29): the `baron` tier is that, kept for variety.
- **Bot tactics measured and dropped** (ARCHIVE 11y): a penalty for leaving an unfillable
  one-tile hole (no effect — those holes come from shots) and thickening the side facing
  opponents first (raised forfeits). And "close gaps from the outside" applied to every
  plan thinned walls 14%: it is applied only while repairing.
- **A defensive bot opening from the castle farthest from opponents** had half the guns
  and won 2 of 24: that castle is on the outer edge, hemmed in by sea (ARCHIVE 11zb).
- **Rounder islands** read better but meet their neighbours at points with open sea
  between, and flight time is the reload: corner radius 6 is the roundest that kept the
  channels (ARCHIVE 11zc).
- **Wider rings round the castles as planned strategies** (room 3 to 10, every castle with
  room 2 to 6; ARCHIVE 13zi): even played out exactly, they raised Level 6's ground only 96 → 100. The gap was caution in widening, not the walls on offer.
- **Raising flight time further** to force exactly three salvos drops the rate below the
  original's three and makes close shots slower. The spread of ranges makes "exactly
  three for everyone" unreachable without flattening distance-scaling entirely.

## Hard-won gotchas

- **A minimum cut is the _tightest_ wall that works** — exactly the wall with nowhere to
  put a gun, and the most fragile one. Nearly every bot problem traces back to this.
- **`cannonsToPlace` is zero for the whole build phase**; it is set at the resolution that
  ends it. Judge cannon room against the reward about to be earned.
- **`enclosedCastles` is refreshed by placements, resolutions and a build phase opening,
  not by shots landing.** It is legitimately 0 mid-repair, and through combat and the
  intermission after it still says "sealed" for a breached wall. Do not assert on it except
  at a resolution; a bot deciding on it must count afresh with `computeEnclosure`, which is
  what cost the bots a quarter of their rounds. The refresh as the build phase opens is
  needed for a build phase rolled out in advance to come true (ARCHIVE 13zf).
- **A bot plans its build phase in the intermission** (`ai.planning`, ARCHIVE 13zf):
  it plays strategies out on a snapshot, a simulated look at the board at a time within
  the table's `stepsPerTick`, and lays the best rollout's pieces on their ticks. Anything that
  makes one step dear (a loop inside `RolloutRun.advance`) shows as a hitch at every phase.
  A whole-match test of the ladder must pass `plansAhead: false`, or it plans every strategy
  with no budget and runs for minutes.
- **A bot values a wall by `wallValue`, not by points alone.** Under ground-and-guns scoring a
  castle adds only its tiles at its resolution; valued so, the widening walled a strip of land
  rather than the castle beside it. Its guns, at the planning's `weights.gun`, are what make
  it worth sealing — and only as many as the wall leaves room for (the user's rule).
- **A bot's build may read only its own island.** Anything it reads from elsewhere, such as
  another island's wall in a search across the map, makes its phase depend on its
  neighbours, and a rollout can no longer predict it. `rollout.test.ts` catches it.
- **Headless Chrome cannot verify anything time-dependent in the client** by virtual time: a
  watched match is still on round 0 after 120s of it at 10x speed. Pull the logic into a pure
  function and test that, as `banners.ts`, `lobby.ts` and `scores.ts` do. It can still be
  _looked at_: in real time, Playwright's screenshot command renders fine, and
  `tools/screenshots.sh` uses `&snapshot=PHASE&round=N` plus a wait to reach a state —
  an announcement, the final round, game over. And it can be _watched_: launched with
  `--enable-gpu --use-angle=gl --ignore-gpu-blocklist`, a watched match at `&speed=4` plays out
  in real time, and temporary `console.log`s read through Playwright's `console` event are how
  the Random looks' lost styles were found (ARCHIVE 13e) — removed before committing.
- **A test asserting "failing to seal ends your match" needs `withoutContinues`**, and so
  does anything measuring the piece-size ramp: a continue rewinds the schedule, so the
  build rate climbs back instead of falling.
- **Tune shot flight against round one, not the match average.** The average hid long guns
  firing twice while close ones fired six times.
- **A one-tile gap between a cannon and water cannot be filled** once one-cell pieces stop
  being dealt. That is why `placeCannon` weighs clearance from wall and shore ahead of
  range.
- **Anything visual scaled by flight time breaks when the reload is tuned.** The shot arc
  went off-screen when flight tripled; it follows range now (`shotLift` in `theme.ts`).
- **`Int32Array.fill(Number.MAX_SAFE_INTEGER)` truncates to -1**, which silently disabled
  target selection for an entire tuning session.
- **Measure both seats.** Position carries a real advantage; a 19-1 record looked like a
  coin toss when only seat 0 was tested.
- **"Fits" and "varies" are different questions.** An island that nearly fills its box
  generates fine and produces the _same map for every seed_.
- **Prettier reflows code, so string-replace patches silently miss.** Assert on every
  replacement.
- **The static handler answers an unknown path with `index.html` and a 200.** A missing
  asset is not a 404 — audio decides a sound is absent by its failure to decode, a track by its
  first bytes (`isAudioData`).
- **Music is never decoded whole** (ARCHIVE 14b): every audio file is fetched once behind the
  loading screen, the sounds decoded, each track kept compressed and played by an `<audio>`
  element through the music bus. Decoded, the thirteen minutes of shared music took 277 MB of the
  page's memory; with the styles' tracks there are 57. The server's `ETag` and 304s let the browser keep every file between visits.
- **Check nothing stale is answering.** A git worktree sharing the main checkout's
  `node_modules` resolves `@bollfort/*` back into the working tree and measures the new
  code twice; a server left running on 8080 answers instead of the one you just built.
  Identical state hashes either side of a change mean the code did not load.
- **The HUD's banner layer holds more than the announcement**: island banners, team tags,
  the big timer, the cursor count. Replacing its children for each announcement detached
  the rest, which went on updating nodes no longer on the page. Screenshots taken with
  `&snapshot=` skip the announcements and could not catch it; watch a phase change.
- Removing a rectangle's **corner** does not breach it under 4-connectivity; use a
  mid-edge tile in tests.
- **`weakestWall` only aims at sealed castles** (`castle.enclosed`), so an ASCII test board
  needs `applyEnclosure` first — which also sets guns outside sealed ground inert.
- **Before-and-after soaks**: `git stash`, run, `git stash pop`, then run again — and edit
  nothing while a background soak runs, since the stash swaps the files under it. Attribute
  a change of several parts with a temporary switch per part, removed before committing,
  and check the final code reproduces the measured variant's hashes.
- **The Bash tool's heredocs mangle patch scripts**: a backslash is lost (a `\s` became
  `s`, and a parser split words on the letter "s") and template literals with backticks
  break the quoting. Write patch scripts with the file tool, or edit directly.
- **Stopping a background `npm start` leaves its node child serving the port.** Find it by
  port and check its command line before killing it; remove any recording a test match
  left in `recordings/` — that folder is the user's tuning data.
- **`destroy({ children: true })` keeps every `Graphics`' own drawing**: Pixi hands the
  options down, and a `Graphics` destroyed with any keeps its context, registered with the
  renderer for good. Use `release` (`render/release.ts`); a look thrown away also empties
  Pixi's `BigPool`, whose free batches hold old buffers (`Scene.drop`, ARCHIVE 12q).
- **A bloomed layer blurs everything in it**, and each `BlurFilter` costs a screen-sized
  texture and its passes whatever it holds. Sharp cores go in an added layer never bloomed
  (Cyberpunk's `effectCore`), and blurs run at half resolution (ARCHIVE 12r).
- **A `StampBook` retires its shapes when the tile size changes**, and a stamp not placed again
  in that frame — a layer of a look readied out of sight, not yet drawn at the new size — would
  show a destroyed context, which Pixi throws on (ARCHIVE 15a). `retire` empties and hides such
  stamps first; a book's shape is only ever shown through `Stamps.place`, which is what lets it.
- **A style is in the registry** (`client/src/styles/registry.ts`, ARCHIVE 16g): a new one is a
  folder of its own beside `wildwest/`, its data (`StyleData`: colours, track and credit, texts)
  apart from its drawing, and one line in `STYLES`. Its stylesheet comes as text (`?inline`), which
  the registry appends after `style.css`: imported as plain CSS it went into whichever chunk the
  registry fell into, linked before `style.css` in production only, and ties with the shared rules
  turned. Its tunables have a strict schema of their own in its folder, not in `config/`.
- **Each style is a module fetched when first asked for** (`STYLE_MODULES` in `scene.ts`,
  ARCHIVE 15zf), so `createTheme` is async. Pixi registers the pipes of `Text`, `BitmapText`,
  `HTMLText`, `TilingSprite` and `NineSliceSprite` as the class is first imported, and a renderer
  made before has none: a style bringing one of them must have its `pixi.js/…` registration
  imported up front, as `pixi.js/text` is, or its first drawing throws in `updateRenderable`.
- **`motionReduced()` is called per particle and per point**: it once read storage and built
  a media query at every call, 48 ms a frame in Opera. It is cached in `motion.ts`; anything
  else read that often must be too.
- **A new look's first render is warmed a piece at a time** (`Scene.warmChains`): a container's
  drawings one by one, its sprites together. One chain a sprite made Pixel's and Night's six
  thousand tiles six thousand chains, a minute and a half of warming, and their random looks never
  arrived in time (ARCHIVE 13e).
- **A mask in Pixi v8 is a stencil**: it stops pixels being coloured, not the drawing of what it
  covers, so a look masked off half the screen still costs it whole on the GPU. Wipes are cut by
  the GL scissor instead (`Scene.render`), which Pixi never touches. And measure the GPU at a load
  where it is the limit, several runs alternating: the same 2560×1440 run gave 16.8 dropped frames
  a second one hour and 0.4 the next (ARCHIVE 13o).
- **Pixi rebuilds a render group's whole draw list when any `Graphics` in it changes shape**:
  500 stamps each changing shape on their own beat cost Chocolate 3 ms a frame until they were
  put in render groups of their own (ARCHIVE 13f).
- **`cannonsToPlace` keeps its count when no cannon fits**: the sim ends the cannon phase early
  for that player but zeroes the count only as combat begins (it is hashed). The client shows
  `placeableCannons`, never the raw count.
- **One frame's events can span a phase change**: the overtime's last piece ends the round in
  the same step, so a check of `state.phase` after the frame reads the intermission — and a
  local match's bots in their worker step it between frames, so the frame may begin there too.
  The seal's fanfare asks the phase as of the events it has handled (`matchAudio.sealed`,
  ARCHIVE 14f).
- **A local match's bots think in a Web Worker, in lockstep** (ARCHIVE 13k): one bot
  planning its walls takes 15 to 50 ms. The page holds the match and sends each tick's turn
  with the person's moves on it; the worker's `BotTable` (`client/src/bots/`) plays them on a
  mirror, runs the bots and answers with their actions, and only then does the page step — so
  bots play action for action as on the page's thread. A move made while a turn is out lands on
  the next tick. `&bots=thread`, a dev fast-forward and every fallback put them on the page's
  thread (`ThreadDriver`, a tick's turns spread over frames at 8 ms); a worker that fails or goes
  quiet is replaced with a warning, mid-match by new bots, the recording still exact.
- **Bots share a few plans a tick** (`PlanningSlots`, `ai.plansPerTick`): every player is dealt
  the same pieces, so bots of one level fall due to plan on the same ticks. Every driver —
  room, `LocalMatch`, harness — gives a table's bots one `PlanningSlots` and calls them in
  `turnOrder` (`takeBotTurns`; locally `botTurns`, in the worker's `BotTable` or the page's
  `ThreadDriver`, which spreads one tick's over frames in the same order); a bot made without
  one is never held back (ARCHIVE 12p).
- **`computeEnclosure`, `weakestWall` and `MaxFlow` keep their working arrays between
  calls** (ARCHIVE 12w): nothing they return is one of them, and they are not re-entrant.
  A cache of a bot's plan lasts one turn (`Look`, `SealPlanner`), never a tick: bots act
  in turn, and each one's action changes the board the next one plans on.
- **Never `app.destroy(true)` while another Pixi renderer runs**: `true` releases what every
  renderer on the page shares, including pooled batches the other is using, and its next
  frame fails in the batcher. The style pictures destroy theirs without it (ARCHIVE 12b).
- **Playwright clicks on the canvas need a move, a pause, then down and up**, and clicks
  inside one tick claim one gun between them.
- **Line endings are LF everywhere, by `.gitattributes`**: a git that converts to CRLF —
  this machine's, a Windows runner's — fails every file against prettier's `endOfLine: lf`
  and `CREDITS.md` against its staleness test, which is what stopped the first v0.5.0
  Windows build.

## Drawing a style cheaply

Pixi cuts every changed `Graphics` into triangles on the CPU inside `render`; a good graphics
card does not help with that (ARCHIVE 12n). So a style **never redraws what has not changed**:

- **Walls and sealed ground by island**: `IslandParts` (`render/islandParts.ts`) gives the
  style's drawing one island's board and redraws only the island that changed. Walls dear to
  draw go in parts of their own, `'walls'`, the keeps and guns in `'pieces'`, so a hit does not
  draw the island's keeps again (Sakura, ARCHIVE 14zo).
- **The terrain in strips of rows**: `TerrainStrips` (`render/terrainStrips.ts`), a pass for
  each fill or stroke, each drawn over eight strips of rows, every strip of a pass before the
  next pass, so the order is as when whole; a hidden look draws and first renders it a strip
  at a time (ARCHIVE 13n). A new style's terrain is a plan (what is worked out across the
  board) and its passes.
- **Many small shapes each frame** (smoke, chunks, embers): `Particles` (`render/particles.ts`),
  sprites of a white disc or square, four vertices each; stamped, Pixi still copies every
  vertex of every stamp into its batch each frame (ARCHIVE 16e).
- **Sprites in a layer emptied every frame**: from a `SpritePool` (`render/stamps.ts`), not
  `new Sprite`; Medieval made two hundred a frame and left them to the collector (ARCHIVE 12w).
- **Many alike, moving**: `Stamps` and `StampBook` (`render/stamps.ts`) — a shape drawn once
  for the tile size, then only placed, turned, scaled, tinted and faded. A shape whose
  look changes with its motion is stamped per step (Chocolate's swirls by turn, Sakura's
  crests by rise), never stretched where a line would thin.
- **Still most of the time**: `Memos` — a `Graphics` per thing redrawn when its key changes;
  the guns' barrels, which move only when firing. The key must name everything drawn.
- **Changing at a hit or a round**: its own `Graphics` behind a key (blots, stains, the Maß).
- **The crowns**: `MainCastles` (`theme.ts`), keyed, in its own `Graphics` at the place they are
  drawn, what came after them in a `Graphics` above (ARCHIVE 13k).
- **Cleared every frame**: `clearDrawn`, never `clear()` — an empty `Graphics` cleared still marks
  its render group's draw list to be rebuilt.
- **Thousands of sprites** beside something redrawn each frame: a render group of their own
  (Medieval's `tileLayer`), or Pixi gathers and packs every one of them again each frame.

- **Hatching, textures, anything repeating**: a `FillPattern` drawn once on a small canvas and
  laid into shapes as a fill, in screen space (Noir's hatching and cobbles, ARCHIVE 12zn) — a
  few vertices a shape, where strokes would be thousands.

A hidden look is rendered once offscreen at the start (`Scene.warmUp`) and primed in the pause
before the banner that brings it (`Scene.prime`): its stale layers drawn and rendered unseen a
frame's share at a time, so the wipe's first frame has nothing left to do (ARCHIVE 12zm). A new
random look is made the same way, `IslandParts` drawing under a budget (`withDrawBudget`). Each
style's terrain is drawn in strips of rows (`TerrainStrips`, ARCHIVE 13n), a few a frame.

Check with `&perf=1` at eight players: the readout names the `Graphics` rebuilt most, every
frame and at worst. Keep the draw order where it shows; what came after a stamped thing goes
in a second `Graphics` above it. Before building, measure what a routine costs by switching it
off and timing the render's real triangulation: a routine triangulated alone overstates small
shapes several times over, and the sea life it put at 0.1 ms a frame gave 0.08 at most (ARCHIVE
14zo).

## Conventions

Comments explain _why_, not _what_, and record measurements where a number was chosen by
experiment. Commit messages are prose explaining the reasoning and what was measured. They carry
no Co-Authored-By or other AI attribution line (the user's, 2026-11-11): the README says
once that the game was developed with the help of AI coding tools.
Tests state expectations as ASCII pictures where the subject is geometric
(`stateFromAscii` in `sim/testing.ts`). Findings that are deferred go into `docs/PLAN.md`
rather than being left in chat; completed work is summarised into `docs/ARCHIVE.md`.
