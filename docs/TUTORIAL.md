# The tutorial

A guided match for first-time players, designed with the user on 2026-11-22 and built the same
day for the user to try. A second pass the same day followed their first look: the stage set before
anything is asked, the words in a card above the board rather than a line at its foot, the points as
a sum, the sounds in the order they are told, and a second round with Big Bertha. A third
(2026-11-23) followed their play-through: the texts in plain words, no note interrupting a task,
fewer cards, no button named, the special towers called optional, and the last build phase ending
in its overtime as any match's does. It reverses "guidance in a first match", declined twice before
(PLAN §11 items 7 and 10): the game is to be released free on Steam, where the first few minutes
decide whether a player stays. Once tried and settled, this design is retired into the ARCHIVE.

## 1. The idea

**One fully scripted match, on rails, of two rounds.** An open tutorial, one that lets the
player do anything, has to answer every move a player might make. A tutorial where each task admits
only the move it teaches is far easier to keep on track (the user's). So every task has one outcome,
any other move is refused before it reaches the rules, and **no clock runs** but one, at the very
end, which is the lesson. It takes 97 s of play for someone who does each task the moment it is set
(measured in the test's play-through), plus the reading of 9 cards: three to four minutes.

It is a real match: the board is the game's, the rules the default ruleset's, every move goes
through the simulation, so nothing it teaches is untrue. It covers every core mechanic and one
special tower: placing cannons, firing and reloading, what shots break, building and turning
pieces, sealing, the corner rule, the main castle's reward, a second castle, the points, silent
guns, a life lost and a fresh start, Big Bertha, the build clock and its overtime, and how a match
is won.

Medieval for building and Night for combat, whatever the menu has chosen (the user's): the two
plainest styles, which show everything clearly. The build look's music starts with the tutorial, not
the menu's played on.

## 2. Where it is offered

- **Once, on the first start** (`tutorial/offer.ts`): after the name window where there is one, at
  once under Steam, which asks for no name. "New to Bollfort?" with _Play the tutorial_ and _Not
  now_. Answered either way, it is not offered again; never in a browser driven by a script (the
  screenshot tools), and not to someone who has played it already. `?tutorialOffer=1` shows it again.
- **The menu's Tutorial button**, beside How to play, Options below them. It stays marked until the
  tutorial has been played to its end, as How to play's was.
- `?tutorial=1` opens it at once, for looking at it; with `&perf=1` the page also holds the match as
  `bollfortTutorial`, for a script driving it.

## 3. The board

Seed 1 at two players (`tutorial/layout.ts`, checked against the map in `director.test.ts`): you on
the west island, the rival on its mirror to the east. Set up as the game would, wherever a rule
allows (`tutorial/board.ts`): both castles chosen and the guns placed as actions; written in only
where no rule could: the second ring and the gun in the open.

- **Your main castle** (11, 12), crowned, its ring whole, a gun in the ring's north-east corner.
- **A second castle** (19, 18), walled but for an L at its ring's south-east corner.
- **A gun out in the open** (17, 11), between the two rings, inert.
- **The rival's castle** (41, 12), its ring whole, three guns; **two lives left**.

It starts in the cannon phase of round 1, with two cannons still for you to place.

## 4. The script

**A card above the board** (`tutorial/panel.ts`): the board is fitted below it, so it covers
nothing. A small kicker, _Tutorial_ or _Your task_; the heading large; a sentence or two in plain
words under it. It comes in afresh with every step, so a new one is noticed. Two kinds:

- **A note** explains, and holds the match still until **Continue** is pressed (a controller's
  Accept), read at the player's own pace. No ghost or reticle while it is up.
- **A task** lets the match run until it is done, its count as a bar where it has one, and what
  helps with it as a smaller hint line. **A task is never interrupted by a note** (the user's).

**No button is named in the words** (the user's): the cursor shows it — while a piece is to be
turned, the mouse's right button and wheel or the controller's Turn, beside a turning arrow; while
the tower may be chosen, the game's own switch hint, with the controller's button where a pad is in
use. _Skip tutorial_ in the card's corner; Esc pauses as ever.

| Phase   | Step           | Kind | Heading — what it says                                                                | Done when                                   |
| ------- | -------------- | ---- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| Opening | `welcome`      | note | Welcome to Bollfort — you and a rival each hold a castle on an island                 |                                             |
|         | `island`       | note | This is your island — the crowned castle in its wall; the land and cannons yours      |                                             |
|         | `rules`        | note | How a round works — cannons, fire, repair; a castle not walled in costs a life        |                                             |
| Cannons | `cannons`      | task | Place your cannons (0 / 2)                                                            | Both placed                                 |
| Combat  | `fire`         | task | Fire! — break 9 blocks (bar); hint: reloading, and only walls break                   | 9 down and the rival's shots landed         |
| Build   | `turn`         | task | Repair your wall — turn the piece so it fits the gap (marked)                         | The two-block piece upright in the long gap |
|         | `corner`       | task | Close the corner — blocks touching only at a corner leave a gap (marked, pinged)      | The single block in the corner              |
|         | `sealed`       | note | Your castle is walled in! — land, points, and two cannons a round for the crowned one |                                             |
|         | `second`       | task | Wall in a second castle — turn the last piece so it fits (marked)                     | The L, turned half round, in its gap        |
|         | `secondSealed` | note | Two castles — one more cannon each; a real game gives 20 seconds to build             |                                             |
|         | `points`       | note | Your points for this round — the sum; the marked gun outside earns nothing            | Continue: the camera goes to the rival      |
|         | `resolving`    |      | (no card: the camera reaches the rival, then the round resolves)                      | The rival's life lost                       |
|         | `lifeLost`     | note | Your rival lost a life — its island cleared, a new castle, its last life              | The intermission, then the cannon phase     |
| Cannons | `tower`        | task | Big Bertha — special towers are an optional extra; she costs two of your 3 cannons    | Bertha placed                               |
|         | `lastCannon`   | task | One more cannon                                                                       | Placed                                      |
| Combat  | `barrage`      | task | Your rival's last life — break 14 blocks (bar); hint: Bertha fires first, a cross     | 14 down and the rival's four shots landed   |
| Build   | `repair`       | task | Repair on your own — wall in at least one castle; any placement                       | A castle of yours sealed                    |
|         | `countdown`    | task | The clock is running — the clock shown, 10 s                                          | The clock out                               |
|         | `overtime`     | task | Last piece — the piece held may still be placed, as in any match                      | The overtime all but out                    |
|         | `resolving`    |      | (no card: the camera reaches the rival, then the round resolves)                      | The rival knocked out                       |
|         | `out`          | note | Your rival is out — no castle walled in, no lives left                                |                                             |
|         | `won`          | note | You win! — last one standing, or the best score after 10 rounds (fireworks)           |                                             |
|         | `done`         |      | _Tutorial complete_: **Play a match** (the lobby) or **Main menu**                    |                                             |

The rival's shots, one every 1.6 s from 2.5 s into each barrage. The first barrage's script: your
keep, the long gap's upper block, the sea, the corner, your corner gun, the long gap's lower block,
bare ground — three break wall, four show what a shot cannot break. The second's: four walls, two
rings, the repair left to you. **Then the rival keeps firing until the barrage ends** (the user's: a
rival falling silent felt wrong), at random tiles of your island: in the first barrage never at a
wall, so the gaps the lesson needs are the only ones; in the second at a wall one time in four
(`rivalWallShare`) — aimed anywhere, they took most of the main ring. A barrage ends once your count
is reached and the script's shots have landed. After its lost life the rival takes its castle again
and places its guns where the rules first allow.

Notes:

- **Explained before it happens**: the first round's end is told while the build phase is held, the
  points worked out as the resolution will count them (`pointsAhead`, which a test holds to the
  banked score). Then the camera goes to the rival, and the round resolves 1.2 s later, as it
  arrives, so its life lost is seen and heard there; the build music plays on until then. The
  second round's overtime is held a moment short of its end in the same way. The victory fanfare is
  held back until the camera is back on your castle (`TutorialHooks.heard`), the fireworks too.
- **The silent gun is told with the points**, the gun marked, rather than in the barrage, which no
  note interrupts (the user's).
- **The corner is the corner-gap lesson**: a missing corner seals under a 4-connected flood but not
  the real one, so the game's own corner ping (`cornerGaps.ts`) marks it. The words speak of blocks
  touching only at a corner, never of the sea (the user's).
- **Turns count from the piece as dealt**: in the tutorial each new piece starts unturned, so a gap
  always wants the same turns; a match keeps the turn from piece to piece. The cards never say how
  many (the user's).
- **Big Bertha is handed over in round 2**, as the rival's life is lost: from the start, the HUD
  spoke of her ("not at the opening") before she was introduced.

## 5. How it is built

- **One sim change**: an optional `build.pieceScript` in the ruleset, names dealt in order from each
  build phase's first piece before the draw takes over (`pieceAt`). No match has one. The tutorial's
  ruleset is the default with its three pieces scripted — at the start of every build phase, so the
  free repair begins with small ones too — and the special towers on (`tutorialRuleset`). The
  overtime is the default's; the first round's resolution, explained beforehand, skips it.
- **The director** (`tutorial/director.ts`), pure and played through in a test: the steps, notes
  holding the match, the rival's moves as actions, the clocks held 60 s ahead while a task is open
  and let go by setting the phase's end to now; which moves are let through (`allows`), what is
  marked, the card and its hint, the camera, whether input is open and the turn shown by the cursor,
  when to celebrate, when the clock shows.
- **The session** (`tutorial/session.ts`): ticks the match as a local one does, with no bots and no
  recording, and not at all while a note is up.
- **The match screen** takes `exits.tutorial` (`TutorialHooks`): placements and guns filtered in
  `Controls` before the rules (the ghost red, the refusal cue), the marks drawn as a leak's tiles
  are, the board fitted below the card, the phase's music at once, no clocks but the countdown
  (`hideClocks`), no ghost under a note, the turn's hint by the cursor (`turnHintHtml`), no island
  zoom, no summary, the island banners kept after the end (`bannersFor`'s `atEnd`), the camera eased
  onto an island and back, the fanfare and fireworks only for the win. The tower's switch hint by
  the cursor shows a controller's button where a pad is in use, in any match.
- **Controller**: the same rails, since a pad sends the same moves; Accept is Continue.
- **Tests** (`director.test.ts`): the board; the whole tutorial played through to your win, every
  step in order; the points told equal to the points banked; the match held still under a note;
  under three minutes of play; a piece only into the gap of the moment, Bertha only where she is the
  task; the rival's first barrage breaking exactly the three tiles meant, and the rival firing on
  through a slow barrage with nothing more broken; the second build phase run
  out on its clock and overtime; each task's hint. `offer.test.ts`: when the offer shows. Looked at
  in a browser, every step.

## 6. Achievement and recordings

- **Basic training** (`TUTORIAL`, _Grundausbildung_): finish the tutorial. The 37th, easy. It is
  sent when the last window opens; it still has to be entered in Steamworks with the others (AC5).
- The tutorial is **never recorded** and counts towards **no other achievement**: it is a lesson,
  not a match anyone played.

## 7. Open

- **The texts**: rewritten in plain words (2026-11-23), still for the user to settle, the Hessian
  above all.
- **Placement in the menu**: Tutorial beside How to play leaves Options alone on its row.
