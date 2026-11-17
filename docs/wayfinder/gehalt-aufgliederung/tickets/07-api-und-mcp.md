# 07 · Welche API- und MCP-Oberfläche bekommt das Gehalt?

Type: grilling
Status: resolved
Assignee: Anri
Blocked by: 02, 05

## Question

1. **Eigene Routen oder `/api/income` erweitern?** `/api/salaries` mit
   `/api/salaries/:id/components` ist ehrlich zum eigenen Typ; `/api/income` mit
   verschachtelter Nutzlast hält das Frontend bei einem Endpunkt. Die Entscheidung
   folgt der aus Ticket 02 — aber nicht zwingend eins zu eins: getrennte Tabellen
   können hinter einem gemeinsamen Endpunkt liegen.
2. **Liefert `GET /api/income` das Gehalt mit?** Wenn nein, muss die Einnahmen-Seite
   zwei Quellen zusammenführen und selbst sortieren. Wenn ja, wie sieht die Zeile aus —
   eine Summenzeile mit eingebetteten Bestandteilen?
3. **Was ändert sich an `GET /api/summary`?** Der Endpunkt ist laut `CLAUDE.md` die
   einzige Wahrheit für das Dashboard. Erscheint das Gehalt dort als ein Posten mit
   Bestandteilen, oder als flache Posten wie heute?
4. **Und `/api/stats`, `/api/export`?** Die Statistik gruppiert nach Kategorie, der
   Export liefert Zeilen — beide müssen wissen, ob sie Gehalt oder Bestandteile zählen.
5. **MCP: erweitern oder neue Werkzeuge?** `list_income`, `add_income`,
   `update_income`, `delete_income` bestehen (`server/mcp.ts`). Ein Gehalt über
   `add_income` anzulegen wäre gequetscht; eigene Werkzeuge sind vier mehr zu pflegen.
   Mindestens muss `list_income` das Gehalt nicht verschweigen.
6. **Bleibt die Nutzlast rückwärtskompatibel?** Bestehende MCP-Klienten und das
   Frontend lesen heute flache Einnahmezeilen.

## Answer

### Der Leitgedanke

**Getrennt halten, wo Verwechslung still schadet — zusammenführen, wo Schweigen
still schadet.** Alle sechs Antworten folgen daraus, und daraus folgt auch das
einzige Ergebnis, das überrascht: die beiden **Lese**oberflächen laufen
auseinander. Beim Frontend ist Verwechslung die Gefahr (ID-Kollision), bei MCP das
Verschweigen (eine falsche Summe, zuversichtlich berichtet).

### Drei Befunde, die den Zuschnitt der Fragen korrigiert haben

- **`GET /api/summary` liefert gar keine Einnahmenliste.** Nur `expenses:
  enrichedExpenses`, für Einnahmen ausschließlich Summen. Frage 3 („ein Posten oder
  flache Posten *wie heute*?") hatte damit keine Grundlage — es gibt heute dort keine
  Einnahmeposten.
- **`list_income` (`server/mcp.ts:238`) ist eine fast zeichengleiche Kopie von
  `GET /api/income`** (`server/routes/income.ts:21`). Dass die beiden hier trotzdem
  auseinanderlaufen, ist deshalb eine bewusste Abweichung, kein Versehen.
- **`stats.ts` berührt Einnahmen nur als `SUM`** (`:137`, `:227`) — keine
  Zeilen, keine Kategoriedimension. `export.ts:122` dagegen liefert eine Zeile je
  Einnahme.

### 1 · Eigene Routen

`/api/salaries` und `/api/salaries/:id/components`. `/api/income` bleibt unberührt.

Zwei Gründe, beide über Typtreue hinaus:

- Es ist **dieselbe Entscheidung wie 02**. Eine verschachtelte Nutzlast an
  `POST /api/income` führt die Vermischung wieder ein, die Gestalt A gerade
  vermeidet: ein Endpunkt, zwei Bedeutungen, `IncomeCreateSchema` als Vereinigung,
  deren falscher Zweig still das Andere anlegt.
- Die Bestandteile brauchen **granulare** Operationen. Einen einzelnen Posten zu
  deaktivieren (`salary_components.is_active`, 02) über eine „ganzes Gehalt
  ersetzen"-Nutzlast zu erledigen, macht daraus einen Lese-Ändern-Schreiben-Zyklus.
  Bei last-write-wins (`CLAUDE.md`, „Frische-Mechanik") überschreibt der still nicht
  ein Feld, sondern die **ganze Postenliste** eines Mitglieds.

Preis: das Frontend hat zwei Schreibziele.

### 2 · `GET /api/income` bleibt unverändert

Die Einnahmen-Seite holt `/api/salaries` als zweite Quelle und führt zusammen.

Entscheidend war ein Befund, kein Prinzip: `src/pages/Income.tsx` schlüsselt die Liste
durchgehend über `item.id` auf und schickt sie ungeprüft zurück (`:290` →
`handleDelete` → `:165 api.delete('/income/${id}')`, ebenso `:148`). `income_sources.id`
und `salaries.id` sind zwei getrennte Autoincrement-Folgen; in *einer* Liste
kollidieren sie garantiert. Jede Stelle, die das Unterscheidungsfeld zu prüfen
vergisst, löscht die **falsche Zeile eines anderen Typs**.

Die Zusammenführung ist billig: `filtered` (`Income.tsx:61`) sortiert und filtert
ohnehin im Frontend über `accountId`, `isActive`, `type`, `amount` — liefert die
Gehalts-Summenzeile diese Felder, ordnet sie sich ohne neue Mechanik ein. Zwei
`useApi`-Aufrufe, beide mit `{ paused: modalOpen }`.

### 3 · `GET /api/summary`

Dass `summary` das Gehalt als **Struktur** tragen muss, ist keine Wahl: das Ziel der
Karte verlangt die aufklappbare Zeile auch im Dashboard, und das Dashboard liest
ausschließlich diesen Endpunkt.

- **Die Summen sind Pflicht.** `totalMonthlyIncome` (`:102`), `rest` (`:103`) und je
  Konto `monthlyIncome` (`:139`) enthalten die Bestandteile. Dies ist die eine Stelle,
  an der ein vergessenes Gehalt *nicht* sichtbar unterschlägt, sondern eine plausible
  falsche Zahl zeigt — und die dritte KPI-Karte trägt je Raum eine andere Größe
  (`CLAUDE.md`), lügt also in beide Richtungen. `itemCount` (`:180`) zählt das Gehalt
  als **eins**, nicht als *n* Posten.
- **Neue Liste `salaries`, flach über alle Räume, Bestandteile eingebettet** — nach dem
  Vorbild von `enrichedExpenses` (`:226`), das genauso gebaut ist. Eine Spiegelung in
  `sharedAccounts[]` wäre eine dritte Struktur für dieselbe Zeile.

```
salaries: [{ id, employer, accountId, account: {…}, isActive,
             monthlyAmount,        // aus server/lib/salary.ts, aktive Posten beider Ebenen
             components: [{ id, kind, label, amount, type, monthlyAmount,
                            isActive, hourlyRate, hours }] }]
```

- **Bestandteile stehen *nur* eingebettet.** Keine zweite flache Postenliste daneben —
  das wäre die Doppelzählung aus Gestalt B, in JSON statt in SQL.
- **Kein `shareOfTotal`** am Gehalt: bei Ausgaben normiert es auf den Raumnenner, für
  Einnahmen gibt es keinen etablierten Nenner. 09 kann es nachfordern.

Ausdrücklich **nicht** hier entschieden, sondern in 09: zu- oder aufgeklappt, in
welchem Raum, und ob es überhaupt eine Einnahmen-Aufschlüsselung gibt. Die Nutzlast
trägt beides.

### 4 · `/api/stats` und `/api/export`

**Stats** ist die leichtere Hälfte: `:137` (`monthlyRecurringIncome`) und `:227`
(`plannedIncome`) summieren die **Bestandteile** — das Gehalt trägt nach 02 keinen
Betrag — über `server/lib/salary.ts`, raumgefiltert über `room.ids` wie bisher.
Auch das ist ein „plausible falsche Zahl"-Fall: die Plan/Ist-Kurve ohne Gehalt sieht
nicht kaputt aus, sie sieht nach einem schlechten Monat aus. Ob `kind` darüber hinaus
eine **Auswertungsdimension** wird, gehört zu 09 Frage 3 und wäre dann ein *neues*
Feld, keine Änderung an diesen beiden.

**`einnahmen.csv` bekommt eine Zeile je Bestandteil**, nicht je Gehalt:

```
Gehalt;Bestandteil;Bezeichnung;Betrag;Typ;Satz;Stunden;Konto;Raum;Erfasst von;Aktiv;Notiz
```

`Gehalt` (Arbeitgeber) und `Bestandteil` (Anzeigename der Katalogart) sind bei
gewöhnlichen Einnahmen **leer**. Zwei Gründe:

- Ein Gehalt passt in die alte Zeile **gar nicht**: `Betrag` und `Typ` bilden ein Paar,
  und ein Gehalt mit monatlichem Grundgehalt und jährlichem Weihnachtsgeld hat kein
  solches Paar. Ein *Bestandteil* hat immer genau eines.
- Die wahrscheinlichste Handlung mit dieser Datei ist `=SUMME(B:B)`. Jede Gestalt, die
  Gehalt **und** Bestandteile als Zeilen führt, verdoppelt genau dort. So steht nie
  eine Summe neben ihren Summanden.

`Satz`/`Stunden` sind nach 04 gespeicherte Herleitung und sollen in einer Tabelle
nachrechenbar sein. Sortierung wechselt von `ORDER BY i.label` auf Arbeitgeber, dann
Bezeichnung.

Verworfen: eine eigene Datei `GET /api/export/salaries`. Dann untertriebe
`einnahmen.csv` still das Einkommen, und „die zweite Datei vergessen" ist kein lautes
Scheitern.

### 5 · MCP

- **`get_summary` spiegelt `/api/summary`** — keine eigene Entscheidung; `server/mcp.ts:59`
  ist eine Kopie von `summary.ts` und muss es bleiben.
- **`list_income` liefert das Gehalt mit, in einem eigenen benannten Feld:**
  `{ incomeSources: [...], salaries: [...] }` statt eines nackten Arrays. Das löst den
  Widerspruch zu Antwort 2 auf. Für ein Sprachmodell ist **Schweigen schlimmer als
  Doppelzählen** — es berichtet zuversichtlich eine falsche Summe, weil es die fehlende
  Zeile nie gesehen hat; das „laute Scheitern" aus 02 wirkt nur bei einem Leser, der die
  Lücke bemerkt. Die ID-Kollision aus Antwort 2 ist hier aber **größer**, nicht kleiner:
  ein Modell mit gemischter Liste ruft irgendwann `delete_income(id=3)` auf und meint
  das Gehalt. Zwei benannte Felder machen **beides** unmöglich; die Werkzeugbeschreibung
  sagt, dass IDs aus `salaries` nur in die Gehalts-Werkzeuge gehören.
- **Die vier bestehenden Einnahmen-Werkzeuge bleiben unangetastet** — `add_income`
  bekommt kein verschachteltes Gehalt.
- **Sechs neue Werkzeuge, kein `list_salaries`** (das Lesen erledigt `list_income`):
  `add_salary`, `update_salary`, `delete_salary`, `add_salary_component`,
  `update_salary_component`, `delete_salary_component`. Endstand 29.

Zwei Feinheiten: **`add_salary` nimmt optional `components[]` in derselben Nutzlast** —
ein Modell hat beim Anlegen alles beisammen, und vier erzwungene Runden erzeugen bei
Abbruch ein Torso-Gehalt; beim *Ändern* gilt die Ausnahme nicht. Und **kein einziges
`set_salary_components(salaryId, components[])`**, obwohl es drei Werkzeuge spart: das
ist dieselbe Lese-Ändern-Schreiben-Falle wie in Antwort 1, bei einem Sprachmodell sogar
schärfer — es schickt zuverlässig die Liste zurück, die es *vorher* gelesen hat.

### 6 · Zwei Brüche, ohne Übergangspfad

| Stelle | Bruch |
|---|---|
| `list_income` (MCP) | Array → Objekt. Echter Formbruch |
| `GET /api/export/income` | drei neue Spalten, andere Zeilensemantik, andere Sortierung |

Nicht betroffen: `GET /api/income`, `GET /api/summary` (rein additiv), `/api/stats`
(Feldnamen gleich), die vier bestehenden Einnahmen-Werkzeuge.

- **Es gibt keinen Leser, den wir nicht mitziehen.** Das Frontend liegt im selben
  Docker-Image wie der Server (`dist/` wird von Express ausgeliefert) — ein Bundle, das
  nicht zum Server passt, kann nicht laufen. Bleibt MCP, und dort liest ein Modell die
  geänderte Werkzeugbeschreibung mit.
- **Der Wertebruch findet am Releasetag nicht statt.** Nach 06 kommt das Gehalt als
  leere Struktur ohne Backfill; am Tag der Auslieferung existiert kein Gehalt und jede
  Zahl ist Ziffer für Ziffer dieselbe. Die Zahlen wandern erst, wenn der Nutzer selbst
  ein Gehalt anlegt.
- **Ein zweiter Pfad wäre schlimmer als der Bruch:** der alte `list_income`-Weg
  verschwiege per Bauart das Gehalt — genau die stille Falschauskunft, wegen der die
  neue Form gewählt wurde.

`server/mcp.ts:45` trägt seit jeher `version: "1.0.0"` → auf `2.0.0`. Rein kosmetisch,
aber die einzige Stelle, an der ein Klient den Bruch sehen kann.

### Was daraus graduiert ist

- [11 · Umsetzung Schema und Baustein](./11-umsetzung-schema.md) — blockiert von **10**:
  entscheidet 10, dass ein Gehalt per `end_date` endet, braucht Migration v8 die Spalte.
  Diese Abhängigkeit ist erst in dieser Sitzung aufgefallen.
- [12 · Umsetzung Routen, Aggregation und MCP](./12-umsetzung-routen-mcp.md) —
  blockiert von 11 und **08** (dessen Frage 7 kann eine zusätzliche Operation verlangen).
