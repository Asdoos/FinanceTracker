# 12 · Umsetzung: Routen, Aggregation und MCP

Type: task
Status: resolved
Assignee: Anri
Blocked by: 11

## Question

Kein Entscheidungsticket — die Oberfläche ist in
[07](./07-api-und-mcp.md) vollständig entschieden. Hier wird sie gebaut.

**Blockade aufgelöst.** [11](./11-umsetzung-schema.md) steht: Migration 8, Katalog,
`server/lib/salary.ts` und der dritte Guard sind da. Zwei Vorgaben von dort, die nicht im
Umfang unten stehen: die Konto-Löschung läuft ohne Zutun in den Fremdschlüssel, die
**409-Antwort in `accounts.ts` und `convert.ts` ist deshalb Pflicht** — und der
**Postgres-Zweig der Migration ist nie gelaufen**, er prüft sich beim ersten Start gegen
Postgres mit.

**08 hat mit „ja" geantwortet** und die Blockade damit aufgelöst: die Palette des
Editors übernimmt bestehende Einnahmen, und die Quellzeilen werden gelöscht. Die
zusätzliche Operation gehört in dieses Ticket — siehe Umfang 9.

### Umfang

1. **`server/routes/salaries.ts`** — `/api/salaries` (GET, POST, PATCH /:id,
   DELETE /:id) und `/api/salaries/:id/components` (POST, PATCH /:cid, DELETE /:cid).
   Granulare Posten-Operationen, **kein** „ganze Liste ersetzen". Sichtbarkeit und
   Schreibrecht ausschließlich über den Baustein aus 11.
2. **Zod-Schreibgrenze** — die drei Regeln aus 04 (`round(rate × hours, 2) == amount`;
   `rate > 0` und `hours > 0` strikt; beide oder keiner), `amount != 0` statt
   `positive()` wegen `entgeltumwandlung` (03), `label` Pflicht nur bei `sonstiges`
   (03). Ausdrücklich **nur in Zod**, kein `CHECK` — die Grenze gilt für HTTP und MCP
   gleichermaßen.
3. **`summary.ts`** — Bestandteile in `totalMonthlyIncome` (`:102`), `rest` (`:103`),
   `monthlyIncome` je Konto (`:139`); `itemCount` (`:180`) zählt das Gehalt als eins;
   neue flache Liste `salaries` mit eingebetteten Posten, ohne `shareOfTotal`.
4. **`stats.ts:137` und `:227`** — Bestandteile in `monthlyRecurringIncome` und
   `plannedIncome`, raumgefiltert über `room.ids`.
5. **`export.ts:122`** — eine Zeile je Bestandteil, Kopfzeile
   `Gehalt;Bestandteil;Bezeichnung;Betrag;Typ;Satz;Stunden;Konto;Raum;Erfasst von;Aktiv;Notiz`,
   Sortierung Arbeitgeber → Bezeichnung.
6. **Die beiden Zählstellen** (02, 05, 06): `accounts.ts:254` (Löschen eines Kontos)
   und `convert.ts:68` (Umwandeln in ein Gemeinschaftskonto) müssen das Gehalt kennen
   und **409** antworten. Ein Konto mit Gehalt darf nicht als leer gelten.
7. **MCP** (`server/mcp.ts`): `get_summary` spiegelt `summary.ts` · `list_income`
   gibt `{ incomeSources, salaries }` statt eines Arrays, mit angepasster Beschreibung
   (IDs aus `salaries` gehören nur in die Gehalts-Werkzeuge) · sechs neue Werkzeuge
   `add_salary` (mit optionalem `components[]`), `update_salary`, `delete_salary`,
   `add_salary_component`, `update_salary_component`, `delete_salary_component` ·
   `version` `:45` auf `2.0.0`.
8. **Kosmetisch:** `src/pages/Setup.tsx:36` zählt adoptierte Zeilen mit (02).
9. **Übernahme bestehender Einnahmen** (aus 08): eine **atomare** Operation, die
   angekreuzte `income_sources`-Zeilen in Posten eines Gehalts überführt und die
   Quellzeilen löscht — in **einer** Transaktion, weil halb ausgeführt entweder
   Doppelzählung oder Datenverlust bedeutet. Schreibrecht auf beiden Seiten prüfen
   (Quellzeile *und* Gehalt müssen sichtbar sein). Nur HTTP, **nicht** in MCP: für ein
   Modell ist „lege den Posten an und lösche die Einnahme" zwei Werkzeugaufrufe, die es
   auch einzeln richtig hinbekommt — die Atomarität schützt den Formularabbruch, nicht
   den Agenten. Der Zuschnitt (eigene Route oder Feld an `POST /api/salaries`) fällt
   beim Bauen.

### Nicht in diesem Ticket

Die Oberfläche. Der Editor ist seit 08 entschieden und steht als
[13 · Umsetzung: Gehalts-Editor-Seite](./13-umsetzung-editor.md); Einnahmen-Seite,
Dashboard und Statistik hängen an 09 und bleiben vorerst Nebel.

### Erwartetes Ergebnis

Ein Gehalt lässt sich über HTTP und MCP vollständig anlegen, ändern und löschen; die
Summen in Dashboard, Statistik und Export enthalten es; `npm run lint` und
`npm run build` sind grün.

## Answer

Alle neun Punkte umgesetzt. Ein Gehalt lässt sich über HTTP **und** MCP vollständig
führen, und alle fünf Einnahmensummen enthalten es. Die Oberfläche fehlt weiter (13, 14).

| Datei | was |
|---|---|
| `server/routes/salaries.ts` | **neu** — 8 Endpunkte einschließlich Übernahme |
| `server/lib/salary.ts` | Lader, Nutzlast-Gestalt, Schreibgrenze dazu |
| `server/mcp.ts` | 6 neue Werkzeuge, `list_income` umgebaut, `get_summary`, `version` |
| `server/routes/summary.ts` | 3 Summen, `itemCount`, neue Liste `salaries` |
| `server/routes/stats.ts` | `monthlyRecurringIncome`, `plannedIncome` |
| `server/routes/export.ts` | `einnahmen.csv` neu geschnitten |
| `server/routes/accounts.ts` | dritte Zählung → 409 |
| `server/routes/convert.ts` | Gehalt und Postenzahl in der Vorschau |
| `server/index.ts`, `src/pages/Setup.tsx` | Registrierung, adoptierte Zeilen |

### Eine Ticketvorgabe war falsch, und die Korrektur ist die interessantere Antwort

**Punkt 6 verlangt 409 an *beiden* Zählstellen — `convert.ts:68` kann das nicht
leisten, und soll es auch nicht.** Die Stelle ist die *Vorschau*
(`GET /convert-preview`), kein Tor: `convert-to-shared` prüft überhaupt keinen Inhalt,
es wandelt um. Ein 409 dort wäre außerdem sachlich falsch — Ticket 05 erlaubt Gehälter
auf Gemeinschaftskonten ausdrücklich, die Grenze *ist* die Kontowahl. Ein Gehalt zum
Umwandlungshindernis zu machen hieße: einmal angelegt, ist das Konto für immer
persönlich.

Umgesetzt ist deshalb das, was 05 an dieser Stelle wirklich verlangt: die Vorschau
**zählt Gehälter und Posten** (`salaries`, `salaryComponents`). Die Umwandlung
persönlich → geteilt ist derselbe Offenlegungsakt, für den 05 im Editor eine
namentliche Bestätigung fordert — und die Vorschau ist genau der Ort, an dem „1 Gehalt
mit 7 Posten wird sichtbar" statt „deine Historie wird sichtbar" steht. Der 409 bleibt
allein bei `accounts.ts` (Löschen), wo er hingehört: dort ist er die Erklärung, die
sonst ein Fremdschlüssel-Fehler mit Status 500 wäre.

### Fünf Wahlen, die das Ticket offen ließ

**1. Die Zusammenführung des Posten-PATCH liegt im Baustein, nicht in der Route.**
Ticket 04 verlangt, dass ein direkt gesetzter Betrag die Herleitung *verwirft*, ein
geänderter Satz aber gegen den Betrag *geprüft* wird. Beides hängt am
**zusammengeführten** Zustand: ein PATCH mit nur `hours` ist erst gegen das gespeicherte
`amount` beurteilbar. Zod allein kann das nicht, und HTTP und MCP ändern beide Posten —
also `resolveComponentPatch(current, patch)` in `server/lib/salary.ts`, von beiden
aufgerufen. Nur die Prüfung zu teilen hätte nicht gereicht; die Zusammenführung selbst
ist die Regel.

Nebenbefund, der beim Bauen auffiel: „nur `hours` schicken" schlägt damit **fehl** statt
den Betrag nachzurechnen. Das ist 02s Vorgabe („der Betrag muss die Wahrheit bleiben")
und für den Editor kein Problem — er schickt Betrag und Herleitung zusammen. Die
Antwort trägt `derivationDiscarded`, damit 13 das Verwerfen sichtbar machen kann, ohne
es selbst herzuleiten.

**2. `label` roh *und* `displayLabel` aufgelöst in der Nutzlast.** Zwei Leser brauchen
Verschiedenes: die Anzeige darf nie leer sein (Kette Bezeichnung → Katalogname → roher
Schlüssel), der Editor muss unterscheiden können, ob der Nutzer selbst etwas eingetragen
hat. Nur `displayLabel` zu liefern hieße, dass der Editor den Katalognamen
zurückschreibt und er in die Zeile einfriert — genau was 03 verhindern wollte. Nur `label`
zu liefern hieße, dass jeder Leser die Kette selbst nachbaut.

**3. Die Übernahme ist eine eigene Route, nicht ein Feld an `POST /api/salaries`.** Das
Ticket ließ den Zuschnitt offen. Grund für die Route: die Übernahme trifft auch ein
**bestehendes** Gehalt (Jobwechsel, nachträgliches Aufräumen), und ein Feld an der
Anlage-Nutzlast könnte das nicht. Sie erzwingt **dasselbe Konto auf beiden Seiten** —
ohne die Regel verschöbe sie still Geld zwischen Räumen, weil der Posten das Konto des
Gehalts erbt und die Quellzeile aus ihrem eigenen Raum verschwindet. Ohne Vorgabe
gewählt: fehlt `label`, wird die Bezeichnung der Einnahme **verbatim** übernommen, statt
zu raten, ob sie dem Katalognamen entspricht — der Nutzer sieht sie im Editor und kann
sie leeren.

**4. `loadSalaries()` als gemeinsamer Lader, zwei Abfragen statt n+1.** Vier Leser
brauchen dieselbe Gestalt (`/api/salaries`, `summary.ts`, MCP `list_income`, MCP
`get_summary`), und `summary.ts` und `mcp.ts` sind laut 07 ohnehin absichtliche Kopien —
desto wichtiger, dass wenigstens das Laden einer Stelle gehört.

**5. `selectVisibleComponents` bekam eine `joins`-Option.** Der CSV-Export braucht Konto
und Urheber am Bestandteil. Der Aufrufer darf anbauen, aber den Kern nicht ersetzen: das
`FROM` samt Join auf `salaries` bleibt ihm entzogen, denn daran hängt die Sichtbarkeit.

### Der Guard hat zweimal angeschlagen, beide Male zu Recht

`DELETE FROM salary_components WHERE id = ?` in Route und MCP-Werkzeug — Löschen **per
ID**, unmittelbar nach der Sichtbarkeitsprüfung über den Join. Ein zweites Prädikat ist
dort nicht möglich (die Tabelle trägt keine `account_id`). Genau die erwünschte
Falschmeldung: Ausnahme mit Begründung an der Fundstelle, nicht in einer zentralen Liste.

### Geprüft: 51 Zusicherungen über HTTP, dazu eine echte MCP-Sitzung

Wegwerf-Sonde gegen einen laufenden Server auf einer leeren Datenbank, danach gelöscht.
**51/51.** Nicht bloß Statuscodes:

- **Gestalt und Summe.** Gehalt mit vier Posten in einer Nutzlast → `monthlyAmount`
  3.400 (3.000 + 400 − 100 + 1.200/12). Negatives `amount` addiert sich von selbst.
- **Die Schreibgrenze, acht Ablehnungen:** `amount: 0` · `sonstiges` ohne Bezeichnung ·
  Satz ohne Stunden · Stunden ohne Satz · verletzte Invariante (20 × 5 ≠ 101) ·
  negativer Satz · unbekanntes `kind` · `hours: 0`.
- **Das Verwerfen.** `{amount: 130}` allein → `derivationDiscarded: true`, Satz und
  Stunden sind `null`. Danach `{hours: 7}` allein → **400** gegen den gespeicherten
  Betrag. `{amount: 140, hourlyRate: 20, hours: 7}` → wieder gesetzt.
- **Alle fünf Summen** tragen dieselbe Zahl (3.790): `totalMonthlyIncome`, `rest`,
  `monthlyRecurringIncome`, `plannedIncome` — und `itemCount` steht auf **2** (eine
  Einnahme + ein Gehalt), nicht auf 7.
- **CSV.** Kopfzeile wie in 07 festgelegt; 1 Einnahme + 6 Bestandteile = 7 Datenzeilen;
  die gewöhnliche Einnahme hat leere Gehalts-Spalten; `Satz`/`Stunden` stehen als `20`
  und `7` da und sind nachrechenbar.
- **Die Übernahme ist summenneutral** — vorher 3.830, nachher 3.830. Genau das ist die
  Aussage: keine Doppelzählung, kein Verlust. Über die Kontogrenze → 400. (Die erste
  Fassung dieser Zusicherung war *falsch gerechnet* und hat eine 10-€-Einnahme auf dem
  Zweitkonto vergessen; die Messung vorher/nachher ist die richtige Frage.)
- **Sichtbarkeit gegen einen zweiten Nutzer:** sieht kein Gehalt, kann keinen Posten
  ändern (404), das Gehalt nicht löschen (404), und seine `totalMonthlyIncome` ist 0.
- **Zählstellen:** Konto mit Gehalt → 409 mit Erklärung; Vorschau nennt 1 Gehalt und 7
  Posten.
- **Kaskade:** Gehalt gelöscht → alle 7 Posten weg.

**MCP separat geprüft**, weil `buildServer()` die Werkzeuge erst beim
Verbindungsaufbau registriert — ein Verdrahtungsfehler fällt beim Serverstart *nicht*
auf. Echte SSE-Sitzung mit API-Key: **29 Werkzeuge** (der von 07 vorhergesagte
Endstand), die sechs neuen vorhanden, kein `list_salaries`, kein
`set_salary_components`. `list_income` liefert ein Objekt mit zwei benannten Feldern,
`get_summary` trägt `salaries`, und dieselbe Schreibgrenze greift mit derselben
Fehlermeldung.

`npm run lint` und `npm run build` grün.

### Was offen bleibt

- **Der Postgres-Zweig von Migration 8 ist weiter nie gelaufen.** Unverändert die Lage
  aus 11; die Routen selbst sind engine-neutral geschrieben (`BOOL_PARAM`, nackte
  `is_active`-Spalte statt `= 1`), aber ungetestet gegen Postgres.
- **`server/` ist von `tsc` weiter nicht abgedeckt** (steht als Out-of-scope auf der
  Karte). Deshalb die 51 Laufzeit-Zusicherungen statt einer Typprüfung — sie sind hier
  kein Extra, sondern der Ersatz.
