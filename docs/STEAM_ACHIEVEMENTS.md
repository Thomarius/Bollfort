# Bollfort's Steam achievements — the design and its packages

A design of its own beside [`STEAM.md`](./STEAM.md) until built, then retired into the ARCHIVE.
Begun 2026-11-12 while S4 waits on Valve; everything but the last package can be built and
tested before the App ID is ours. How the list was reached — the draft of 62, each judged against
the recordings, the user's review — is ARCHIVE 15zz.

## 1. What Steam achievements are

- **Set up in Steamworks, per app**: an API name (what the code calls), a display name and a
  description per language, two icons (achieved in colour, unachieved usually grey; 256 × 256
  recommended, 64 × 64 the least) and a hidden flag. The partner site imports and exports the list
  as CSV and takes icons in bulk.
- **Stats**: integers kept per player by Steam. An achievement may name a stat and a range, and
  Steam shows its progress; the game may pop it up at milestones (`IndicateAchievementProgress`).
- **Unlocking**: `SetAchievement`, then `StoreStats`; Steam's toast in its overlay (not drawn on the
  Linux desktop, STEAM.md §3.3). Kept through an offline session; with Steam not running, nothing
  unlocks.
- **Our binding**: `steamworks.js` 0.4.0 has `achievement.activate / isActivated / clear` and
  `stats.getInt / setInt / store / resetAll`, but not `IndicateAchievementProgress`, which `koffi`
  can call as it calls the lobby list (`steamLobbyFinder.ts`).
- **Limits**: 100 achievements at first. Until the app reaches Valve's threshold for Profile
  Features it is "Profile Features Limited" — achievements unlock but count for nothing on
  profiles; free games often stay so. These achievements are for our players' enjoyment, and
  farming them is no concern of ours.
- **Permanent once published**: an API name cannot change once players hold it. Trim before
  launch, not after.

Sources: Steamworks' [Achievements](https://partner.steamgames.com/doc/features/achievements),
[its guide](https://partner.steamgames.com/doc/features/achievements/ach_guide),
[Stats](https://partner.steamgames.com/doc/features/achievements/stats_guide),
[ISteamUserStats](https://partner.steamgames.com/doc/api/ISteamUserStats).

## 2. The decisions (the user's, 2026-11-12)

- **35 achievements**, the list of §4.
- **Bot matches count**, with no level floor unless an achievement names one; floors are Level 5
  or Level 8, never Level 10.
- **Grind in reason**: a stat asks for some 10–20 matches of ordinary play, never 100 or more.
- **Special towers are a core feature**: each of the nine has its own achievement.
- **No hidden achievements, none about the looks** (styles are subjective and hard to track).
- **Online achievements few**: one; every other one reachable alone.
- **No name the same as an end-screen award's**, in either language (Wrecker / Abrissbirne,
  Landlord / Großgrundbesitz, Castle collector / Burgensammlung, Iron wall / Eiserne Mauer,
  Comeback / Aufholjagd, Front-runner / Spitzenreiter, Photo finish / Fotofinish, Last stand /
  Letztes Gefecht, Phoenix / Phönix, Late bloomer / Spätzünder, Artillerist / Artillerie, Steady /
  Beständig, _X_'s nemesis / Erzfeind von _X_, Mason / Maurermeister). Puns where they suit.
- **Thresholds from the recordings, no soaks.**

## 3. The rules every achievement follows

1. **Where**: only in the Steam build, with Steam running (`SteamInfo.ready`). The browser, the
   GitHub builds and a dev server unlock nothing.
2. **Which matches count**: any match the player sits in, local or online, any table size, teams
   or none, special towers on or off. **Never**: the demo, a watched match (`&watch=1`), a
   tournament's quick rolls, the dev parameters (`&snapshot`, `&speed`, `&autopilot`, `&round`),
   nor a seat while a bot plays it for an absent person — a feat must be the person's own moves,
   and a result needs the person seated at the end.
3. **A level floor** means every **opponent** bot is at that level or above; an opponent who is a
   person always passes; teammates do not matter.
4. **A win** is the player's team winning, alone; a draw is no win. "You" in a team match means
   the player's own seat unless it says "your team".
5. **Detected on the player's own page** from the simulation every page replays exactly — the
   events of `MatchEvent` and the state at each resolution. Nothing new on the wire, nothing
   trusted from anyone else, nothing in the sim changed; pure functions with tests, as
   `awards.ts` is.
6. **Thresholds in config** behind a schema (no rule hardcoded).

## 4. The 35

Difficulty: **E** most players within their first few matches; **M** a skilled player in a fair
share of matches, a casual one now and then; **H** a skilled player's goal; **stat** across
matches, with a progress bar. 14 E, 13 M, 5 H, 3 stats.

"Recordings" is what the 34 recordings of 2026-09-28 to 2026-10-23 show (ARCHIVE 15zz): the share
of matches in which Thomas (36 seat-matches, about a Level 5–6 player) and Mausica (14, about
Level 2–3) met the condition, or what the towers' rules say where they were not recorded.

| #   | English              | German                     | API                | Condition                                                                                        | Diff | Recordings                                                                        |
| --- | -------------------- | -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------- |
| 1   | Breaking ground      | Erster Spatenstich         | `FIRST_MATCH`      | Finish a match                                                                                   | E    | —                                                                                 |
| 2   | King of the castle   | Burgherr                   | `FIRST_WIN`        | Win a match                                                                                      | E    | Thomas won 74%, Mausica 67%                                                       |
| 3   | Pocket money         | Taschengeld                | `POCKET`           | Hold a pocket — sealed ground with no castle — at a resolution                                   | E    | Thomas 86%, Mausica 79%                                                           |
| 4   | Just in time         | Auf den letzten Drücker    | `JUST_IN_TIME`     | With no castle sealed, seal one with a piece laid in the overtime                                | E    | Thomas 73%, Mausica 100%                                                          |
| 5   | Knock knock          | Klopf, klopf               | `FIRST_BREACH`     | A shot of yours opens a rival's sealed castle: sealed before it, open after                      | E    | Thomas 79%, Mausica 100%                                                          |
| 6   | Read the manual      | Wer lesen kann …           | `READ_THE_MANUAL`  | Open every page of How to play                                                                   | E    | —                                                                                 |
| 7   | Four of a kind       | Alle viere                 | `FULL_ESTATE`      | Hold all four castles of your island sealed at a resolution                                      | M    | Thomas 42%, Mausica 21%                                                           |
| 8   | Land grab            | Landnahme                  | `LAND_GRAB`        | Hold **150** tiles of territory at a resolution                                                  | M    | Thomas 53%, Mausica 14%                                                           |
| 9   | Kingdom come         | Königreich                 | `EMPIRE`           | Hold **220** tiles at a resolution                                                               | H    | Thomas 6% (best 232), Mausica best 192                                            |
| 10  | Seal of approval     | Gütesiegel                 | `SEAL_OF_APPROVAL` | Castles sealed at resolutions, **250** in all                                                    | stat | a match: Thomas 23, Mausica 14 — about 11 and 18 matches                          |
| 11  | Bring the house down | Kein Stein auf dem anderen | `BIG_BARRAGE`      | Destroy **40** walls in one combat phase                                                         | M    | Thomas 45%, Mausica best 27                                                       |
| 12  | Lights out           | Licht aus                  | `LIGHTS_OUT`       | A rival spends a life after a combat phase in which you destroyed more of their wall than anyone | E    | Thomas 73%, Mausica 64%                                                           |
| 13  | Demolition crew      | Fachbetrieb für Rückbau    | `DEMOLITION_CREW`  | Walls destroyed, **2,500** in all                                                                | stat | a match: Thomas 246, Mausica 147 — about 10 and 17 matches                        |
| 14  | Seasoned             | Gut gewürzt                | `SEASONED`         | Win a match (Level 5 floor)                                                                      | M    | Thomas won all 5 of his free-for-alls against Level 5                             |
| 15  | Warlord              | Feldherr                   | `WARLORD`          | Win a match (Level 8 floor)                                                                      | H    | not recorded                                                                      |
| 16  | Untouchable          | Unantastbar                | `UNTOUCHABLE`      | Finish a whole match never spending a life                                                       | H    | no person in 29 full matches; Level 3–4 bots 27%, Level 5 6%                      |
| 17  | Sole survivor        | Allein auf weiter Flur     | `SOLE_SURVIVOR`    | Win by knocking everyone out, before the round cap                                               | H    | 2 of 20 matches ended so, both won by bots                                        |
| 18  | Good neighbour       | Gute Nachbarschaft         | `GOOD_NEIGHBOUR`   | A teammate's castle is sealed at a resolution with your blocks in its wall                       | E    | a piece on a teammate's island: Thomas 53% of team matches, Mausica 27%           |
| 19  | In good company      | In guter Gesellschaft      | `IN_GOOD_COMPANY`  | Win a team match                                                                                 | E    | Thomas's teams won 9 of 13                                                        |
| 20  | Season ticket        | Dauerkarte                 | `SEASON_TICKET`    | Play a tournament to its end                                                                     | E    | not recorded; some 5–8 matches                                                    |
| 21  | Champion             | Pokalheld                  | `CHAMPION`         | Win a tournament                                                                                 | M    | not recorded                                                                      |
| 22  | Invincible           | Ungeschlagen               | `INVINCIBLE`       | Win a tournament without losing a match                                                          | H    | at Thomas's 74% a match, about one tournament in six                              |
| 23  | Special delivery     | Sonderlieferung            | `SPECIAL_DELIVERY` | Buy a special tower                                                                              | E    | —                                                                                 |
| 24  | Tower of Babel       | Turmbau zu Babel           | `ALL_TOWERS`       | Buy each of the nine towers at least once                                                        | stat | one kind a match: nine matches with towers on                                     |
| 25  | Big bang             | Urknall                    | `BIG_BANG`         | One Big Bertha shot destroys **4** walls                                                         | M    | rules: the `plus5` crater takes 3 of a plain wall, 4–5 at a corner or a thick one |
| 26  | Heavyweight          | Schwergewicht              | `HEAVYWEIGHT`      | The Allerdickste Bertha's one shell destroys **10** walls                                        | M    | a Level 5 bot's best: 10 at cost 2                                                |
| 27  | Zoning laws          | Bebauungsplan              | `ARCHITECT_ZONING` | Own three Architects at once, no tile within reach of two of them                                | M    | the user's design: placement, three rounds of buying                              |
| 28  | Rapid fire           | Schnellfeuer               | `RAPID_FIRE`       | One Rapid Cannon fires **12** shots in one combat phase                                          | M    | rules: three barrels at cost 3, some 4–5 flights each a phase                     |
| 29  | Chain reaction       | Kettenreaktion             | `CHAIN_REACTION`   | One Lightning strike destroys **3** walls                                                        | M    | a Level 5 bot's best: 4 at cost 3; cost 2 strikes 3 at most                       |
| 30  | Straight through     | Voller Durchblick          | `STRAIGHT_THROUGH` | One Laser beam clears **3** walls                                                                | M    | rules: cost 3 only, the third wall half the time                                  |
| 31  | Cold shoulder        | Kalte Schulter             | `COLD_SHOULDER`    | A rival spends a life in a build phase with a tile of theirs your Frost Cannon froze             | M    | soaks: a freeze cost a round in some 5% of rounds (SPECIAL_TOWERS.md §5 FR)       |
| 32  | Sweet dreams         | Schlaf, Kindlein, schlaf   | `SWEET_DREAMS`     | One Lullaby shot puts **3** guns to sleep                                                        | E    | Thomas did it in his one Lullaby match                                            |
| 33  | Bass drop            | Mit Wumms                  | `BASS_DROP`        | One Subwoofer wave clears **3** walls                                                            | E    | rules: three lanes at cost 3, each clearing the first wall it meets               |
| 34  | Towering victory     | Turmhoch überlegen         | `TOWERING_VICTORY` | Win a match in which you bought **3** towers                                                     | M    | Thomas bought 3 and won in his one tower match                                    |
| 35  | Among friends        | Unter Freunden             | `AMONG_FRIENDS`    | Finish an online match with another person at the table                                          | E    | 17 of 34 recordings are rooms                                                     |

**Zoning laws** (27): the reach is the Architect's own (`inRepairReach`, 2.2 at cost 2 and 2.6 at
cost 3, from the footprint's centre); "no tile within reach of two" is checked on the board as the
third is placed, and while all three stand.

### 4.1 The stats

Integers kept by Steam: `castles_sealed` (10), `walls_destroyed` (13), and `towers_bought` with
`towers_bought_count` (24, a bitmask of 9 and its count — the count is the progress Steam shows,
the mask makes each tower count once). Steam is the store of truth: nothing is kept beside it,
so a match played with Steam not running counts for nothing.

## 5. Still to decide

- **The icons**: one picture per achievement, or one frame for all with an emblem — the game's
  icons from `icons.ts`; the grey version made from the coloured one either way. Not drawn in the
  looks (§2). With AC4.

## 6. The packages

| Package | What                                                                                   | Needs our App ID          |
| ------- | -------------------------------------------------------------------------------------- | ------------------------- |
| **AC1** | The draft, judged against the recordings, reviewed: the 35 (done, 2026-11-12, 15zz)    | no                        |
| **AC2** | The definitions and their detection, pure and tested                                   | no                        |
| **AC3** | The client and the desktop app's bridge to Steam                                       | no (480 for the plumbing) |
| **AC4** | The texts in English, German and Hessian; the icons                                    | no                        |
| **AC5** | Steamworks: the achievements, stats, icons and texts entered; tried on the beta branch | yes                       |

- **AC2 — Definitions and detection.** `config/achievements.json` behind a schema (the API names,
  kinds, floors, thresholds and stats, cross-checked). A pure detector, in a package of its own or
  `packages/analysis` beside the statistics: fed one seat's view of a match — the events, the
  state at each resolution, the table (levels, teams, online, towers) — it answers the
  achievements unlocked and the stats' increments. Tests on ASCII boards (`stateFromAscii`) for
  the geometric ones, on replayed recordings for the rest. And the harness reports what each seat
  would have unlocked over recordings (`--replay … --achievements`), which repeats ARCHIVE 15zz's
  figures from the real detector and checks them whenever a rule changes.
- **AC3 — The client and the bridge.** The client feeds the detector as the match plays (§3's
  gates in one pure function) and handles what it alone sees — How to play's pages, a tournament's
  end. The desktop app's preload offers the page `achieve(id)`, `addStat(name, by)` and
  `markStat(mask, bit)`; `steamMain.ts` carries them out with `steamworks.js` and `koffi` for
  `IndicateAchievementProgress` at a stat's quarters, `store` once at a match's end (Steam
  rate-limits it). The plumbing tried on 480 against Spacewar's own achievements behind a dev
  switch — _to confirm_ which 480 still has.
- **AC4 — Texts and icons.** `achievement.<id>.name` and `.desc` in `config/locale/` for all three
  languages (the locale test demands it); a writer in `tools/steamworks` turning English and German
  into the file Steamworks imports for its localisation, as it writes rich presence's (_to
  confirm_ the format); Hessian stays in the game. The icons rendered by `tools/storeart` at
  256 px, the grey ones derived, checked on a contact sheet.
- **AC5 — Steamworks.** With the App ID: stats and achievements entered (by CSV if it serves),
  icons and texts uploaded, published; tried on the beta branch, a line for them in
  [`STEAM_CHECKLIST.md`](./STEAM_CHECKLIST.md). Whether a stat-linked achievement unlocks by itself
  at its maximum is confirmed here (the client calls `activate` as well either way).

Order: AC2 and AC4 in either order, then AC3; AC5 after S4's App ID. No protocol, sim or
recording format change is expected; needing one would be a sign the design has gone wrong.
