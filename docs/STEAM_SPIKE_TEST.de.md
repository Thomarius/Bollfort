# S1 — der Steam-Spike (App-ID 480)

Die deutsche Fassung von `docs/STEAM_SPIKE_TEST.md`, für die Tester. Beide werden gleich gehalten
und mit dem Spike entfernt, sobald die Antworten von S1 in STEAM.md stehen. Die Spike-App selbst
ist englisch: Knöpfe und Felder heißen hier so, wie sie in der App stehen.

Der Spike ist ein Wegwerf-Programm (docs/STEAM.md §3.3), das nie in den Hauptzweig kommt. Auf
jedem Rechner läuft ein fertig gepackter Spike; der Spike des Gastgebers betreibt Bollforts eigenen
Server in sich selbst, und jede Nachricht zwischen den Rechnern geht über Steams P2P-Kanal. Das
Spiel selbst ist unverändert.

Zwei Rechner, zwei Steam-Konten, die miteinander befreundet sind:

- **A** — Linux
- **B** — Windows

| Frage | Worum es geht                                                                   | Wo                                    |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------- |
| Q1    | Funktioniert die Steam-Anbindung in unserem Electron, unter Windows und Linux?  | Teil 1                                |
| Q2    | Erscheint Steams Overlay über dem Spielfenster, und sein Einladungsdialog?      | Teil 2                                |
| Q3    | Trägt Steams P2P-Kanal ein ganzes Spiel mit acht Plätzen ohne Desyncs?          | Teile 4, 5                            |
| Q4    | Darf auch ein Gast einladen, nicht nur der Gastgeber?                           | nicht getestet: braucht drittes Konto |
| Q5    | Erreicht eine Einladung ein laufendes Spiel, und startet sie ein geschlossenes? | Teile 2, 3, 6                         |
| Q6    | Gehört `RestartAppIfNecessary` in unseren Programmstart?                        | Teil 1, nur notieren                  |

Q6 lässt sich auf 480 nicht wirklich beantworten: Mit `steam_appid.txt` neben dem Programm sagt
Steam immer, dass kein Neustart nötig ist. Den Wert notieren; entschieden wird in S2.

Die Schritte sind als **Tun**, **Erwartet** und **Notieren** geschrieben. Das Ergebnisblatt am Ende
nebenbei ausfüllen.

---

## Der automatische Teil — schon erledigt

Alles, was nur ein Steam-Konto braucht, hat ein Skript (`auto.mjs`) am 2026-11-07 auf beiden
Rechnern geprüft, alles bestanden. Der Abend muss das nicht wiederholen. Was dabei herauskam und
für den Abend wichtig ist:

- **Unter Windows (B)** zeichnet sich das Overlay im **zuerst geöffneten Fenster** — dem
  Kontrollfenster —, egal welches Fenster vorne ist; ist das Kontrollfenster geschlossen, über dem
  Spielfenster. Das Overlay also im Kontrollfenster suchen.
- **Unter Linux (A) erscheint das Overlay gar nicht**, auch nicht, wenn der Spike aus Steams
  Bibliothek gestartet wird: Steam kann sich nicht in Chromiums Zeichnen einhängen. Auf A gibt es
  also kein Shift+Tab, und ein Einladungsdialog öffnet sich, wenn überhaupt, in einem eigenen
  Steam-Fenster. Wo ein Schritt A einladen lässt: den Einladen-Knopf versuchen, und wenn kein
  Dialog kommt, **in Steams Freundesliste auf A: Rechtsklick auf B → Zum Spiel einladen**.
- A wird wie unten aus dem Terminal gestartet. Falls A doch einmal aus Steams Bibliothek gestartet
  wird, müssen die Startoptionen **nur** `--no-sandbox` lauten (mit `%command%` davor führt Steam
  den Schalter als Programm aus), sonst dauert es 70–80 s, bis das Fenster erscheint.

---

## Vor dem Abend

1. **Die neuesten Builds herunterladen.** Auf GitHub: **Actions** → **Steam spike** → der neueste
   Lauf mit grünem Haken → unten **Artifacts**. A bekommt `bollfort-steam-spike-linux`, B bekommt
   `bollfort-steam-spike-windows`. Ältere Downloads ersetzen: Den alten Builds fehlen die Knöpfe
   unten.
2. **Auf A (Linux) entpacken.** Der Download ist ein Zip mit einem `.tar.gz` darin:
   ```bash
   rm -rf ~/spike && mkdir -p ~/spike && cd ~/spike
   unzip ~/Downloads/bollfort-steam-spike-linux.zip
   tar xzf BollfortSteamSpike-linux.tar.gz
   ```
   Das Programm ist `~/spike/BollfortSteamSpike-linux/bollfort-steam-spike`.
3. **Auf B (Windows) entpacken.** Der Download ist ein Zip mit einem zweiten Zip darin. Rechtsklick
   darauf → **Alle extrahieren…**, dann Rechtsklick auf `BollfortSteamSpike-windows.zip` darin →
   **Alle extrahieren…** in einen leeren Ordner wie `C:\Spike`. Nie aus einem Zip heraus starten.
4. **Steam prüfen, auf beiden:**
   - angemeldet, online, die beiden Konten miteinander befreundet;
   - **Steam → Einstellungen → Im Spiel → Steam-Overlay im Spiel aktivieren** eingeschaltet;
   - jeder Steam-Name **höchstens 24 Zeichen** (die Grenze des Spiels; ein längerer wird auf 24
     gekürzt);
   - kein Bollfort-Spiel und keine Bollfort-Desktop-App offen.
5. **Ein Controller** für Teil 7 bereit, falls vorhanden.

## Das Kontrollfenster

Jeder Spike öffnet ein **Kontrollfenster**; das Spiel öffnet sich in einem zweiten Fenster, sobald
man ein Spiel eröffnet oder beitritt. Im Kontrollfenster:

- **Notes** oben:
  - **Mark in log** — die Nummer des Schritts eintippen (z. B. `4`) und Enter drücken oder
    klicken. Schreibt den Schritt und die ganze State-Tabelle ins Log. **Am Ende jedes Schritts
    markieren**: Dann stehen alle Zahlen jedes Schritts in der Log-Datei, und nichts muss von Hand
    abgeschrieben werden.
  - **Copy state and log** — legt beides in die Zwischenablage, zum Einfügen in einen Chat oder
    das Blatt.
  - **Restart clean** — beendet den Spike und startet ihn neu, ohne Reste (keine Lobby, kein
    Server, kein Spielfenster, Zähler auf null). Überall verwenden, wo ein Schritt _neu starten_
    sagt.
- **State** — wer man ist, die Lobby, der Raum und die Zahlen der Verbindung:
  - **Round trip over Steam** (nur beim Gast): aktuell, höchster und Mittelwert.
  - **Host silent > 3 s**: wie oft der Gastgeber nicht mehr antwortete, und die längste Stille.
  - **Sent / Read**: Pakete, Größe, Sendefehler.
  - **Sockets opened (in a match: N)**: N muss **0** bleiben. Ein während eines Spiels geöffneter
    Socket ist das Spiel des Gastes, das sich neu verbindet — ohne verlorene Verbindung heißt das,
    Steam hat Daten verloren oder vertauscht.
  - **Log file**: wohin das Log dieses Starts geschrieben wird.
- **Log** — alles, was passiert ist. Rote Zeilen sind Fehler. Warnungen und Fehler des
  Spielfensters erscheinen hier auch, als `game warning:` oder `game error:`.

**Die Log-Dateien** liegen in einem Ordner `logs` neben dem Programm —
`~/spike/BollfortSteamSpike-linux/logs/` auf A, `C:\Spike\logs\` auf B —, eine Datei je Start.
Jeder Neustart beginnt eine neue Datei.

---

## Teil 1 — Start (Q1, Q6)

**Tun:** Den Spike auf beiden starten.

- **A:** `cd ~/spike/BollfortSteamSpike-linux && ./bollfort-steam-spike`
- **B:** Doppelklick auf `C:\Spike\BollfortSteamSpike.exe`. SmartScreen warnt vor einem
  unbekannten Herausgeber: **Weitere Informationen → Trotzdem ausführen**.

**Erwartet:** das Kontrollfenster. **Steam user** zeigt den eigenen Steam-Namen und eine lange ID.
Keine Firewall-Abfrage (nichts lauscht über den Rechner hinaus).

**Notieren:**

- Steam user angezeigt: ja / nein, auf A und auf B → **Q1**. Steht dort _not initialised_, läuft
  Steam nicht oder ist nicht angemeldet: Steam starten, dann **Restart clean**.
- `restartAppIfNecessary` auf jedem (erwartet `false`) → **Q6**.
- Eine Firewall-Abfrage, falls eine kommt.

Diese Werte hat `auto.mjs` schon geliefert (2026-11-07, auf beiden: Steam user angezeigt, `false`,
nichts lauscht über den Rechner hinaus). Der Start ist trotzdem für alles Weitere nötig.

**Mark** `1` auf beiden.

## Teil 2 — A eröffnet eine Friends-Lobby; Overlay und Einladung (Q2, Q5)

**2a. Eröffnen.**
**Tun:** auf A **Host: Friends lobby**.
**Erwartet:** nach wenigen Sekunden öffnet sich das Spielfenster in Bollforts Lobby mit acht
Plätzen. Im Log von A: `lobby … made (friends)`, dann `room … published in the lobby`.
**Notieren:** Spielfenster geöffnet: ja / nein.

**2b. Das Overlay auf A.** Erledigt: Es erscheint auf dem Linux-Desktop nicht (oben). Überspringen.

**2c. Der Einladungsdialog.**
**Tun:** im Kontrollfenster von A **Invite (lobby.openInviteDialog)**.
**Erwartet:** kein Overlay; vielleicht Steams Einladungsdialog in einem eigenen Steam-Fenster.
**Notieren:** öffnet sich: ja / nein, und wo. Öffnet sich nichts, **Invite
(overlay.activateInviteDialog)** versuchen und notieren, ob das geht.

**2d. B einladen, während B läuft (Q5).**
**Tun:** im Dialog das Konto von B einladen — oder, ohne Dialog, in Steams Freundesliste auf A
Rechtsklick auf B → **Zum Spiel einladen**. Notieren, auf welchem Weg. Auf B die Einladung annehmen
(in Steams Chatfenster oder der Benachrichtigung).
**Erwartet:** im Log von B `GameLobbyJoinRequested: …`, dann `joined lobby …`; auf B öffnet sich
ein Spielfenster, und der Name von B erscheint auf einem Platz in As Spielfenster.
**Notieren:** `GameLobbyJoinRequested` im Log von B: ja / nein. B sitzt in As Raum: ja / nein.

**2e. Das Overlay auf B.** Von `auto.mjs` am 2026-11-07 erledigt: Overlay und beide
Einladungsdialoge öffnen sich unter Windows, im Kontrollfenster, solange es offen ist, sonst über
dem Spielfenster. Überspringen.

**Mark** `2` auf beiden.

## Teil 3 — Beitreten aus der Freundesliste (Q5)

**Tun:** auf B **Restart clean**. Wenn das Kontrollfenster von B wieder da ist, auf B Steams
**Freundesliste** öffnen, Rechtsklick auf As Namen → **Spiel beitreten**. (As Lobby aus Teil 2 ist
noch offen.)
**Erwartet:** im Log von B `GameLobbyJoinRequested`, ein Spielfenster auf B, B sitzt in As Raum.
**Notieren:** „Spiel beitreten" im Menü angeboten: ja / nein. B sitzt: ja / nein.

**Mark** `3` auf beiden.

## Teil 4 — Das Spiel, A ist Gastgeber (Q3)

**Tun:** in As Spielfenster sind die sechs leeren Plätze Bots. B klickt **Ready**, A klickt
**Start match**. Das **ganze** Spiel normal spielen, beide. Das Netzwerk nicht stören.

**Ab und zu im Kontrollfenster von B schauen:** Round trip, _Host silent_, _Sockets opened in a
match_.

**Erwartet:** Sockets in a match bleibt **0**; keine roten Zeilen; _Host silent_ 0-mal.

**Notieren, am Ende des Spiels** (vor allem anderen):

- Round trip: Mittelwert und höchster;
- _Host silent_: Anzahl und längste;
- Sockets opened in a match (muss 0 sein);
- Sendefehler und das größte Paket;
- jede rote Zeile oder `game error` in einem der beiden Logs;
- wie es sich im Vergleich zu einem LAN-Spiel anfühlte: Verzögerung nach einem Klick, Sprünge,
  Ruckler.

**Mark** `4` auf beiden, gleich nach dem Spiel.

## Teil 5 — B eröffnet eine Public-Lobby; die Lobbyliste; das Spiel andersherum (Q3)

**5a. B eröffnet, A findet sie.**
**Tun:** auf beiden **Restart clean**. Auf B **Host: Public lobby**. Auf A **List our lobbies**.
**Erwartet:** im Log von A `getLobbies: N lobbies on 480, M of ours`. Alle Spacewar-Entwickler
teilen sich die Liste von App 480, und die Anbindung kann sie nicht filtern — _none of ours found_
ist also ein Ergebnis, kein Fehler.
**Tun:** steht Bs Lobby in der Liste, sie anklicken. Wenn nicht, die **Lobby**-Nummer aus Bs State
in As Feld _lobby id_ kopieren und **Join by id** klicken.
**Notieren:** die `getLobbies`-Zeile (N und M); Bs Lobby gelistet: ja / nein; beigetreten über
Liste oder über ID.

**5b. Das Spiel.**
**Tun:** A klickt **Ready**, B **Start match**. Das Spiel normal spielen, jetzt schaut **A** in
sein eigenes Kontrollfenster, bis **zwei Runden vor Schluss**.
**Tun:** **Mark** `5b` auf A und B — das sichert die Zahlen des ungestörten Teils, vor dem Ausfall
unten.
**Notieren:** wie in Teil 4 (Round trip Mittelwert und höchster, Host silent, Sockets in a match,
Fehler).

**5c. Ein Netzwerkausfall beim Gast.**
**Tun:** auf A das Netzwerk für **10 Sekunden** trennen (Kabel ziehen oder WLAN aus), dann wieder
verbinden. Weiterspielen.
**Erwartet:** im Log von A `the host has not answered for 3 s`, später `the host answers again,
after N s`. Das Spiel auf A friert vermutlich ein und holt dann auf. (Der Verbindungshinweis des
Spiels selbst erscheint _nicht_: As Spiel spricht mit dem Spike auf As eigenem Rechner, und diese
Verbindung reißt nie ab.)
**Notieren:** Hat der Gastgeber wieder geantwortet (nach N Sekunden)? Hat As Spiel aufgeholt und
weitergespielt? Eine Zeile `P2P session … failed` in einem der Logs? Sockets in a match noch 0?
**Tun:** hat es sich erholt, das Gleiche noch einmal für **30 Sekunden**, und dasselbe notieren.
**Tun:** das Spiel zu Ende spielen. **Mark** `5c` auf beiden.

## Teil 6 — Eine Einladung bei geschlossenem Spiel (Q5)

**Tun:** auf A **Restart clean**; auf A **Host: Friends lobby**. Den Spike von B ganz beenden
(seine Fenster schließen). Auf A **Invite (lobby.openInviteDialog)** und B einladen — oder, ohne
Dialog, in Steams Freundesliste auf A Rechtsklick auf B → **Zum Spiel einladen**. Auf B annehmen.
**Erwartet:** Auf App 480 startet Steam **Spacewar**, nicht unseren Spike — das ist so erwartet;
der echte Test braucht unsere eigene App-ID.
**Notieren:** was Steam auf B getan hat: Spacewar zur Installation angeboten / gestartet / nichts /
etwas anderes.

Danach den Spike von B wieder starten. **Mark** `6` auf A.

## Teil 7 — Controller und Steams Tastatur

**Tun:** einen Controller an B (oder A) anschließen, ins **Kontroll**fenster klicken und eine
beliebige Taste am Pad drücken.
**Notieren:** den Namen unter _Controllers this page sees_. `Xbox 360 Controller`, `Steam Virtual
Gamepad` oder Ähnliches heißt, Steam Input reicht das Pad durch. Steam wendet Spacewars eigene
Controller-Einstellungen auf den Spike an, bei unserer App-ID kann es also anders sein.
**Tun:** **Restart clean**, eine Lobby eröffnen und im Spielfenster nur mit dem Pad durch die Menüs
und ein paar Runden gegen Bots gehen.
**Notieren:** Funktioniert das Pad im Spielfenster unter Steam?
**Tun (nur in Steams Big-Picture-Modus oder auf einem Steam Deck):** **Steam's gamepad keyboard**.
**Notieren:** Öffnet sie sich, und was hat sie laut Log zurückgegeben?

**Mark** `7`.

## Teil 8 — Optional: eine Invite-only-Lobby

**Tun:** auf beiden **Restart clean**. Auf A **Host: Invite only**, dann **Invite
(lobby.openInviteDialog)** und B einladen — oder, ohne Dialog, in Steams Freundesliste auf A
Rechtsklick auf B → **Zum Spiel einladen**; B nimmt an.
**Notieren:** B sitzt in As Raum: ja / nein. Kein Spiel nötig. **Mark** `8` auf beiden.

---

## Danach

Schicken:

- die **logs-Ordner** beider Rechner (alle Dateien darin);
- das **Ergebnisblatt** unten.

Sie entscheiden über die Arbeit an der Anbindung in S3 (STEAM.md §3.2: ob wir `steamworks.js`
forken, und ob das alte P2P reicht) und werden in STEAM.md festgehalten. Danach werden der Spike
und sein Zweig weggeworfen.

## Ergebnisblatt

| Schritt | Was                                              | A (Linux)       | B (Windows) |
| ------- | ------------------------------------------------ | --------------- | ----------- |
| 1       | Steam user angezeigt (Q1)                        |                 |             |
| 1       | Wert von `restartAppIfNecessary` (Q6)            |                 |             |
| 1       | Firewall-Abfrage                                 |                 |             |
| 2a      | Spielfenster als Gastgeber geöffnet              |                 | —           |
| 2b      | Overlay über dem Spielfenster (Q2)               | nein (erledigt) | —           |
| 2c      | Einladungsdialog: welcher Knopf, wo; sonst Liste |                 | —           |
| 2d      | `GameLobbyJoinRequested`; sitzt (Q5)             | —               |             |
| 2e      | Overlay über dem Spielfenster (Q2)               | —               |             |
| 3       | Spiel beitreten aus der Freundesliste; sitzt     | —               |             |
| 4       | Round trip, Mittelwert / höchster (Gast)         | —               |             |
| 4       | Host silent: Anzahl / längste                    | —               |             |
| 4       | Sockets in a match (muss 0 sein)                 |                 |             |
| 4       | Sendefehler; rote Zeilen; wie LAN?               |                 |             |
| 5a      | `getLobbies` N / M; gelistet; beigetreten über   |                 | —           |
| 5b      | Round trip, Mittelwert / höchster (Gast)         |                 | —           |
| 5b      | Host silent; Sockets in a match; Fehler          |                 |             |
| 5c      | 10 s Ausfall: erholt nach N s; aufgeholt         |                 |             |
| 5c      | 30 s Ausfall: erholt nach N s; aufgeholt         |                 |             |
| 5c      | `P2P session … failed`; Sockets in a match       |                 |             |
| 6       | Was Steam bei geschlossenem Spiel tat (Q5)       | —               |             |
| 7       | Name des Controllers; Pad funktioniert im Spiel  |                 |             |
| 7       | Steams Tastatur (nur Big Picture / Deck)         |                 |             |
| 8       | Invite only: sitzt                               | —               |             |
