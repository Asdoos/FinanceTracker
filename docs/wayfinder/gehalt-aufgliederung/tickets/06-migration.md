# 06 · Was passiert mit bestehenden Gehalts-Einnahmen?

Type: grilling
Status: resolved
Blocked by: 02
Speist: 07 (API und MCP), 08 (Eingabemaske), Umsetzung Backend

## Question

**Vor der Sitzung `CLAUDE.md`, Abschnitt „Migrationen", und
`server/db/migrations.ts` lesen** (zuletzt Version 7; Schritte tragen je einen
SQLite- und einen Postgres-Zweig, Versionsnummern sind engine-übergreifend).

1. **Werden bestehende Zeilen konvertiert?** In produktiven Datenbanken steht das
   Gehalt heute als gewöhnliche `income_sources`-Zeile — vielleicht als eine, vielleicht
   schon als mehrere („Gehalt", „Weihnachtsgeld"). Automatisch umwandeln ist Raten;
   stehen lassen heißt, der Nutzer legt das Gehalt neu an und löscht die alte Zeile.
2. **Falls stehen lassen: gibt es einen Umwandlungsweg in der Oberfläche?** Ein
   „In Gehalt umwandeln" an einer Einnahmezeile, analog zu
   `convert-to-shared` bei Konten. Umkehrbar oder nicht?
3. **Kann eine gewöhnliche Einnahme und ein Gehalt gleichzeitig existieren, ohne
   doppelt zu zählen?** Während der Übergangszeit garantiert der Fall — die
   Aggregation muss ihn aushalten, statt sich auf Disziplin zu verlassen.
4. **Welche Migrationsschritte braucht das Schema?** Version 8 (und ggf. 9) mit beiden
   Engine-Zweigen, plus die Frage, ob `USER_COLUMNS` in `server/db/migrate.ts` und die
   Prä-Versions-Präambel in den Adaptern berührt werden.
5. **Was passiert beim Löschen eines Gehalts?** Bestandteile mitlöschen (Kaskade) —
   und was passiert, wenn das Konto gelöscht wird, an dem das Gehalt hängt?

## Answer

Das Gehalt kommt als **neue, leere Struktur** ins Schema. Es wird nichts geraten,
nichts umgewandelt und nichts geschützt, was sich nicht selbst schützt.

### 1 · Kein Backfill

Bestandszeilen bleiben `income_sources` und werden nicht angefasst. Eine Heuristik
über das Label (`/gehalt|lohn/i`) kann den entscheidenden Unterschied gar nicht lesen:
„Gehalt Anna" und „Gehalt Bernd" sind **zwei Gehälter**, „Gehalt" plus „Weihnachtsgeld"
ist **eines mit zwei Posten**. Und der Fehler wäre still — Migrationen brechen bei einer
Ausnahme hart ab, aber ein falsch geratener Backfill wirft keine, er ist schon
committet. Dieselbe Lage und dieselbe Antwort wie beim Backfill alter Umbuchungs-Paare
in Migrationsschritt 2 („eine Heuristik mit irreversiblen Falschtreffern").

### 2 · Kein Umwandlungsknopf

Kein `POST /api/income/:id/convert-to-salary`, kein „In Gehalt umwandeln" an der Zeile.
Der Grund ist nicht Aufwand, sondern dass die 1:1-Umwandlung **die falsche Form
erzeugt**: Der Fall, der Hilfe verdient, ist der zusammengesetzte (drei Zeilen: Gehalt,
Weihnachtsgeld, Zulage). Ein Knopf an *einer* Zeile macht daraus dreimal gedrückt **drei
Gehälter mit je einem Posten** — der Nutzer muss danach zusammenführen, was er ohne den
Knopf gleich richtig angelegt hätte. Der einfache Fall (eine Zeile) spart durch den Knopf
nichts: Betrag und Konto abtippen ist billiger als ein Endpunkt mit eigener Rechteprüfung,
eigener Atomarität und eigenem Testpfad.

`convert-to-shared` ist kein tragendes Vorbild — das ist unumkehrbar, weil es Besitz und
Sichtbarkeit verschiebt. Hier verschiebt sich nichts.

**Geht an 08:** ob die Gehaltsmaske beim Anlegen anbietet, vorhandene Einnahmezeilen
*desselben Kontos* einzusammeln (mehrere ankreuzen → werden zu Posten, Quellzeilen
verschwinden). Das trifft den zusammengesetzten Fall und ist ein Formular-Merkmal, kein
Migrationsweg.

### 3 · Der Übergangszustand braucht keinen Schutz

„Alte Einnahmezeile *und* neues Gehalt auf demselben Konto" ist nach 1 und 2 der
garantierte Normalfall jedes Bestandsnutzers. Er ist trotzdem **keine Doppelzählung**:
Gestalt A (02) macht `income_sources` und `salaries` zu disjunkten Quellen, keine Zeile
erscheint in beiden. Zwei Zeilen ergeben zwei Einnahmen — die Summe ist *korrekt*, nur
nicht die gewollte. Derselbe Fall wie eine versehentlich doppelt angelegte Einnahme heute.

Kein Erkennungsmechanismus, keine Warnung. Jeder denkbare Schutz wäre die Heuristik aus 1
an schlechterer Stelle: Er warnte bei „Gehalt Partnerin" fälschlich und schwiege bei
„AG-Bezüge". Eine Warnung, die man wegklicken lernt, ist schlimmer als keine. Die
Sichtbarkeit trägt ohnehin die Einnahmen-Seite, auf der beides untereinander steht (09).

**06 setzt keine Eindeutigkeitsregel** für mehrere Gehälter — die gehört zu **10**.

### 4 · Ein Migrationsschritt, Version 8

Ein einziger Schritt, **kein `sqliteRebuild`** (es wird nur angelegt, nichts umgebaut —
der FK-Check-vor-Commit ist für Tabellen-Neubauten da), **kein Backfill**. Aufteilen in
„Tabellen" und „Indizes" bringt nichts, weil beide zusammen atomar sein müssen.

```
Version 8 — "Gehalt: salaries und salary_components"

salaries                        SQLite / Postgres
  id            INTEGER PK AUTOINCREMENT / SERIAL PK
  employer      TEXT     NOT NULL
  account_id    INTEGER  NOT NULL REFERENCES accounts(id)
  is_active     INTEGER NOT NULL DEFAULT 1 / BOOLEAN NOT NULL DEFAULT TRUE
  note          TEXT     NULL
  created_by    INTEGER  NULL REFERENCES users(id)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')) / TIMESTAMPTZ NOT NULL DEFAULT NOW()

salary_components
  id            INTEGER PK / SERIAL PK
  salary_id     INTEGER  NOT NULL REFERENCES salaries(id) ON DELETE CASCADE
  kind          TEXT     NOT NULL                       -- kein CHECK, siehe 5
  label         TEXT     NULL                           -- NULL = Katalogname (03)
  amount        REAL / DOUBLE PRECISION NOT NULL
  type          TEXT     NOT NULL CHECK (type IN ('monthly','annual'))
  hourly_rate   REAL / DOUBLE PRECISION NULL
  hours         REAL / DOUBLE PRECISION NULL
  is_active     INTEGER NOT NULL DEFAULT 1 / BOOLEAN NOT NULL DEFAULT TRUE
  created_by    INTEGER  NULL REFERENCES users(id)
  created_at    TEXT / TIMESTAMPTZ NOT NULL DEFAULT …

Indizes: salaries(account_id) · salary_components(salary_id)
```

Drei Abweichungen von 02s Skizze, alle begründet:

- **`label` ist `NULL`-fähig**, nicht `NOT NULL`. 03 hat das umentschieden: leeres Label
  heißt „nimm den Katalognamen" — eine Tatsache an *einem* Ort statt einer kopierten
  Zeichenkette. 02s Skizze ist an dieser Stelle überholt.
- **`created_at` kommt dazu.** Jede Bestandstabelle hat es, es kostet nichts.
- **`account_id` steht nur am Gehalt** (05). Der Index auf `salary_components(salary_id)`
  ist deshalb der *Sichtbarkeitsindex*: jedes Prädikat läuft über den Join.

Die Tabellen entstehen **ausschließlich im Migrationsschritt**, nicht zusätzlich in der
`CREATE TABLE IF NOT EXISTS`-Präambel der Adapter — sonst gibt es zwei Wahrheiten für
dieselbe Tabelle, die auseinanderlaufen. Neuinstallationen laufen Version 0 → 8 durch und
bekommen sie darüber. Das ist die Linie aus `CLAUDE.md`: „Neue Schemaänderungen gehören
ausschließlich nach `migrations.ts`."

### 5 · `CHECK` nur auf `type`

Die Linie: **kleine, endgültige Wertemenge → in die Datenbank; alles Wachsende oder
Gerechnete → in die Zod-Schreibgrenze.**

| Kandidat | Ort | Grund |
|---|---|---|
| `type IN ('monthly','annual')` | **`CHECK`** | Zwei Werte, seit Bestehen unverändert; `income_sources` und `expense_items` tragen ihn schon. Weglassen wäre eine Abweichung ohne Gewinn. |
| `kind` | **nur Zod** | Der Katalog ist nach 03 bewusst eine Konstante in `shared/salaryCatalog.ts` und soll wachsen. Ein `CHECK` wäre eine zweite Wahrheit — und die teurere: auf SQLite ist er nachträglich nur per Tabellen-Rebuild änderbar, jede neue Bestandteilsart also ein Rebuild-Schritt. Genau diesen Preis vermied 03 mit der Ablehnung der Katalogtabelle; über den Umweg `CHECK` käme er zurück. |
| `amount != 0` (03) | **nur Zod** | Gleiche Familie wie 04s drei Stundenregeln, gleiche Behandlung. Ein `CHECK` hier und keiner auf `round(rate × hours, 2) == amount` wäre willkürlich. |

Das ernstzunehmende Gegenargument steht in Migrationsschritt 2: „der `CHECK` bleibt und
wächst, denn der MCP ist ein zweiter Schreibweg und die Datenbank die letzte Stelle, an
der ein falscher Typ noch auffällt." Es trägt bei **drei** Werten und trägt nicht bei
**fünfzehn wachsenden**. Der zweite Schreibweg ist gedeckt, solange MCP und HTTP durch
**dasselbe** Zod-Schema gehen — was sie müssen, weil `server/lib/salary.ts` ohnehin der
eine Ort für Gehaltslogik wird (02, 05).

**Preis, ausdrücklich benannt:** ein direkter `INSERT` an der API vorbei kann ein `kind`
schreiben, das der Katalog nicht kennt. Die Anzeige muss das aushalten — **Rückfall auf
den rohen Schlüssel statt Absturz**. Das ist eine Auflage an 09 und an die Umsetzung.

### 6 · Kaskade nach unten, Sperre nach oben

**a) Gehalt löschen → Bestandteile: `ON DELETE CASCADE` in der Datenbank.** Nicht
Bequemlichkeit: nach 05 hat der Bestandteil kein eigenes Konto, sein Prädikat läuft über
den Join aufs Gehalt. Ein verwaister Bestandteil ist damit für *jede* Abfrage unsichtbar
— niemand findet ihn, niemand kann ihn löschen, er zählt nirgends mit. Kein Leck, aber
strukturell unerreichbarer Müll. Die Kaskade gehört in die **Datenbank**, nicht in die
Route, weil der MCP ein zweiter Löschweg ist — dieselbe Begründung wie bei
`account_members`. `foreign_keys = ON` steht global (`server/db/sqlite.ts:182`), die
Kaskade greift also auch auf SQLite wirklich.

**b) Konto löschen → Gehalt: kein Kaskadieren, sondern 409.** `accounts.ts:254` zählt
heute `expense_items` und `income_sources`; `salaries` kommt als dritte Zählung dazu,
ebenso in `convert.ts:68` vor dem Umwandeln in ein Gemeinschaftskonto (beide Stellen
stehen schon in 02s Liste). Konsistenz ist nur das halbe Argument; das andere: ein Gehalt
mit fünfzehn Posten ist das teuerste Gebilde der App — es still mit dem Konto verschwinden
zu lassen wäre der schlechteste Ort für eine Kaskade.

**c) Nutzer löschen → `created_by`: keine `ON DELETE`-Klausel**, wie im Bestand.

### 7 · `USER_COLUMNS`: `salaries` ja, `salary_components` nein

`USER_COLUMNS` in `server/db/migrate.ts` ist **zweierlei**: das Register für die Adoption
verwaister Daten im Setup **und** die Löschliste beim Entfernen eines Nutzers
(`auth.ts:423`). Eintragen heißt: „diese Tabelle wird beim Nutzer-Löschen nach Urheber
geleert."

- **`salaries: "created_by"` — ja.** Deckungsgleich mit `income_sources`: wer geht, nimmt
  seine Einnahmen mit, auch die auf einem Gemeinschaftskonto. Die Bestandteile folgen über
  die Kaskade aus 6a, die Klammer bleibt heil.
- **`salary_components` — nein**, und das ist die eigentliche Entscheidung. Auf einem
  Gemeinschaftskonto darf jedes Mitglied die Zeilen des anderen ändern (05): Mitglied B
  kann einen Posten an A's Gehalt hängen, mit `created_by = B`. Stünde die Tabelle in der
  Liste, risse B's Löschung **einzelne Posten aus einem weiterbestehenden Gehalt**, und
  dessen Summe änderte sich still. Genau das zu verhindern ist der Zweck der Klammer. Die
  Kaskade von oben deckt den Normalfall vollständig; der Eintrag brächte nur den
  Sonderfall, der schadet.

**Preis:** ein Posten mit `created_by` eines gelöschten Nutzers überlebt und zeigt auf
eine verschwundene Zeile. Das ist derselbe Bestandsfehler wie unten, nicht ein neuer.

### Randbefund (nicht Teil dieses Tickets)

`DELETE /api/auth/users/:id` (`server/routes/auth.ts:415–425`) löscht den Nutzer **vor**
seinen Daten: erst `DELETE FROM users`, dann die Schleife über `USER_COLUMNS`. Da
`foreign_keys = ON` steht und `created_by` auf `users(id)` zeigt, läuft das erste `DELETE`
in den Fremdschlüssel, sobald der Nutzer irgendetwas angelegt hat — auf beiden Engines.
Bestandsfehler, betrifft alle sieben Tabellen; das Gehalt macht es nur um eine breiter.
Die Reparatur ist die Reihenfolge (erst Daten, dann Nutzer) und gehört nicht hierher.
Steht als Notiz auf der Karte.

### Was 06 offen lässt

Eindeutigkeit und Jobwechsel → **10**. Routen, Zod-Schemata, MCP-Oberfläche → **07**.
Einsammeln vorhandener Einnahmezeilen im Formular → **08**. Der Baustein
`server/lib/salary.ts` und der dritte ESLint-Guard (05) → Umsetzungstickets.
