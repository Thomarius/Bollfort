# Campaign mode — design and implementation plan

A mode for one to three people against an enemy fleet: ships that sail in and bombard the walls,
transports that land grunts, frost ships whose shots leave frozen ground. Levels on generated maps,
four difficulty settings, progress saved between levels, co-operative online play. Designed with
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
- **Continues, not lives** (the user's, 2026-11-26): failing ends the level, and a continue plays it
  again from its start, the team's firepower raised; their count a lever of the difficulty (§9).
- **Four difficulty settings**: Easy, Normal, Veteran and Legend (the user's, 2026-11-25, after the
  first campaign played; §9).
- **Progress is saved** between levels, as tournaments are (§12).
- **Co-op online from the start**, through rooms, like any match; one player locally too. **No
  bots** in campaign seats for now.
- **The choice of the next level must mean something or not be offered** (§10): v1 goes straight
  on; an informed choice between two fronts follows as its own package.
- **Art**: Medieval and Night first (§14), then every other style its own (CA15, done 2026-11-27);
  the shared plain drawing remains for a style that brings none. **One ship design**, the three kinds told apart by size and by colours that are
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
  strike once each, smashing the wall or taking the unheld castle in front of them; the players
  shoot ships and grunts.
- A ship sinks after a number of hits (2, 3 or 5 by kind). A **frost ship's** shot leaves **ice**: nothing can be built there for the next two or three build phases.
- A level is **cleared** at the end of a combat phase once the fleet's remaining strength has
  fallen below the level's threshold, or once the level's round limit is reached (§8). The final
  battle cleared, the campaign is won.
- The team fails when it seals **no castle at all**: the level is lost, and a **continue** plays it
  again from its start with more firepower; with none left the campaign is over (§9).
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
**carry-over**: score per player, rounds played in the campaign (a record only: no level's play
reads it), levels cleared, the team's
firepower and the continues used. A level left midway is replayed from its start, as a tournament
match is.

```
CAMPAIGN MENU -> new (difficulty, solo or co-op room) | resume (a save)
-> LEVEL INTRO (map preview, fleet, level number)          [v2: choose between two fronts]
-> MATCH: castle_select -> cannon_place -> combat -> build -> ... (§4)
   -> cleared:  LEVEL SUMMARY -> save -> next level, or VICTORY after the final battle
   -> lost:     DEFEAT -> the level again (free after its first round, else a continue, §9),
                or the campaign's end with no continue left
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
  `bonus = r + max(0, r − 2)`, r the rounds played in this level,

  capped by what is left in the pool. **A level is as hard however the levels before it went**
  (the user's, 2026-11-28): the original counted the rounds of the whole game, so a player who
  struggled through levels 1 and 2 met level 3 with a first wave of 15 or more, the pool spent in
  two rounds; counted by level, its waves run 5, 6, 7, 9, … and the pool lasts some five rounds.
  The level's whole fleet, its pool, is unchanged. Each ship of the wave is drawn at random from the pool,
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
2. **Speed**: `s = min(random(level index + the fleet's rounds in this level), 3)`, those the rounds
   played in it plus `fleet.laterLevelRoundOffset` (4) on every level but level 1 (Veteran's first,
   level 2, too), so later levels' first ships are already fast (the user's, 2026-11-26); ticks per tile from
   `[64, 43, 32, 26]` (2.1 s down to 0.85 s a tile). In level 1's first round every ship is at the
   slowest; later they are faster, and from level 2 fast from the start.
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
- **Holding castles** (the user's, 2026-11-26): at each resolution every sealed castle is assigned
  to a player: each player's main castle to them if sealed; every other sealed castle is **dealt one
  each in turn among all the players**, starting with the player with the fewest cannons (ties by
  seat). Cannon rewards per player as versus (`cannonReward`: the main castle's reward if theirs is
  sealed, the extra castle reward for each other castle dealt to them). **The team fails together**,
  and only when it holds no sealed castle at all (§9): a player holding none plays on, earning no
  cannons that round. No player is given a gun as a floor.
- **Pockets** (sealed ground without a castle) are territory while the team holds any sealed
  castle (versus rule, team-wide).
- Scores are each player's own and summed for the team (§11). The ground is shared equally among
  all the players while the team holds a castle.

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
  level (§5.2), `[5, 6, 7, 8, 9, 10, 12, 13]` (the last for every round after), times
  `1 + 0.5 × (players − 1)` (§9 lever).
- **Landing**: in the build phase, each transport next to free land puts one grunt on a free land
  tile beside it every **56 ticks** (1.9 s) while the allowance lasts.
- **Reinforcement**: every **352 ticks** (11.7 s) per grunt on land, a new grunt appears on a
  random free tile beside it, from the same allowance. Small landings grow.
- **Removed**: by a player's shot landing on its tile (§11 points); by being **walled in** — a
  piece that seals ground, pockets too, clears every grunt on it at once, the points to whoever
  placed it (the user's, 2026-11-25: building round a landing is a way to fight it); and at a
  level's end. A ring raised by a castle choice clears the grunts inside its 8 × 8.

### 6.3 Grunts walking (build phase only)

Each grunt steps one tile every **48 ticks** (1.6 s), only in the build phase:

- **Goal**: the nearest castle by Manhattan distance (every castle still standing, held or not;
  a castle taken is gone, and they make for the next, §6.5); the direction one of four, the one
  nearest the straight line to it.
- **Free tile ahead** (land, no wall, grunt, cannon, castle, ice): step.
- **Blocked**: try 90° one way, then the other (counter-clockwise first); all three blocked: turn to
  face the goal and wait. Never backwards. Against a wall a grunt slides along it, re-aiming each
  step.
- **At a castle** (the tile ahead is the castle): it stops and faces it.

### 6.4 Grunts striking (combat only)

**One blow per grunt per battle**, never two, at a moment drawn for each grunt as the battle opens
(`grunts.timing.smashWindowMs`, 0.5 s to 9.5 s of the 10 s battle, from the stream
`campaign-smash:<grunt>:<round>`), so the grunts strike one by one rather than together, and a
player who shoots one early saves what it faced. The blow falls on the tile the grunt faces, as its
last step left it — a grunt never turns as a battle opens (the user's, 2026-11-26: turning every
grunt to its castle made them far too strong):

- **team wall**: cleared as a shot would clear it (no points to anyone);
- **a castle nobody held**: taken (§6.5);
- anything else: nothing.

A grunt that slid along a wall faces along it and strikes nothing; one that waits, blocked on three
sides, faces its castle and strikes whatever is in the way.

### 6.5 Taken castles

A grunt's blow on a castle that was **not held at the resolution before the battle** (not sealed:
`castle.enclosed`, which shots do not refresh) takes it (the user's, 2026-11-26):

- The castle is **gone for the rest of the level**: removed from the castles every rule reads, its
  tiles plain buildable land. It seals nothing, earns nothing, and nobody can choose it.
- A **main castle** taken stays lost: its player chooses no new one, their crown is gone, and they
  earn only what the other castles dealt to them bring (§6.1).
- The grunts make for the next castle still standing.
- It goes up as the Allerdickste Bertha's blast over the castle's middle, with its sound, and the
  callout "A castle has fallen!" (`castle_taken`).

A castle held at the resolution cannot be reached anyway: grunts never stand on sealed ground, and a
piece sealing ground round them kills them. So only castles left open — ones the team was expanding
to, ones nobody held, or a main castle the team survived without — can fall.

## 7. Ice, and the pieces

### 7.1 Ice

Frost ships are the design's frost ships read as frost (the user's, 2026-11-25): a frost ship's shot
freezes the tile it lands on — wall (the wall is cleared as by any shot) or bare ground; not water,
castles or cannons. **A frozen tile takes no piece, no cannon and no grunt.** It does not block the
enclosure flood (ice is not wall, so a ring with ice in it is open until rebuilt round the ice).

### 7.2 Lifetime

Ice **ages as each combat phase begins**:

- in a level's first **8 rounds**: a new patch lasts through the next **2** build phases;
- from its round 9 on: **3** build phases (by the level's own rounds, §5.2).

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
  (`[4, 5, 14, 16, 18, 18]` battles; the user's, 2026-11-26): the level is survived. Ships still afloat sail off.
* Otherwise the round goes on to its build phase.

Every cannon counts against the threat, so a well-armed team finishes sooner; a level is never
endless. The match ends with `endedBy: 'level_cleared'` (`checkGameOver`'s campaign branch, which
must also stop the all-one-team ending of versus play).

## 9. Failing, continues, difficulty

(The user's, 2026-11-26, after playing: with lives spent inside a level a failure left the team on a
ruin, few guns and the fleet still afloat, with little chance to come back. Now a failure starts the
level over.)

- **Failing**: the team fails at a resolution when it holds **no sealed castle** (§6.1); the level
  ends at once, lost (`endedBy: 'level_lost'`). A level has no lives of its own (the team's pool of
  continues is 0 inside the match).
- **A continue** plays the lost level again **from its start, on the same map** (the level's seed
  does not change): nothing of the attempt is kept — no wall, ship, grunt or ice; the score back to
  the level's start. Each continue raises the team's **firepower** by one (below), and the level so
  played opens with **2 cannons more** for every player (`firepower.continueCannons`).
- **A free first round**: a level lost in its first round is played again at no cost — no continue
  spent, no firepower gained (an unlucky opening).
- **Continues** per campaign (`continues`): Easy without limit, Normal 4, Veteran 4, Legend none.
  None are given back for a level cleared.
- **Campaign over**: a level lost after its first round with no continue left ends the campaign. Its
  save is kept as its **record**, listed apart under "Finished campaigns" and opened on its end: the
  total and every level's points.

**Firepower** (`campaign.firepower`, the team's, carried in the save from level to level): 0 at the
start, +1 per continue up to **4**; a level cleared leaves at most **3** of it. By its value 0 to 4:

| Firepower                     | 0   | 1    | 2   | 3   | 4   |
| ----------------------------- | --- | ---- | --- | --- | --- |
| Shot speed (`shotSpeed`)      | 1   | 1.25 | 1.5 | 1.5 | 1.5 |
| A ship's first hit counts for | 1   | 1    | 1   | 2   | 3   |

**Difficulty** is a table of levers (`campaign.difficulties`): the pool row, the frost ship
countdown, the continues, the grunt allowance factor, and a score multiplier (Normal 1.0, Veteran
1.5). **Veteran also starts at level 2** with a bonus of 500 points, skipping level 1 (six levels
remain: 2, 3, 4, 5, a second 5 and the final battle). **Easy**: the easier pool, continues without
limit, points × 0.75. **Legend**: the harder pool, no continue, from level 2 with 500 points, points
× 2 (Easy's and Legend's multipliers starting guesses, the user's to tune).

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

- **Each round**, banked at the resolution while the team holds a castle: ground (1 per team
  territory tile, **shared equally** among all the players, rounded down) and guns (5 per own
  working gun after the resolution), a player holding no castle of their own included.
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
  version: z.literal(2),
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
    roundsPlayed: z.number().int(),
    firepower: z.number().int(), // the team's, kept from level to level (§9)
    continuesUsed: z.number().int(),
  }),
  continued: z.boolean(), // the next level is a lost one played again after a continue
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
  defeated: z.boolean(), // the last level was lost and is not yet played again
  finished: z.boolean(), // won, or over: kept as the campaign's record
});
```

- **Saved** after every level, cleared or lost, and when a campaign is started. Never mid-level: a
  level left is replayed from its start (`carry` is the level's start).
- `parseSave` tells another version from a damage, as the tournament's does.
- **Resume** lists the saves (Resume campaign); a co-op save is the **host's**, resumed by the host
  opening a room with it; any people may take the seats (names in the save are labels).
- Level seeds: from the campaign's seed and the stage, `campaign-level:<stage>`, so a level played
  again after a defeat is the same map (the user's, 2026-11-26).
- A **finished** campaign — won, or out of continues — is kept as its record, listed apart and
  opened on its end; only the player deletes it.

## 13. Online co-op

- **Rooms**: the `create` message gains `mode: 'campaign'` and the campaign's start (difficulty,
  players 1–3, or a save's carry-over and level). `RoomManager.create`, `Room` and `MatchRunner`
  get a campaign branch: **no bots** fill seats (a campaign room starts only with its seats taken,
  or the host lowers the count); the match is created from the level's ruleset; at the level's end
  the room stays open on the summary, and the host's **Next level** (or **Continue**) starts the next
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
  New campaign (difficulty as four cards, Solo or Co-op room),
  Resume (the saves: difficulty, level, score, date; Delete).
- **Level intro** (§10, with the continues left and the firepower), **level summary** (points by
  source and player, ships sunk by kind, grunts; Next level), **defeat** (Play the level again when
  lost in its first round; else Continue, firepower +1, with the continues left; or the campaign's
  end, its total and levels, once none is left), **victory** (the campaign's total, levels with their
  points; back to menu). Finished campaigns are listed apart in the menu, opened with View. In the menus' frame, as the
  tournament's screens are.
- **HUD in the match**: the level and round (no lives: a level has none, §9); the fleet's strength as a bar
  falling towards the level's threshold (a mark where it clears), with ship icons for the pool
  left by kind; each player's score; banners for "Ships approaching", "Transports landing",
  "Level cleared", "Frost ship sighted" (the first of a level), "A castle has fallen!", as phase
  banners are.

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
- **Every other style** (CA15, done): its own ships and grunts, a `FleetLook` (`render/fleets/`,
  the theme's optional `fleet`, as `drone` is), drawn by the shared layer (`render/campaignMarks.ts`)
  with its sinking, hits and wakes; the layer's plain drawing only for a style without one. The
  fleet's shots are every style's own cannonballs (`withFleetShots` in `scene.ts`).
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
  walls lost to ships and grunts, grunts landed and killed, ice tiles, failures), for balancing
  (CA12, §16).
- **Headless**: `--campaign N --difficulty D`, the versus bots with a gunner for the fleet (CA12,
  §16; the scripted defender first planned here was dropped for them).
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
- The round: `resolveRound` (`match.ts`): enclosure, failing (a campaign's team together, when it
  holds no castle; versus play's lives from the team pool, a continue's `wipeIsland`, starting
  cannons + bonus, `pieceRound = 0`), `cannonReward`, the sweep, `scoreRound`, `checkGameOver`;
  `autoFinishCannonPhase`.
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

**CA8 done** (2026-11-25). `packages/campaign`: the save (`save.ts`, version 1, as §12 with
`stage` — the next level's place in the difficulty's `levelOrder` — and `defeated`, so a lost
level left unretried reopens on its defeat) and the run (`run.ts`: `newCampaign`, `levelSetup`,
`levelSeed` from the campaign's seed, the stage and the losses there, `recordLevel`, `retryLevel`;
pure, every function a new save). A cleared level adds its clear points (× the multiplier) to every
player, a life back up to the starting count, its rounds, and moves on; a lost one keeps the carry,
so a retry is the level from its start on a fresh map; Veteran's two retries spent, a loss ends
the campaign. `state.campaign` counts ships sunk by kind and grunts killed for the summary. The
client: `campaignSaves.ts` (`bollfort.campaign.` keys), `campaignScreens.ts` (pure markup: the
campaign menu with Normal and Veteran and the third setting greyed, the saved campaigns; a level's
intro with its real map drawn small, its shape and the fleet by kind; the summary, the defeat with
its retry, the victory) and `campaignFlow.ts` (the save written as a level ends, before its summary;
a level left is played again from its start). The main menu's Campaign button stands behind
`campaign.menuButton` (the user's, 2026-11-25: early work, one switch to take it out);
`?campaign=menu` opens the screen either way, and `&snapshot=game_over` plays each level out at once.
Campaign levels count for none of versus play's achievements. Texts in every locale.

**After the first campaign played** (the user's, 2026-11-25; lost at level 5: "very fun and
playable", grunts and frost ships "very annoying, as they should"). Fixed, every change in the
campaign only:

- **Ships beside the shore at once**: 3% of spawn points stood beside land, where a sea band met a
  land edge of the map (162 of 4173 on level 3 over 40 seeds), and a transport arriving there in a
  build phase landed its grunts at once. Spawn points keep `map.spawnClearanceTiles` (3) of water
  from land.
- **Grunts barely smashed**: one wall in some two hundred grunts' battles, since a grunt held up by
  a wall slid along it and faced along it. As a battle opens every grunt turns to its castle (§6.4).
  With the ring rebuilt each round, 6 walls smashed where there was 1 — still few, since most
  grunts make for the nearest castle, often one nobody holds. Left so (the user's): they are still a
  great threat, and hard to keep in check.
- **The win came late**, after the pause and the "Rebuild" banner. Now the fleet's threat is asked
  the moment the battle's clock runs out, shots in the air or not (the user's design): beaten, the
  intermission leads to `game_over` — no new music, no banner, the battle's look kept — and the
  level is won on the tick its last shot lands. The round limit is asked as before.
- **The comeback** (the user's choice of two): a castle chosen in a campaign has its ring's square
  cleared of walls, grunts and ice first, a clean start; and each continue makes that player's shots
  fly 25% faster, at most twice (`campaign.comeback`, `state.campaign.boosts`).
- **The screen**: no island zoom and no corner piece in a campaign (one shared map, the ships to be
  seen); the round label reads the ships left to beat, not the threat's figure; the level's intro says
  when ships take a hit more.
- **Four difficulties**, Easy, Normal, Veteran and Legend, the reserved two offered (ids `easy` and
  `legend`, `easier` and `harder` before).

**CA9 built** (2026-11-25), for the user's look. A style may hand the campaign layer its own
drawing of the enemy (`FleetLook`, `render/fleetLooks.ts`, the theme's optional `fleet`, as
`drone` is); the rest keep the shared one. **Medieval and Night**: ships rasterised a pixel at a
time from their shape along the heading — hull, deck, two square sails across the beam, a pennant,
a transport's soldiers, a frost ship's cold bow, holes torn in the sails by the hits taken — once
straight and once diagonal, and turned only by quarter turns, so the pixels stay square at all
eight headings; placed on the style's pixel grid. Grunts are small pixel soldiers, kept simple
(the user's: there may be many), turned to their facing. Night tints both as it darkens its board
and hangs a lantern at each stern. Medieval's own cannonballs draw the fleet's shots, Night's
burning (`fleetShotsAsShots`). Sinking, hits and wakes are the shared layer's in every style. The
**fleet bar** beside the round (`fleetBar`, no figures, the user's): the fleet's threat against the
whole fleet the level began with, a mark at the threshold, green once below it. **Callouts** over
the board (`campaignCallouts.ts`, `Hud.callout`): "Ships approaching!" as a wave begins to arrive,
"Troops landing!" as a build phase's first grunt comes ashore, "A frost ship sighted!" for the
level's first; each once a phase. "Level cleared" is the end screen's.

**After the user's look at CA9** (2026-11-25): the level is won the moment nothing is left to fight
— no ship afloat, waiting or to come, no grunt ashore — once the last shot in the air is down, in
any phase (`fleetGone`, checked after each step); a level won in a battle or the pause after it
keeps the battle's look at its end (`campaign.wonInBattle`), where it had jumped to the build look
as the match ended — a jump caught in frames, and the likeliest of the brief flash the user saw
before the summary. The threat moved to the middle of the HUD's bar, wide, labelled "Threat ·
round 2 / 8" ("Bedrohung"), the round leaving the left; its gauge slides by its style rather than
its markup being rewritten.
And the time taken no longer changes the fleet: ships arrive one of each kind a second, so a castle
chosen at once had left level 1's first battle with one ship of three. As the castle choice ends,
and as a build phase does, every ship still waiting in the wave comes in at once, while there is
room afloat (`flushArrivals`).
An empty board — no ship afloat, no grunt ashore — wins the level at once also while ships are still
to come, if their threat is already below the threshold (the user's: ships left in the pool had
kept a beaten level going).
The "You win" that flashed as a level was won (the user's screenshot, in the desktop app): the end
screen wrote and measured its summary before holding it back, so the browser styled it shown and
the hold's transition faded it out again; it is now held first (`EndScreen.showEndScreen`).

**CA10 and CA11 built together** (2026-11-25, the user's: co-op is only tried through rooms). The
user's choices: a campaign's count of people is **fixed as it starts** (resuming a co-op save needs
that many, anyone in the seats); co-op starts from the **campaign screen** (Solo, Co-op: 2, Co-op: 3
beside the difficulties), its room listed in Find a game; **the host keeps the only save**.

- **The sim** (`sim/src/campaign/coop.ts`): every campaign player stands on island 1, so placement,
  guns and territory need no branch of their own; a gun fires on its owner's island's ground
  (`enclosure.ts` asks the player's island rather than `owner + 1`). `castleHolders` hands out
  the sealed castles at every enclosure, as §6.1 says — each player's main castle if sealed, then
  the nearest sealed one left to a player without, then the rest dealt one each, the fewest guns
  first — and `enclosedCastlesByPlayer` counts them, so a player holding none has failed. A castle
  nobody chose is nobody's, so one player is unchanged only once they have chosen. A pocket counts
  while anyone holds a castle; the ground's tiles are shared equally among the players holding one
  (`holdingsOf`). A teammate's main castle is refused (`castle_taken`) and never offered
  (`choosableCastles`); one not chosen in time is the free castle nearest the land's middle
  (`fallbackCastle`), at the start and after a continue.
- **Protocol 39**: `create` takes `mode: 'campaign'` and one to three players; the host's
  `campaign` message carries the level's setup (`CampaignSetupSchema`: difficulty, level, players,
  seed, carry, checked by bounds) and the save as JSON, or no level at a defeat or the end; the room
  answers with `campaign` in its `room` message and passes the save on as `campaignSave`, as a
  tournament's. The server builds the level's rules itself, from its own campaign config
  (`campaignRuleset`), so a page cannot send rules. The snapshot carries the fleet
  (`campaign`, everything of `state.campaign` but the terrain's sea and spawn points) and a frost
  ship's ice's `buildsLeft`, and takes one player where the ruleset allows it.
- **The room** (`server/src/room.ts`): seats are people's alone, in seat order (one island, nothing
  to deal); Start only with every seat a person's, here and ready; no bot ever, not even for a
  person who drops — their seat waits, their choices and guns made as the phase closes, as for
  anyone who does not choose. Once a level is over the host's next `campaign` brings the room back
  to its lobby with the next level, its map's seed the level's. Recorded as any server match.
  `roomCampaign.test.ts` plays a level between two pages, every hash agreeing, a page rejoining
  mid-level from the snapshot in step too.
- **The client**: the campaign menu's Solo and Co-op; a co-op save opens a room on the server the
  page came from (under Steam the host's app), and a notice where none answers
  (`campaign.noServer`). The room's screen (`campaignRoom.ts`, `campaignRoomMarkup`) is the next
  level's intro beside the team, the room's code and Play for the host, Ready for the others; the
  level just cleared shown over it; a defeat with its retry for the host; the end. The lobby
  (`lobbyFlow.ts`) hands a campaign's room to it, so a code, Find a game and Steam's joins reach
  it. The host's page records each level as it ends, the save's names the people's, and its
  Continue sends the room on. Banners sit over each player's main castle; the team tags, one
  corner for all, are not drawn; the outline of what to seal is a player's own castle.
- **Not done, for later**: walls, ground and castles are drawn in the first player's colour
  (every style colours them by island, and the island is the team's). Since done (2026-11-27,
  below): a person away no longer holds the cannon phase to its clock (§13); the statistics'
  walls and frost are the team's columns, said so (CA12).

**After the second playtest** (the user's, 2026-11-26; grunts "very strong", and a failure in a
level all but lost it). Every change in the campaign only, on protocol 40 and save version 2:

- **Grunts strike once a battle** (§6.4): each at a moment drawn for it in 0.5–9.5 s, never twice
  (`smashWindowMs` for `smashMs`); `nextActTick` is -1 between blows. The turn to the castle as a
  battle opens is gone: it had made them far too strong.
- **Taken castles** (§6.5): a grunt's blow on a castle not sealed at the resolution before removes
  it from `state.castles` and leaves its tiles plain land, so every rule that reads the castles
  skips it without a check of its own; the grunts make for the next. `castle_taken` carries the
  castle; the client plays the Allerdickste Bertha's blast, its sound and a callout, and the summary
  state counts `castlesTaken` (hashed).
- **Continues for lives** (§9): a level has no lives (its team's pool is 0), so a failure ends it
  as lost, the first round's too; the campaign (`run.ts`) decides what that costs: `freeRetry` when
  lost in its first round, else `continueLevel` spends a continue and raises the firepower, which
  the save carries (`carry.firepower`, `continued`). `levelSeed` no longer counts the losses: the
  same map again. `campaign.firepower` replaces the comeback and its per-player `boosts`; the
  level's ruleset carries its `shotSpeed`, `firstHitExtra` and `openingCannons`. A finished
  campaign is kept, listed under "Finished campaigns".
- **The levels' lengths and pace** (§5.2, §8.3): `maxRounds` is the most battles a level lasts,
  `[4, 5, 14, 16, 18, 18]` (was `[3, 8, 17, 19, 21, 21]`), and every level but level 1 is reckoned
  four rounds in by the fleet (`fleet.roundOffset`, from `laterLevelRoundOffset`): its ships' speed
  and its waves' round bonus. The round label still reads "Round 1 / 5" as a level opens.
- **The team fails together** (§6.1): `castleHolders` gives each main castle to its player and
  deals the rest among everyone, fewest guns first; `resolveRound` fails a campaign's team only
  when no player holds a castle, and the ground is shared among all (`shareGround`).

**CA15 done** (2026-11-27, approved by the user): every base style but Medieval and Night, which
keep their pixel fleet, brings a `FleetLook` of its own (`render/fleets/<style>.ts`, the Wild
West's in its folder; `BASE_FLEETS` in `render/fleets/index.ts`), drawn with one kit
(`render/fleets/kit.ts`: the kinds' measures, hull forms, a bellied sail, the hits' marks, the
transport's crew, the frost bow, a grunt's body in its tunic). The sails keep `art.campaign.sails`
and the grunts their tunic in every look, as §14.2 asks. A drawn look is turned to all eight
headings (a look in pixels still by quarter turns, its diagonal a sprite of its own). The fleet's
shots are every style's own cannonballs (the user's): the scene adds them to the players' shots it
hands the styles (`withFleetShots`), with no owner and no gun, so the shared ball is gone.
`?fleet=preview` shows every style's ships and grunts enlarged, and on a board of its own with two
shots in flight (`fleetPreview.ts`). The ten supporter styles bring theirs in the private package
(`supporter/src/<style>/fleet.ts`), seen there with `?supporter=1`.

**CA12 planned** (the user's, 2026-11-27), in two parts, the first before the users' session:

- **Statistics** (`packages/analysis`): campaign columns in the per-player, per-round table, zero
  in versus play — the team's, repeated on every player's row under a `team` prefix (ships arrived,
  recycled and afloat by kind, the threat, the fleet's shots and the walls they cleared, grunts
  landed and alive, walls smashed, castles taken, frost placed and still blocking), and the
  player's own (shots at sea, hits on ships, sinks by kind, grunts shot and walled in, castles
  held) — and a row per level played: difficulty, level, attempt, firepower, how it ended (the
  threat, the round limit, lost), rounds and points by source. A campaign's recording names its
  save and attempt in an optional `campaign` field of its header.
- **Bots playing it headless**: the versus bots, which already choose, build and place in a
  campaign seat, with a gunner for the fleet in place of §15.3's scripted defender. It leads a
  ship along its present run only, misses by a model per level, and puts **transports near the
  coast first**, the most dangerous ships (the user's). Solo only; co-op bots only if the co-op
  factors cannot be judged in play. Single levels (`--campaign N --difficulty D`, firepower
  settable) and whole campaigns through `run.ts`, continues and Veteran's order included; a
  bot's own seed changes with each attempt, since a continue replays the level's.
- **What the runs should show**: the campaign is meant to be very hard on every difficulty. A
  Level 5 bot might win Easy, 7 Normal, 8 or 9 Veteran, 10 Legend, all rarely; what must show is
  progress rising with the bot's level and falling with the difficulty. A level is cleared by the
  fleet's threat almost always, its round limit very rarely. No calibration against people: the
  campaign asks other skills of them (grunts, which ship first), and its numbers are never tuned
  on bots alone, their results taken as indication.

**CA12's statistics built** (2026-11-27): `StatRow` carries the campaign's columns
(`CampaignColumns`, `NO_CAMPAIGN` in versus play) and a level won in a battle or by its round
limit gets a row for that last battle; `levelRows` (`analysis/src/levels.ts`) sums a level, and
`--replay … --level-table FILE` writes them, the console listing each. The header's `campaign`
(`recordingTag` in `run.ts`) is written by the client and, from the host's save, by the room.

**CA12's bots built** (2026-11-27): `FleetAim` (`ai/src/fleetAim.ts`), the `Gunner`'s aim whenever
the match is a campaign's, ranks as the user did — a transport at the coast or bound for it, a
grunt facing the team's wall or an unheld castle before its blow, any other ship, any other grunt
— leads a ship along its present run, and leaves a ship its shots in the air will sink. Its misses
are `ownAccuracy` taken as the share of shots led right, a miss not led or led a tile off: assumed,
to be fitted to the sessions' hits on ships for shots at sea. `--campaign N` plays one level from a
fresh start (`--firepower`; the rounds before it as if each earlier level went to its limit, which
from level 3 on puts the grunts' allowance and the ice at their ceiling); `--campaign all` whole
campaigns through `run.ts`, a bot's stream drawn afresh for each try. `levelOutcome` moved from
the client into `run.ts`, shared. **Grunts in a solo plan**: a bot's rollout steps the real sim, so
in solo play it sees the grunts land and walk as they will; a Level 5's 13 planned phases of level
4, among 78 grunts, were played exactly as planned, none left. A teammate's pieces would turn them
in ways no plan sees, so co-op bots stay out.

**The first sweep** (2026-11-27, ten whole campaigns per bot level and difficulty, balanced bots,
seeds 1–10): campaigns won, stages cleared of six (mean), continues spent (mean).

| Bot | Easy            | Normal         | Veteran        | Legend       |
| --- | --------------- | -------------- | -------------- | ------------ |
| L3  | 10/10, 6.0, 7.1 | 0/10, 3.9, 4.0 | 0/10, 2.2, 4.0 | 0/10, 1.1, — |
| L5  | 10/10, 6.0, 3.9 | 1/10, 4.8, 4.0 | 0/10, 3.9, 4.0 | 0/10, 1.4, — |
| L7  | 10/10, 6.0, 5.2 | 7/10, 5.6, 3.0 | 4/10, 4.9, 3.7 | 0/10, 2.1, — |
| L9  | 10/10, 6.0, 1.7 | 9/10, 5.9, 2.7 | 6/10, 5.6, 3.0 | 0/10, 2.4, — |
| L10 | 10/10, 6.0, 1.3 | 8/10, 5.8, 1.9 | 8/10, 5.8, 2.2 | 3/10, 3.7, — |

Progress rises with the bot's level and falls with the difficulty, as the user asked; Easy, with
continues unlimited, is always won in the end, its measure the continues spent. The wins are
far more than the user's "very low", but the bots hit **85–88 % of their shots at sea**, which is
very probably far above people: the sessions' recordings decide. Levels end by the threat
almost always (round limit 27 of 1513 levels, nearly all on level 2, about one try in eight there:
its 5 rounds). The levels lost most: 4 (45–64 %), 5 (49–57 %) and the final battle (58–71 %, but
25 % of Legend's four tries); level 4 lands the most grunts, 47–70 a try.

**Before the users' online session** (2026-11-27, the user's choices):

- **A person away** (§13): once the reconnect grace (`botTakeoverDelayMs`) is over, the room plays
  their castle choice and their guns at once, as the clock's fallback would have
  (`awayAction`, `sim/src/campaign/away.ts`), sent as the seat's own actions, so recorded and
  replayed as any; only their phase ends early, the others keep their time. Nothing else is played
  for them, and versus play's fallback is untouched.
- **A level's own end screen** (`EndScreen`'s campaign branch, `campaignEnd.ts`): the level
  cleared or lost as its headline, what it means for the campaign under it (the score, the
  continues left, the free try, the campaign's end; `levelEndText`), each player's points by
  source — ground, guns, ships, soldiers, the clear bonus — and the team's in co-op, no awards,
  the ships sunk of those that came by kind, the soldiers beaten of those that landed, the castles
  taken, the level's points by round. Its main button leads straight on (`levelEndButton`): the
  next level's intro, the level again (free, or for a continue), or the campaign's end; the
  separate summary screen is gone. A co-op room's pages show the same, the host's Continue
  sending the room on as before. `MatchLog` now counts the arrivals (a ship recycled once), the
  grunts landed and each player's points for ships and soldiers.
- **How to play's Campaign tab** (CA13), the last of five: ships and leading them, which ship
  first and ice, soldiers, the threat's line, each caption ten words at most as every page's; the
  campaign screen's How to play button and a campaign level's pause open it.

**A level by its own rounds** (2026-11-28, the user's, after a level 3 whose first battle brought 15
ships against the original's 6–10): the original reckons its waves, grunt allowance and ice by the
rounds of the whole game, so a player slow through levels 1 and 2 was pressed hardest in level 3 —
an arcade's way of ending a credit, not this game's. All three now count the level's own rounds
(§5.2, §6.2, §7.2); the rounds before it left the level's ruleset (`carry.roundsPlayed`, kept in the
save as a record; protocol 41), and `--campaign N` no longer plays a level as if the earlier ones
went to their limits. The level's pool, its threat and its ships' head start in speed are unchanged.
The comparison with the original's code also found why it never showed more than ten ships in a
first battle: it lets a wave in one ship of each kind a second and stops at the castle choice's
end, the rest arriving in the next build phase; Bollfort's arrivals at the choice's end
(`flushArrivals`) stay, the user's choice.

**The difficulty map** (2026-11-28, the user's: each level's own chance rather than how far a whole
campaign got; `tools/headless/src/campaignSweep.ts`, the harness's `--continued`): bots of levels
2, 4, 6, 8 and 10, balanced, on every level of every difficulty from a fresh start, at firepower 0
to 4 (above 0 played as a continued level, its opening cannons too), 20 seeds a cell, the same
seeds everywhere; 11,000 levels in 65 minutes on four cores, after the waves by the level's own
rounds. The run ends by writing `sweep.html` beside its cells (`--html` again at any time): a
heatmap per difficulty and each bot's curve across the levels or the firepower. Cleared, as a share
of the tries past their first round; Normal (the others below it):

| Level | L2 FP0 → FP4 | L4 FP0 → FP4 | L6 FP0 → FP4 | L8 FP0 → FP4 | L10 FP0 → FP4 |
| ----- | ------------ | ------------ | ------------ | ------------ | ------------- |
| 1     | 100 → 100    | 100 → 100    | 100 → 100    | 100 → 100    | 100 → 100     |
| 2     | 100 → 95     | 100 → 100    | 100 → 100    | 100 → 100    | 100 → 100     |
| 3     | 40 → 90      | 75 → 100     | 100 → 100    | 100 → 100    | 100 → 100     |
| 4     | 0 → 82       | 25 → 85      | 60 → 100     | 90 → 100     | 95 → 100      |
| 5     | 0 → 20       | 35 → 60      | 60 → 90      | 80 → 100     | 95 → 100      |
| 6     | 0 → 10       | 0 → 55       | 35 → 90      | 35 → 85      | 65 → 95       |

What it shows: **levels 1 and 2 are a plateau** — every bot from Level 4 clears them at every
difficulty, level 1 in two rounds. **The steps are levels 3 → 4 and 5 → 6** (Level 6: 100, 60,
60, 35 on Normal), level 4 and 5 alike between them. **Easy plays almost as Normal** at every
level: its lever is the continues without limit, not the fleet. Veteran and Legend press levels 3,
4 and the final battle (Level 6 on the final: 15 % on both at firepower 0). **Firepower buys little
at first and much at the end**: one continue (firepower 1) moves most rows within the noise, the
third and fourth (a first hit counting double, then treble) lift the weak bots most — the Level 2 bot on
Normal's level 4 from 0 % to 82 %. The Level 2 bot does slightly worse on level 2 continued (100 → 84 % on
Normal at firepower 1), perhaps because the continue's two cannons bring two more ships in the
first wave. Twenty seeds a cell: ±11 points at 50 %. The bots' 85–88 % of shots at sea are very
probably above people's, so the shape is to be read, not the levels.

**Open campaign work** (2026-11-27; PLAN §11 item 14 keeps the same list): the users' online
co-op session; CA12's tuning — the bots' misses at ships fitted to the session's recordings, a new
sweep, the difficulties' levers against the targets above, level 2's round limit looked at; the
grunts' strength judged again in play; CA13's rest — achievements proposed, new sound cues; co-op's
colours (a design question first); CA14, once the balance stands; the questions of §17.

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
| CA12 | **Balance**: statistics, headless runs (both built 2026-11-27), the four difficulties' levers tuned                                                                                                                                         | numbers set by measurement and play                                    |
| CA13 | **Polish**: sounds, How to play's campaign section (done 2026-11-27), achievements proposed                                                                                                                                                 | —                                                                      |
| CA14 | **Informed choice between fronts** (§10 v2)                                                                                                                                                                                                 | **the user's play**                                                    |
| CA15 | **Other styles' ships and grunts** — **done** 2026-11-27, the supporter styles' too, the fleet firing each style's own cannonballs                                                                                                          | per style, as time allows                                              |

## 17. Open questions, to settle in play

- Whether ships recycling at the coast feels right, or should be dropped (then raiders would also
  wait at the coast and be shot there).
- Whether grunts should **besiege** castles (no reward while a grunt stands beside it, §6.4), now
  that they take the castles nobody held (§6.5).
- Whether ships should damage cannons (`damagesCannons`, §5.4).
- The repair deck (§7.4), if rebuilding among grunts and ice proves too hard.
- The co-op scaling factors (pool 0.6, grunts 0.5, castles +2 per extra player).
- Special towers in the campaign: off in v1; perhaps later as rewards between levels.
