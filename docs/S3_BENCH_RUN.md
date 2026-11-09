# S3's first bench run, on the Linux machine — a handoff

Written 2026-11-09 on the Windows gaming PC, at the end of the session that built S3 (STEAM.md
§7.3). For the Claude Code session on the Linux machine: run the Steam test bench (STEAM.md §3.4,
`tools/steambench`) on S3's Steam build for the first time, read the report, and fix what fails.
Retire this file into the ARCHIVE once the bench passes.

## Where things stand

S3 is built and pushed (`main`, up to `9ead354`): the transport over Steam's P2P and rejoining by
Steam ID (S3.1, S3.2), Steam lobbies, codes, invites and Back to the match (S3.3), avatars and
Steam's language (S3.4), and the bench driving the Steam build (S3.5). `npm run check` passes.
Checked by hand on Windows with one account only: the menu's Steam rows, a lobby made and left,
the Steam code and Invite friends in the room, the host's avatar on its seat card, `--game-params`
reaching the page. **Nothing with two accounts has run yet.**

**The bench's Steam adapter has never run** (`tools/steambench/src/steamApp.ts`, and the target
switch in `machines.ts` and `bench.ts`): the bench needs `pkill`, `ss`, `virsh` and the VM, so it
could not run on Windows. A failure in the first short run is more likely the adapter than the
game.

## Steps

1. Update and install (`koffi` is a new dependency of the desktop package):
   ```bash
   git checkout main && git pull
   npm ci
   ```
2. Build the Steam build, into `packages/desktop/release/steam/linux-unpacked/bollfort`:
   ```bash
   npm run build
   BOLLFORT_STEAM=1 npm run package -w @bollfort/desktop
   ```
   The bench copies it into the VM itself, to `/home/tester/bollfort` (beside the spike's folder).
3. Both Steams running: this desktop as Arnoldex; the VM `bollfort-guest` up, its Steam logged in
   as arnoldex83. `lag` and `outage` need the sudoers line for `/usr/sbin/tc`, as before.
4. A short run first, some 10–15 minutes, to catch setup and adapter faults:
   ```bash
   npx tsx tools/steambench/src/bench.ts start join code
   ```
5. Then the full set, some 90 minutes, unattended, the desktop left alone:
   ```bash
   npx tsx tools/steambench/src/bench.ts
   ```
   `--reverse` for a pass with the VM hosting; `--target spike` runs the S1 spike, the reference.

The report is `steambench-results/<time>/report.md`, with each scenario's logs (`host.log`,
`guest.log` — the build's `~/.config/Bollfort/start.log`) and screenshots beside it.

## What to look for

- **restart**: "Back to the match offered" and "back in the match" must pass — the spike could
  not get a restarted guest back in; S3 must.
- **outage**: the guest in the match again after the 30 s and 90 s cuts (the session given up and
  rejoined by Steam ID).
- **code**: seated both times (the guest types the host's Steam code into the menu).
- **every match scenario**: the end screens agree, no mismatch, no game error; on the end-screen
  screenshots, both players' **avatars** beside their names — the first run of the avatar FFI
  (`koffi` on `libsteam_api.so`) on Linux. A `game error` or `no avatars:` line in a log says why.
- **seating**: a guest waits up to 10 s for the host's first answer over P2P (`OPEN_WAIT_MS` in
  `packages/desktop/src/steamNet.ts`); S1 measured some 4 s, and a slow VM could come near it.

## What the adapter relies on, if it fails

- The game page is found by its address, `http://127.0.0.1:<port>/`; the Steam build's server
  takes 8080 upward (`STEAM_BUILD.ports` in `machines.ts`).
- Steam is read through `window.bollfortHost` (`steam()`, `steamStats()` — with the lobby, the
  round trip from pings every 2 s, and `guestLinksDialled` for rejoins).
- Hosting sets `#lobby-kind` and clicks `#play`; joining by code fills `#code` and clicks
  `#join`; a join by lobby ID reloads the page with `?steamLobby=<id>`; Back to the match is
  `#back-to-match`.
- The log lines the scenarios wait for are the build's own: `the host answered over Steam after
… s`, `joined lobby …` / `join failed: …`, `the host answers again, after … s`,
  `P2P session with … failed`, `game error: …`.

Afterwards, by hand with two people (STEAM.md §7.3, S3.5): Steam's friend picker in the overlay,
an invite accepted during a match, a guest restarted coming back. Rich presence's texts, an invite
starting a closed game and the Deck wait for our own App ID (S4).
