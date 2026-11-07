# The Steam store page — ready for S4

What the store page needs that no Steamworks account does (STEAM.md §9.2, package S4): the texts,
the settings, the pictures. Made on the user's gaming PC on 2026-11-05 and 2026-11-06; how each was
reached is in ARCHIVE 15zn (the art and the trailer) and 15zo (this material). This file keeps
what is to be typed and uploaded into Steamworks, and what is still open; it is retired into the
ARCHIVE once the page is live.

## 1. What holds (STEAM.md §1)

- **Rampart is named nowhere on Steam**: not in the descriptions, the tags, the art, nor a
  disclaimer. The "inspired by" line stays in the game, the README and the release notes. (The
  YouTube trailer's description names it in the disclaimer; that text is not reused here.)
- **No links in the description**, and none implied (Valve's rule too, §2).
- **English and German** are the declared languages; Hessian stays an in-game joke.
- **Free**, the whole game, every style, no DLC.
- **Screenshots only of play.**
- **The Steam build has only Steam's online services**: Steam lobbies (Public, Friends, Invite
  only; Friends the default), no link, no UPnP, no LAN. The texts must not promise those.
- **Developer and publisher: Thomas Arnold**, the user's own name — no studio label, as Bollfort
  is a one-off (the user's, 2026-11-06).

## 2. Valve's rules, as read on 2026-11-06

Read from Steamworks' documentation; the standard-assets and tags pages came through partly as a
summary, so the marked points are to be checked on the live page.

| Asset                                         | Size                       | Format                       | Ours                                                  |
| --------------------------------------------- | -------------------------- | ---------------------------- | ----------------------------------------------------- |
| Header capsule (also the library header)      | 920 × 430                  |                              | `assets/store/header_capsule.png`                     |
| Small capsule                                 | 462 × 174                  |                              | `small_capsule.png`                                   |
| Main capsule                                  | 1232 × 706                 |                              | `main_capsule.png`                                    |
| Vertical capsule                              | 748 × 896                  |                              | `vertical_capsule.png`                                |
| Library capsule                               | 600 × 900                  |                              | `library_capsule.png`                                 |
| Library hero (no text, 860 × 380 safe middle) | 3840 × 1240                | PNG                          | `library_hero.png`                                    |
| Library logo (title alone, transparent)       | 1280 wide and/or 720 tall  | PNG                          | `library_logo.png`                                    |
| Screenshots (at least 5, only gameplay)       | at least 1920 × 1080, 16:9 |                              | `screenshots/`, eight, in Steam's order               |
| Trailer                                       | 1080p                      | H.264, AAC                   | `trailer-build/half/BollfortTrailer.mp4` (not in git) |
| Shortcut icon                                 | 256 × 256 or 512 × 512     | PNG or ICO                   | `shortcut_icon.png` (or `.ico`), Minimal's B          |
| App icon (generated from the shortcut icon)   | 184 × 184                  | JPG                          | made by Steam                                         |
| Event cover                                   | 800 × 450                  |                              | **to choose** (§5)                                    |
| Event header                                  | 1920 × 622                 | (Valve's template has notes) | **to choose** (§5)                                    |
| Page background (ambient)                     | 1438 × 810                 |                              | optional; Steam makes one from the last screenshot    |

Sources: <https://partner.steamgames.com/doc/store/assets> and its pages `standard`,
`libraryassets`, `community` and `eventassets`. Since August 2024 Valve takes only the larger
capsule sizes; ours are those.

- **The shortcut icon**: "any alpha will be replaced with solid black"; ours is opaque.
- **The App icon** shows on the store page only from Coming Soon on.
- **Capsules**: no text but the title (ours comply).
- **Screenshots** (summary): at least five, four or more suitable for all ages. To confirm.
- **Short description**: "a few hundred characters" (no number given; commonly 300, to check in
  the form), **plain text only**, nothing time-related ("coming soon", "out now").
- **About This Game**: text with headings and bold, and embedded images or looping GIFs; each
  image under **5 MB**, all together under **15 MB**. The description column is commonly said to
  be 616 px wide, the loops' width — to check on the live page.
- **Text in images must be translated too**: the loops carry no words but the change of look's
  banner, which has a German version.
- **No links**, no QR codes, no implied URLs; **no imitation of Steam's interface**; no
  advertising of other games.
- **Tags** (<https://partner.steamgames.com/doc/store/tags>): at least 5 before launch, up to 20
  — only the top 20 show and steer visibility. Set in the Tag Wizard (Edit Store Page → Basic
  Info), and by players and moderators.
- **Languages**: declared per game in the store page's settings; English is Steam's fallback.

## 3. The facts the texts draw on

Checked against the code and the locales on 2026-11-06. German names are the game's own, from
`config/locale/de.json`.

- **The game**: shoot down your opponents' castle walls, then race to rebuild your own before
  the next barrage. Cannon phase, combat, build phase; a wall must turn its corners; cannons are
  dead outside sealed ground; fail to seal a castle and a life is spent, and a fresh castle and
  ring come back. Ground and guns score. Ten rounds and three lives by default.
- **2 to 8 players**; every match a team match (free-for-all is teams of one), teams of two
  among them; teammates may build on each other's islands.
- **Bots at ten levels** (Stufe), any seat; a person can play alone against them.
- **Online**: on Steam, Steam lobbies — Public in the games list, Friends, Invite only; Steam
  names and avatars, Join from the friends list. The host can remove a guest in the lobby.
- **Special towers** (Spezialtürme), a table's switch, off by default — the classic game
  without: bought in the cannon phase for 2 or 3 cannons. Nine:

  | English             | German             |
  | ------------------- | ------------------ |
  | Big Bertha          | Dicke Berta        |
  | Architect           | Baumeister         |
  | Rapid Cannon        | Schnellfeuerkanone |
  | Lightning Tower     | Blitzturm          |
  | Allerdickste Bertha | Allerdickste Berta |
  | Laser Tower         | Laserturm          |
  | Frost Cannon        | Frostkanone        |
  | Lullaby Tower       | Schlafturm         |
  | Subwoofer           | Subwoofer          |

- **Tournaments** (Turniere): the player's team of people and bots against a field of named bot
  teams, a league and then a single- or double-elimination knockout, saved between matches;
  friends can join the player's team.
- **24 visual styles** (Optiken), chosen separately for building and combat, a new one every round
  if wished, a change of look sweeping across the board mid-match; each with its own animations,
  and its own music but three (Minimal, Medieval and Night play the shared music). English /
  German: Minimal, Medieval / Mittelalter, Night / Nacht, Cyberpunk, Blueprint / Blaupause,
  Parchment / Pergament, Toy bricks / Spielzeugsteine, Stained glass / Buntglas, Chocolate /
  Schokolade, Halloween, Sakura, Oktoberfest, Opera, Office / Büro, Under the sea / Unter dem Meer,
  Electric / Elektrisch, Cartoon / Zeichentrick, Christmas / Weihnachten, Noir, Stadium / Stadion,
  Pirates / Piraten, Anime, Mythos, Wild West / Wilder Westen.
- **Controls**: the mouse — two buttons and the wheel — or a controller through the same actions,
  with the Steam Deck in mind (STEAM.md §8). No keyboard needed.
- **Languages**: English and German, interface and texts; no voice.
- **Audio**: all from OpenGameArt.org and Pixabay, credited in the game.

## 4. To type in

The user edits the texts before they go in (2026-11-06: the German still to be read).

### 4.1 Short description

**English** (235 characters, plain text):

> Shoot down your opponents’ castle walls, then race to rebuild your own before the next
> barrage. A castle siege for 2 to 8 players, online or against bots, in 24 visual styles, each
> with its own animations and most with their own music.

**German** (255 characters):

> Schieß die Burgmauern deiner Gegner in Trümmer und bau deine eigenen wieder auf, bevor die
> nächste Salve kommt. Eine Burgbelagerung für 2 bis 8 Spieler, online oder gegen Bots, in 24
> Optiken, jede mit eigenen Animationen und die meisten mit eigener Musik.

No "free": Steam shows the price.

### 4.2 About This Game

Headings as the form's own text; the loops from `assets/store/description/` where marked — the
three stages of a round under the first section, the change of look under the looks (each
language its own), the Frost Cannon under the towers: 9.8 MB a page. Remade from the filmed clips
by `sh tools/storeart/loops.sh` (ARCHIVE 15zo).

**English**

> **A game of cannons and walls**
>
> Every round has three phases:
>
> - **Place your cannons** inside your walls.
> - **Fire!** Shoot holes in your opponents' walls while they shoot at yours.
> - **Rebuild your walls** with pieces of every shape before the clock runs out.
>
> A wall seals a castle only if it closes all the way round — corners included. Cannons outside
> sealed ground fall silent. Fail to seal a castle and you lose a life, and get a fresh castle
> to start again. After ten rounds, the best score among those still standing wins.
>
> _[1-place-cannons.gif]_
>
> _[2-combat.gif]_
>
> _[3-rebuild.gif]_
>
> **Play together**
>
> Two to eight players, everyone against everyone or in teams. Open a Steam lobby — public, for
> friends, or by invitation — and fill any empty seat with a bot of ten skill levels. Or take on
> the bots alone.
>
> **24 looks**
>
> Choose one look for building and one for combat, or a new one every round: Medieval,
> Cyberpunk, Pirates, Anime, Christmas, Wild West and eighteen more. Each draws the whole board
> its own way, with its own animations, and most bring their own music. When the look changes
> mid-match, it sweeps across the board.
>
> _[4-change-of-look-en.gif]_
>
> **Special towers**
>
> Switch them on for a wilder game: nine towers, from Big Bertha's crater to a chain of
> lightning and a lullaby that sends enemy cannons to sleep. They are off by default, so the
> classic game stays classic.
>
> _[5-special-towers.gif]_
>
> **Tournaments**
>
> Lead your team through a league and a knockout against a field of named rivals. Friends can
> join your team, and your progress is saved between matches.
>
> **Mouse or controller**
>
> Played with the mouse alone — two buttons and the wheel — or with a controller. In English and
> German.

**German**

> **Ein Spiel aus Kanonen und Mauern**
>
> Jede Runde hat drei Phasen:
>
> - **Stell deine Kanonen auf**, hinter deinen Mauern.
> - **Feuer!** Schieß Löcher in die Mauern deiner Gegner, während sie auf deine schießen.
> - **Bau deine Mauern wieder auf**, mit Teilen jeder Form, bevor die Zeit abläuft.
>
> Eine Mauer umschließt eine Burg nur, wenn sie ganz herum geht — auch um die Ecken. Kanonen
> außerhalb umschlossenen Bodens verstummen. Umschließt du keine Burg, verlierst du ein Leben
> und bekommst eine neue Burg für den Neuanfang. Nach zehn Runden gewinnt die beste Punktzahl
> unter denen, die noch im Spiel sind.
>
> _[1-place-cannons.gif]_
>
> _[2-combat.gif]_
>
> _[3-rebuild.gif]_
>
> **Gemeinsam spielen**
>
> Zwei bis acht Spieler, jeder gegen jeden oder in Teams. Öffne eine Steam-Lobby — öffentlich,
> für Freunde oder nur auf Einladung — und besetze jeden freien Platz mit einem Bot, in zehn
> Stärkestufen. Oder tritt allein gegen die Bots an.
>
> **24 Optiken**
>
> Wähl eine Optik fürs Bauen und eine für den Kampf, oder jede Runde eine neue: Mittelalter,
> Cyberpunk, Piraten, Anime, Weihnachten, Wilder Westen und achtzehn weitere. Jede zeichnet das
> ganze Spielfeld auf ihre Art, mit eigenen Animationen, und die meisten bringen eigene Musik
> mit. Wechselt die Optik mitten im Spiel, fegt sie über das Spielfeld.
>
> _[4-change-of-look-de.gif]_
>
> **Spezialtürme**
>
> Schalte sie für ein wilderes Spiel ein: neun Türme, vom Krater der Dicken Berta bis zu einer
> Kette aus Blitzen und einem Schlaflied, das gegnerische Kanonen einschlafen lässt.
> Anfangs sind sie aus, damit das klassische Spiel klassisch bleibt.
>
> _[5-special-towers.gif]_
>
> **Turniere**
>
> Führ dein Team durch eine Liga und eine K.-o.-Runde gegen ein Feld rivalisierender Teams. Freunde
> können deinem Team beitreten, und dein Fortschritt wird zwischen den Spielen gespeichert.
>
> **Maus oder Controller**
>
> Gespielt mit der Maus allein — zwei Tasten und das Mausrad — oder mit einem Controller. Auf
> Englisch und Deutsch.

### 4.3 The store's settings

- **Tags**, in order of weight, to check against the Tag Wizard's list: Strategy, Multiplayer,
  Online PvP, Free to Play, Casual, Action, Arcade, Real-Time, PvP, Team-Based, Party Game,
  Destruction, Base Building, Artillery, Colorful, Stylized, 2D, Retro, Medieval, Controller.
  Castles in place of Medieval if the Wizard has it. Left out on purpose: Local Multiplayer (no
  couch play), Tower Defense (it is not one), Pixel Graphics (only some styles).
- **Genre**: Strategy, Action, Casual. **Price**: Free.
- **Features**: Single-player (a whole match or tournament against bots), Online PvP, Online
  Co-op (friends in one team against bot teams); Full controller support once checked on the
  Steam build; Steam Deck later, by review. No achievements, no cloud at launch (STEAM.md §10).
- **Languages**: English and German — interface, subtitles (the texts); no audio.
- **System requirements** (measured 2026-11-07 on Windows and Linux, ARCHIVE 15zp):

  |           | Minimum                                               | Recommended                  |
  | --------- | ----------------------------------------------------- | ---------------------------- |
  | OS        | Windows 10 64-bit; Linux 64-bit (Steam Linux Runtime) | Windows 11; a current distro |
  | Processor | 64-bit, 2 cores                                       | 4 cores                      |
  | Memory    | 4 GB RAM                                              | 8 GB RAM                     |
  | Graphics  | integrated graphics with WebGL 2 (DirectX 11)         | any dedicated card           |
  | Network   | broadband for online play; none against bots          | the same                     |
  | Storage   | 500 MB                                                | the same                     |

  What the figures stand on — the packaged app in an eight-player match of bots, every process
  of it sampled (`tools/storeart/src/sysreq.ts`): **memory** 0.9–1.0 GB private on average, 1.27
  GB at its peak, 1.3 GB working set, from round 1 and from round 8 alike, so 4 GB leaves Windows
  itself room and 8 GB a browser beside it; on Linux less, 0.78–0.85 GB proportional (PSS) on
  average and 0.94 GB at the peak. **Processor**: about one core busy on average, 2.6 at
  the peak; held to two threads of an i7-8700K the game kept 59.5–59.7 fps, late in the match too,
  and on one thread it fell to 54 fps with 9% of frames slow — so two cores at the least. On a
  slow processor of its own, a Ryzen 3 4300U (a 2020 laptop's, four cores, no SMT), held to two
  cores: 56–58 fps, 4–6% of frames a refresh late; so two cores hold, the four recommended for
  room. **Graphics**: the packaged AppImage on that machine's integrated AMD Renoir graphics, full
  screen at 2560 × 1440, eight players: 58.2–58.3 fps, 2.6–2.9% of frames a refresh late (in the
  window 58.7) — the graphics line holds for the real app. Electron draws WebGL through Direct3D
  11 on Windows, through OpenGL (Mesa's radeonsi) on Linux. **Storage**: the unpacked Windows app
  is 431 MB, the Linux one 347 MB (its AppImage 178 MB). Electron 44 needs Windows 10 or later.

- **The content survey and the IARC questionnaire**: cartoon violence against walls and cannons
  only, no people hurt (Anime's heroes and Stadium's sportsmen are guns of their style — note
  them), no blood, no language, no gambling, no purchases, online interaction without chat (there
  is none).
- **The AI disclosure**: to be answered from the form as it stands. Two answers the user obtained
  said no disclosure is needed: the graphics are procedural code, not a generative model's, and
  Claude Code, with which the code was written, is a development tool, not AI content in the game
  or its marketing. Valve's 2024 wording named code among "pre-generated" content; the form's
  present wording decides.
- **The legal notice**, if the form has one: © 2026 Thomas Arnold; audio credited in the game.
  No Rampart (§1).

## 5. Still open

**Next steps while the spike (S1) waits** (the user's, 2026-11-06):

- ~~**Measure the system requirements**~~ — done 2026-11-07 on the gaming PC (ARCHIVE 15zp, §4.3):
  six runs of an eight-player match, the whole app's memory and processor sampled, a weaker
  processor seen by holding the app to two threads and to one. Not measured: a slow processor of
  its own, nor styles other than the default looks (Minimal and Medieval), which cost at most
  some 1 ms a frame each (ARCHIVE 14zc–14zo).
- ~~**See the icon on Linux**~~ — done 2026-11-06 on the development machine (Cinnamon): the
  AppImage built locally shows the B in the panel (the window's class `bollfort` matching the
  .desktop file's `StartupWMClass`) and as the file's icon in Nemo. Its .desktop `Comment`, read
  from `package.json`'s `description`, had been a developer's note; now the game's line.
- ~~**Measure the requirements on the Linux machine too**~~ — done 2026-11-07 (ARCHIVE 15zp,
  §4.3): `sysreq.ts` runs on Linux, five runs on the Ryzen 3 4300U and its Renoir graphics, the
  lines unchanged. The plan, as it was (the user's, 2026-11-07, to be done on
  the development machine). Why: it is the weaker machine — integrated AMD Renoir graphics and
  slower cores, where the gaming PC could only take threads away — so it says more about the
  minimum; and the graphics line rests on a browser's measurement (ARCHIVE 12n), not the packaged
  app's, while the Linux build, drawing through OpenGL rather than Direct3D, was not measured at
  all. What:
  1. **Make `tools/storeart/src/sysreq.ts` run on Linux**: it is Windows-only so far. Start the
     AppImage (`npm run build`, `npm run package -w @bollfort/desktop`, then
     `packages/desktop/release/Bollfort-*-linux.AppImage`) with `--remote-debugging-port=9222`,
     as it starts the .exe; read the app's processes from `ps` (every process of the AppImage —
     find them by the parent's tree or by the mount's path, not by a name of `bollfort` alone —
     their RSS and their processor time, summed) in place of PowerShell's `Get-Process`;
     `taskset` for `--affinity` if wanted; the logical processors from `nproc`. The rest — the
     window found by its `#play`, the match, the frame clock, the results — is the same.
  2. **Three runs** of four minutes, eight bots: in the window; in full screen; in full screen
     from round 8 (`--round 8`). Look at each run's screenshot: eight islands in play.
  3. **Read them against §4.3**: if full screen keeps close to 60 fps on the integrated graphics,
     the graphics line holds for the real app; if not, raise it, or name a resolution that does.
     Memory on Linux beside Windows' 1.3 GB. Then STORE_PAGE.md §4.3 and ARCHIVE 15zp's note
     extended with the Linux figures.

**Before or at S4:**

- The user's reading of the texts, the German above all.
- **The events' art**: a cover and a header to choose, made by
  `npm start -w @bollfort/storeart -- <dir> event-cover event-header` (the capsules' board, plain
  or with a look above the line; ARCHIVE 15zo); Valve's template for the header to read first.
- In the Steamworks forms: the short description's limit, the Tag Wizard's list, the legal
  notice's field, the AI disclosure's wording; on the live page, the description column's width.
- Not read yet: the graphical asset rules (`/doc/store/assets/rules`), the trailer page, the
  localisation page, the community icons' page.
