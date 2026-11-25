# Campaign mode — design and implementation plan

A mode for one to three people against an enemy fleet: ships that sail in and bombard the walls,
transports that land grunts, frost ships whose shots leave frozen ground. Levels on generated maps,
three difficulty settings, progress saved between levels, co-operative online play. Designed with
the user on 2026-11-25; nothing of it is built yet. Once built and tried, this design is retired
into the ARCHIVE as every other one is.

**This document is meant to be enough to build the mode from.** Every mechanism is described with
its starting numbers. Where something is still missing, the local reference notes
(`gameanalysis/NOTES.md`, on the developer's machine only, never published) hold the measured
behaviour this design was oriented on; consult them before inventing a number, and treat them as
orientation, not as a specification.

## 0. Decisions so far (the user's, 2026-11-25)

- **A mode of its own.** Nothing of it reaches versus play or tournaments: no ships, grunts, ice
  or campaign scoring there, and no change to any versus rule or hash.
- **Bollfort's own piece set** (all 22 pieces and the size schedule) is kept. The _repair deck_
  (§7.3) is held in reserve, for if rebuilding proves too hard with grunts and ice about.
- **Maps are generated**, from a seed, in a few shapes (§3), and **shared**: in co-op all players
  defend one map together.
- **Lives, as in versus** (a pooled count with continues), the count a lever of the difficulty.
- **Three difficulty settings**: Normal and Veteran first; where the third goes (easier or harder)
  is decided after testing (§9).
- **Progress is saved** between levels, as tournaments are (§12).
- **Co-op online from the start**, through rooms, like any match; one player locally too. **No
  bots** in campaign seats for now.
- **The choice of the next level must mean something or not be offered** (§10): v1 goes straight
  on; an informed choice between two fronts follows as its own package.
- **Art**: Medieval and Night first (§14); every other style gets a shared fallback drawing until
  its own is made. **One ship design**, the three kinds told apart by size and by colours that are
  the same in every style. **Frost ships, not frost ships** (the user's, 2026-11-25): their shots
  leave the Frost Cannon's own ice blocks, drawn and refused as those are, only lasting build
  phases (§7). No new picture for it.

## 1. The game in one page

A **campaign** is six **levels**: five, then a **final battle**. A level is one match on its own
map: the players choose castles, rings go up, and then rounds run as in versus — cannons, combat,
build — while an enemy **fleet** attacks from the sea.

- In each **build phase** new ships arrive at the sea's edge, transports at the coast put **grunts**
  ashore, and grunts walk towards the castles, blocking pieces where they stand.
- In each **combat phase** every ship makes one long straight run and fires at the walls; grunts
  smash the wall in front of them; the players shoot ships and grunts.
- A ship sinks after a number of hits (2, 3 or 5 by kind). A **frost ship's** shot leaves **ice**: nothing can be built there for the next two or three build phases.
- A level is **cleared** at the end of a combat phase once the fleet's remaining strength has
  fallen below the level's threshold, or once the level's round limit is reached (§8). The final
  battle cleared, the campaign is won.
- Failing to seal costs a **life** from the team's pool, as a continue does in versus; with none
  left the level is lost, and can be retried (§9).
- Points: ground and guns as in versus, plus hits, sinkings, grunts killed and a bonus per level
  (§11). The score runs across the whole campaign.

## 2. Structure: a campaign is a run of matches

**Each level is one match** — one `createMatch`, one seed, one ruleset, one recording. The
ruleset carries an optional, strict **`campaign` section** describing that level (§15.1): its map
shape, castles, fleet, grunts, ice, the difficulty's levers and what is carried in from earlier
levels. Its absence is versus play: every campaign code path is gated on `state.campaign`, and
every new state section is hashed only when present, so versus hashes and old recordings are
untouched.

Between levels a **campaign run** (client side, like `tournamentFlow`) shows the level's result,
saves, and builds the next level's ruleset from the campaign config, the difficulty and the
**carry-over**: score per player, lives left, rounds played in the campaign, levels cleared,
retries used. A level left midway is replayed from its start, as a tournament match is.

```
CAMPAIGN MENU -> new (difficulty, solo or co-op room) | resume (a save)
-> LEVEL INTRO (map preview, fleet, level number)          [v2: choose between two fronts]
-> MATCH: castle_select -> cannon_place -> combat -> build -> ... (§4)
   -> cleared:  LEVEL SUMMARY -> save -> next level, or VICTORY after the final battle
   -> lost:     DEFEAT -> retry the level (if allowed, §9) or back to the menu
```

## 3. Maps

### 3.1 Shape

One map per level, generated from the level's seed, **shared by all players** (§6). A map is a
rectangle of land and sea with **open sea along one or more edges**, because ships come from the
edge. Shapes (`campaign.map.shape`):

| Shape    | Sea                                  | Notes                                                               |
| -------- | ------------------------------------ | ------------------------------------------------------------------- |
| `coast`  | one edge (N, E, S or W)              | a mainland coast; the easiest to defend                             |
| `corner` | two adjacent edges                   | a headland                                                          |
| `strip`  | two opposite edges                   | a land strip in the middle, sea left and right (or above and below) |
| `island` | all four edges                       | an island, as in versus but larger; ships from every side           |
| `bay`    | one edge, cutting deep into the land | optional, later                                                     |

Lakes inland are allowed (they never connect to the sea and carry no ships). The coastline is
noisy as the versus islands' is. **Default level order** (v1, straight on): level 1 `coast`, 2
`corner`, 3 `strip`, 4 `coast` (another edge), 5 `corner` or `strip`, final battle `island` with a
lake in the middle and few castles. The edge(s) and details are drawn from the seed.

### 3.2 Size

The map's size is configured per player count (unlike versus, where it is measured), sized for
the fleet to have room: starting values 1 player **44 × 32** tiles, 2 players **56 × 36**, 3 players
**66 × 40**; land about 55–65% of the map for `coast`, less for `island`. A sea margin of at least
**4 tiles** along every sea edge, so ships have water to manoeuvre in.

### 3.3 Generation

`sim/src/campaign/terrain.ts`, `generateCampaignTerrain(seed, shape, players, config)`, drawn from
`streamFor(seed, 'campaign-terrain')`:

1. Start from the shape's mask: land everywhere except bands of sea along the sea edges, with a
   coastline moved by the existing noise field (`noiseFrequency`, `coastlineRoughness`), keeping
   the land one connected piece (largest component kept, as `tryGenerate` does).
2. Optionally cut a lake (the final battle's island has one; `campaign.map.lakes`).
3. **Check the sea**: every sea tile that ships may use must be connected to the sea edges; a
   pocket of sea not connected becomes a lake. The navigable sea must have room for a 2 × 2 ship
   along the whole coast (ships are 2 × 2, §5.1).
4. **Place castles** by farthest-point sampling as `placeCastles` does, each with room for its
   starting ring on solid land and at least `minDistanceFromShoreTiles` from the sea. Count by
   level and players (§3.4).
5. **Spawn points**: every sea tile on a sea edge with a 2 × 2 of water inward of it, in order
   along the edge (a cyclic list, §5.2).

`islandId` is 1 for all land (one shared island, §6), 0 for water. Retries on failure as versus
does (`generation.maxRetries`). A test holds that different seeds give different maps (the
"fits versus varies" gotcha) and that every shape generates at every player count.

### 3.4 Castles per level

| Level               | 1   | 2   | 3   | 4   | 5   | final |
| ------------------- | --- | --- | --- | --- | --- | ----- |
| Castles, one player | 6   | 5   | 5   | 4   | 3   | 2     |

**Plus `castlesPerExtraPlayer` (2) for every player beyond the first**, so every player always has
at least one castle to choose and a spare. Fewer castles each level is part of the difficulty: less
choice, fewer cannons.

## 4. The round

The phases are versus play's (`castle_select`, `cannon_place`, `combat`, `build`, the
intermissions and banners), with the same durations by default (`ruleset.phases`: castle 15 s,
cannons 25 s, combat 10 s, build 20 s, overtime 3 s). What the campaign adds, by phase:

| Phase                              | Fleet                                                               | Grunts                                 | Ice             |
| ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------- | --------------- |
| `castle_select` (start of a level) | the first wave arrives (§5.2)                                       | —                                      | —               |
| `cannon_place`                     | ships choose targets (§5.5)                                         | stand                                  | blocks cannons  |
| intermission before combat         | —                                                                   | —                                      | **ages** (§7.2) |
| `combat`                           | ships make their run (§5.3) and fire (§5.4)                         | **smash wall** (§6.4)                  | —               |
| intermission after combat          | **level check** (§8)                                                | —                                      | —               |
| `build`                            | new ships arrive (§5.2); transports at the coast land grunts (§6.2) | **walk** (§6.3), reinforcements (§6.2) | blocks pieces   |
| resolution (end of build)          | —                                                                   | —                                      | —               |

The battle ends early, before its 10 s, when no player has a working cannon and the fleet has no
ship: there is nothing left to shoot (a campaign rule; versus combat always runs its time).

## 5. The fleet

All of it lives in the sim (`sim/src/campaign/fleet.ts`), driven from `step()` as `launchDrones`
and `advanceWaves` are: never transmitted, regenerated by every client from the seed and the
action log. RNG only from named streams: `campaign-spawn:${round}`, `campaign-run:${shipId}:${n}`,
and so on; ships are always processed in id order.

### 5.1 Ships

```ts
interface Ship {
  id: number; // from state.campaign.nextShipId
  kind: ShipKind; // 'raider' | 'transport' | 'frostship'
  x: number;
  y: number; // top-left tile of its 2x2 footprint, where it last stood
  hits: number; // taken so far
  heading: number; // 0..7, eighths of a turn, towards its target castle
  run: Run | null; // a straight run in progress
  shotId: number | null; // its one shot in flight, if any
  target: Tile | null; // assigned by the fleet's aim (§5.5)
}
interface Run {
  dx: number;
  dy: number;
  tiles: number;
  startTick: number;
  ticksPerTile: number;
}
```

**A ship covers 2 × 2 tiles of water.** Its position while sailing is interpolated from its run
in fixed point (exact integer arithmetic, `math.ts`), so every client places it identically and a
shot's hit test (§5.6) agrees everywhere. Ships never overlap: a run claims every tile it will
cross until it ends.

**The three kinds** (`campaign.fleet.kinds`), told apart at a glance in every style by **size and
sail colour**, never by a style's palette (§14.2):

| Kind           | Hits to sink | From level 4 | Weight (§8) | Fires | Special                                 |
| -------------- | ------------ | ------------ | ----------- | ----- | --------------------------------------- |
| **Raider**     | 2            | 3            | 7           | yes   | —                                       |
| **Transport**  | 3            | 4            | 18          | yes   | lands grunts (§6.2); waits at the coast |
| **Frost ship** | 5            | 6            | 20          | yes   | its shots leave ice (§7)                |

### 5.2 Arrival

- **The level's pool** (`campaign.fleet.pool[difficulty][level]`, counts per kind, §8.1) is the
  whole fleet the level will send. Frost ships are also **added to the pool** on a countdown (§8.2).
- **A wave** is drawn from the pool at the start of each build phase (and, for the first wave, as
  the level opens): its size is

  `wave = Σ players' cannons to place this round + level index + bonus`, where
  `bonus = min(rounds played in the campaign, rounds played in this level) + max(0, rounds played in the campaign − 2)`,

  capped by what is left in the pool. Each ship of the wave is drawn at random from the pool,
  weighted by the counts left of each kind. **More cannons bring more ships**: the fleet keeps up
  with the defenders.

- **Arrival during the build phase**, one ship per kind every **30 ticks** (1 s) while that kind's
  share of the wave lasts; the first wave arrives during the castle choice. A ship appears at a
  spawn point (§3.3): the fleet's spawn cursor steps on by **random(10), at least 3**, entries
  around the cyclic list, and takes the first free one from there. It fades in at the edge and
  turns its heading towards the nearest castle.
- **At most `maxAfloat` ships at once** (16 for one player, +4 per extra player); a ship that
  cannot arrive waits in the wave until a place is free.
- Ships stay afloat from round to round until sunk.

### 5.3 Movement: one long run per battle

Ships move **only in combat**. As combat opens, every ship without a run plans one, in id order:

1. **Direction**: one of three preference lists, chosen with equal chance, in eighths of a turn
   relative to its heading: `[0, −1, +1, −2, +2]`, `[−1, 0, +1, +2, −2]`, `[+1, 0, −1, −2, +2]`.
   It takes the first direction whose next 2 × 2 is free water. Never backwards. None free: it
   waits this battle.
2. **Speed**: `s = min(random(level index + rounds in this level), 3)`; ticks per tile from
   `[64, 43, 32, 26]` (2.1 s down to 0.85 s a tile). In level 1's first round every ship is at the
   slowest; later they are faster.
3. **Length**: one tile, then as many more in the same direction as are free water and still fit
   `combat ticks left + 72` at that speed (6 tiles at the slowest at the battle's start, 15 at the
   fastest). It claims those tiles.

When a run ends before the battle does, the ship plans the next one at once. A ship never turns
mid-run. Its heading is re-aimed at the nearest castle at each new run.

**The coast**: a **raider or frost ship** whose run ends next to land (an orthogonal neighbour of its
footprint is land) during combat is **recycled** at the next build phase: it is removed and goes
back into the wave, to arrive again at a spawn point. (Measured behaviour; it keeps ships off the
shore, where they would be easy prey.) A **transport** next to land stays there, unloading (§6.2);
once it has no grunts left to land it stays as well, a target.

### 5.4 Firing

- **One shot in flight per ship.** Ships fire only in combat.
- **The fleet's aim** (§5.5) hands its best target to **one ship every 22 ticks** (0.73 s), the next
  ship in id order whose shot is free and which is not mid-sail-start; that ship fires at once.
  (Measured: three ships fired 11 shots in a 10-second battle, seven fired 20.)
- A fleet shot flies as a cannon's (`shots.baseFlightMs` + per tile, distance from the ship's
  centre), scaled by `campaign.fleet.flightFactor` (1.0), and **lands exactly on its target** — no
  scatter.
- **What it does**: a team wall tile it hits is cleared (one tile; `lostWalls` as a cannon's).
  Castles and cannons are **not damaged** (versus play's rule; `campaign.fleet.damagesCannons` is a
  lever, off). A **frost ship's** shot also freezes the tile it lands on, wall or bare ground
  (§7). Water: a splash.

### 5.5 The fleet's aim

Run over every team wall tile when a target is due (the map is small; a full scan is cheap):

`score(tile) = base[n] + 5 × (orthogonal neighbours that are a castle or a cannon) − 12 × (orthogonal neighbours destroyed this round)`

with `n` the tile's orthogonal wall neighbours and `base = [−10, 0, 10, 15, 0]` for n = 0..4. So
ships go for **wall in the middle of a run** (two or three wall neighbours), where one hit opens a
breach, not stubs or the thick inside of a double wall, and **spread their damage** instead of
widening one hole. The **last 8 tiles aimed at are skipped**. Ties go to scan order (columns left to
right, rows top to bottom). With no wall left, ships hold fire.

### 5.6 Hitting ships

- In campaign play `fire()` accepts **any tile**: the sea (for ships) and the team's own land (for
  grunts). An impact never damages a team wall (`damagesOwnWalls` stays false), so shooting a grunt
  next to the wall is safe.
- **A ship is hit** when the impact point lies inside its 2 × 2 footprint **grown by half a tile on
  every side**, the footprint taken at its interpolated position on the impact tick. One hit per
  shot; with two ships in reach the one with the lowest id.
- At `hits ≥ kind.hitsToSink` (+1 from level 4) it **sinks** (an event for the client: sinking
  animation, splash, points §11), its run's claimed tiles freed, its shot in flight still landing.
- Fleet shots never hit ships.

## 6. Co-op on one map, and grunts

### 6.1 Sharing the map

- **One team**, all players on it; one shared island (`islandId` 1), whose walls and territory
  belong to the team. Any player may place pieces anywhere on the team's free land
  (`teams.crossIslandBuild` everyone, `build.restrictToOwnIsland` irrelevant here).
- **Each player has a main castle** (crown), chosen in `castle_select` among the free castles
  (first come, ties by seat order; the auto-pick for a player who does not choose takes the free
  castle nearest the map's centre of land). Two players never hold the same castle.
- **Cannons** are each player's own (they fire them), placed anywhere in the team's territory.
  Inert outside territory, as in versus.
- **Holding castles**: at each resolution every sealed castle is assigned to a player: each
  player's main castle to them if sealed; then each player without one takes the nearest
  unassigned sealed castle (seat order); remaining sealed castles stay unassigned. **A player with
  no castle assigned has failed** (§9). Cannon rewards per player as versus (`cannonReward`: the
  main castle's reward if theirs is sealed, the extra castle reward for each other castle they were
  assigned), and the **unassigned sealed castles' rewards are dealt one each in turn**, starting
  with the player with the fewest cannons.
- **Pockets** (sealed ground without a castle) are territory while the team holds any sealed
  castle (versus rule, team-wide).
- Scores are each player's own and summed for the team (§11).

**Implementation**: the sim's ownership model is one island per player. The campaign needs the
island to belong to the team and castles to a holder. Suggested: a `holder` on each castle
(player id or 0) used only when `state.campaign` is present; the island owned by seat 0 with the
others its teammates; enclosure computed for island 1 and handed out by `holder`. Every check that
reads "the player's island" (`placement.ts`, `cannonReward`, `enclosedCastlesByPlayer`,
`scoreRound`) needs a campaign branch. One player is the same code with one holder.

### 6.2 Grunts arriving

```ts
interface Grunt {
  id: number;
  x: number;
  y: number;
  facing: 0 | 1 | 2 | 3;
  nextStepTick: number;
  nextActTick: number;
}
```

A grunt stands on one land tile. It blocks pieces, cannons and other grunts; it does not block the
enclosure flood (it is not wall) and is not damaged by fleet shots.

- **The round's allowance** of grunts to land, set at each build phase: by rounds played in the
  campaign, `[5, 6, 7, 8, 9, 10, 12, 13]` (the last for every round after), times
  `1 + 0.5 × (players − 1)` (§9 lever).
- **Landing**: in the build phase, each transport next to free land puts one grunt on a free land
  tile beside it every **56 ticks** (1.9 s) while the allowance lasts.
- **Reinforcement**: every **352 ticks** (11.7 s) per grunt on land, a new grunt appears on a
  random free tile beside it, from the same allowance. Small landings grow.
- **Removed**: by a player's shot landing on its tile (§11 points); by being **walled in** — a
  piece that seals ground, pockets too, clears every grunt on it at once, the points to whoever
  placed it (the user's, 2026-11-25: building round a landing is a way to fight it); and at a
  level's end. When a player's continue raises a new ring, grunts inside the ring's 8 × 8 are
  removed.

### 6.3 Grunts walking (build phase only)

Each grunt steps one tile every **48 ticks** (1.6 s), only in the build phase:

- **Goal**: the nearest castle by Manhattan distance (every castle of the map, held or not); the
  direction one of four, the one nearest the straight line to it.
- **Free tile ahead** (land, no wall, grunt, cannon, castle, ice): step.
- **Blocked**: try 90° one way, then the other (counter-clockwise first); all three blocked: turn to
  face the goal and wait. Never backwards. Against a wall a grunt slides along it, re-aiming each
  step.
- **At a castle** (the tile ahead is the castle): it stops and faces it.

### 6.4 Grunts smashing (combat only)

Every **208 ticks** (6.9 s) per grunt, only in combat: the tile it faces, if it is team wall, is
cleared as a shot would clear it (counted in `lostWalls`, no points to anyone). About one wall per
grunt per battle.

**A grunt at a castle** does nothing more in v1 than block and smash. Whether a castle with a grunt
beside it should count as **besieged** (no cannon reward while besieged) is a lever to try in play
(`campaign.grunts.besiegeBlocksReward`, off).

## 7. Ice, and the pieces

### 7.1 Ice

Frost ships are the design's frost ships read as frost (the user's, 2026-11-25): a frost ship's shot
freezes the tile it lands on — wall (the wall is cleared as by any shot) or bare ground; not water,
castles or cannons. **A frozen tile takes no piece, no cannon and no grunt.** It does not block the
enclosure flood (ice is not wall, so a ring with ice in it is open until rebuilt round the ice).

### 7.2 Lifetime

Ice **ages as each combat phase begins**:

- in the campaign's first **8 rounds**: a new patch lasts through the next **2** build phases;
- from round 8 on: **3** build phases.

(`campaign.ice: { early: 2, late: 3, lateFromRound: 8 }`.) Measured: the ageing at the start of
each battle, never during a build phase, so a player always knows at a build phase's start what
will still be frozen at its end.

### 7.3 Implementation: the Frost Cannon's blocks, made to last

The frost mechanism (`sim/src/frost.ts`) as it is: a frozen tile is a `Freeze` with `buildsLeft`
(`sim/src/campaign/ice.ts`), frozen to the end of every build phase it has left, kept when a build
phase ends where a Frost Cannon's freeze goes, and counted down as each battle opens; refused by the
same `frozen` rejection. Cannon placement and grunt movement check it too (a Frost Cannon's freeze
blocks pieces only). Drawn by the same shared layer as a Frost Cannon's ice (`render/towerMarks.ts`),
the same in every style; a frost ship's freeze plays the Frost Cannon's sound and burst.

### 7.4 Pieces

Bollfort's catalogue and size schedule (`build.pieces`, `build.sizeSchedule`), dealt per player by
`pieceAt` as in versus. **Each level starts the piece schedule again** at `campaign.pieces.levelStartRound`
(3: mid-size pieces; a level's first ring is the game's, so the smallest pieces are not needed at
once); a continue rewinds that player's schedule to round 1 as in versus.

**The repair deck** (held in reserve, `campaign.pieces.repairDeck`, off): while a player holds no
sealed castle, their pieces come from a small band (sizes 1–3: single, domino, three in a line and
corner) — a deliberate help for patching a broken ring among grunts and ice. Further ideas from
the reference notes, if needed: no piece dealt twice in a row (except the single block); a fixed,
shuffled deck rebuilt when empty.

## 8. Levels: pools, waves, the end of a level

### 8.1 The pools

Ships per level, by difficulty, as counts **raider / transport / frost ship** for one player
(`campaign.fleet.pool`), scaled for co-op by `1 + 0.6 × (players − 1)` per kind, rounded:

| Difficulty         | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 | Final   |
| ------------------ | ------- | ------- | ------- | ------- | ------- | ------- |
| (easier, reserved) | 10/0/0  | 18/6/0  | 15/20/0 | 13/26/0 | 3/24/3  | 3/24/3  |
| **Normal**         | 10/0/0  | 16/8/0  | 12/22/0 | 8/30/0  | 2/25/10 | 2/25/10 |
| **Veteran**        | 10/0/0  | 15/10/0 | 10/25/0 | 6/30/6  | 2/32/14 | 2/32/14 |
| (harder, reserved) | 10/0/0  | 15/12/0 | 9/30/6  | 5/35/10 | 2/40/18 | 2/40/18 |

### 8.2 Frost ships on a countdown

On top of the pool: a countdown per level (`campaign.fleet.frostshipEvery[difficulty][level]`, in
rounds): Normal `[5, 4, 3, 2, 1, 1]`, Veteran `[3, 2, 1, 1, 1, 1]`, easier `[5, 3, 2, 2, 1, 1]`,
harder `[2, 2, 1, 1, 1, 1]`. It starts at the level's value + 2 and counts down each round; at 0 a
frost ship is added to the pool (and its weight to the threat) and it restarts at the level's value.
So frost ships come rarely early and every round late, whatever the pool says.

### 8.3 Threat and the end of a level

The fleet's **threat** = Σ weight × (ships of each kind still in the pool, in waves and afloat)

- 4 × grunts on land − 7 × the team's cannons. At the end of each combat phase (after the last
  shot lands):

* **Cleared** when `threat < threshold[level]` (`[20, 30, 60, 80, 80, 80]`, × the co-op pool
  factor), **or** when the rounds played in the level reach `maxRounds[level]`
  (`[3, 8, 17, 19, 21, 21]`): the level is survived. Ships still afloat sail off.
* Otherwise the round goes on to its build phase.

Every cannon counts against the threat, so a well-armed team finishes sooner; a level is never
endless. The match ends with `endedBy: 'level_cleared'` (`checkGameOver`'s campaign branch, which
must also stop the all-one-team ending of versus play).

## 9. Lives, failing, difficulty

- **Lives**: a team pool, `campaign.lives[difficulty]` + `livesPerExtraPlayer` × (players − 1).
  Starting values: Normal 3 (+1), Veteran 2 (+1). Carried over from level to level; **+1 life for
  each level cleared**, up to the starting count (`campaign.lifePerLevel`).
- **Failing** (§6.1: a player with no castle at the resolution) spends one life per player failing,
  as versus play's continue: that player chooses a castle again among the free ones during the
  coming cannon phase, a fresh ring goes up round it (grunts inside it removed), and they place the
  opening count plus the continue bonus. **The map is not wiped** (it is shared): the walls, other
  players' cannons, ships and ice stay. The round's points are forfeited for that player.
- **A free first try**: a failure in a level's first round costs no life (it is easy to lose the
  first ring to an unlucky opening).
- **Lost**: a player failing with the pool empty loses the level for the team (`endedBy:
'level_lost'`). The defeat screen offers **Retry level**: the level again from its start, with
  the score and lives carried in at its start. `campaign.retries[difficulty]`: Normal unlimited,
  Veteran 2 per campaign.
- **Catch-up lever** (reserved, `campaign.continueShotBonus`, off): after a continue that player's
  shots fly 25% faster, up to twice.

**Difficulty** is a table of levers (`campaign.difficulties`): the pool row, the frost ship
countdown, lives, retries, the grunt allowance factor, and a score multiplier (Normal 1.0, Veteran
1.5). **Veteran also starts at level 2** with a bonus of 500 points, skipping level 1 (six levels
remain: 2, 3, 4, 5, a second 5 and the final battle). The third setting is placed after testing,
either easier (more lives, the easier pool, no frost ship countdown before level 3) or harder (the
harder pool, 1 life, no retries).

## 10. Between levels

**v1: straight on.** After the summary the next level's intro: its number, its map's shape in a
small preview (generated from the seed, so it is the real map), and the fleet expected (the
pool's kinds and counts as ship icons).

**v2: an informed choice** (its own package, CA14): after levels 1–4 two **fronts** are offered,
each with its map preview and its **fleet character**, a modifier on the level's pool:

- **Raiders**: +50% raiders, faster (speed +1 tier), no transports;
- **Landing force**: +50% transports, grunt allowance +50%;
- **Frost fleet**: the frost ship countdown halved;
- **Calm sea**: the plain pool, but a smaller score multiplier.

Each front shows what it means in one line, and a reward multiplier reflecting its difficulty, so
the choice is between risks the player can weigh. Fronts are drawn from the campaign seed and the
levels cleared, so a save resumes the same offer.

## 11. Points

Per player, summed for the team, × the difficulty's multiplier:

- **Each round**, banked at the resolution by every player holding a castle, as in versus:
  ground (1 per team territory tile, **shared equally** among the players holding castles, rounded
  down) and guns (5 per own working gun after the resolution). Forfeited by a player who failed.
- **Hits**: 10 per hit on a ship; on sinking, 20 (raider), 40 (transport), 60 (frost ship), to the
  player whose shot sank it.
- **Grunts**: 10 each, shot or walled in.
- **Level cleared**: 250 × the level's number, to every player; the final battle 2000.
- No points for walls (there are no opponents' walls).

## 12. Saving progress

A save per campaign in localStorage, `bollfort.campaign.<id>`, as tournaments are
(`client/src/tournamentSaves.ts` as the model; the package `packages/campaign` holding the schema,
as `packages/tournament` does):

```ts
const CampaignSaveSchema = z.strictObject({
  version: z.literal(1),
  id: z.string(),
  createdAt: z.number(),
  playedAt: z.number(),
  difficulty: z.enum(['easier', 'normal', 'veteran', 'harder']),
  seed: z.number().int(), // the campaign's; each level's seed derives from it
  players: z
    .array(z.strictObject({ name: z.string() }))
    .min(1)
    .max(3),
  level: z.number().int(), // the next level to play, 0-based
  carry: z.strictObject({
    scores: z.array(z.number().int()),
    lives: z.number().int(),
    roundsPlayed: z.number().int(),
    retriesUsed: z.number().int(),
  }),
  history: z.array(
    z.strictObject({
      level: z.number().int(),
      shape: z.string(),
      front: z.string().optional(),
      rounds: z.number().int(),
      points: z.array(z.number().int()),
      result: z.enum(['cleared', 'lost']),
    }),
  ),
  finished: z.boolean(),
});
```

- **Saved** after every level, cleared or lost, and when a campaign is started. Never mid-level: a
  level left is replayed from its start (`carry` is the level's start).
- `parseSave` tells another version from a damage, as the tournament's does.
- **Resume** lists the saves (Resume campaign); a co-op save is the **host's**, resumed by the host
  opening a room with it; any people may take the seats (names in the save are labels).
- Level seeds: `mix32(campaign seed, level, retry)`, so a retry is a fresh map of the same shape.

## 13. Online co-op

- **Rooms**: the `create` message gains `mode: 'campaign'` and the campaign's start (difficulty,
  players 1–3, or a save's carry-over and level). `RoomManager.create`, `Room` and `MatchRunner`
  get a campaign branch: **no bots** fill seats (a campaign room starts only with its seats taken,
  or the host lowers the count); the match is created from the level's ruleset; at the level's end
  the room stays open on the summary, and the host's **Next level** (or **Retry**) starts the next
  match in the same room with the carry-over the host's client sends (validated by schema and
  bounds: a co-op host cheating only cheats their own team).
- **Local**: one player runs it in `LocalMatch`, which needs a campaign path for the terrain
  (today it always uses `defaultTerrainConfig`) and no bot table.
- **A dropped player**: their seat stays theirs; while away their cannon phase is auto-finished
  (`autoFinishCannonPhase`), their guns stand silent, teammates may build for them. They may
  rejoin; a campaign never gives the seat to a bot.
- **Protocol**: `PROTOCOL_VERSION` 38 → 39; the snapshot gains an optional `campaign` object (fleet,
  grunts, ice, the level's counters), present only in campaign matches; `players` may be 1 when
  the ruleset has a campaign section (schema refine). **Recordings**: the header's ruleset carries
  the campaign section; bump `RECORDING_FORMAT` only if the header's shape changes; a recording
  replays one level.

## 14. What it looks like

### 14.1 Screens

- **Menu**: a **Campaign** button beside Play and the tournament's, opening the campaign screen:
  New campaign (difficulty as three cards — the third greyed until decided —, Solo or Co-op room),
  Resume (the saves: difficulty, level, score, date; Delete).
- **Level intro** (§10), **level summary** (points by source and player, ships sunk by kind, grunts,
  lives; Next level), **defeat** (Retry level / Back to menu, retries left), **victory** (the
  campaign's total, levels with their points; back to menu). In the menus' frame, as the
  tournament's screens are.
- **HUD in the match**: the level and round; lives (the team's); the fleet's strength as a bar
  falling towards the level's threshold (a mark where it clears), with ship icons for the pool
  left by kind; each player's score; banners for "Ships approaching", "Transports landing",
  "Level cleared", "Frost ship sighted" (the first of a level), as phase banners are.

### 14.2 Ships: one design, three kinds

- **One drawing**: a hull seen from above at an angle, a deck, one or two masts with square sails
  and a pennant, a wake behind it while sailing, a small gun flash and smoke when it fires.
  Drawn once per tile size as a stamp (`StampBook`), turned to eight headings, so it costs nothing
  to place.
- **The kinds by size and sail colour, the same in every style** (`art.default.json`,
  `campaign.shipColours`, never a style's palette):
  - **Raider**: the base size (2 × 2 tiles), **white** sails;
  - **Transport**: 110% long and wider in the beam, **yellow** (ochre) sails, figures on deck;
  - **Frost ship**: 120%, **icy blue** sails, a cold glow at the bow.
  - The hull's own colour may follow the style; sails and pennant never do.
- **Hit**: a splinter burst and a smoke puff; damage marks on the sails by hits taken.
  **Sinking**: it lists, sinks, a ring of foam and debris.
- **Arriving**: fades in at the edge. **Recycled at the coast**: turns and fades out.

### 14.3 Grunts and ice

- **Grunt**: a small figure on one tile, four facings, a bob while walking, a raised club when
  smashing; one colour for all grunts in every style (dark red tunic), so a grunt reads as enemy
  anywhere. Medieval and Night: a soldier; other styles later.
- **Ice**: the Frost Cannon's own blocks (`towerMarks.ts`), nothing new (§7).

### 14.4 Styles

- **Medieval and Night first**: ships, grunts, fleet shots (the style's own cannonball), sinking
  and ice in both. Night shares Medieval's drawing with its lighting.
- **Every other style**: a **shared fallback layer** (`render/campaignMarks.ts`, like `TowerMarks`)
  draws ships and grunts plainly, the same in every style, over the style's own board, until the
  style gets its own. A style opts in through optional `Theme` members (`ship?`, `grunt?`), as
  `drone?` does.
- Cheap drawing (CLAUDE.md, Drawing a style cheaply): stamps for ships and grunts, particles for
  smoke, foam and embers, nothing redrawn that has not changed. Measure with `&perf=1` at three
  players on the largest map.

### 14.5 Sound

v1 reuses the existing, credited cues: a cannon's shot for a ship's, impacts and splashes, the
seal's fanfare; new cues (ship bell, grunts landing, freezing) later, each credited in
`config/audio.manifest.json` as every file must be.

## 15. Implementation

### 15.1 Configuration

- **`config/campaign.default.json`**, schema `packages/config/src/campaign.ts` (strict), added to
  `ConfigBundle` (`bundle.ts`, `defaults.ts`, `node.ts`): the campaign as a whole — difficulties,
  pools, countdowns, lives, maps per level, castles, scoring, the fleet's and grunts' timings.
- **`ruleset.campaign`** (strict, `.optional()`, `RulesetSchema`): the one level a match plays,
  built by `campaignRuleset(campaignConfig, difficulty, level, players, carry, front?)` from the
  config, so it travels in the snapshot and the recording's header. Its absence is versus.
- `RulesetSchema.players.min` 1 when a campaign section is present (a refine), else 2.
- `validateConfigBundle`: every level has a shape, castles ≥ players + 1 at every count, map sizes
  fit the shapes, pools and countdown tables cover every difficulty and level.

### 15.2 Simulation (`packages/sim/src/campaign/`)

| File         | Contents                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `terrain.ts` | `generateCampaignTerrain` (§3)                                                                                                                                     |
| `state.ts`   | `CampaignState`: pool, waves, ships, grunts, ice, spawn cursor, frost ship countdown, rounds in level, aim history, `nextShipId`, `nextGruntId`; its copy and hash |
| `fleet.ts`   | arrival (§5.2), runs (§5.3), aim and firing (§5.4–5.5), hits (§5.6), recycling                                                                                     |
| `grunts.ts`  | allowance, landing, reinforcement, walking, smashing (§6.2–6.4)                                                                                                    |
| `ice.ts`     | frozen tiles on frost's mechanism (§7)                                                                                                                             |
| `level.ts`   | waves, the frost ship countdown, threat, the end of a level (§8)                                                                                                   |
| `coop.ts`    | castle holders, failing, continues on a shared map (§6.1, §9)                                                                                                      |

- **Hooks**: `createMatch` (campaign terrain and state); `step()` after `resolveImpacts`:
  `advanceCampaign(state)`; `enterPhase`/`beginPendingPhase` (waves at build, runs at combat, ice
  ageing before combat); `resolveImpacts` (ship hits, grunt kills, ice on frost ship impacts);
  `resolveRound` (holders, failures, points); `checkGameOver` (level cleared or lost).
- **Shots from the fleet**: `Shot` gains an optional `ship` (the firing ship's id) with `owner` 0
  and no cannon; `strikable` accepts a fleet shot against a team wall. Versus code never makes one.
- **Determinism**: integer and fixed-point arithmetic only; RNG only by named streams; every list
  processed in id order; arrays replaced, not mutated where a rollout copies them (as `frozen`).
  **Hash**: `state.campaign` hashed only when present (`hashMatchState`, as `frozen` and `waves`),
  bumping `HASH_VERSION` only if the versus part changes (it must not).
- **Events** for the client: `ship_arrived`, `ship_fired`, `ship_hit`, `ship_sunk`,
  `ship_recycled`, `grunt_landed`, `grunt_killed`, `wall_smashed`, `fire_started`, `fire_out`,
  `level_cleared`, `level_lost`.
- **Tests**: `stateFromAscii` gains glyphs for a ship (`S`, top-left of its 2 × 2), a grunt (`g`)
  and ice (`f`); expectations as ASCII pictures for runs, aim, landing, walking and smashing. A
  campaign level replayed from its action log reproduces its hashes; a versus match's hashes are
  unchanged by the whole package (the existing determinism tests).

### 15.3 Other packages

- **`packages/campaign`**: the save schema, `campaignRuleset`, the level sequence, fronts (v2),
  the run's state machine (pure, testable, as `packages/tournament`).
- **Protocol**: §13. **Server**: §13. **Client**: §14, `campaignFlow.ts` (as `tournamentFlow.ts`),
  `campaignSaves.ts`, the screens, the HUD, the render layers.
- **AI**: none in campaign seats; `ai` must not break on campaign state (the rollout copies it or
  ignores it — no bot plays a campaign).
- **Analysis**: per-round statistics for campaign matches (ships arrived, sunk, recycled, shots,
  walls lost to ships and grunts, grunts landed and killed, ice tiles, failures), for balancing.
- **Headless**: `--campaign --difficulty normal --level N --players P`, with a stand-in player
  for measuring the fleet: a scripted defender that rebuilds the starting ring and fires at the
  nearest ship (enough to measure the fleet's pressure; a real campaign bot is out of scope).
- **Achievements**: campaign matches excluded from the existing achievements' counting
  (`matchCounts`); campaign achievements (a level cleared, the campaign won per difficulty, a
  frost ship sunk) proposed later in `docs/STEAM_ACHIEVEMENTS.md`.
- **Locale**: every new text in `en`, `de` and `hes` (`locale.test.ts`).
- **Docs**: PLAN §11 a new item pointing here, §12's "singleplayer campaign" deferral removed;
  CLAUDE.md's Status and layout updated as packages land.

### 15.4 The code as it stands (surveyed 2026-11-25)

So a new session need not survey again; line numbers drift, the names do not.

**What stands in the way today**, all to be lifted for campaign rulesets only:

- **One player is refused**: `RulesetSchema.players.min` is `min(2)` (`config/src/ruleset.ts`),
  `createMatch` throws below `ruleset.players.min` (`sim/src/match.ts`), `SnapshotSchema.players`
  is `.min(2)` (`protocol/src/snapshot.ts`), and the protocol's `create` message takes 2–8 players.
- **One team ends the match**: `checkGameOver` (`match.ts`) ends it once one team or fewer is
  alive, so an all-human team would win at the first resolution.
- **Only players fire**: every shot needs a `cannonId` and a player `owner`; `fire()` refuses one's
  own and teammates' islands; `strikable`/`isOpponents` (`sim/src/shots.ts`) judge a wall by the
  shooter's player.
- **Rooms host only matches** (and tournament matches): the `create` message has no mode field.
- **`LocalMatch` always uses `defaultTerrainConfig`** (`client/src/localMatch.ts`).
- **One island per player**: player p owns island p + 1; placement, enclosure, rewards and scoring
  all read "the player's island" (§6.1's implementation note).

**The sim** (`packages/sim/src`):

- `MatchState` (`types.ts`): `seed`, `ruleset`, `terrainConfig`, `width`, `height`, `tick`, `round`,
  `phase`, `phaseEndTick`, `pendingPhase`, `overtime`, `players`, `teams` (`continuesRemaining`,
  `continuesAtStart`), the grids `terrain`, `islandId`, `structure`, `owner`, `territory` (all
  `Uint8Array`), `castles`, `cannons`, `shots`, `lostWalls`, `frozen`, `waves`, the id counters,
  `winners`, `draw`, `endedBy`, `events`. `Terrain` {Water, Land}; `Structure` {Empty, Wall,
  Castle, Cannon, Stone}; no rubble type (a cleared wall is Empty).
- Phases (`PHASES`): `lobby`, `castle_select`, `intermission`, `combat`, `build`, `cannon_place`,
  `game_over`; durations `ruleset.phases.*Ms` through `ticksFor`; `enterPhase`,
  `enterIntermission`, `beginPendingPhase` (the round counts up on entering combat),
  `advancePhase`; `step()` = tick++, `resolveImpacts`, `advanceWaves`, `launchDrones`,
  `advancePhase`. `tickRateHz` 30.
- Actions: `select_castle`, `fire`, `place_piece`, `place_cannon`; `applyAction` →
  `fire()` (`shots.ts`), `placePiece`/`canPlacePiece`/`cellsRefusal` (`placement.ts`, with the
  `isFrozen` refusal), `placeCannon`; the wire's `ActionSchema` in `protocol/src/messages.ts`.
- Shots: `newShot` (impact tick = base + per tile × distance, `flightTicks`), `resolveImpacts`
  (`strikeWall`, `shot_impact`, then `freezeTile` and the Lullaby's effect).
- Enclosure: `computeEnclosure`/`applyEnclosure` (`enclosure.ts`), a flood from the map border,
  8-connected, only wall-like tiles block.
- The round: `resolveRound` (`match.ts`): enclosure, lives from the team pool (continue:
  `wipeIsland`, starting cannons + bonus, `pieceRound = 0`), `cannonReward`, the sweep,
  `scoreRound`, `checkGameOver`; `autoFinishCannonPhase`.
- Hash: `hashMatchState` (`HASH_VERSION` 4); optional sections (`frozen`, lulled guns, `waves`,
  the drone's anchor) hashed only when non-empty — the pattern for `state.campaign`.
- RNG: `streamFor(seed, name)` (`rng.ts`). Pieces: `pieceAt(ruleset, seed, round, index)`
  (`pieces.ts`), the bands from `build.sizeSchedule`; each player dealt through `currentPieceId`
  (`placement.ts`) by `pieceRound` and `pieceIndex`.
- Frost (`frost.ts`): `Freeze {tile, share, throughOvertime, thawTick}`, `freezeTile` on impact,
  `startFreezes` as build opens, `thawExpired` each build tick, cleared at build's end; in the
  snapshot (`protocol/src/snapshot.ts`) and the bots' rollout copy (`ai/src/rollout.ts`). Drawn by
  `client/src/render/towerMarks.ts` (`drawIce`), the same in every style, one shared layer over
  both looks.
- Terrain (`terrain.ts`): `generateTerrain` → `tryGenerate` (noise, threshold to the target area,
  largest component, erosion, trim), `placeCastles` (farthest-point sampling, ring room on solid
  land), `planLayout`/`patternFor`; a 2-tile water border; no notion of sea edges.
- Autonomous controllers inside the sim, the model for the fleet: `launchDrones` (`drone.ts`) and
  `advanceWaves`, deterministic by named streams, never transmitted.
- Tests: co-located `*.test.ts` (vitest); `stateFromAscii(art, ruleset, islands?)`
  (`sim/src/testing.ts`; `.` water, `,` land, `#` wall, `@` castle, `*` cannon, island digits);
  helpers `beginMatch`, `withoutContinues`, `withoutRoundCap`, `fastRuleset`.

**Elsewhere**:

- Config: `RulesetSchema` (`config/src/ruleset.ts`, strict throughout, refines, retired keys); a
  new file joins `ConfigBundle` (`bundle.ts`), `defaults.ts`, `node.ts`; `validateConfigBundle`.
- Tournament saves, the model for campaign saves: `packages/tournament/src/save.ts`
  (`SAVE_VERSION`, `SaveSchema`, `parseSave`), stored by `client/src/tournamentSaves.ts`
  (`bollfort.tournament.` keys), resumed through `tournamentResume.ts` and `tournamentFlow.ts`
  (`playTournament`); no match state is saved.
- Server: `RoomManager.create` (`server/src/rooms.ts`), `Room` (`room.ts`: seats, `handle`,
  `start()` — bots fill seats, `dealSeats`, `applySettings`, `createMatch`, the recorder, the bots'
  slots, a `MatchRunner`), `MatchRunner.tick` (`matchRunner.ts`: bot turns, queued actions, `step`,
  a `commit` with a hash). `PROTOCOL_VERSION` 38 (`protocol/src/messages.ts`), `RECORDING_FORMAT` 4
  (`protocol/src/recording.ts`).
- Client: the menu (`menu.ts`, `showMenu`), query routing (`main.ts`), the style registry
  (`styles/registry.ts`, `StyleDefinition`, `Theme` in `render/theme.ts` with optional members such
  as `drone?` falling back to a shared look), `t()` (`i18n.ts`) with `config/locale/{en,de,hes}.json`
  and `localeProblems`, phase banners (`hud.ts` `PHASE_CALL`, `phaseBanner`; `banners.ts`). The
  tutorial (`client/src/tutorial/`) builds its own board and session: a precedent for a board that
  is not versus play's.
- Achievements: `matchCounts` (`client/src/steam/achievements.ts`) excludes the demo, watched
  matches and dev parameters; the tutorial is excluded in `runSession` (`matchScreen.ts`).
- Headless (`tools/headless/src/main.ts`): `--matches`, `--players`, `--seed`, `--set path=json`
  (schema-checked overrides), `--stats`, `--record`, `--map` (`renderAscii`), `--replay`.

### 15.5 Starting

Begin with CA1 in a fresh session: read this document, CLAUDE.md, PLAN §1 (the rules the campaign
builds on) and SPECIAL_TOWERS.md §2.7 (the frost blocks ice reuses). Ask the user anything this
document leaves open before coding, as every design question is asked. The reference notes are a
fallback for numbers, never a source of code or text.

## 16. Work packages

In order; each ends with `npm run check` passing and, where marked, the user's play.

**Progress.** **CA1 done** (2026-11-25). `config/campaign.default.json` holds the levels,
difficulties, pools, countdowns, lives, map sizes, ship kinds, threat, pieces and scoring; the
fleet's, grunts' and ice's timings join it in their packages. `ruleset.campaign` carries
the level's difficulty, index, shape (drawn from the seed by `campaignRuleset`), round limit,
lives, piece start round and carry, and grows the same way. A campaign ruleset may take one
player, has no versus round cap and no towers. The team's pool of continues is the carried lives,
scores start from the carry, and the first build deals the schedule's round 3. The level is
cleared in the intermission after the battle that reaches its round limit, and lost at a
resolution once nobody is left in it (`sim/src/campaign/level.ts`); `endedBy` gains
`level_cleared` and `level_lost`, hashed after versus play's codes. Until CA2 a solo level is
played on a one-island versus map, from a `players: 1` pattern added to the terrain config;
`?campaign=1&level=N&difficulty=` opens one. The protocol is unchanged (CA11 bumps it), and so
is the end screen ("You win" when cleared).

**CA2 done** (2026-11-25). `generateCampaignTerrain` (`sim/src/campaign/terrain.ts`) draws the
level's map at its configured size: a distance from the sea edges, the corner where two meet
rounded as versus play's boxes are, plus noise, cut at the sea level that gives the land its
share (`map.landFraction` by shape: coast 60%, corner and strip 50%, island 42%). The sea margin
is kept open, the largest piece of land kept, and the area checked before lakes are cut (with
the lake counted against it, the final battle's map needed up to 38 draws). The coastline's
noise is the campaign's own (`map.coastNoise`, ±7 tiles at frequency 0.06): versus play's ±3,
sized for a box a few tiles from the sea, left a campaign coast nearly straight. Lakes sit near
the land's middle, clear of every shore by their radius and three. Castles are placed by
versus play's farthest-point sampling (`placeCastles`, now given a count and a clearance from the
map's edge); spawn points run clockwise round the edge wherever a 2 × 2 ship fits in open sea,
and the sea is told from lakes by a flood from the edge (`seaOf`). `bay` throws until it is
built. Every level generates at 1–3 players for sixty seeds each, in one draw (2 ms a map).
`--map --campaign N [--players P] [--difficulty D]` prints one. The `players: 1` pattern in the
terrain config stays: seating asks `patternFor` even for one seat, until co-op seats (CA10).

**CA3 done** (2026-11-25). `state.campaign` (`sim/src/campaign/state.ts`) holds the pool, the
wave, the ships, the spawn cursor and the guns given; hashed after everything versus play
hashes, only in a campaign. `sim/src/campaign/fleet.ts`: the wave is drawn as the castles are
chosen and as each build phase opens, from the guns given that round (the opening count, then
each resolution's awards, as the reference adds them), the level's index and the rounds bonus;
one ship of each kind arrives a second; raiders and frost ships standing at the coast when a build
phase opens go back into the wave. As a battle opens every ship plans its run in id order —
re-aimed at the nearest castle, the heading's octant found exactly against 29/70 rather than by an
arctangent — and a run claims every footprint it crosses. Runs may outlast the battle by the
slack and finish in the intermission; no run is planned outside a battle. The level's section
gains `fleet` (the pool scaled for co-op, `maxAfloat`, `timing` in milliseconds: arrival 1000,
tiles 2100/1400/1050/850, slack 2400, the spawn step 3 to 9). "Rounds played" counts
resolutions, so level 1's first battle is at the slowest speed. Ships are drawn by a shared
stamped layer over every look (`render/campaignMarks.ts`: hull, deck, two square sails across the
beam, a wake while sailing, a fade in and out), in colours from `art.campaign` that no style
changes; the layer sits over the looks and under the towers' marks. `stateFromAscii` reads `S` as
a ship's 2 × 2 footprint on water. The snapshot does not carry the fleet yet (CA11).

**CA4 done** (2026-11-25). `sim/src/campaign/gunnery.ts`. **Fleet shots are not `state.shots`**
but `state.campaign.shots`: every style draws a player's shot in its owner's colour and versus
play's rules judge a shot by its shooter, and a ship's has neither, so it lives apart, drawn by the
campaign layer (a ball on an arc, its shadow under it) and landing through `landFleetShots`, which
calls each style's own `noteImpact` from `matchScreen`; `inFlight` waits for them too. The aim
(`fleetTarget`) scans columns left to right, scores by `fleet.aim`, skips the last eight aimed at
and spreads away from the tiles struck this battle (`struck`, the campaign's own list: the
Architects' `lostWalls` is kept only with towers on). A target goes to the next ship after the last
to fire with no shot in the air, every 733 ms (22 ticks); its flight is a cannon's from the ship's
middle. In a campaign `fire` takes any tile; a player's shot is tested against every ship's
footprint, grown half a tile, where it is on the impact tick (strictly inside, so a ship standing
still is hit on its own four tiles and a sailing one near where it is drawn). Hits score 10, a
sinking 20/40/60 by kind, at once and times the difficulty's multiplier (`ruleset.campaign.scoring`);
`hitsToSink` is the level's, one more from level 4. The client: splinters and smoke at a hit, a ship
listing and going under in a ring of foam when sunk (told from one recycled, which fades), a
cannon's sounds for the fleet's shots and a Bertha's landing for a sinking until the campaign has
cues. The level-end tests play without ships: an idle player's walls no longer last.

**CA5 done** (2026-11-25). `sim/src/campaign/grunts.ts`. Each grunt carries its own clocks (step
1600 ms, smash 6933, breed 11733) and each transport its landing clock (1866): the milliseconds
round to the reference's 48, 208, 352 and 56 ticks. The allowance is set as each build phase opens
(`grunts.allowance` by rounds played in the campaign, times `factor`: the difficulty's and 1 + 0.5
per extra player), and landing and breeding share it. A transport at rest lands on the first free
tile round its footprint, clockwise from above its top left; a grunt breeds onto a random free one
of its eight neighbours. Walking: the nearest castle by Manhattan distance to its middle, the axis
it is farther along (ties across), then straight, counter-clockwise, clockwise, else face it and
wait; a castle tile ahead stops it. Smashing clears the faced team wall into `struck`, so the
fleet's aim spreads away from it too. A grunt blocks pieces and guns (the rejection `grunt`); a
player's shot kills the grunts on its crater for 10 points each, and a piece that seals ground
clears every grunt on it for the same, to its placer (`clearWalledIn`, the user's addition after
trying CA5); a ring raised by a castle choice clears the grunts in its square. Drawn in the campaign layer: a red-tunicked figure facing its way,
slid and bobbed from tile to tile, its club swung as it smashes, a puff where it dies; a smashed
wall plays each style's own impact. `stateFromAscii` reads `m` as a grunt (the design's `g` is
already a gun). And the bots' rollout now copies `state.campaign` (`copyCampaign`): shared, the
dev fast-forward's autopilot landed some sixty grunts where the allowances allow eighteen.

**CA6 done** (2026-11-25), as **frost ships** (the user's: the fireships reinterpreted, the Frost
Cannon's ice reused with a slower decay, no new picture). The kind is `frostship`, its sails icy
blue, `frostshipEvery` the countdown's name. `sim/src/campaign/ice.ts`: a frost ship's shot landing
on land a piece could go on (the wall it cleared, or bare ground) adds a `Freeze` with `buildsLeft`
— 2, or 3 once the campaign has played `ice.lateFromRound` rounds — frozen to the end of every build
phase as a whole-phase freeze is, kept when the build phase ends (a Frost Cannon's freezes still
go), and counted down by `ageIce` as each battle opens. Ice also refuses a gun and stops a grunt.
`buildsLeft` is hashed only when present, so a Frost Cannon's freezes hash as before. The event is
`tile_frozen` with owner −1, so the Frost Cannon's burst and sound play and no achievement counts
it. A continue wiped the island's freezes with its walls until CA7 kept the map.

**CA7 done** (2026-11-25). The fleet's `threat` (`sim/src/campaign/level.ts`): the ships in the
pool, the wave and afloat by their weights (7/18/20), plus 4 a grunt, less 7 a gun of the team's.
The level is cleared in the intermission after a battle, its last shot down, once the threat is
below the level's threshold (scaled by the co-op pool factor) or its round limit is reached. The
frost ships' countdown (`fleet.frostshipEvery`, the difficulty's per level) starts at its value + 2
and counts down as each build phase opens, before the wave is drawn, adding a frost ship to the pool
at 0. A failure in a level's first round costs no life. A continue in a campaign keeps the map —
walls, ice, ships, grunts — and removes only the failing player's guns and shots (`removeGuns`;
versus play's `stripEliminated` would have made the team's walls ownerless); they choose a castle
again and the ring goes up round it, as before. Until the HUD's fleet bar (CA9) the round label
reads "round 2 / 8 · fleet 241 / 30": the level's rounds and the threat against its threshold
(`round.campaign`, in every locale). The end screen still says only "You win" or "Nobody wins"
(CA8); the battle's early end with nothing left to shoot is not built.

| #    | Package                                                                                                                                                                                                                                     | Done when                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CA1  | **Config and a one-player match**: `campaign.default.json` and schemas, `ruleset.campaign`, players 1, `createMatch` with campaign state, `checkGameOver`'s campaign branch, `LocalMatch` for one player, `?campaign=1&level=N&difficulty=` | a one-player match runs rounds without ending at once, on a versus map |
| CA2  | **Maps**: `generateCampaignTerrain`, all shapes, castles per level, spawn points; `--map --campaign` in headless                                                                                                                            | every shape at 1–3 players, varied by seed                             |
| CA3  | **Ships arrive and sail**: pool, waves, arrival, runs, recycling; plain fallback drawing                                                                                                                                                    | ships seen arriving and sailing                                        |
| CA4  | **Ships fire and sink**: aim, fleet shots, hits on ships, sinking, points                                                                                                                                                                   | a level playable against raiders                                       |
| CA5  | **Grunts**: landing, reinforcement, walking, smashing, kills                                                                                                                                                                                | transports' grunts block and smash                                     |
| CA6  | **Ice**: frost ships' frozen tiles on frost's mechanism, ageing                                                                                                                                                                             | frost ships' patches block for 2–3 builds                              |
| CA7  | **Levels**: threat, the frost ship countdown, level end, lives, failing, the free first try                                                                                                                                                 | **the user plays levels 1–3 solo**                                     |
| CA8  | **Campaign run and saves**: intro, summary, defeat, victory, saves, resume, retries, Veteran                                                                                                                                                | **the user plays a campaign solo**                                     |
| CA9  | **Medieval and Night art**: ships, grunts, ice, sinking, HUD fleet bar and icons                                                                                                                                                            | **the user's look**                                                    |
| CA10 | **Co-op**: castle holders, shared rewards, continues on a shared map, team scores                                                                                                                                                           | co-op tested locally with two pages                                    |
| CA11 | **Online rooms**: `mode: 'campaign'`, next level and retry in the room, protocol 39, recordings                                                                                                                                             | **an online co-op session with the users**                             |
| CA12 | **Balance**: statistics, headless runs, the third difficulty decided                                                                                                                                                                        | numbers set by measurement and play                                    |
| CA13 | **Polish**: sounds, How to play's campaign section, achievements proposed                                                                                                                                                                   | —                                                                      |
| CA14 | **Informed choice between fronts** (§10 v2)                                                                                                                                                                                                 | **the user's play**                                                    |
| CA15 | **Other styles' ships and grunts**                                                                                                                                                                                                          | per style, as time allows                                              |

## 17. Open questions, to settle in play

- Whether ships recycling at the coast feels right, or should be dropped (then raiders would also
  wait at the coast and be shot there).
- Whether grunts should **besiege** castles (no reward while a grunt stands beside it, §6.4).
- Whether ships should damage cannons (`damagesCannons`, §5.4).
- The repair deck (§7.4), if rebuilding among grunts and ice proves too hard.
- The co-op scaling factors (pool 0.6, grunts 0.5, lives +1, castles +2 per extra player).
- Where the third difficulty goes (§9).
- Special towers in the campaign: off in v1; perhaps later as rewards between levels.
