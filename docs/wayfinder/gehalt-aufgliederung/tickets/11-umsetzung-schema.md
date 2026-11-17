# 11 · Umsetzung: Schema, Baustein und Guard

Type: task
Status: resolved
Assignee: Anri
Blocked by: —

## Question

Kein Entscheidungsticket — die Entscheidungen stehen in 02, 03, 04, 05 und 06. Hier
wird das Fundament gelegt, gegen das 12 dann baut. Aus dem Nebel „Umsetzung Backend"
graduiert, nachdem 07 die Oberfläche entschieden hat; die Karte trägt laut Notes die
Umsetzung.

**Blockade aufgelöst.** [10](./10-mehrere-gehaelter.md) hat entschieden, dass ein Gehalt
über `is_active` endet und **kein `end_date`** bekommt — Migration v8 bleibt genau so,
wie sie hier steht. (Die Blockade bestand, weil ein nachträgliches `end_date` ein
zweiter Schritt und bei SQLite ein Rebuild gewesen wäre.)

### Umfang

1. **Migration Version 8** in `server/db/migrations.ts`, je ein SQLite- und ein
   Postgres-Zweig. Tabellen `salaries` und `salary_components` nach 02, mit den
   Abweichungen aus 06: `label` `NULL`-fähig, `created_at` dazu, `CHECK` **nur** auf
   `type`, `ON DELETE CASCADE` von `salary_components` auf `salaries`. Kein
   `sqliteRebuild`, kein Backfill. Tabellen **nur** hier, **nicht** zusätzlich in der
   Adapter-Präambel (`CLAUDE.md`, „Migrationen").
2. **`USER_COLUMNS` in `server/db/migrate.ts`**: `salaries` eintragen,
   `salary_components` **nicht** (06 — die Liste ist zugleich die Löschliste beim
   Entfernen eines Nutzers und risse sonst einzelne Posten aus einem überlebenden
   Gehalt).
3. **`shared/salaryCatalog.ts`** — die fünfzehn Arten aus 03 als Konstante, mit
   `betragSchwankt` und der Katalogspalte `stundenhilfe` aus 04. Schlüssel und
   Anzeigename getrennt.
4. **`server/lib/salary.ts`** — der Baustein nach dem Vorbild von
   `EXCLUDE_TRANSFERS_SQL`/`signedAmount` in `server/lib/transactions.ts`. Er trägt
   *beides*: die `/12`-Summenlogik über aktive Posten beider Ebenen (02) **und** das
   Sichtbarkeitsprädikat als Join aufs Gehalt (05). Er ist die einzige Stelle, an der
   `salary_components` in SQL vorkommen darf.
5. **Dritter ESLint-Guard** in `eslint.config.js` auf rohes `FROM salary_components`
   (05), als `no-restricted-syntax` wie die beiden bestehenden. Ausnahme nur in
   `server/lib/salary.ts` selbst, mit Begründung an der Fundstelle.

### Erwartetes Ergebnis

Migration läuft auf beiden Engines durch, `npm run lint` und `npm run build` sind
grün, der Guard schlägt bei einer probeweise eingefügten rohen Query an. Noch keine
Route, kein MCP-Werkzeug, keine Oberfläche.

## Answer

Das Fundament steht. Fünf Dateien neu oder geändert, keine Route, kein MCP-Werkzeug,
keine Oberfläche — 12 baut ab jetzt gegen etwas, das existiert.

| Datei | was |
|---|---|
| `shared/salaryCatalog.ts` | **neu** — fünfzehn Arten als Konstante |
| `server/lib/salary.ts` | **neu** — Sichtbarkeitsprädikat + `/12`-Summenlogik |
| `server/db/migrations.ts` | Schritt 8 |
| `server/db/migrate.ts` | `USER_COLUMNS` |
| `eslint.config.js` | dritter Guard, plus ein Lint-Block für `shared/` |
| `tsconfig.app.json` | `include: ["src", "shared"]` |
| `CLAUDE.md` | Datenmodell, Sichtbarkeitstabelle, „Drei ESLint-Guards", `shared/` |

### Vier Stellen, an denen die Umsetzung eine Wahl treffen musste

Die Entscheidungen aus 02–06 waren vollständig; diese vier Punkte standen darin nicht
und sind hier gefallen.

**1. Die Form des Bausteins: eine `SELECT`-Fabrik, kein SQL-Schnipsel.** `EXCLUDE_TRANSFERS_SQL`
ist eine Konstante, die der Aufrufer in sein `WHERE` klebt — dieselbe Bauart hätte hier
nicht getragen, weil das Prädikat einen **`FROM`-Teil mitbringt**: die Aliase `c` und `s`
und der Join sind Teil der Regel, nicht des Aufrufs. Also
`selectVisibleComponents(columns, accountIds, { activeOnly, where, orderBy })`, das den
ganzen `SELECT` baut. Der Aufrufer schreibt seine Spalten und Zusatzbedingungen mit den
festen Aliasen; das `FROM` ist ihm entzogen. Genau das erzwingt der Guard, und die
Fabrikform macht es zur bequemsten Variante statt zur lästigen.

**2. `monthlySalaryTotal` liefert `0` für ein inaktives Gehalt, statt es abzulehnen.**
Ausdrücklich nach dem Vorbild von `signedAmount`, das für ein nicht berührtes Konto `0`
liefert: damit darf über eine **ungefilterte** Liste reduziert werden, und die Regel
„beide `is_active`-Ebenen müssen greifen" gilt automatisch statt an jeder der zehn
Lesestellen wiederholt zu werden. Die Alternative — Aufrufer filtert vorher — verlegt
die Regel zurück in die Aufrufer, also genau dorthin, wo 02 sie wegholen wollte.

**Die Summenlogik ist JavaScript, nicht SQL.** Kein `CASE WHEN c.type = 'annual'`-Fragment,
weil der Bestand es auch nicht so macht: `summary.ts:12` und `stats.ts:140/230` rechnen
`/12` in JS über geladene Zeilen. Ein SQL-Fragment daneben wäre eine zweite Bauart für
dieselbe Rechnung — und 07 verlangt für `summary` ohnehin die Posten selbst, nicht nur
ihre Summe.

**3. `is_active` wird als `!!row.is_active` gelesen, nicht mit `= 1` verglichen.** SQLite
liefert `0`/`1`, Postgres `true`/`false`; `c.is_active = 1` wäre auf Postgres ein
Typfehler. Im SQL steht deshalb das nackte `AND c.is_active AND s.is_active` — dieselbe
Schreibweise wie `stats.ts:133` bei `expense_items`.

**4. `beispiele` als vierte Katalogspalte.** 03 hat die Anzeigenamen mit Klammerzusätzen
notiert („Zuschlag *(Nacht, Sonntag, Feiertag)*"). Die Klammer ist aber nicht Teil des
Namens — sie macht die **Bündelung** sichtbar und gehört in die Palette, nicht in jede
Listenzeile. Also `label: "Zuschlag"` plus `beispiele: "Nacht, Sonntag, Feiertag"`.
Slash-Namen („Weihnachtsgeld / Jahressonderzahlung") bleiben unverändert im `label`, das
sind Synonyme, keine Beispiele.

Dazu ein Zusatz außerhalb des Umfangs: `shared/` fiel unter **keinen** ESLint-Block und
wäre damit ungeprüft geblieben. Ein eigener Block ohne die drei SQL-Regeln — dort steht
kein SQL, und der Katalog kennt keine Laufzeitumgebung.

### Was geprüft ist, und was nicht

Eine Wegwerf-Sonde (Migration 0 → 8 auf einer leeren SQLite-Datei, danach gelöscht) hat
bestätigt:

- Version 8 gesetzt, beide Tabellen und beide Indizes vorhanden.
- `selectVisibleComponents` zeigt die vier eigenen Posten und liefert für den Posten des
  fremden Kontos **null** Zeilen — auch beim Zugriff über die ID.
- `activeOnly` filtert auf drei; Monatssumme 3.000 + 400 − 100 = **3.300** (negatives
  `amount` addiert sich von selbst), mit aktivem Weihnachtsgeld 1.200/12 → **3.400**;
  inaktives Gehalt → **0**.
- `CHECK` auf `type` greift (`'weekly'` wird abgelehnt), `kind = 'unbekannt'` geht durch
  und die Anzeige fällt auf den rohen Schlüssel zurück — beides wie in 06 beschrieben.
- Gehalt löschen räumt die Posten weg (Kaskade greift auf SQLite wirklich, `foreign_keys
  = ON` steht global); Konto löschen läuft in den Fremdschlüssel — die 409-Antwort in
  `accounts.ts` und `convert.ts` ist damit **Pflicht**, nicht Kosmetik. **Aufgabe für 12.**
- `npm run lint` und `npm run build` grün. Der Guard schlägt bei einer probeweise
  eingefügten rohen Query an — sowohl im Template-Literal als auch im String.

**Nicht geprüft: der Postgres-Zweig.** Kein Postgres und kein Docker in dieser Umgebung.
Die Statements spiegeln Schritt 3 (`SERIAL PRIMARY KEY`, `BOOLEAN … DEFAULT TRUE`,
`TIMESTAMPTZ … DEFAULT NOW()`, `DOUBLE PRECISION`), sind aber **nie gelaufen**. Wer als
erster gegen Postgres startet, prüft es mit.

**Nicht geprüft, weil unprüfbar: `server/lib/salary.ts` wird von `tsc` nicht gesehen.**
`tsconfig.app.json` deckt `src` und jetzt `shared`, `tsconfig.node.json` nur
`vite.config.ts` — `server/` läuft über `tsx` und ist in **keinem** Projekt. Das ist
Bestand, kein Zuwachs dieses Tickets, aber es heißt: ein Typfehler in `salary.ts` fällt
erst zur Laufzeit auf. Die Sonde hat die Datei deshalb ausgeführt statt nur kompiliert.
Kandidat für die Karte.
