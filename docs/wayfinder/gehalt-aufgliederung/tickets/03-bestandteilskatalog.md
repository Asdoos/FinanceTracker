# 03 · Welche Bestandteilsarten gibt es, und wie fest ist der Katalog?

Type: grilling
Status: resolved
Blocked by: 01
Speist: 04 (Stundenmodell), 08 (Eingabemaske), 09 (Darstellung)

## Question

Der Gehalts-Typ trägt einen **festen Bestandteilskatalog** statt freien Textes — das
ist entschieden. Offen ist, was drinsteht und wie starr er ist.

1. **Welche Arten?** Ausgangspunkt: Grundgehalt, Urlaubsgeld, Weihnachtsgeld,
   Mehrstunden, Zulage, Sonstiges. Ticket 01 liefert, was in DE tatsächlich häufig
   ist — welche kommen dazu, welche fliegen raus?
2. **Fest oder erweiterbar?** Fest verdrahtete Aufzählung (Änderung = Deployment) oder
   Katalogtabelle, in der der Nutzer eigene Arten anlegen kann. Eine feste Aufzählung
   ist die halbe Arbeit und macht Auswertungen verlässlich; „Sonstiges" plus
   Freitext-Bezeichnung fängt den Rest ab.
3. **Bringt eine Art ihre Periodizität mit?** Weihnachtsgeld ist praktisch immer
   jährlich, Grundgehalt monatlich. Vorbelegen und änderbar lassen, oder erzwingen?
4. **Reicht `monthly|annual` überhaupt?** Ticket 01 hat gezeigt, dass die tragende
   Unterscheidung eine andere ist: *Rhythmus fest vs. Betrag fest*. Alle Zuschläge und
   Rufbereitschaft haben einen festen Rhythmus, aber einen schwankenden Betrag — sie
   brauchen dieselbe Durchschnittsmechanik wie Mehrstunden. Bonus und Provision haben
   beides nicht. Bekommt der Bestandteil also ein zweites Merkmal („fester Betrag" /
   „Durchschnitt" / „unregelmäßig"), oder bleibt es bei zwei Periodizitäten und der
   Nutzer trägt eben einen Schätzwert ein? Diese Frage entscheidet mit über 04.
5. **Darf eine Art mehrfach vorkommen?** Zwei Zulagen an einem Gehalt — erlaubt, oder
   ein Bestandteil je Art? Bei „mehrfach erlaubt" braucht jeder Bestandteil eine
   eigene Bezeichnung neben der Art.
6. **Sind Bestandteile mit negativem Betrag denkbar?** Etwa ein Abzug für ein
   Jobrad-Leasing. Wenn ja, ist „Betrag positiv" keine gültige Validierung mehr —
   `income_sources` erzwingt heute `amount.positive()`. Nach Ticket 01 wird das nur
   dann nötig, wenn bAV und Jobrad in den Katalog sollen — die Frage ist also mit
   Nummer 1 gekoppelt und nicht unabhängig zu beantworten.

**Nicht in den Katalog** (aus Ticket 01, belegt): Inflationsausgleichsprämie —
ausgelaufen zum 31.12.2024. Homeoffice-Pauschale — Werbungskostenabzug, kein
Gehaltsbestandteil. Kinderzuschlag — im TVöD nur noch Altfall-Besitzstand.

---

## Antwort

### Der Katalog ist fest verdrahtet

Eine reine Konstantenliste in einem **neuen `shared/salaryCatalog.ts`**, importiert von
Server (Zod-Prüfung) und Frontend (Auswahlfeld, Vorbelegungen). Keine Katalogtabelle,
keine nutzerdefinierten Arten.

Die Katalogtabelle wurde verworfen, weil ihr Gewinn schon anderweitig bezahlt ist: die
Erweiterbarkeit steckt in *Sonstiges* mit freier Bezeichnung **und** darin, dass jede Art
mehrfach mit eigener Bezeichnung vorkommen darf. Übrig bliebe nur das Umbenennen der Art
selbst — zu wenig für CRUD-Routen, ein **Sichtbarkeitsprädikat** (gehört eine eigene Art
dem Nutzer, dem Konto oder allen?), einen Befüllungs-Migrationsschritt und
Referenzintegrität beim Löschen. Dazu kommt: die Auswertung aus 09.3 („welcher Anteil
meines Einkommens ist variabel?") braucht **stabile Schlüssel**; nutzerdefinierte Arten
machen sie unvergleichbar. Der Katalog ist geschlossene Fachsprache, kein Nutzerinhalt.

**Zum Ort (`shared/` statt `server/lib/salary.ts`):** `tsconfig.app.json` schließt heute
nur `src` ein, `server/` läuft über `tsx`. Ein Import aus `src` nach `server` wäre der
erste seiner Art — und `salary.ts` trägt laut Ticket 02 die Summenlogik, die im
Browser-Bündel nichts verloren hat. Der Katalog ist weder Server- noch Frontendbelang.
`shared/` braucht einen Eintrag in `tsconfig.app.json`, damit die Typprüfung ihn sieht.

### Fünfzehn Arten, gebündelt statt granular

| # | Schlüssel | Anzeige | Periodizität | `betragSchwankt` | Vorzeichen |
|---|---|---|---|---|---|
| 1 | `grundgehalt` | Grundgehalt | monatlich | nein | + |
| 2 | `mehrstunden` | Mehrstunden | monatlich | **ja** | + |
| 3 | `weihnachtsgeld` | Weihnachtsgeld / Jahressonderzahlung | jährlich | nein | + |
| 4 | `urlaubsgeld` | Urlaubsgeld | jährlich | nein | + |
| 5 | `zuschlag` | Zuschlag *(Nacht, Sonntag, Feiertag)* | monatlich | **ja** | + |
| 6 | `zulage` | Zulage *(Schicht, Wechselschicht, Erschwernis)* | monatlich | nein | + |
| 7 | `rufbereitschaft` | Rufbereitschaft / Bereitschaftsdienst | monatlich | **ja** | + |
| 8 | `vl` | Vermögenswirksame Leistungen | monatlich | nein | + |
| 9 | `bonus` | Bonus / Prämie / Tantieme | jährlich | **ja** | + |
| 10 | `provision` | Provision | monatlich | **ja** | + |
| 11 | `dienstwagen` | Dienstwagen *(geldwerter Vorteil)* | monatlich | nein | + |
| 12 | `sachbezug` | Sachbezug *(Gutschein, 50-€-Freigrenze)* | monatlich | nein | + |
| 13 | `zuschuss` | Zuschuss *(Jobticket, Fahrtkosten, Internet, Essen)* | monatlich | nein | + |
| 14 | `entgeltumwandlung` | Entgeltumwandlung *(bAV, Jobrad, Dienstrad)* | monatlich | nein | **−** |
| 15 | `sonstiges` | Sonstiges | monatlich | nein | + |

**Schlüssel und Anzeigename sind getrennt.** In der Datenbank steht die stabile
Kleinbuchstaben-Kennung; ein späteres Umbenennen der deutschen Anzeige ist damit keine
Migration.

Der **Bündelungshebel** ist „mehrfach erlaubt + eigene Bezeichnung": „Internetzuschuss"
braucht keine eigene Art, er ist ein *Zuschuss* namens „Internet". Das drückt die 21
Arten aus der Empfehlung von Ticket 01 auf 15, ohne Ausdruckskraft zu verlieren. Die
**Zweistufigkeit** aus 01 (Kern + einblendbare Erweiterung) wurde verworfen: sie kürzt
eine Maske, aber die Art wird über ein Auswahlfeld gewählt, nicht über eine Liste von
Ankreuzfeldern — Bedienlogik ohne Gegenwert im Modell.

Eigenständig geblieben **trotz** Bündelbarkeit: `dienstwagen` (die 1-%-Regel ist eine
eigene Denkweise, nicht „ein Gutschein"), `mehrstunden` (Ticket 04 hängt daran),
`rufbereitschaft` (schwankt, im Gegensatz zur Zulage).

**Nicht im Katalog**, aus 01 belegt: Inflationsausgleichsprämie (ausgelaufen 31.12.2024),
Homeoffice-Pauschale (Werbungskosten, kein Gehaltsbestandteil), Kinder-/Familienzuschlag
(nur noch Altfall-Besitzstand). **Nicht im Katalog, bewusst:** der AG-Zuschuss zur bAV
(15 % nach § 1a BetrAVG) — er fließt in die Versorgung, nicht in die Auszahlung, und
diese Karte zeigt die Zusammensetzung dessen, was ankommt. Wer ihn sichtbar haben will,
legt einen zweiten Bestandteil an.

### Vier Regeln, und es sind überall dieselben

**1. Der Katalog belegt vor, er erzwingt nie.** Periodizität und Vorzeichen kommen aus
der Art und sind an jedem Bestandteil frei änderbar. Damit fällt die Empfehlung aus 01,
bei Weihnachts-/Urlaubsgeld und Grundgehalt die Periodizität zu **erzwingen**. Zwei
Klassen von Arten wären eine Fallunterscheidung im Modell, in der Zod-Prüfung, in der
Maske und in jeder Fehlermeldung — bezahlt für einen Fall, der nicht weh tut. Wer sein
Weihnachtsgeld in zwei Halbjahresraten bekommt und es monatlich einträgt, hat recht.

**2. Ein zweites Merkmal am Bestandteil: `betragSchwankt`** (Boolean, aus der Art
vorbelegt, änderbar). Es bildet den eigentlichen Befund aus 01 ab — die tragende
Unterscheidung ist *Rhythmus fest vs. Betrag fest*, nicht monatlich/jährlich.

Bewusst **ein Boolean, keine dreiwertige Aufzählung**: Muster 2 („Rhythmus fest, Betrag
schwankend") und Muster 3 („frei variabel") verhalten sich für die App identisch — beide
heißen „das ist ein Schätzwert". Ihr Unterschied liegt im Rhythmus, und Fälligkeitsmonate
sind ausdrücklich außerhalb des Ziels. An der gespeicherten **Zahl** ändert das Merkmal
nichts; es trägt die *Verlässlichkeit* der Zahl. Es ist der Anker für drei spätere Dinge:
den Durchschnitts-Hinweis in der Maske (08), die Auswertungsachse „welcher Anteil meines
Einkommens ist variabel?" (09.3 — die einzige interessante Achse, die Einnahmen je
hätten, denn sie tragen keine Kategorie) und die Frage, wo Stundensatz × Stunden
angeboten wird (04).

**3. `monthly | annual` bleibt unverändert.** Kein `quarterly`, kein `einmalig`.
Quartalsweise 900 € trägt der Nutzer als jährlich 3.600 € ein — auf den Cent dieselbe
Zahl, weil der Auszahlungsmonat außerhalb des Ziels liegt und damit der einzige
Unterschied wegfällt. „Einmalig" ist im Zweck dieser Karte keine Periodizität: eine
einmalige Zahlung hat keine Zusammensetzung eines *laufenden* Einkommens und gehört als
Buchung in `transactions` — dieselbe Trennung, die für die Mehrstunden schon gezogen ist.
Ein dritter Wert allein bei `salary_components` machte die Tabelle außerdem mit
`income_sources` und `expense_items` unvergleichbar und zwänge jede Aggregationsstelle zu
einem Sonderfall.

**4. Eine Tatsache, ein Ort.**

- **Der Abzug ist ein negatives `amount`**, kein Flag neben einem positiven Betrag. Die
  Validierung geht von `amount.positive()` auf `amount != 0`. Grund ist das
  Scheitern-Verhalten — dasselbe Kriterium wie in Ticket 02: bei einem Flag liegt eine
  Tatsache in zwei Feldern, und eine vergessene Summenstelle addiert die bAV **dazu**
  statt sie abzuziehen, still und um den doppelten Betrag daneben. Mit Vorzeichen ist die
  Summe eine gewöhnliche Addition und `server/lib/salary.ts` hat nichts zu entscheiden.
  Der Preis ist die Darstellung: die Maske muss das Minus zeigen, sonst tippt jemand
  `250` und meint einen Abzug (→ 08).
- **`label` ist `NULL`-fähig** und fällt in der Anzeige auf den Katalognamen zurück. Ein
  gewöhnliches Grundgehalt speichert `NULL` und zeigt „Grundgehalt"; der Zuschuss
  speichert „Internet". Der Katalogname gehört dem Katalog, nicht der Zeile — sonst
  friert er zum Anlegezeitpunkt in jede Zeile ein.
- **Pflicht ist `label` nur bei `sonstiges`**, in der Zod-Prüfung, nicht im Datenmodell.
  Das ist die einzige Ausnahme von Regel 1 und eine andere Sorte: kein Zwang gegen einen
  belegten Standardfall, sondern das Auffangen eines fehlenden Standards. „Sonstiges
  340 €" ist eine Zeile, die in einem halben Jahr nichts mehr sagt — und genau das ist
  der Zweck dieser Karte.

**Mehrfachvorkommen ist uneingeschränkt erlaubt**, ohne Eindeutigkeitsregel für
irgendeine Art. Zwei Grundgehälter sind Unsinn, aber harmloser, sofort sichtbarer Unsinn;
eine Eindeutigkeitsregel für drei von fünfzehn Arten wäre wieder die Zwei-Klassen-
Fallunterscheidung.

### Nachtrag zu Ticket 02

Ticket 02 hält fest: „`amount` ist `NOT NULL`". Das gilt weiter. Der dort mitgedachte
Zusatz „und positiv" **fällt** — siehe Regel 4. Vermerkt hier statt rückwirkend in 02,
damit die Karte den tatsächlich gelaufenen Weg zeigt.
