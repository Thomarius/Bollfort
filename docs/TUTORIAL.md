# The tutorial

A guided match for first-time players, designed with the user on 2026-11-22 and built the same
day for the user to try. A second pass the same day followed their first look: the stage set before
anything is asked, the words in a card above the board rather than a line at its foot, the points as
a sum, the sounds in the order they are told, and a second round with Big Bertha. It reverses
"guidance in a first match", declined twice before (PLAN §11 items 7 and 10): the game is to be
released free on Steam, where the first few minutes decide whether a player stays. Once tried and
settled, this design is retired into the ARCHIVE.

## 1. The idea

**One fully scripted match, on rails, of two rounds.** An open tutorial, one that lets the
player do anything, has to answer every move a player might make. A tutorial where each task admits
only the move it teaches is far easier to keep on track (the user's). So every task has one outcome,
any other move is refused before it reaches the rules, and **no clock runs** but one, at the very
end, which is the lesson. It takes 92 s of play for someone who does each task the moment it is set
(measured in the test's play-through), plus the reading of 23 cards: four to five minutes.

It is a real match: the board is the game's, the rules the default ruleset's, every move goes
through the simulation, so nothing it teaches is untrue. It covers every core mechanic and one
special tower: placing cannons, firing and reloading, what shots break, silent guns, building and
turning pieces, sealing, the corner rule, the main castle's reward, a second castle, the points,
a life lost and a fresh start, Big Bertha, the build clock, and how a match is won.

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
nothing. A small kicker, _Tutorial_ or _Your task_; the heading large; a line or two under it. It
comes in afresh with every step, so a new one is noticed. Two kinds:

- **A note** explains, and holds the match still — shots stop in the air — until **Continue** is
  pressed (a controller's Accept), read at the player's own pace.
- **A task** lets the match run until it is done, its count as a bar where it has one.

_Skip tutorial_ in the card's corner; Esc pauses as ever. The texts are drafts in all three languages.

| Phase   | Step           | Kind | Heading — what it says                                                                  | Done when                                         |
| ------- | -------------- | ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Opening | `welcome`      | note | Welcome to Bollfort — two islands, two castles, one siege                               |                                                   |
|         | `island`       | note | Your island — the castle in its ring; the ground and its guns yours (camera on it)      |                                                   |
|         | `rules`        | note | How a round goes — cannons, fire, rebuild; a round unsealed costs a life                |                                                   |
| Cannons | `cannons`      | task | Place your cannons (0 / 2)                                                              | Both placed                                       |
| Combat  | `fire`         | task | Fire! — break 9 blocks (bar)                                                            | Your first shot                                   |
|         | `reload`       | note | Reloading — a cannon fires again once its shot has landed                               |                                                   |
|         | `firing`       | task | Keep firing (bar)                                                                       | 9 down, the rival's shots landed, both notes read |
|         | `silent`       | note | A silent cannon — outside your walls it cannot fire (marked)                            | 4 s into `firing`                                 |
|         | `underFire`    | note | They fire back! — shots break walls only, never castles or cannons                      | As the rival's first wall hit lands               |
| Build   | `turn`         | task | Rebuild — close the gap; turn the piece to fit it (marked)                              | The two-block piece upright in the long gap       |
|         | `corner`       | task | Mind the corner — blocks touching only at corners leave a gap (marked, pinged)          | The single block in the corner                    |
|         | `sealed`       | note | Sealed! — its ground keeps you in the match and scores                                  |                                                   |
|         | `reward`       | note | Cannons for castles — the crowned castle earns two each round                           |                                                   |
|         | `second`       | task | A second castle — wall it in; turn the piece to fit the gap (marked)                    | The L, turned half round, in its gap              |
|         | `secondSealed` | note | Two castles — every further castle one more cannon, and more ground                     |                                                   |
|         | `clock`        | note | Time's up — a real match gives 20 seconds; here the clock waited                        |                                                   |
|         | `points`       | note | Your points this round — walls 14 × 2, ground 72 × 1, cannons 3 × 5, total (camera you) |                                                   |
|         | `idleGun`      | note | Nothing for idle cannons — the gun outside scores nothing (marked)                      |                                                   |
|         | `rivalFails`   | note | Meanwhile, your rival … has not closed its walls (camera on it)                         | Continue: the round resolves                      |
|         | `lifeLost`     | note | A life lost — the island cleared, a fresh castle, its last life                         | The intermission, then the cannon phase           |
| Cannons | `tower`        | task | Big Bertha — right-click to switch to her, worth two cannons, and place her             | Bertha placed                                     |
|         | `lastCannon`   | task | One more — place your last cannon                                                       | Placed                                            |
| Combat  | `bertha`       | note | Bertha fires first — whatever you click, and her shell breaks a cross of five           |                                                   |
|         | `barrage`      | task | Their last life — break 14 blocks of their new wall (bar)                               | 14 down, the rival's four shots landed            |
| Build   | `repair`       | task | Rebuild on your own — seal at least one castle; any placement                           | A castle of yours sealed                          |
|         | `countdown`    | task | The clock is running — the clock shown, 10 s                                            | The clock all but out                             |
|         | `rivalFinal`   | note | Time's up — the rival sealed nothing again (camera on it)                               | Continue: the round resolves                      |
|         | `out`          | note | Knocked out — no lives left (camera on it, the banner over it)                          |                                                   |
|         | `won`          | note | Victory! — last one standing, or the best score after 10 rounds (camera you, fireworks) |                                                   |
|         | `done`         |      | _Tutorial complete_: **Play a match** (the lobby) or **Main menu**                      |                                                   |

The rival's shots, one every 1.6 s from 2.5 s into each barrage. The first: your keep, the long
gap's upper block, the sea, the corner, your corner gun, the long gap's lower block, bare ground —
three break wall, four show what a shot cannot break. The second: four walls, two rings, the repair
left to you. After its lost life the rival takes its castle again and places its guns where the rules
first allow.

Notes:

- **Explained before it happens**: each round's end is told while the build phase is held, the
  points worked out as the resolution will count them (`pointsAhead`, which a test holds to the
  banked score). Only then does the camera go to the rival and the round resolve, so its life lost is
  seen and heard there, and the build music plays on until then. The victory fanfare is held back
  until the camera is back on your castle (`TutorialHooks.heard`), the fireworks too.
- **The corner is the corner-gap lesson**: a missing corner seals under a 4-connected flood but not
  the real one, so the game's own corner ping (`cornerGaps.ts`) marks it.
- **Turns count from the piece as dealt**: in the tutorial each new piece starts unturned, so a gap
  always wants the same turns; a match keeps the turn from piece to piece. The cards never say how
  many (the user's).
- **Big Bertha is handed over in round 2**, as the rival's life is lost: from the start, the HUD
  spoke of her ("not at the opening") before she was introduced.
- **The countdown** stops two ticks short of its end, for the rival's failure to be told before the
  round resolves.

## 5. How it is built

- **One sim change**: an optional `build.pieceScript` in the ruleset, names dealt in order from each
  build phase's first piece before the draw takes over (`pieceAt`). No match has one. The tutorial's
  ruleset is the default with its three pieces scripted — at the start of every build phase, so the
  free repair begins with small ones too — no overtime, and the special towers on
  (`tutorialRuleset`).
- **The director** (`tutorial/director.ts`), pure and played through in a test: the steps, notes
  holding the match, the rival's moves as actions, the clocks held 60 s ahead while a task is open
  and let go by setting the phase's end to now; which moves are let through (`allows`), what is
  marked, the card, the camera, when to celebrate, when the clock shows.
- **The session** (`tutorial/session.ts`): ticks the match as a local one does, with no bots and no
  recording, and not at all while a note is up.
- **The match screen** takes `exits.tutorial` (`TutorialHooks`): placements and guns filtered in
  `Controls` before the rules (the ghost red, the refusal cue), the marks drawn as a leak's tiles
  are, the board fitted below the card, the phase's music at once, no clocks but the countdown
  (`hideClocks`), no island zoom, no summary, the island banners kept after the end (`bannersFor`'s
  `atEnd`), the camera eased onto an island and back, the fanfare and fireworks only for the win.
- **Controller**: the same rails, since a pad sends the same moves; Accept is Continue; the cards
  naming a button have pad versions.
- **Tests** (`director.test.ts`): the board; the whole tutorial played through to your win, every
  step in order; the points told equal to the points banked; the match held still under a note;
  under three minutes of play; a piece only into the gap of the moment, Bertha only where she is the
  task; the rival's first barrage breaking exactly the three tiles meant; the countdown's clock and
  its stop. `offer.test.ts`: when the offer shows. Looked at in a browser, every step.

## 6. Achievement and recordings

- **Basic training** (`TUTORIAL`, _Grundausbildung_): finish the tutorial. The 37th, easy. It is
  sent when the last window opens; it still has to be entered in Steamworks with the others (AC5).
- The tutorial is **never recorded** and counts towards **no other achievement**: it is a lesson,
  not a match anyone played.

## 7. Open

- **The texts**: every card in all three languages, the Hessian above all, are drafts for the user
  to fix.
- **Placement in the menu**: Tutorial beside How to play leaves Options alone on its row.
