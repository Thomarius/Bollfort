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
- **System requirements** (draft; the processor and memory still to measure, §5):

  |           | Minimum                                                                  |
  | --------- | ------------------------------------------------------------------------ |
  | OS        | Windows 10 64-bit; Linux 64-bit (Steam Linux Runtime)                    |
  | Processor | a dual-core from the last ten years — to confirm                         |
  | Memory    | 4 GB RAM — to confirm by measuring an eight-player match                 |
  | Graphics  | any GPU with WebGL 2; integrated graphics run eight players at 58–60 fps |
  | Network   | broadband for online play; none against bots                             |
  | Storage   | 500 MB (the unpacked Windows app 431 MB, 2026-11-06)                     |

  Electron 44 needs Windows 10 or later. The 58–60 fps is ARCHIVE 12n's (AMD Renoir); the page
  took 356 MB in an eight-player match (ARCHIVE 14b), Electron's other processes on top.

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

- **Measure the system requirements**: the packaged app in an eight-player match against bots,
  every process's memory in Task Manager, and the processor's load — for §4.3's memory and
  processor lines. On the gaming PC; a weaker machine would say more about the minimum.
- **See the icon on Linux**: the AppImage's icon in a file manager and a dock, from the release
  workflow run by hand (no publishing) or on the development machine. Only the .exe's was seen.

**Before or at S4:**

- The user's reading of the texts, the German above all.
- **The events' art**: a cover and a header to choose, made by
  `npm start -w @bollfort/storeart -- <dir> event-cover event-header` (the capsules' board, plain
  or with a look above the line; ARCHIVE 15zo); Valve's template for the header to read first.
- In the Steamworks forms: the short description's limit, the Tag Wizard's list, the legal
  notice's field, the AI disclosure's wording; on the live page, the description column's width.
- Not read yet: the graphical asset rules (`/doc/store/assets/rules`), the trailer page, the
  localisation page, the community icons' page.
