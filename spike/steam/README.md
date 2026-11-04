# S1 — the Steam spike (App ID 480)

Throwaway (docs/STEAM.md §3.3), on the branch `s1-steam-spike`, never merged. It answers
STEAM.md's six S1 questions with the real game: each machine runs a packaged spike, the host's
spike runs Bollfort's own server inside itself, and every message between the machines goes
through Steam's P2P channel. Nothing of the game is changed for it.

| Question | What it asks                                                             | Step  |
| -------- | ------------------------------------------------------------------------ | ----- |
| Q1       | Does the Steam binding work in our Electron, on Windows and on Linux?    | 4     |
| Q2       | Does Steam's overlay show over the game window, and its invite dialog?   | 6     |
| Q3       | Does Steam's P2P channel carry a whole eight-seat match without desyncs? | 10    |
| Q4       | May a guest, not only the host, invite?                                  | 8     |
| Q5       | Does an invite reach a running game, and start a closed one?             | 7, 12 |
| Q6       | Does `RestartAppIfNecessary` belong in our start-up?                     | 4     |

Two machines are called **A** (Linux, the development machine) and **B** (Windows) below.

---

## Part 1: get the two apps (once)

GitHub builds both on every push to the branch (`.github/workflows/steam-spike.yml`).

1. **Download.** In a browser, open the repository on GitHub → **Actions** → **Steam spike** on
   the left → the newest run with a green tick. At the bottom, under **Artifacts**:
   - on **A**, download `bollfort-steam-spike-linux`;
   - on **B**, download `bollfort-steam-spike-windows`.
2. **Unpack on A (Linux).** The download is a zip holding a `.tar.gz`. In a terminal:
   ```bash
   mkdir -p ~/spike && cd ~/spike
   unzip ~/Downloads/bollfort-steam-spike-linux.zip
   tar xzf BollfortSteamSpike-linux.tar.gz
   ```
   The app is now in `~/spike/BollfortSteamSpike-linux/`.
3. **Unpack on B (Windows).** The download is a zip holding a second zip. Right-click the
   download → **Extract All…**; open the folder, right-click `BollfortSteamSpike-windows.zip` →
   **Extract All…** into a folder of its own, e.g. `C:\Spike`. Do not start the program from inside
   a zip: Windows would run it from a temporary copy without its files.

## Part 2: start them

Both machines: **Steam running and logged in**, two different accounts that are **friends** on
Steam. If they are not yet, add each other first (Steam → Friends → Add a Friend).

4. **Start the spike on both.**
   - **A:** `cd ~/spike/BollfortSteamSpike-linux && ./bollfort-steam-spike`
   - **B:** in `C:\Spike`, double-click **BollfortSteamSpike.exe**. Windows SmartScreen warns of an
     unknown publisher: **More info → Run anyway**.

   A **control window** opens on each. Under **State**, check and note:
   - **Steam user** shows your Steam name and ID on both machines → **Q1** answered for that
     system. If it says _not initialised_, Steam is not running or not logged in: start it, then
     the spike.
   - **restartAppIfNecessary** → note what it says on each (**Q6**).
   - Keep the control window visible: its **Log** at the bottom records everything. You can select
     it and copy it (Ctrl+C) for the notes.

   No firewall prompt should appear: nothing listens beyond the machine itself. If one does, note
   it.

## Part 3: lobby, overlay and invites (A hosts)

5. **A hosts.** In A's control window, click **Host: Friends lobby**. Within a few seconds a second
   window, the **game window**, opens in Bollfort's lobby (Room, eight seats), and the log says
   `lobby … made (friends)` and `room … published in the lobby`.
6. **The overlay (Q2).** Click into A's game window, then press **Shift+Tab**. Note: does Steam's
   overlay appear on top of the game? Close it again (Shift+Tab). Then, in A's control window, click
   **Invite (lobby.openInviteDialog)**. Note: does Steam's invite dialog open (over which window)?
   Invite **B's account** in it. If the first button shows nothing, try the second, **Invite
   (overlay.activateInviteDialog)**, and note which works.
7. **The invite, B's game running (Q5).** On B, with the spike running, accept the invite — from
   Steam's chat window or the notification. Note: does B's log show `GameLobbyJoinRequested`, and
   does a game window open on B and sit in A's room (B's name on a seat in A's game window)? Also
   try the friends list: on B, **Leave** first (control window), then in Steam's friends list
   right-click A's name → **Join Game**. Note whether that works too.
8. **A guest invites (Q4).** On B (now in A's lobby), click **Invite (lobby.openInviteDialog)**.
   Note: does the dialog open for a guest? If you have a third Steam account somewhere, invite it.
9. **Finding the lobby without an invite.** On B: **Leave**, then **List our lobbies**. Note: is
   A's lobby listed? Every Spacewar developer's lobbies share App 480's list and the binding cannot
   filter it, so _none of ours found_ is a finding, not your mistake. If it is listed, click it to
   join; if not, copy the lobby id from A's State (**Lobby**) into B's _lobby id_ field and click
   **Join by id**.

## Part 4: matches over Steam

10. **A whole match (Q3).** In A's game window: eight seats (the six empty ones are bots). In B's
    game window, click **Ready**; in A's, **Start match**. Play the whole match, both of you, as
    normally. While playing, glance at **B's** control window:
    - **Round trip over Steam**: note the usual value and the highest you see.
    - **Sockets opened (in a match: N)**: N must stay **0**. A socket opened during a match is B's
      page rejoining; without a lost connection that means Steam's channel lost or reordered
      something. Note any red lines in B's log.
    - Note also: did the game feel any different from a LAN match — delays after a click, jumps?

    After the match, **Rematch** on both, and play a second one; somewhere in it:

11. **A dropped link.** On B, unplug the network (or switch off Wi-Fi) for about ten seconds, then
    reconnect. Note: does B's game show the connection notice and come back into the match? Then
    quit B's spike entirely (close its windows), start it again, and join A's lobby by id — note
    what happens (the match is under way, so Steam's lobby is closed to joins: expected).
12. **An invite with the game closed (Q5).** Quit B's spike. From A, invite B again; on B accept.
    On App 480 Steam starts **Spacewar**, not our spike — that is expected. Note only what Steam
    does (asks to install Spacewar, starts it, or nothing). The real test needs our own App ID.

## Part 5: swap roles

13. **B hosts.** On both, **Leave** (or restart both spikes). On **B**, **Host: Friends lobby**,
    then invite A, A accepts, and play one whole match, A watching A's control window as in step 10
    (round trip, sockets in a match). Now both systems have hosted and joined.

## Part 6: controller and Steam's keyboard

14. **A pad under Steam.** Plug a controller into B (or A). Click into the control window and press
    any button on the pad. Under **Controllers this page sees**, note the name shown —
    `Xbox 360 Controller`, `Steam Virtual Gamepad` or similar means Steam Input passes the pad
    through to the game. Then play a round in the game window with the pad only.
15. **Steam's keyboard** (only in Steam's Big Picture mode, or on a Steam Deck): **Steam's gamepad
    keyboard**. Note: does it open, and does the log show what was typed?

## Part 7: the rest of the session

Since everyone is together anyway — on the normal game, not the spike (close the spikes first):

- **Online, on the real server** (`npm start` on A, port 8080; B joins by the link or the LAN
  address): Find a game lists A's room and joins it; joining by the room's code; a tournament match
  played to its end in a room; a guest's Rematch after a single match.
- **Controller**, by everyone with a pad: the menus, Options → Controller (rebind a button, then
  Restore defaults), the on-screen keyboard for the name and the room code, a whole match.

## Afterwards

Send the copied logs of both control windows and the notes from each step. They decide S3's
binding work (STEAM.md §3.2: whether we fork `steamworks.js`) and are recorded in STEAM.md. The
spike and its branch are then thrown away.
