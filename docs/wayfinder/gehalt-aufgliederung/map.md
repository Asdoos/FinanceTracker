# Karte: Gehalt aufgliedern

## Destination

Ein Gehalt lässt sich im Produkt als eigene, aufgliederbare Einnahme erfassen — mit
Arbeitgeber, Bestandteilen aus festem Katalog (je eigene Periodizität) und Mehrstunden
über Stundensatz × Stunden — und tritt in der Oberfläche als **eine Einheit** auf statt
als n Einnahmen, ohne dass sich die Bedeutung der bestehenden Monatssummen ändert.

*(Der Zielsatz hieß bis Ticket 09 „…erscheint als **eine** aufklappbare Zeile in
Einnahmen und Dashboard". 09 hat daraus einen Block auf der Einnahmen-Seite und gar
nichts im Dashboard gemacht — die Absicht ist unverändert, die Formulierung war zu
konkret für eine Frage, die erst am Prototyp zu entscheiden war.)*

Am Ende der Karte läuft die Funktion im Produkt, sie endet **nicht** mit einer
Spezifikation.

## Notes

- **Domäne:** persönliche Finanzplanung, deutschsprachige Oberfläche. Alle Tickets,
  Antworten und Nutzertexte auf Deutsch.
- **Diese Karte trägt die Umsetzung** — das überschreibt Wayfinders Voreinstellung
  „nur planen". Umsetzungstickets graduieren aus dem Nebel, sobald das Datenmodell
  (01) und die Oberflächenentscheidungen stehen.
- **Skills je Sitzung:** `/grilling` und `/domain-modeling` als Standard,
  `/prototype` für die beiden Darstellungstickets, `/research` für R1.
- **Vor jeder Sitzung `CLAUDE.md` lesen** — besonders „Sichtbarkeit und Schreibrecht",
  „Zwei ESLint-Guards" und „Migrationen". Neue Schemaschritte gehören ausschließlich
  nach `server/db/migrations.ts` (zuletzt Version 7).
- Der Nutzer hat bei Ticket-Zuschnitt 04 (Gehalt als eigener Typ statt generischer
  Aufgliederung) **gegen die Empfehlung des Agenten** entschieden. Das ist eine
  getroffene Entscheidung, keine offene Frage — nicht neu aufrollen.

## Decisions so far

<!-- Index: eine Zeile je geschlossenem Ticket. Detail steht im Ticket. -->

Vor dem Zeichnen der Karte in einer Grilling-Sitzung festgelegt (kein Ticket):

- **Zweck** — Die Aufgliederung macht die *Zusammensetzung* des Einkommens sichtbar.
  Nicht Liquiditätsvorschau, nicht Ist-Verfolgung, nicht Brutto/Netto.
- **Struktur** — Echte Klammer über den Bestandteilen, nicht bloß ein
  Gruppierungsfeld an `income_sources`.
- **Zuschnitt** — Gehalt ist ein **eigener Typ**, keine generische
  Einnahmen-Aufgliederung.
- **Eigenschaften des Typs** — Arbeitgeber-Name, fester Bestandteilskatalog,
  Stundendaten. Brutto/Netto ausdrücklich nicht.
- **Mehrstunden** — Stundensatz × Stunden ist eine *Eingabehilfe*; gespeichert und
  aggregiert wird ein fester Betrag.

Aus Tickets:

- [01 · Übliche Gehaltsbestandteile](./tickets/01-gehaltsbestandteile-recherche.md) —
  Die tragende Unterscheidung ist **nicht** monatlich/jährlich, sondern *Rhythmus fest
  vs. Betrag fest*: alle Zuschläge und Rufbereitschaft haben festen Rhythmus bei
  schwankendem Betrag und brauchen dieselbe Durchschnittsmechanik wie Mehrstunden.
  Belegt häufige Arten: Weihnachtsgeld 53 %, bAV 51,9 %, Urlaubsgeld 44 %, VL ~65 %,
  Zuschläge, Dienstwagen, Sachbezug, Bonus. Inflationsausgleichsprämie ist ausgelaufen,
  Homeoffice-Pauschale ist kein Gehaltsbestandteil. Bei anderen Werkzeugen wird eine
  Gruppensumme nur gespeichert, wenn der Elternteil eine echte Kontobewegung ist —
  reine Klammern summieren immer; Doppelzählung ist überall ein Query-Problem.
  Finanzguru hat gar keine Gehaltsaufgliederung.
- [02 · Wie trägt sich das Gehalt im Datenmodell?](./tickets/02-datenmodell.md) —
  **Gestalt A**: eigene Tabellen `salaries` + `salary_components`, `income_sources`
  bleibt unverändert. Gewählt wegen des Scheiterns-Verhaltens, nicht wegen Eleganz —
  eine vergessene Lesestelle unterschlägt das Gehalt sichtbar, statt es still zu
  verdoppeln. **Die Wahrheit sind die Posten**, `salaries` trägt keinen Betrag; die
  `/12`-Umrechnung sitzt am Posten und die Summenlogik genau einmal als Baustein in
  einem neuen `server/lib/salary.ts`. **`is_active` auf beiden Ebenen**, ein Posten
  zählt nur wenn beide aktiv sind. **`amount` ist `NOT NULL`**, auch stundenbasiert —
  `hourly_rate`/`hours` sind reine Herleitung. Urheberspalte `created_by`; `salaries`
  gehört in `USER_COLUMNS`. Zehn berührte Lesestellen sind im Ticket aufgelistet.
- [03 · Welche Bestandteilsarten gibt es, und wie fest ist der Katalog?](./tickets/03-bestandteilskatalog.md) —
  **Fest verdrahtet** als Konstante in einem neuen `shared/salaryCatalog.ts`; keine
  Katalogtabelle, weil ihr Gewinn über *Sonstiges* und Mehrfachvorkommen schon bezahlt
  ist und ihr Preis ein weiteres Sichtbarkeitsprädikat wäre. **Fünfzehn Arten**,
  gebündelt statt granular — „Internetzuschuss" ist ein *Zuschuss* namens „Internet",
  das drückt die 21 Arten aus 01 auf 15. Neu dazu `entgeltumwandlung` (bAV, Jobrad) und
  damit **negative Beträge**: `amount.positive()` → `amount != 0`. Der Bestandteil trägt
  ein zweites Merkmal **`betragSchwankt`** — der Befund aus 01 („Rhythmus fest vs.
  Betrag fest") als ein Boolean, nicht als dreiwertige Aufzählung, weil „schwankend" und
  „frei variabel" sich für die App gleich verhalten. Vier Regeln, überall dieselben: der
  Katalog **belegt vor und erzwingt nie** (auch nicht die Periodizität — gegen die
  Empfehlung von 01, weil zwei Klassen von Arten überall eine Fallunterscheidung sind) ·
  `monthly | annual` bleibt unverändert · **eine Tatsache, ein Ort** (Vorzeichen statt
  Abzugs-Flag, `label` `NULL`-fähig mit Rückfall auf den Katalognamen) ·
  Mehrfachvorkommen ohne Eindeutigkeitsregel. Einzige Ausnahme: `label` ist Pflicht bei
  `sonstiges`, in der Zod-Prüfung. Schlüssel und Anzeigename sind getrennt.

- [04 · Stundensatz × Stunden](./tickets/04-stundenmodell.md) — Der Satz sitzt **am
  Bestandteil** (drei Zuschlagszeilen haben drei Sätze), die Herleitung wird
  **gespeichert**, und der Widerspruch ist **nicht speicherbar**: sind `hourly_rate` und
  `hours` gesetzt, gilt `round(rate × hours, 2) == amount`; direktes Ändern des Betrags
  verwirft die Herleitung auf `NULL`. Damit erledigt sich das zweite Boolean
  `istStundenbasiert` — „stundenbasiert" ist `hourly_rate IS NOT NULL`; stattdessen eine
  dritte **Katalog**spalte `stundenhilfe` (`mehrstunden`, `zuschlag`, `rufbereitschaft`),
  die nur vorbelegt und nirgends verbietet. Stunden stehen **in der Periodizität des
  Bestandteils** — kein 4,33-Faktor, weil er ungenau ist und die Cent-Invariante bricht.
  `rate > 0` und `hours > 0` strikt („keine Mehrstunden" ist `is_active = false`, nicht 0),
  **beide oder keiner** gesetzt. Alle drei Regeln **nur in Zod**, kein `CHECK` im Schema —
  eine Schreibgrenze für HTTP und MCP. Bestätigt 02 (Spalten bleiben an
  `salary_components`, `salaries` ohne Stundenfeld).

- [05 · Konto-Bindung, Sichtbarkeit und Schreibrecht des Gehalts](./tickets/05-konto-bindung.md) —
  **Kein neues Sichtbarkeitskonstrukt**, das Gehalt ordnet sich dem bestehenden unter:
  `salaries.account_id NOT NULL` ohne `NULL`-Zweig, **kein eigenes Konto je Bestandteil**
  (sonst zeigt die aufgeklappte Zeile je Raum einen anderen Wert als die zugeklappte),
  Prädikat der Bestandteile über den **Join aufs Gehalt** — aber nie handgeschrieben,
  sondern im Baustein `server/lib/salary.ts`, bewacht von einem **dritten ESLint-Guard**
  auf rohes `FROM salary_components`. Die Kopie einer `account_id` am Bestandteil wurde
  verworfen, weil sie *still* leckt; der handgeschriebene Join, weil zehn Lesestellen zehn
  Gelegenheiten sind, ihn zu vergessen. Im Gemeinschaftsraum **keine Grenze** — die Grenze
  *ist* die Kontowahl, eine zweite innerhalb des Kontos entwertete die erste.
  Schreibrecht = Sichtbarkeit wie bei `income_sources`; Löschen kaskadiert; die Zählstellen
  in `accounts.ts` und `convert.ts` müssen das Gehalt kennen. Kontowechsel **erlaubt** (die
  Bestandteile wandern von selbst mit, weil sie kein Konto tragen). Neu sind nur zwei
  Oberflächenregeln, die den Nutzer und nicht das Modell schützen: Vorbelegung auf das
  **persönliche** Standardkonto (nicht `is_default`) mit namentlichem Mitleser-Hinweis, und
  **Bestätigungspflicht** beim Wechsel persönlich → geteilt.

- [06 · Was passiert mit bestehenden Gehalts-Einnahmen?](./tickets/06-migration.md) —
  Das Gehalt kommt als **neue, leere Struktur**: **kein Backfill** (die Label-Heuristik
  kann „zwei Gehälter" nicht von „ein Gehalt mit zwei Posten" unterscheiden und scheitert
  still — dieselbe Ablehnung wie beim Umbuchungs-Backfill in Schritt 2), **kein
  Umwandlungsknopf** (1:1 erzeugt die falsche Form: drei Zeilen → drei Ein-Posten-Gehälter;
  das Einsammeln mehrerer Zeilen geht als Frage an 08) und **kein Schutz des
  Übergangszustands**, weil Gestalt A die Quellen disjunkt macht — zwei Zeilen sind zwei
  Einnahmen, keine Doppelzählung. **Ein Schritt, Version 8**, ohne `sqliteRebuild`, ohne
  Backfill, Tabellen **nur** in der Migration und nicht zusätzlich in der Adapter-Präambel;
  `label` wird `NULL`-fähig und `created_at` kommt dazu (Abweichungen von 02s Skizze).
  **`CHECK` nur auf `type`** — kleine endgültige Wertemenge in die Datenbank, Wachsendes
  und Gerechnetes in die Zod-Schreibgrenze; ein `CHECK` auf `kind` machte jede neue
  Bestandteilsart zu einem SQLite-Rebuild, also Auflage an die Anzeige: unbekanntes `kind`
  fällt auf den rohen Schlüssel zurück. **Kaskade nach unten, Sperre nach oben**: Posten
  hängen per `ON DELETE CASCADE` am Gehalt (ein verwaister Posten hätte keinen
  Sichtbarkeitsschlüssel und wäre unerreichbar), Konto-Löschen und `convert-to-shared`
  antworten **409**. In `USER_COLUMNS` steht **`salaries`, aber nicht
  `salary_components`** — die Liste ist zugleich die Löschliste beim Nutzer-Entfernen, und
  der Eintrag risse einzelne Posten aus einem überlebenden Gehalt.

- [07 · Welche API- und MCP-Oberfläche bekommt das Gehalt?](./tickets/07-api-und-mcp.md) —
  Leitgedanke: **getrennt halten, wo Verwechslung still schadet — zusammenführen, wo
  Schweigen still schadet.** Daraus laufen die beiden *Lese*oberflächen bewusst
  auseinander. **Eigene Routen** `/api/salaries` + `/api/salaries/:id/components` mit
  **granularen** Posten-Operationen (eine „ganze Liste ersetzen"-Nutzlast überschriebe bei
  last-write-wins nicht ein Feld, sondern die ganze Postenliste des Mitglieds).
  **`GET /api/income` bleibt unverändert**, die Seite holt zwei Quellen — weil
  `income_sources.id` und `salaries.id` zwei Autoincrement-Folgen sind und `Income.tsx`
  `item.id` ungeprüft in `DELETE /income/:id` zurückschickt. **`summary`** trägt die
  Bestandteile in `totalMonthlyIncome`/`rest`/`monthlyIncome` (die eine Stelle, an der ein
  vergessenes Gehalt *plausibel falsch* statt sichtbar leer ist) plus eine flache Liste
  `salaries` mit eingebetteten Posten, ohne `shareOfTotal`; `itemCount` zählt eins.
  **`stats.ts:137`/`:227`** summieren die Posten über den Baustein. **`einnahmen.csv`:
  eine Zeile je Bestandteil** mit neuen Spalten `Gehalt`/`Bestandteil` — ein Gehalt hat
  kein `Betrag`/`Typ`-Paar, und `=SUMME(B:B)` darf nie Summe *und* Summanden treffen.
  **MCP geht den anderen Weg**: `list_income` → `{ incomeSources, salaries }`, weil für ein
  Modell Schweigen schlimmer ist als Doppelzählen — zwei *benannte* Felder verhindern
  Verschweigen und Verwechseln zugleich; dazu sechs neue Schreibwerkzeuge (kein
  `set_salary_components`, dieselbe Falle), Endstand 29, `version` → `2.0.0`. **Beide
  Brüche ohne Übergangspfad**, weil das Frontend im selben Image liegt und wegen 06s „kein
  Backfill" am Releasetag keine einzige Zahl wandert. Drei Ticketfragen waren
  fehlgestellt — u. a. liefert `summary` heute gar keine Einnahmenliste.

- [08 · Wie sieht die Eingabemaske für ein Gehalt aus?](./tickets/08-eingabemaske.md) —
  **Variante C, der Gehaltszettel**: keine Maske, sondern eine **Vollseite** unter
  eigenen Routen (`/income/gehalt/neu`, `/income/gehalt/:id`), links die Katalog-Palette,
  rechts der wachsende Zettel. Die Bestandteilszeile ist **zweistufig** — zugeklappt eine
  Zeile, aufgeklappt die Felder samt Stundenrechner —, damit fällt „Zeile oder Karte" weg.
  Die **Summe ist die größte Zahl der Seite**, aufgeteilt in fest / schwankend / Abzug;
  der Editor **startet leer**, weil die Palette die Vorbelegung ist. Verworfen: das Modal
  (zu eng für fünfzehn Arten neben einer Live-Summe) und der Assistent (versteckt die
  Zusammensetzung hinter „Weiter" und ist beim Bearbeiten reiner Weg). Damit **bricht das
  Modal-Muster** — mit Auflage: die Seite lädt Konten und Einnahmen **einmal beim
  Betreten** und nie bei Fokus nach, weil die Begründung der `{ paused }`-Pause hier
  stärker gilt als im Modal. Konto als Chip-Reihe im Zettelkopf, Mitleser-Banner darunter,
  Bestätigungsdialog aus 05 unverändert. Frage 7 ist mit **ja** beantwortet: die Palette
  übernimmt bestehende Einnahmen des Kontos, und die **Quellzeilen werden gelöscht** —
  das verlangt eine atomare Operation in 12, weil Kopieren-ohne-Löschen das Geld bis zum
  Aufräumen von Hand doppelt zählt.

- [09 · Wie erscheint das Gehalt in Liste, Dashboard und Statistik?](./tickets/09-darstellung.md) —
  **Variante B, der eigene Block**: das Gehalt ist kein Listeneintrag, sondern steht
  **über** der Einnahmenliste — Arbeitgeber, Kontochip, Summe groß, Bestandteile
  zweispaltig, **immer offen**. Damit ist die Einsortierungsfrage *weggefallen statt
  beantwortet*: die Aufklappzeile (A) wäre optisch eine Einnahme unter vielen gewesen und
  beim Aufklappen mitten durch die Liste gewachsen, das Seitenpanel (C) versteckte die
  Zusammensetzung hinter einem Klick. Preis: zwei Orte auf einer Seite. Bei **mehreren
  Gehältern** stapeln sich die Blöcke nach Summe, das erste offen, alle weiteren
  zugeklappt (*ob* es mehrere geben darf, bleibt Ticket 10). **Das Dashboard bekommt
  nichts** — die Frage war fehlgestellt, es listet heute gar keine Einnahmen; das Gehalt
  steckt nur in den Summen aus 07, damit die Klammer einen einzigen Anzeigeort hat.
  **Statistik: genau eine neue Achse** fest vs. schwankend aus `betragSchwankt` — die
  Bestandteilsart wird keine Dimension, sonst stünde eine zweite Taxonomie neben den
  Kategorien. **Raum** folgt dem Konto ohne Sonderregel, **Kalender** unberührt
  (bestätigt, nicht angenommen).

- [10 · Wie viele Gehälter gleichzeitig, und was passiert beim Jobwechsel?](./tickets/10-mehrere-gehaelter.md) —
  **Beliebig viele, keine Eindeutigkeitsregel**: Nebenjob, zweites Konto (der Ausweg aus
  05) und Überlappung sind derselbe Fall; „eindeutig je Arbeitgeber + Konto" scheiterte
  daran, dass der Arbeitgebername zum Schlüssel würde und „Musterfirma GmbH" ≠
  „Musterfirma" genau dann durchrutscht, wenn die Regel greifen soll. **Ein Gehalt endet
  über `is_active`, kein `end_date`** — die Asymmetrie zu `income_sources` müsste jede
  Aggregationsstelle einzeln lernen (vergessener Filter = still zu viel), und weil die
  Statistik Planwerte **nie** rückblickend auswertet, brächte das Datum keine einzige
  neue Auswertung, nur Automatik. **Migration v8 bleibt damit unverändert und 11 ist
  entblockt.** Preis, bewusst genommen: im Überlappungsmonat zählen zwei aktive Gehälter
  beide voll. **Inaktive Gehälter bleiben als gedämpfter Block in der Liste**, der
  bestehende Aktiv-Filter greift auch auf sie. An der Aggregation ändert sich nichts
  (zweistufiges `is_active` aus 02). Neu und nicht gefragt: ein **Vorlagenweg**
  `/income/gehalt/neu?vorlage=<id>` übernimmt Posten samt Beträgen — reine Frontend-Sache
  in 13, weil der Jobwechsel sonst sieben Posten Abtippen heißt.

- [11 · Umsetzung: Schema, Baustein und Guard](./tickets/11-umsetzung-schema.md) —
  **Das Fundament steht**, 12 baut ab jetzt gegen etwas, das existiert: Migration
  **Version 8** (beide Tabellen, beide Indizes, `CHECK` nur auf `type`, Kaskade nach
  unten), `salaries` in `USER_COLUMNS` und `salary_components` bewusst nicht,
  `shared/salaryCatalog.ts` mit fünfzehn Arten, `server/lib/salary.ts` und der dritte
  ESLint-Guard. Vier Wahlen, die in 02–06 nicht standen: der Baustein ist eine
  **`SELECT`-Fabrik** (`selectVisibleComponents`), keine Konstante wie
  `EXCLUDE_TRANSFERS_SQL` — das Prädikat bringt einen `FROM`-Teil mit, also ist auch das
  `FROM` dem Aufrufer entzogen · `monthlySalaryTotal` liefert für ein inaktives Gehalt
  **`0`** statt abzulehnen, nach dem Vorbild von `signedAmount`, damit über ungefilterte
  Listen reduziert werden darf · die `/12`-Rechnung ist **JavaScript, nicht SQL**, weil
  der Bestand es an allen drei Stellen so macht · vierte Katalogspalte **`beispiele`**,
  weil „*(Nacht, Sonntag, Feiertag)*" die Bündelung sichtbar macht und nicht zum Namen
  gehört. Geprüft mit einer Wegwerf-Sonde über 0 → 8: Prädikat dicht (fremder Posten
  auch über die ID nicht erreichbar), Summen 3.300/3.400/0, `type`-`CHECK` greift,
  unbekanntes `kind` fällt auf den rohen Schlüssel zurück, Kaskade räumt, Konto-Löschen
  läuft in den Fremdschlüssel — **die 409 in `accounts.ts`/`convert.ts` ist damit Pflicht
  für 12, nicht Kosmetik**. Lint und Build grün. **Der Postgres-Zweig ist nie gelaufen**
  (kein Postgres, kein Docker) — wer als erster gegen Postgres startet, prüft mit.

- [12 · Umsetzung: Routen, Aggregation und MCP](./tickets/12-umsetzung-routen-mcp.md) —
  **Alle neun Punkte gebaut**: `server/routes/salaries.ts` mit acht Endpunkten, die
  Zod-Schreibgrenze und der Lader im Baustein, drei Summen plus `itemCount` und die neue
  Liste `salaries` in `summary`, beide `stats`-Stellen, `einnahmen.csv` neu geschnitten,
  die Zählstelle in `accounts.ts`, sechs MCP-Werkzeuge und `list_income` als
  `{ incomeSources, salaries }` — **29 Werkzeuge, `version: 2.0.0`**. **Eine
  Ticketvorgabe war falsch:** der geforderte 409 in `convert.ts` ist dort weder möglich
  noch richtig — die Stelle ist die *Vorschau*, und ein Gehalt zum Umwandlungshindernis
  zu machen hieße, dass ein Konto nach dem ersten Gehalt für immer persönlich bleibt
  (05 erlaubt Gehälter auf Gemeinschaftskonten ausdrücklich). Stattdessen **zählt die
  Vorschau Gehälter und Posten** — genau der Offenlegungs-Hinweis, den 05 verlangt; der
  409 bleibt allein beim Löschen. Fünf offene Wahlen entschieden: die
  PATCH-**Zusammenführung** liegt als `resolveComponentPatch` im Baustein, weil die
  Invariante am zusammengeführten Zustand hängt und MCP dieselbe Regel braucht (Folge:
  „nur `hours` schicken" **scheitert**, statt den Betrag nachzurechnen) · die Nutzlast
  trägt `label` **roh und** `displayLabel` **aufgelöst**, sonst friert der Katalogname
  beim Zurückschreiben in die Zeile ein · die Übernahme ist eine **eigene Route** (sie
  trifft auch ein bestehendes Gehalt) und erzwingt **dasselbe Konto auf beiden Seiten** ·
  `loadSalaries()` als gemeinsamer Lader, zwei Abfragen statt n+1 · `joins`-Option am
  Prädikat für den CSV-Export. Der Guard schlug zweimal an (Löschen per ID) — beide Male
  die erwünschte Falschmeldung. **Geprüft: 51/51 Zusicherungen** gegen einen laufenden
  Server (Schreibgrenze mit acht Ablehnungen, Verwerfen der Herleitung, alle fünf Summen
  auf 3.790, `itemCount` 2 statt 7, CSV-Schnitt, Übernahme **summenneutral** 3.830 →
  3.830, Fremdnutzer sieht und ändert nichts, Kaskade) plus eine echte MCP-Sitzung.
  Lint und Build grün. Postgres weiter ungeprüft.

- [13 · Umsetzung: Gehalts-Editor-Seite](./tickets/13-umsetzung-editor.md) —
  `src/pages/SalaryEditor.tsx` und zwei Routen; der Prototyp war Vorlage, nicht Quelle.
  **Der eigentliche Ertrag ist ein Befund:** die Spalte `betrag_schwankt` **fehlt** — 03
  hat das Merkmal am Posten als *änderbar* beschlossen, 06 hat den Spaltensatz aus 02s
  Skizze übernommen, die vor 03 entstand, und niemandem ist es aufgefallen. Also ein
  Versehen, keine Entscheidung; die Maske zeigt das Merkmal deshalb als **abgeleitete
  Marke** statt als Ankreuzfeld, und die Frage steht als
  [Ticket 15](./tickets/15-betrag-schwankt.md) — sie **blockiert jetzt 14**, weil 09s
  Statistik-Achse sonst zweimal entsteht. Vier offene Wahlen entschieden: „einmal laden"
  ist `paused: true` **als Konstante** (der Erstabruf läuft immer, nur der Fokus-Zuhörer
  hängt an `paused` — die Auflage aus 08.5 ist damit ausgedrückt statt nachgebaut) ·
  **Abzug ist `amount < 0`**, nicht „`kind` ist `entgeltumwandlung`" wie im Prototyp, denn
  sonst zeigt der Zettelkopf etwas anderes als seine Zeilen (das Minus wird sichtbar
  vorbelegt, nicht beim Speichern gedreht) · der Stundenrechner steht bei **allen** Arten
  offen, `stundenhilfe` entscheidet nur über den Startzustand, dazu ein `× 4,33`-Knopf für
  Wochenstunden · der Speicherweg ist ein **Diff** (löschen, ändern, anlegen, übernehmen)
  mit sofortiger ID-Übernahme, damit ein zweiter Klick nach einem Fehler ändert statt neu
  anzulegen. **Ein echter Fehler dabei gefunden und behoben:** scheiterte die Übernahme
  *nach* dem Anlegen, hätte ein zweiter Klick ein **zweites Gehalt** erzeugt — jetzt
  schaltet die Seite auf die Bearbeiten-Route um. **Geprüft: 22/22** durch Nachspielen der
  Aufruffolge von `save()` gegen einen laufenden Server (Anlegen + Übernahme + Nachziehen
  → 3.395, Bearbeiten als Diff → 3.665, Vorlage mit eigenen IDs, Kontowechsel, Mitleser
  namentlich auflösbar). Lint und Build grün. **Nicht geprüft: das Aussehen** — die
  Chrome-Erweiterung war nicht verbunden, die Seite ist nie im Browser gelaufen.

## Not yet specified

- **Release** — Versionssprung und Docker-Tag, sobald die Funktion steht.

*(Graduiert: „mehrere Gehälter gleichzeitig / Jobwechsel" durch 05 → Ticket 10.
„Umsetzung Backend" und „MCP-Werkzeuge" durch 07 → Tickets 11 und 12. Der Editor aus
„Umsetzung Frontend" durch 08 → Ticket 13, der Rest durch 09 → Ticket 14.)*

## Out of scope

Alles hier liegt jenseits des Ziels und kehrt nur zurück, wenn das Ziel neu
gezogen wird — dann als eigene Karte.

- **Brutto/Netto-Ableitung** — braucht ein gepflegtes Steuermodell (Steuerklasse,
  Sozialabgaben, Kirchensteuer). Eigenes Vorhaben, nicht dieses.
- **Monatsgenaue Fälligkeit von Jahresbeträgen** — „Weihnachtsgeld im November"
  ist Liquiditätsvorschau. Der Zweck dieser Karte ist Zusammensetzung; die
  bestehende `/12`-Verteilung bleibt unangetastet.
- **Ist-Verfolgung schwankender Mehrstunden** — was tatsächlich kam, steht als
  Buchung in `transactions`. Die Planung trägt einen Durchschnittswert.
- **`server/` wird von `tsc` überhaupt nicht geprüft** — beim Auflösen von 11 gefunden:
  `tsconfig.app.json` deckt `src` (und jetzt `shared`), `tsconfig.node.json` nur
  `vite.config.ts`; `server/` läuft über `tsx` und steht in **keinem** Projekt. `npm run
  build` ist damit für jede Backend-Datei blind — ein Typfehler in `server/lib/salary.ts`
  fällt erst zur Laufzeit auf. Bestandslücke über das ganze Backend, das Gehalt macht sie
  nur um zwei Dateien breiter. Reparatur ist ein `tsconfig.server.json` samt
  Projektverweis und gehört in ein eigenes Vorhaben.

- **Reihenfolge in `DELETE /api/auth/users/:id`** — beim Auflösen von 06 gefunden:
  `server/routes/auth.ts:415–425` löscht erst `users`, dann per `USER_COLUMNS` die Daten
  des Nutzers. Mit `foreign_keys = ON` und `created_by → users(id)` läuft schon das erste
  `DELETE` in den Fremdschlüssel, sobald der Nutzer irgendetwas angelegt hat — auf beiden
  Engines. Bestandsfehler über alle sieben Tabellen; das Gehalt macht ihn nur um eine
  breiter, verursacht ihn nicht. Reparatur ist die umgedrehte Reihenfolge und gehört in
  ein eigenes Vorhaben.
