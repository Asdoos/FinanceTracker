# 02 · Wie trägt sich das Gehalt im Datenmodell?

Type: grilling
Status: resolved
Blocked by: —

## Question

Wo leben Gehalt und seine Bestandteile, und was ist die Wahrheit für Aggregationen?

Zwei Gestalten stehen zur Wahl, und die Entscheidung trägt die ganze restliche Karte:

- **A — Eigene Tabellen.** `salaries` (Arbeitgeber, Konto, Stundendaten, aktiv) und
  `salary_components` (Art, Betrag, Periodizität, Stunden). `income_sources` bleibt
  unberührt. Sauberer Typ, aber jede Aggregation (`summary.ts`, `stats.ts`,
  `export.ts`, MCP) muss eine zweite Quelle kennen.
- **B — `income_sources` erweitern.** Eine Spalte `kind` (`plain`|`salary`) plus
  `parent_id` für Bestandteile. Alle bestehenden Abfragen liefern weiter Zeilen,
  aber jede muss lernen, Eltern und Kinder nicht doppelt zu zählen — sonst zählt das
  Dashboard das Gehalt zweimal.

Daran hängen unmittelbar:

1. **Ist die Gehaltssumme abgeleitet oder gespeichert?** Abgeleitet ist immer
   konsistent, gespeichert ist billig zu lesen. Bei B mit gespeicherter Summe ist die
   Doppelzählung praktisch garantiert.
2. **Trägt ein Bestandteil eine eigene Periodizität?** Nach der Vorentscheidung ja
   (Grundgehalt monatlich, Weihnachtsgeld jährlich) — hier bestätigen und festhalten,
   wo die `/12`-Umrechnung stattfindet.
3. **Wie heißt die Urheberspalte?** Nach `CLAUDE.md` tragen kontogebundene Tabellen
   `created_by`, nicht `user_id`. Für neue Tabellen gilt dasselbe, und
   `USER_COLUMNS` in `server/db/migrate.ts` muss sie kennen.
4. **Bestandteil ohne Betrag, nur mit Stunden?** Betrifft das Zusammenspiel mit
   Ticket 04 — hier nur festhalten, ob ein Bestandteil einen Betrag *haben muss*.

Erwartetes Ergebnis: festgelegtes Schema mit Spaltennamen und Typen, benannte
Aggregationswahrheit, und die Liste der Stellen, die davon berührt werden.

## Answer

### Gestalt A — eigene Tabellen

`income_sources` bleibt **unverändert**. Zwei neue Tabellen:

```
salaries
  id           INTEGER PK
  employer     TEXT     NOT NULL      -- Arbeitgeber
  account_id   INTEGER  NOT NULL FK   -- Sichtbarkeitsschlüssel, siehe 05
  is_active    BOOLEAN  NOT NULL DEFAULT 1
  note         TEXT     NULL
  created_by   INTEGER  NULL FK users
  -- KEIN amount: die Wahrheit sind die Posten
  -- hourly_rate: Ort noch offen, entscheidet Ticket 04

salary_components
  id           INTEGER PK
  salary_id    INTEGER  NOT NULL FK salaries
  kind         TEXT     NOT NULL      -- Katalogwert, Wertebereich aus 03
  label        TEXT     NOT NULL      -- eigene Bezeichnung (Art darf mehrfach vorkommen)
  amount       NUMERIC  NOT NULL      -- immer gesetzt, immer die Wahrheit
  type         TEXT     NOT NULL      -- monthly|annual; ob ein drittes Merkmal
                                      --   dazukommt, entscheidet 03 Frage 4
  hourly_rate  NUMERIC  NULL          -- reine Herleitung, siehe 04
  hours        NUMERIC  NULL          -- reine Herleitung, siehe 04
  is_active    BOOLEAN  NOT NULL DEFAULT 1
  created_by   INTEGER  NULL FK users
```

**Warum A und nicht `income_sources` erweitern.** Beide Gestalten müssen an fast alle
zehn lesenden Stellen heran — die Arbeitsmenge war nicht der Unterschied. Der
Unterschied ist das Scheitern bei einer *vergessenen* Stelle: Gestalt B liefert die
Zeilen automatisch mit und zählt Eltern **und** Kinder, also still das Doppelte;
Gestalt A liefert nichts automatisch und unterschlägt das Gehalt sichtbar. Dasselbe
Argument, mit dem `CLAUDE.md` die Umbenennung `user_id` → `created_by` begründet:
laut scheitern schlägt bequem weiterlaufen. Ticket 01 belegt die Kehrseite an Actual
Budget — dort steht `is_parent = 0` in jedem Aggregat und es brauchte vier
Split-Semantiken.

### Die Wahrheit sind die Posten

`salaries` trägt **keinen** Betrag, weder gespeichert noch zwischengespeichert. Jede
Aggregation summiert die Bestandteile; die `/12`-Umrechnung sitzt am Posten, weil die
Periodizität am Posten sitzt.

Daraus folgt zwingend: **die Summenlogik existiert genau einmal als Baustein**, nach
dem Vorbild von `EXCLUDE_TRANSFERS_SQL` und `signedAmount` in
`server/lib/transactions.ts` — ein neues `server/lib/salary.ts`. Acht Aufrufer, die
dieselbe `CASE WHEN type='annual'`-Zeile abschreiben, sind acht Gelegenheiten, sie
verschieden abzuschreiben.

### Aktiv auf beiden Ebenen

`salaries.is_active` **und** `salary_components.is_active`. Ohne das zweite wäre es ein
Rückschritt: heute lässt sich die Einnahme „Weihnachtsgeld" auf inaktiv setzen, als
Bestandteil ginge das dann nicht mehr. Ein Posten zählt nur, wenn **beide** Kennzeichen
aktiv sind — der Doppelfilter ist unkritisch, weil er nach der vorigen Entscheidung
ohnehin nur an einer Stelle steht.

### Betrag ist Pflicht

`amount` ist `NOT NULL`, auch bei stundenbasierten Posten. `hourly_rate` und `hours`
sind **reine Herleitung** und für die Aggregation unsichtbar; `SUM(amount)` braucht nie
eine Fallunterscheidung. Was passiert, wenn Satz × Stunden dem Betrag widerspricht,
entscheidet Ticket 04 — die Aggregation ist von dieser Frage jetzt unabhängig.

### Berührte Stellen (Bestandsaufnahme)

Zehn lesende Stellen außerhalb `server/db/`, jede muss das Gehalt ausdrücklich lernen:

| Stelle | was sie tut |
|---|---|
| `server/routes/income.ts:30` | Liste der Einnahmen |
| `server/routes/summary.ts:37` | Dashboard-Wahrheit |
| `server/routes/stats.ts:137`, `:227` | Statistik, Budget-Vergleich |
| `server/routes/export.ts:122` | CSV-Export |
| `server/mcp.ts:59`, `:238` | MCP-Zusammenfassung, `list_income` |
| `server/routes/accounts.ts:254` | Zeilen zählen vor dem Löschen eines Kontos |
| `server/routes/convert.ts:68` | Zeilen zählen vor dem Umwandeln in ein Gemeinschaftskonto |
| `src/pages/Setup.tsx:36` | Anzeige der adoptierten Zeilen (kosmetisch) |

Die beiden Zählstellen sind die unauffälligsten: ein Konto mit einem Gehalt darf nicht
als leer gelten und sich löschen lassen.

### Anschlüsse an den Bestand

- **Urheberspalte heißt `created_by`**, nicht `user_id` — beide Tabellen sind
  kontogebunden, `CLAUDE.md` legt das fest, und der ESLint-Guard erzwingt es.
- **`USER_COLUMNS` in `server/db/migrate.ts`** muss `salaries` kennen, sonst bleiben
  Gehälter bei der Adoption verwaister Daten im Setup ohne Eigentümer. Ob auch
  `salary_components` dort einzutragen ist, hängt daran, ob die Adoption über den
  Elternteil läuft — offene Detailfrage für Ticket 06.
- **Neue Spalten ausschließlich über `server/db/migrations.ts`** (zuletzt Version 7),
  je ein SQLite- und ein Postgres-Zweig. Nicht in die Prä-Versions-Präambel der
  Adapter.

### Was dieses Ticket ausdrücklich offen lässt

Wertebereich von `kind` und ob `type` ein drittes Merkmal braucht → **03**. Ort und
Verhalten von `hourly_rate`/`hours` → **04**. `account_id` an `salaries` und das
Sichtbarkeitsprädikat der Bestandteile → **05**. Kaskade beim Löschen → **06**.
