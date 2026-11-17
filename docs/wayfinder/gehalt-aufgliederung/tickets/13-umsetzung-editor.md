# 13 · Umsetzung: Gehalts-Editor-Seite

Type: task
Status: resolved
Assignee: Anri
Blocked by: 12
Speist: 15 (fehlende Spalte `betrag_schwankt`)

## Question

Kein Entscheidungsticket — die Gestalt steht vollständig in
[08 · Eingabemaske](./08-eingabemaske.md) (Variante C, der Gehaltszettel). Aus dem
Nebel „Umsetzung Frontend" graduiert, nachdem 08 den Editor scharf gemacht hat; der
Rest der Oberfläche (Einnahmen-Liste, Dashboard, Statistik) hängt weiter an 09 und
bleibt Nebel.

**Blockade aufgelöst.** [12](./12-umsetzung-routen-mcp.md) steht: `/api/salaries` samt
granularen Posten-Operationen und die Übernahme als
`POST /api/salaries/:id/adopt-income` existieren. Vier Vorgaben von dort, die die Seite
betreffen:

- Die Übernahme verlangt `items: [{ incomeId, kind, label? }]` und **dasselbe Konto** wie
  das Gehalt — die Palette darf nur Einnahmen dieses Kontos anbieten.
- `PATCH …/components/:cid` antwortet mit **`derivationDiscarded`**. Das ist die
  Grundlage für „das Verwerfen sichtbar machen" (Auflage aus 08) — die Seite muss es
  nicht selbst herleiten.
- Ein PATCH mit **nur** `hours` schlägt fehl. Der Editor schickt Betrag und Herleitung
  **zusammen**.
- Jeder Posten trägt `label` (roh, `null`-fähig) **und** `displayLabel` (aufgelöst).
  Zurückgeschrieben wird `label` — `displayLabel` einzutragen fröre den Katalognamen ein.

**Warum die Blockade bestand:** die Seite schreibt gegen `/api/salaries` und die
Übernahme-Operation. Vorher gebaut, baut sie gegen eine Erfindung.

Der Prototyp liegt als Primärquelle auf dem Branch `prototype/gehalt-formular-08`
(`src/pages/prototype/GehaltFormularPrototyp.tsx`, `VarianteC`). Er ist unter
Prototyp-Bedingungen entstanden — keine Fehlerbehandlung, keine Typen aus der API — und
wird **neu geschrieben**, nicht übernommen.

### Umfang

1. **Zwei Routen** in `src/App.tsx`: `/income/gehalt/neu` und `/income/gehalt/:id`,
   beide auf dieselbe Seite.
2. **Die Seite** (`src/pages/SalaryEditor.tsx`): Palette links (Katalog aus
   `shared/salaryCatalog.ts`, gruppiert in fest / schwankend / Abzug, dazu der
   Abschnitt „Bestehende Einnahmen" des gewählten Kontos), Zettel rechts mit
   Arbeitgeber, Konto-Chips, Mitleser-Banner, großer Summe (aufgeteilt fest /
   schwankend / Abzug) und den Bestandteilszeilen; zugeklappt eine Zeile, aufgeklappt
   die Felder inklusive Satz-×-Stunden-Rechner bei den drei Arten mit `stundenhilfe`.
3. **Kein Nachladen bei Fokus** — die Auflage aus 08.5. Konten und Einnahmen werden
   beim Betreten einmal geladen; `useApi` bleibt danach pausiert. Die Begründung der
   Modal-Pause aus `CLAUDE.md` („Frische-Mechanik") gilt hier unverändert, obwohl es
   kein Modal mehr gibt.
4. **Die beiden Regeln aus 05**: Vorbelegung auf das **persönliche** Standardkonto
   (nicht `is_default`), Mitleser namentlich aus den aktiven `account_members`, und der
   Bestätigungsdialog vor dem Speichern bei persönlich → geteilt.
5. **Zod-Regeln vor dem Absenden spiegeln** (04, 03): `label` Pflicht bei `sonstiges`,
   `amount != 0`, Satz und Stunden beide oder keiner, direktes Ändern des Betrags
   verwirft die Herleitung. Der Server bleibt die Grenze — die Seite hält nur davon ab,
   in sie hineinzulaufen.
6. **Unbekanntes `kind`** fällt auf den rohen Schlüssel zurück, statt abzustürzen (06).
7. **Vorlagenweg** (aus 10): `/income/gehalt/neu?vorlage=<id>` lädt das Quellgehalt,
   übernimmt seine Posten **samt Beträgen**, lässt den Arbeitgeber leer und legt beim
   Speichern ein neues Gehalt an. Reine Frontend-Sache, keine eigene Route im Backend.
8. **Der Weg hinein** aus der Einnahmen-Liste gehört **nicht** hierher, sondern zu
   [14 · Umsetzung: Einnahmen-Liste, Dashboard und Statistik](./14-umsetzung-liste.md).

### Erwartetes Ergebnis

Ein Gehalt lässt sich über die Oberfläche vollständig anlegen und bearbeiten, inklusive
Übernahme bestehender Einnahmen; `npm run lint` und `npm run build` sind grün.

## Answer

`src/pages/SalaryEditor.tsx` (neu) plus zwei Routen in `src/App.tsx`. Der Prototyp war
Vorlage, nicht Quelle — neu geschrieben gegen die echten Typen und die echte API.

### Ein Befund, der über dieses Ticket hinausgeht

**Die Spalte `betrag_schwankt` fehlt.** Ticket 03 hat `betragSchwankt` als zweites
Merkmal **am Bestandteil** beschlossen — „aus der Art vorbelegt, **änderbar**" — und 04
hat darauf aufgebaut. Migration 8 hat sie nicht: 06 hat den Spaltensatz aus **02s
Skizze** übernommen, und 02 entstand *vor* 03. 06s „drei Abweichungen von 02s Skizze,
alle begründet" nennt sie nicht, also ist es ein **Versehen, keine Entscheidung**. 11
hat 06 treu gebaut, 12 leitet das Feld in der Nutzlast aus dem Katalog ab.

Folge für diese Seite: der `schwankt`-Haken des Prototyps hätte nichts, wohin er
schreibt. Umgesetzt ist deshalb eine **abgeleitete Marke** statt eines Ankreuzfelds — ein
Feld anzubieten, das nirgends landet, ist schlimmer als keines. Die Lücke steht als
[15 · Ist `betragSchwankt` am Posten änderbar?](./15-betrag-schwankt.md) auf der Karte;
sie betrifft auch 09s Statistik-Achse und damit 14.

### Vier Wahlen, die das Ticket offen ließ

**1. „Einmal laden" ist `paused: true` als Konstante.** `useApi` prüft `paused` nur für
den Fokus-Zuhörer, der Erstabruf läuft immer — `useApi(url, { paused: true })` heißt
damit genau „lade einmal, nie wieder". Kein Zustand, kein „nach dem ersten Zug
umschalten", drei Zeilen. Die Auflage aus 08.5 ist damit nicht nachgebaut, sondern
*ausgedrückt*.

**2. Abzug ist `amount < 0`, nicht „`kind` ist `entgeltumwandlung`".** Der Prototyp
gruppierte über die Katalogart. Das widerspricht 03: das **Vorzeichen** ist die eine
Tatsache am einen Ort, der Katalog belegt es nur vor. Wer einen negativen Zuschuss
einträgt, hat einen Abzug — und wenn die Aufteilung im Zettelkopf ihm nicht folgt, zeigt
der Kopf etwas anderes als seine Zeilen. Das Minus wird beim Anlegen eines
Entgeltumwandlungs-Postens **sichtbar vorbelegt** (`amount: "-"`), nicht beim Speichern
stillschweigend gedreht.

**3. Der Stundenrechner steht bei *allen* Arten zur Verfügung**, `stundenhilfe`
entscheidet nur, ob er offen startet (`<details open={…}>`). Genau die Formulierung aus
04 — „sie entscheidet nur, ob die Hilfe aufgeklappt startet, verboten ist sie nirgends".
Dazu ein `× 4,33`-Knopf, der Wochen- in Monatsstunden umrechnet: 04 hat die
Wochenstunden-Bezugsgröße **verworfen**, aber der Maske ausdrücklich erlaubt, sie
abzufedern. Gespeichert wird immer die Zahl der Periode.

**4. Der Speicherweg ist ein Diff, und das ist der Preis der granularen Operationen.**
Löschen, ändern, anlegen, übernehmen — in dieser Reihenfolge. Angelegte Posten bekommen
ihre ID sofort in den Zustand, damit ein zweiter Klick nach einem Fehler sie **ändert**
statt sie ein zweites Mal anzulegen.

### Ein echter Fehler, beim Durchdenken der Fehlerfälle gefunden

Im Anlegen-Weg existierte das Gehalt nach dem ersten Aufruf — schlug die **Übernahme**
danach fehl, hätte ein zweiter Klick auf „Speichern" ein **zweites Gehalt** angelegt.
Die IDs der inline mitangelegten Posten kennt die Seite nicht (die Anlage liefert nur die
Gehalts-ID), ein Weiterarbeiten am selben Zustand war also nicht möglich. Repariert
durch Umschalten auf die Bearbeiten-Route (`navigate(…, { replace: true })`) samt
Fehlermeldung: die Seite lädt dort frisch, und ein erneuter Versuch ist ein gewöhnliches
Ändern. Die Anlage selbst bleibt atomar (Posten in derselben Nutzlast), damit es kein
Torso-Gehalt gibt.

### Was geprüft ist — und was ausdrücklich nicht

**Die Chrome-Erweiterung war nicht verbunden**, die Seite ist also **nicht im Browser
gelaufen**. Aussehen, Klickwege und Umbruch auf Mobil sind **ungeprüft**. Geprüft ist der
Teil mit dem Risiko: `tsc` deckt `src/` ab (im Gegensatz zu `server/`), und eine
Wegwerf-Sonde hat die **Aufruffolge** nachgespielt, die `save()` absetzt — gegen einen
laufenden Server auf einer eigens angelegten Datenbank mit zwei Nutzern, einem
Gemeinschaftskonto und zwei Alt-Einnahmen. **22/22:**

- Anlegen mit drei Katalogposten, danach die Übernahme, danach das Nachziehen des im
  Formular geänderten Betrags → Summe 3.395, Quellzeile weg.
- Bearbeiten als Diff: Kopf geändert, ein Posten gelöscht, einer mit **Betrag und
  Herleitung zusammen** geändert (`derivationDiscarded: false`), einer nachträglich
  angelegt → Summe 3.665.
- Vorlagenweg: dieselbe Summe, **eigene** Posten-IDs (die Quelle wird nicht mitgepatcht).
- Kontowechsel auf das Gemeinschaftskonto: die Posten wandern mit, ohne einzeln bewegt zu
  werden.
- Die Mitleser sind aus `freibetragByMember` namentlich auflösbar (`["Anna", "Bernd"]`) —
  die Grundlage des Banners und des Bestätigungsdialogs.

`npm run lint` und `npm run build` grün.

**Empfehlung:** einmal `npm run dev:all` und `/income/gehalt/neu` ansehen, bevor 14 darauf
aufbaut. Die Logik ist geprüft, die Gestalt nicht.
