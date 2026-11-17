# 04 · Wie funktioniert Stundensatz × Stunden für Mehrstunden?

Type: grilling
Status: resolved
Blocked by: 03
Speist: 08 (Eingabemaske), 07 (API und MCP), 06 (Migration)

## Question

Entschieden ist: Stundensatz × Stunden ist eine **Eingabehilfe**, gespeichert und
aggregiert wird ein fester Betrag. Offen ist die Mechanik.

1. **Wo sitzt der Stundensatz?** Am Gehalt (ein Satz für alle stundenbasierten
   Bestandteile) oder am einzelnen Bestandteil (Nachtzuschlag hat einen anderen Satz
   als normale Mehrarbeit)? Am Gehalt ist einfacher, am Bestandteil ist ehrlicher.
2. **Wird der Satz überhaupt gespeichert?** Wenn nur der gerechnete Betrag in die
   Datenbank geht, steht beim nächsten Öffnen des Formulars „400 €" ohne die
   Herleitung — der Nutzer muss neu rechnen, um 5 auf 6 Stunden zu ändern. Speichern
   heißt zwei Felder mehr und die Frage nach Nummer 3.
3. **Was gilt, wenn Satz × Stunden ≠ Betrag?** Etwa weil jemand den Betrag direkt
   überschrieben hat oder der Satz sich geändert hat. Betrag neu rechnen, Herleitung
   verwerfen, oder Widerspruch anzeigen? Der Betrag muss die Wahrheit bleiben, sonst
   verschiebt sich die Aggregation hinter dem Rücken des Nutzers.
4. **Wo wird Satz × Stunden angeboten — bei allen schwankenden Bestandteilen oder nur
   bei Mehrstunden?** *Durch Ticket 03 nachgeschärft:* der Bestandteil trägt jetzt ein
   Boolean **`betragSchwankt`**, aus der Art vorbelegt und änderbar. Fünf Arten sind
   damit vorbelegt schwankend: `mehrstunden`, `zuschlag`, `rufbereitschaft`, `bonus`,
   `provision`. Die Frage ist deshalb nicht mehr „ist stundenbasiert eine Eigenschaft
   der Art oder des Bestandteils" — das ist entschieden, es ist eine Eigenschaft des
   Bestandteils. Offen ist, ob `betragSchwankt` **allein** die Stundenhilfe auslöst
   (dann bekommt auch die Provision Satz × Stunden angeboten, was Unsinn ist) oder ob
   es ein **zweites, unabhängiges Merkmal `istStundenbasiert`** braucht. Vorsicht: das
   wäre das zweite Boolean am Bestandteil, und 03 hat mehrfach gegen zusätzliche
   Fallunterscheidungen entschieden — hier muss es sich verdienen.
5. **Welche Bezugsgröße für die Stundenzahl?** Stunden pro Monat oder pro Woche
   (× 4,33)? Bei „pro Woche" muss der Umrechnungsfaktor irgendwo festgeschrieben
   stehen, sonst rechnet jede Stelle anders.
6. **Darf der gerechnete Betrag negativ sein?** Aus 03: `amount` ist jetzt
   vorzeichenbehaftet (`amount != 0` statt `positive()`). Satz × Stunden mit negativem
   Ergebnis ergibt keinen Sinn — prüft die Herleitung enger als der Betrag, oder ist
   das eine Regel, die man sich sparen kann?

**Vorgaben aus 03**, die dieses Ticket nicht neu aufrollt: der Katalog belegt vor und
erzwingt nie · `amount` ist vorzeichenbehaftet und `NOT NULL` · Periodizität bleibt
`monthly | annual` · der Katalog steht als Konstante in `shared/salaryCatalog.ts`.

---

## Antwort

### Die Kurzform

| # | Entscheidung |
|---|---|
| 1 | Stundensatz sitzt **am Bestandteil** (`salary_components.hourly_rate`) |
| 2 | Herleitung wird **gespeichert** (`hourly_rate`, `hours`, beide `NULL`-fähig) |
| 3 | Widerspruch ist **nicht speicherbar**: sind beide gesetzt, gilt `round(rate × hours, 2) == amount`. Direktes Ändern des Betrags **verwirft** die Herleitung (beide auf `NULL`) |
| 4 | **Kein** zweites Boolean am Bestandteil. Stattdessen Katalogspalte **`stundenhilfe`**, die nur vorbelegt und nirgends verbietet |
| 5 | Stunden stehen **in der Periodizität des Bestandteils** — kein Wochenfaktor, keine Einheitenspalte |
| 6 | **`hourly_rate > 0`, `hours > 0`** strikt |
| 7 | **Beide oder keiner** (`(rate IS NULL) = (hours IS NULL)`), geprüft in **Zod**, nicht als `CHECK` |

Frage 7 stand nicht im Ticket. Sie liegt unter allen anderen und ist beim
Zusammenschreiben aufgefallen — ohne sie bliebe der halb gefüllte Zustand ein Loch für 08.

### Der Satz sitzt am Bestandteil

`salary_components.hourly_rate`, wie 02 die Spalte vorsorglich hingeschrieben hat.
`salaries` bekommt **kein** Stundenfeld.

Grund ist derselbe wie in 02 und 03 — *eine Tatsache, ein Ort*: der Satz ist die
Herleitung **dieses** Betrags, keine Eigenschaft des Arbeitsverhältnisses. Was die Frage
seit dem Schreiben des Tickets verschoben hat, ist 03s Entscheidung „Mehrfachvorkommen
uneingeschränkt erlaubt": ein Gehalt trägt drei Zuschlagszeilen (Nacht, Sonntag,
Feiertag) mit in der Realität **verschiedenen** Sätzen. Ein Satz am Gehalt wäre damit
unauflösbar falsch, und im Normalfall, nicht im Randfall. Er wäre außerdem ein Feld, das
„mein Satz für irgendeinen der Posten" bedeutet — dieselbe Doppelbedeutung, die
`CLAUDE.md` bei `freibetrag` als bewusst bezahlten Preis ausweist, hier aber ohne
Gegenwert.

Verworfen wurde auch die fachlich exaktere Gestalt: **Grundstundenlohn am Gehalt plus
Faktor je Bestandteil** (25 %, 50 %, 125 %). Sie ist ein drittes Feld und eine zweite
Rechenstufe — und die Prozentsätze gehören dem Tarifvertrag, nicht dieser App.

Der Preis: wer drei Zuschläge führt, tippt drei Sätze, und die Maske kann keinen
Gehaltssatz vorbelegen.

### Die Herleitung wird gespeichert

Ernst gemeinte Gegenvariante: die Maske rechnet 5 × 80 € = 400 €, schreibt **nur** 400 €
und die Herleitung verschwindet — ein Taschenrechner neben dem Formular. Sie ist die
einzige Variante, in der es einen Widerspruch (Frage 3) gar nicht *geben* kann.

Sie fällt trotzdem, aus zwei Gründen:

- Der Zweck der Karte ist **Zusammensetzung sichtbar machen**, und bei einem
  schwankenden Posten *ist* die Herleitung ein Teil dieser Zusammensetzung. „400 €"
  sagt nichts, „5 Std. × 80 €" sagt, woran man dreht.
- Der Fall, der ohne Speichern jeden Monat anfällt: aus 5 Stunden werden 6. Im Formular
  steht „400 €", der Satz muss aus dem Kopf rekonstruiert werden. Das ist die Sorte
  Rückschritt, die 02 beim zweiten `is_active` abgelehnt hat („heute geht das, als
  Bestandteil ginge es dann nicht mehr").

Die Felder bleiben bei den zwölf nicht-stundenbasierten Arten leer. Das ist kein
Sonderfall in der Aggregation, weil `SUM(amount)` sie nach 02 nie ansieht. Ausgewertet
wird die Herleitung **nirgends** — 09.3 („welcher Anteil ist variabel?") liest
`betragSchwankt`, nicht die Stunden. Sie wird nur angezeigt und nachgerechnet.

### Der Widerspruch ist nicht speicherbar

Invariante an der Schreibgrenze: **sind `hourly_rate` und `hours` gesetzt, muss
`round(rate × hours, 2) == amount` gelten**, sonst 400. Verglichen wird auf den Cent, ohne
Toleranzband.

Wer den Betrag direkt ändern will, **verwirft damit die Herleitung** — beide Felder gehen
auf `NULL`, statt einen Fehler zu werfen. Ohne diese Klausel wäre ein stundenbasierter
Posten ein Posten, dessen Betrag man nicht mehr frei setzen kann, ohne ihn zu löschen. Die
Maske muss das Verwerfen sichtbar machen; das ist ihr Preis und geht an 08.

Die beiden verworfenen Haltungen, und warum:

- **Widerspruch speichern und anzeigen** („Herleitung passt nicht zum Betrag") speichert
  einen Zustand, den niemand auflösen *muss*. Der Hinweis lebt in der Maske, `SUM(amount)`
  sieht ihn nie — das Gehalt aggregiert dann monatelang einen Betrag, den die Oberfläche
  selbst als fragwürdig markiert. Der Widerspruch wird zu Dauerinventar statt zu einem
  Fehler.
- **Still neu rechnen** ist die Variante, die 02 ausdrücklich verbietet: „Der Betrag muss
  die Wahrheit bleiben, sonst verschiebt sich die Aggregation hinter dem Rücken des
  Nutzers." Wer den Satz von 80 auf 85 korrigiert, verändert damit stillschweigend seine
  Dashboard-Summe.

Der Gewinn ist, dass die Invariante überall **ohne Prüfung** gilt: `server/lib/salary.ts`
hat nichts zu entscheiden, 08 muss keinen Warnzustand gestalten, 09 keinen darstellen.

Ausdrücklich benannt, weil es nach 03s Argumentation gegen Flags erklärungsbedürftig ist:
`amount` bleibt die einzige Wahrheit für die Aggregation, ist bei stundenbasierten Posten
aber kein frei wählbarer Wert mehr, sondern ein abgeleiteter, der gespeichert wird. Der
Unterschied zum abgelehnten Abzugs-Flag: hier ist die Ableitung **erzwungen**, nicht
erhofft. Es liegt keine Tatsache in zwei Feldern, sondern eine in einem und ihre
Begründung in zwei weiteren.

### Kein zweites Boolean — eine Katalogspalte

Die Frage des Tickets („braucht es `istStundenbasiert` neben `betragSchwankt`?") hat sich
durch die beiden vorigen Entscheidungen **erledigt, statt beantwortet werden zu müssen**:
„ist stundenbasiert" ist kein Merkmal, das man setzt, sondern ein Zustand, den man abliest
— `hourly_rate IS NOT NULL`. Ein Boolean daneben wäre eine Tatsache in zwei Feldern, also
genau der Fehler, den 03 beim Abzugs-Flag verworfen hat: `istStundenbasiert = true` mit
leerem Satz wäre ein speicherbarer Widerspruch, den die Invariante gerade abgeschafft hat.

Die echte Restfrage dahinter ist eine **Darstellungs**frage — wo bietet die Maske die
Hilfe an? — und 03 hat die Antwortform schon festgelegt (*der Katalog belegt vor und
erzwingt nie*):

- Dritte Katalogspalte **`stundenhilfe: boolean`** in `shared/salaryCatalog.ts`, gesetzt
  bei `mehrstunden`, `zuschlag`, `rufbereitschaft`.
- Sie entscheidet **nur**, ob die Hilfe bei dieser Art aufgeklappt startet. **Verboten ist
  sie nirgends** — bei den anderen zwölf Arten ist sie eingeklappt erreichbar. Wer
  stundenweise abgerechnete Bereitschaft als `sonstiges` führt, kommt an sie heran; wer
  Provision hat, hat sie nicht im Weg.

Der Unterschied zum abgelehnten Boolean ist der Ort: die Spalte sitzt **am Katalog, nicht
an der Zeile**. Sie ist eine Konstante — keine Migration, kein Sichtbarkeitsprädikat,
keine Zod-Verzweigung, kein speicherbarer Widerspruch. Genau wie Periodizität und
Vorzeichen aus 03.

Verworfen: gar keine Katalogspalte, Hilfe überall gleich eingeklappt. Kostet eine Spalte
weniger und einen Klick mehr bei genau den drei Arten, bei denen sie der Normalfall ist —
bei `mehrstunden`, dem Anlass dieses Tickets, ist das der falsche Klick.

### Stunden stehen in der Periodizität des Bestandteils

Das Ticket fragt „pro Monat oder pro Woche (× 4,33)". Die Antwort ist eine dritte:
**keine eigene Bezugsgröße**. `amount = rate × hours` gilt in *derselben* Periode, die
`type` schon trägt — bei `monthly` Stunden im Monat, bei `annual` Stunden im Jahr. Die
Invariante ist damit von der Periodizität unabhängig, und die `/12`-Umrechnung sitzt
weiter am Betrag, wo 02 sie hingelegt hat.

Warum nicht „pro Woche":

- Es bräuchte eine festgeschriebene Konstante, die **jede** lesende Stelle kennen muss —
  eine dritte Zeitrechnung neben `monthly` und `annual`. 03 hat `quarterly` mit der
  Begründung abgelehnt, dass ein dritter Wert jede Aggregationsstelle zum Sonderfall
  zwingt.
- Schlimmer: der Faktor ist **ungenau**, und die Invariante vergleicht auf den Cent.
  5 Wochenstunden × 4,33 × 80 € = 1.732,00 €; mit 365,25/7/12 = 4,348 sind es 1.739,20 €.
  Zwei Stellen mit zwei Faktoren, und die Invariante bricht reihenweise.
- Mehrstunden werden ohnehin monatlich gedacht — die Abrechnung führt „15 Überstunden im
  Abrechnungsmonat", nicht „3,5 pro Woche".
- Eine Einheitenspalte (`hours_unit`) wäre wieder eine Tatsache mehr an der Zeile, und der
  Bestandteil trägt seine Periode schon.

Preis: wer seinen Vertrag in Wochenstunden denkt, rechnet einmal mal 4,33. Die Maske darf
das abfedern (→ 08), gespeichert wird die Zahl der Periode.

Bekannte Nebenwirkung, akzeptiert: wird die Periodizität eines stundenbasierten Postens
von `monthly` auf `annual` umgestellt, ändert sich die **Bedeutung** der gespeicherten
Stundenzahl (15 im Monat → 15 im Jahr). `amount` bleibt nach der Invariante korrekt, der
Posten bedeutet aber etwas anderes. Das ist derselbe Effekt, den das Umstellen der
Periodizität heute schon bei jedem Betrag hat — der bestehende Fallstrick, kein neuer.

### Die Herleitung wird enger geprüft als der Betrag

**`hourly_rate > 0` und `hours > 0`, beide strikt.** Damit ist das Produkt zwingend
positiv, ohne eine Regel über das Vorzeichen von `amount` — 03s `amount != 0` bleibt
unangetastet.

- Es ist **eine Regel, keine Fallunterscheidung**: sie hängt nicht an der Art, nicht am
  Vorzeichen, nicht an `betragSchwankt`, sondern an einem Feldpaar. Sie fällt damit nicht
  unter das, was 03 dreimal abgelehnt hat (zwei Klassen von Arten).
- Ein negativer Satz oder negative Stunden sind kein Fall, sondern ein Tippfehler. Der
  einzige Abzug im Katalog (`entgeltumwandlung`) ist nicht stundenbasiert und trägt seinen
  negativen Betrag direkt. Wer einen stundenweise gerechneten Abzug bräuchte, trägt den
  Betrag ein und verzichtet auf die Herleitung — der Weg, den das Verwerfen aus Frage 3
  ohnehin vorsieht.

**`hours > 0`, nicht `>= 0`:** bei 0 Stunden wäre der Betrag 0, und das verbietet
`amount != 0` aus 03 schon — 0 Stunden wären ein Wert, der garantiert in einen
Schreibfehler läuft. „Diesen Monat keine Mehrstunden" ist nicht 0, sondern
**`is_active = false`** am Bestandteil; genau dafür hat 02 das zweite `is_active`
behalten. Die Planung trägt ohnehin einen Durchschnitt, kein Ist (Out-of-scope der Karte).

### Beide oder keiner, und die Prüfung sitzt in Zod

**`(hourly_rate IS NULL) = (hours IS NULL)`.** Ein halb gefülltes Feldpaar ist keine
Herleitung, sondern eine unbeantwortbare Zeile: die Maske kann nicht sagen, welcher Betrag
gemeint war, die Anzeige nicht, was sie zeigen soll („80 €/Std. × ? Std."). Im Formular
ist der Zwischenzustand normal; beim **Speichern** ist er es nicht, und die Grenze
zwischen beidem *ist* die Zod-Prüfung.

Alle drei Regeln dieses Tickets (Invariante, Positivität, Paarbindung) sitzen
**ausschließlich in Zod, nicht als `CHECK` im Schema**:

- Migrationen tragen je einen SQLite- und einen Postgres-Zweig (`CLAUDE.md`,
  „Migrationen") — ein `CHECK` wäre zweimal formuliert und in SQLite nur mit
  Tabellen-Neubau änderbar.
- Es ist Fachlogik über drei Felder, kein Spaltentyp.
- Sie gehört an die Schreibgrenze, und dort ist sie **eine** Stelle für HTTP-Routen *und*
  MCP, weil beide dasselbe Schema benutzen müssen. Dass MCP dieselbe Prüfung sieht, ist
  Teil dieser Entscheidung, kein Umsetzungsdetail — geht als Vorgabe an 07.

### Nachträge zu 02 und 03

Nach dem Vorbild von 03 hier vermerkt statt rückwirkend eingetragen, damit die Karte den
tatsächlich gelaufenen Weg zeigt:

- **02 wird bestätigt, nicht korrigiert.** `hourly_rate` und `hours` bleiben an
  `salary_components`, wie dort skizziert; die Kommentare „Ort noch offen" bzw. „siehe 04"
  sind mit diesem Ticket aufgelöst. `salaries` bekommt kein Stundenfeld. Beide Spalten
  sind `NUMERIC NULL`.
- **03 bekommt eine dritte Spalte.** `shared/salaryCatalog.ts` trägt neben `type`,
  `betragSchwankt` und Vorzeichen auch **`stundenhilfe`**, gesetzt bei `mehrstunden`,
  `zuschlag`, `rufbereitschaft` — also bei drei der fünf schwankenden Arten. `bonus` und
  `provision` sind schwankend **ohne** Stundenhilfe; das ist der Beleg dafür, dass die
  beiden Merkmale nicht dasselbe sind.

### Was daran hängt

- **08 (Eingabemaske)** ist entblockt und trägt drei benannte Gestaltungsaufgaben: das
  Verwerfen der Herleitung sichtbar machen, die Wochenstunden-Umrechnung abfedern, das
  Minus bei `entgeltumwandlung` zeigen (letzteres aus 03).
- **07 (API und MCP)** erbt die Zod-Grenze als gemeinsame Schreibstelle beider Oberflächen.
- **06 (Migration)** kennt jetzt den endgültigen Spaltensatz von `salary_components` und
  weiß, dass keine `CHECK`-Bedingung ins Schema geht.
