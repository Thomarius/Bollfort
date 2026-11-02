# Bollwerk on Steam — a plan to think about

**Not decided.** The user is weighing whether to release Bollwerk on Steam (2026-11-02); this
file gathers what was worked out so the decision can be made on it, and so nothing is built
before it is made. If it goes ahead, this file becomes the design and its packages, as
`SPECIAL_TOWERS.md` was; if not, it is retired into the ARCHIVE with the reasons.

What Valve's documentation says was checked against its current pages on 2026-11-02
(partner.steamgames.com, `steamworks.js` on GitHub). Some long pages came back summarised rather
than verbatim; those points are marked _(to confirm)_ and are to be read on the live page before
anything is built on them. Points that are our own reasoning or memory are marked _(unchecked)_.

---

## 1. The decision so far

- **Free, if at all.** A free game is the lowest risk: no Gewerbe needed for sales, no price to
  justify, and a smaller target for the trademark's owner (§2).
- **A supporter DLC** as the way to give money, if any is wanted (§4).
- **Public and private lobbies**, friends invited directly, public games in the games list and
  open to anyone (§5). This brings back the Public / Private choice taken out on 2026-10-28
  (ARCHIVE 15j), for a reason: Steam has no room codes, so without private lobbies there is no
  match "without strangers".
- **The browser game, the portable builds on GitHub and the desktop app's link stay** as they
  are; Steam is one more way to find each other, not a replacement.

## 2. Is it allowed

- **The trademark.** Rules and mechanics are not protected, and nothing of the original is used
  — no code, graphics or sound. But on Steam a rights holder's complaint takes a game down first
  and is argued afterwards, and money makes the game a likelier target. So: no "Rampart" in the
  store page, its tags or its art; weigh whether the "inspired by" line belongs on the Steam
  page at all (it stays in the game's Credits); and if anything is ever sold, a short
  consultation with an IP lawyer first.
- **Audio** (checked in `config/audio.manifest.json`): CC0, CC-BY 3.0 and 4.0, and the Pixabay
  Content License — none NonCommercial, all fine in a game given away or sold. `CREDITS.md`
  gives CC-BY its attribution. **Not** fine: selling the music on its own, as a soundtrack (§4).
- **Fonts**: Inter and Rubik, SIL Open Font License, which allows bundling.
- **AI disclosure.** Steam's content survey asks about AI-generated content that ships with the
  game or is generated while it runs, and says "Efficiency gains through the use of these tools
  is not the focus of this section." Code written with an assistant is that; there is likely
  nothing to declare, as long as no graphics, text or sound are generated.
- **Rights in the work**: if any of it was done as part of a job (the university), who owns it
  is to be checked before publishing under one's own name _(unchecked)_.

## 3. Costs and paperwork

- **The Steam Direct fee**: US$100 per app, not refundable, no exception for free games. It is
  paid back once the app has US$1,000 of _Adjusted Gross Revenue_ — which a free game with a
  supporter DLC may never reach. A one-off cost, not a running one; still the user's decision
  under the no-budget rule. Whether DLC costs another fee is not stated _(to confirm)_.
- **Waiting**: after paying, Valve's pages disagree — 30 days (the Steam Direct page) or 21
  (onboarding) before the first few titles may be released. A first game may also request keys
  only three weeks after its App ID is made.
- **The store page** must show as Coming Soon for at least two weeks before release; submit it
  for review at least 7 working days before it should go live.
- **Valve's review** checks the store page (features "available at launch", a readable title on
  the capsules, screenshots only of play) and the build (it starts on every system listed, every
  feature named is in it). Nothing says multiplayer is tested. 3–5 working days; plan for 7.
- **Tax**: onboarding asks citizens of treaty countries for "information similar to" form
  W-8BEN; without the treaty 30% would be withheld. Any income — DLC sales — is income in
  Germany; with regular sales probably a Gewerbe, the Kleinunternehmer rule perhaps sparing the
  VAT (_unchecked_; a Steuerberater or the Finanzamt).
- **Revenue share**: from memory 30% _(unchecked)_; it is in the Steam Distribution Agreement,
  not in the pages read.
- **Signing**: a Steam install does not meet Windows' unknown-publisher warning, so PLAN §12's
  signing question falls away for Steam players (not for the GitHub builds).

## 4. Money: a supporter DLC

Steam has no tip button. The ways a free game takes money:

- **A supporter DLC** — the recommended one. Valve: DLC "can have actual files that you
  distribute to customers, or it can also just be a license entitlement", and names artbooks and
  wallpapers as DLC "that does not show up in-game". Nothing read requires gameplay content, and
  nothing names supporter or donation DLC either — **ask Valve's support** before relying on it.
  Give it something small anyway: wallpapers of the 24 looks, a little artbook, a supporter's mark
  by the name in the lobby. **Never anything that plays** — no tower, look or level for money in a
  multiplayer game among friends.
- **Not a soundtrack**: the music is the Pixabay and OpenGameArt authors', licensed for use in
  the game, not for selling on its own.
- **No donation button in the game**: "Your product must use Steam Wallet for any in-game
  transactions… your product cannot link to other store pages that does not offer Steam
  Wallet." Whether a voluntary donation counts is not said; expect it to fail review.
- **No links in the store page's description** ("No links… even implied URLs"); the store page
  editor's link fields take "common social media platforms or your own website". A website with
  a donation page is fine; whether Ko-fi or Patreon may be linked directly is not said.
- **Outside Steam**: GitHub Sponsors or Ko-fi on the repository and the website, as now.

## 5. Finding each other: Steam lobbies

### 5.1 What the players see

- **Play** opens a table with bots, as now. Under Steam it is also a **lobby**, **private** by
  default or **public** by the host's choice in the lobby screen, changeable until the start.
- **Private**: no one can join but by an invite — a solo match, or friends only. The host invites
  through Steam's own friend picker in the overlay, from a button in the lobby (mouse only).
- **Public**: listed in the **games list** and joined by anyone with a click; friends can still
  be invited.
- **Quick match** (to consider): joins the fullest public lobby that fits, or hosts one. Bots
  fill every empty seat, so a lobby is worth joining even with few people online — and a game
  with a small player base must never feel empty: Play with bots stays the main path, the list
  an addition.
- **At the start** the lobby closes to joins; a match is never joined in progress, as now.
- No ranking and no skill matchmaking: no players for it, and it would need a server.

### 5.2 How Steam provides it

- **Lobby types** (`ISteamMatchmaking`, _to confirm_ the exact wording): `Private` — "The only way
  to join the lobby is from an invite"; `FriendsOnly` — "Joinable by friends and invitees, but
  does not show up in the lobby list"; `Public` — "Returned by search and visible to friends";
  `Invisible`. Ours are `Private` and `Public`.
- **Changing it**: `SetLobbyType`, "can only be set by the owner of the lobby" — the host.
- **Closing it**: `SetLobbyJoinable(false)` — "no players can join, even if they are a friend or
  have been invited."
- **Lobby data**: key/value pairs the host sets (`SetLobbyData`): a game tag, the **protocol
  version**, free seats, players, teams, special towers on or off. The list is filtered on them
  (`AddRequestLobbyListStringFilter`, `AddRequestLobbyListFilterSlotsAvailable`) and by distance
  (`AddRequestLobbyListDistanceFilter`: Close, Default, Far, Worldwide). Lockstep cares about
  latency, but a small player base needs Worldwide or the list is empty — perhaps nearest first.
- **Invites**: `ActivateGameOverlayInviteDialog(lobby)` opens the overlay's picker. A player not
  running the game who accepts is started with `+connect_lobby <id>` (read it with
  `GetLaunchCommandLine`); one already playing gets `GameLobbyJoinRequested`. Both to handle.
- **Who may invite**: whether a guest, not only the owner, may call `InviteUserToLobby` is not
  documented. To test in S1. If only the owner may, a guest's invite goes through the host's app.
- **A lobby is a meeting point, not a server**: "Once all users have left a lobby, it is
  automatically destroyed."

### 5.3 Underneath: the host is still the server

The host's app runs Bollwerk's authoritative server as the desktop app does today (`packages/
server`, `room.ts`); only the **transport** changes, Steam's peer-to-peer channel in place of a
WebSocket, the host found by the lobby's owner. The protocol, the seats, Ready, the snapshot, the
hashes every 30 ticks, the rejoin after a dropped connection (ARCHIVE 15zc) and the recordings
stay as they are. So:

- **A transport interface** on both ends (`client/src/net/connection.ts`, the server's
  connection handling), with the WebSocket and Steam behind it, and an in-memory fake for tests.
- **The host leaving** ends the match, as now. Lockstep would allow handing the server to a guest
  — every client holds the state and the input log — but that is a package of its own, later.
- **Trust**: a modified host could cheat. Accepted for a free game without rankings.
- **Versions**: Steam updates everyone, but not at once; the protocol version in the lobby data
  keeps old and new apart.
- **Without Steam running**, the app starts as now — local play, the LAN, the link — never a
  crash.

### 5.4 `steamworks.js`, the binding

The likely binding for Electron (MIT, Rust). What it has, from its `client.d.ts`:
`createLobby(type, maxMembers)` with all four types, `joinLobby`, `getLobbies()`, a `Lobby` with
`setData`/`getData`/`getFullData`, `setJoinable`, `getMembers`, `getOwner`, `openInviteDialog`,
`leave`; `overlay.activateInviteDialog(lobbyId)`; the `GameLobbyJoinRequested` callback; and
`electronEnableSteamOverlay()` for the overlay in Electron (used in the renderer it needs
`contextIsolation: false` and `nodeIntegration: true` — better kept in the main process, behind
the preload, as the desktop app's other features are).

What it lacks:

- **The newer networking.** Its `networking` is only the old P2P interface (`sendP2PPacket`,
  `readP2PPacket`, `acceptP2PSession`, `isP2PPacketAvailable`) — not `ISteamNetworkingSockets` or
  `ISteamNetworkingMessages`, the API with Valve's relay (SDR) and the simulated bad networks.
  Whether the old one carries a match well enough is S1's main question.
- **Changing a lobby's type** after creating it (no `setLobbyType`).
- **Filters** on the lobby list: `getLobbies()` takes none — no data, slots or distance filter.
- Each is a small extension in its Rust code, upstream or in a fork; or we filter on the client
  while lobbies are few.

Also: whether Valve's relay is free is not stated ("contact us… to talk about the fine print"),
and the open-source GameNetworkingSockets is "a subset" of the API without access to the relay.

## 6. Testing

Three layers, the Steam code as thin as it can be.

1. **Without Steam, in `npm run check`**: the lobby logic (who hosts, who sits where, the host
   leaving, an invite arriving at start-up or in play) as pure functions over a scripted fake
   Steam, as `lobby.ts` is tested now; one suite of tests for every transport — WebSocket and an
   in-memory fake that delays, reorders, drops and disconnects. A match that ends with no hash
   mismatch and replays exactly from its recording has passed. CI can never run real Steam: it
   needs a client running and logged in.
2. **Real Steam before paying**: App ID 480, Valve's Spacewar example, which has lobbies and
   networking; a `steam_appid.txt` with the App ID while developing ("You should not ship this
   with your builds"). Tag our lobbies, since every developer shares 480. Two accounts on two
   machines (_unchecked_ that one account cannot be online twice; and what an account that never
   spent money may not do — the help page did not load). The newer networking's
   `k_ESteamNetworkingConfig_FakePacketLoss_Send`/`_Recv`, `FakePacketLag_*`, `FakePacketReorder_*`
   and `FakePacketDup_*` simulate a bad network — only if the binding gains that API. A written
   checklist in the repo, run before each Steam build: host and invite; join from the overlay's
   invite with the game closed and with it running; the host quits; a guest drops and comes back;
   the overlay over the match; eight seats with bots; a tournament across matches; Steam not
   running.
3. **After paying**: builds uploaded with SteamPipe (`steamcmd`) to a password-protected beta
   branch, chosen by testers under Properties → Game Versions & Betas — the real install, launch
   options and Linux runtime, where a native module and the overlay are likeliest to break. Keys
   for testers are free (up to 2,500 for testing before release). **Steam Playtest**, a free child
   App ID, for a wider test: players sign up and are picked at random, keys optional.

## 7. Smaller points

- **Steam Deck**: Verified needs the default controller layout to "access all content"; a
  mouse-only game would most likely be **Playable**, which is no bar to the store. The mouse-only
  rule stays.
- **Linux**: a Steam build runs under the Steam Linux Runtime; the AppImage is not what Steam
  ships, the unpacked app is. To try in the beta branch.
- **Achievements and Steam Cloud** (a tournament's save) are possible, not needed.
- **The release workflow** gains a job that builds the Steam depots (the binding's native module
  for Windows and Linux, without `steam_appid.txt`) and uploads them with `steamcmd`, its
  credentials as repository secrets.
- **PLAN §12** defers quick match and matchmaking for v1; Steam lobbies would be the free way to
  have them, with no server of our own.

## 8. Packages, if it goes ahead

- **S0 — Decide.** The user's: whether at all, free or with a supporter DLC, the store page's
  wording about the original. Pay the fee only after S1.
- **S1 — The spike, on App ID 480** (a day or two, nothing paid): `steamworks.js` in the desktop
  app's main process, a lobby made, listed and joined, an invite with the game closed and open,
  and one match between two machines over the old P2P interface. Answers: does the binding build
  for our Electron on both systems, does the overlay show, does the old P2P carry a match, may a
  guest invite.
- **S2 — The transport**: the interface, the fake, the tests; the WebSocket behind it unchanged.
- **S3 — Steam lobbies**: Private and Public in the lobby screen, invites, the games list from
  Steam's lobbies, closing at the start, Steam not running; the binding extended where S1 found
  it short (lobby type, filters, perhaps the newer networking).
- **S4 — The store**: the Steamworks account, the fee, the store page and its art, the content
  survey, the depots and the release job, a beta branch for the users.
- **S5 — The users' test** on the beta branch, then Coming Soon for two weeks, then release.
- **Later, perhaps**: Quick match, the supporter DLC, the host handed on, achievements.

## 9. Open questions

- Whether to do it at all, and when — after the first feature-ready version?
- The store page's wording about the original, and whether a lawyer is consulted.
- Whether a supporter DLC is wanted, what goes in it, and Valve's word that it is acceptable.
- Whether the old P2P interface is enough, or the binding must gain the newer networking.
- Whether guests may invite.
- The distance filter's default for the list, given few players.
- The _unchecked_ and _to confirm_ points above, before each is relied on.
