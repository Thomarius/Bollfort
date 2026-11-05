# Making the trailer on Windows

Steam's trailer (STEAM.md §9.2) is filmed live from the game in a browser window and cut to its
music by `tools/storeart/src/trailer.ts`. It was first made on the development machine (Linux),
whose integrated graphics left it a little laggy; this is how to make it on a gaming PC with an
NVIDIA card (the user's, 2026-11-05). Everything about the cut — its clips, timings and captions —
is in that script; nothing here changes it.

**The version for Steam is the one at half the screen's shake** (`TRAILER_SHAKE=0.5`: half as far,
over the same time), the user's choice of 2026-11-05 after both it and one without the shake were
made in full: every command below is given with it, and its files go into `trailer-build\half\`.
`$env:TRAILER_SHAKE = "0"` makes the version without the shake, into `trailer-build\still\`;
unset, the full shake, into `trailer-build\`.

## 1. Once: the tools

In PowerShell:

```powershell
winget install OpenJS.NodeJS        # Node 24 (22.12 at the least)
winget install Git.Git
winget install Gyan.FFmpeg          # ffmpeg 6 or later, for ddagrab and NVENC
```

Open a new terminal so the three are on the path, and check: `node -v`, `git --version`,
`ffmpeg -hide_banner -filters | findstr ddagrab`, `ffmpeg -hide_banner -encoders | findstr nvenc`.
Keep the NVIDIA driver current; NVENC needs it.

```powershell
git clone https://github.com/Thomarius/Bollfort.git
cd Bollfort
npm install
npx playwright install chromium
```

`.gitattributes` keeps every file's line endings LF, as `npm run check` wants.

## 2. Before each session: the screen

- **Display scaling 100%** (Settings → System → Display → Scale) on the monitor used. The
  recorder finds the page by the screen's pixels, and any other scaling moves it.
- **The primary monitor**, at **2560 × 1440 or larger**: the browser window (a 1920 × 1080 page and
  its frame) opens at its top-left. A monitor of exactly 1920 × 1080 cannot hold the window: set
  `$env:TRAILER_FULLSCREEN = "1"` and the page is the whole screen instead.
- **Nothing over the window**: close Discord, the NVIDIA app's overlay, Steam's overlay; turn on
  Do not disturb so no notification appears; no screensaver. The mouse is not filmed, but leave it
  still and off the window while recording.
- G-Sync and frame-rate caps make no difference; the game runs at the monitor's rate.

## 3. Making it

Two terminals, both in the repository.

**Terminal 1**, the game, left running:

```powershell
npm run dev -w @bollfort/client
```

**Terminal 2**:

```powershell
$env:TRAILER_SHAKE = "0.5"
npm run trailer -w @bollfort/storeart -- calibrate
```

A browser window opens for a few seconds. Open `trailer-build\half\calibrate.png`: it must show
the game's menu filling the picture edge to edge, with no window frame, browser bar or desktop.
Then film every clip (about 15–20 minutes; the browser window must stay uncovered throughout):

```powershell
npm run trailer -w @bollfort/storeart -- record
```

Each clip reports `repeated frames round its moment`. Near 0% for the busy moments is what this PC
should give; a calm building scene may show more, which is not stutter (its frames hardly
change). A clip can be filmed again alone: `npm run trailer -w @bollfort/storeart -- record
eight-pullout`. Then:

```powershell
npm run trailer -w @bollfort/storeart -- captions
npm run trailer -w @bollfort/storeart -- assemble
```

The trailer is `trailer-build\half\BollfortTrailer.mp4`: 55 seconds, 1920 × 1080 at 60 frames,
H.264 and AAC — Valve's format, its music at the game's loudness (−14 LUFS). Watch it with sound
before anything else.

## 4. If something goes wrong

- **The page is not found** (calibrate fails): the window is covered, on another monitor, or the
  scaling is not 100%. With a 1920 × 1080 monitor, use `TRAILER_FULLSCREEN`.
- **ddagrab fails** (an old ffmpeg, a remote desktop session): `$env:TRAILER_CAPTURE = "gdigrab"`,
  Windows' older capture, slower but everywhere.
- **NVENC fails**: `$env:TRAILER_ENCODER = "cpu"` encodes with x264.
- **A clip stutters still**: film it slower — its `slow` in the script's `CLIPS` (0.5 is half
  speed, 0.25 a quarter); the cut speeds it up again. The changes of look, the seal scenes, the
  eight-player pull-out, the tournament's end and the end card are slowed already.
- **A moment never comes** (`never came`): the clip is kept as filmed; film it again — the bots
  play a little differently each time, as the person's moves land on slightly different ticks.

## 5. What the script does, for orientation

Each clip is a match started from the address (`?autostart=1&autopilot=1…`): a bot plays the
person's seat and the game shows it as a person plays it (the piece in hand), the aiming cursor and
the towers' emblems hidden (`&reticle=0`), the screen's shake at half (`&shake=0.5`), the corner's
buttons gone (`&clean=1`), the camera held or moved by `&cameraZoom` and its kin. The recorder waits
for each clip's moment — a change of look's banner crossing the middle, a tower's effect, a castle
sealed — and notes when it came; the cut takes its shots relative to those moments. A slowed clip
runs on a slowed page clock (an init script slowing `performance.now`, `Date.now` and the frame
times together — never the DevTools protocol's animation rate as well, which froze the game).
