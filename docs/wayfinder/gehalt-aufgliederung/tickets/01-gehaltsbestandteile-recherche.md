# 01 · Übliche Gehaltsbestandteile und wie andere Werkzeuge sie modellieren

Type: research
Status: resolved
Blocked by: —

## Question

Welche Gehaltsbestandteile treten in deutschen Arbeitsverhältnissen tatsächlich
regelmäßig auf, und wie modellieren vergleichbare Finanzwerkzeuge eine aus mehreren
Posten zusammengesetzte Einnahme?

Konkret zu klären:

1. **Bestandteilsarten in DE** — über Grundgehalt, Urlaubsgeld, Weihnachtsgeld und
   Mehrstunden hinaus: Zulagen (Schicht, Nacht, Sonntag), vermögenswirksame
   Leistungen, Sachbezüge (Dienstwagen, Jobticket), Provision/Tantieme,
   Inflationsausgleich, Zuschüsse. Welche davon sind häufig genug, um in einen
   festen Katalog zu gehören?
2. **Periodizität je Art** — welche sind monatlich, welche jährlich, welche
   unregelmäßig? Das entscheidet, ob eine Art ihre Periodizität fest mitbringt oder
   frei wählbar ist.
3. **Modellierung anderswo** — wie lösen Finanzguru, Firefly III, YNAB, Actual
   Budget oder MoneyMoney eine Einnahme mit Bestandteilen? Eigene Entität,
   Eltern-Kind-Beziehung, oder gar nicht? Wo liegt jeweils die Wahrheit für
   Aggregationen — bei der Summe oder bei den Posten?

**Nicht Gegenstand:** Steuer- und Abgabenberechnung (außerhalb des Kartenziels).

Die Antwort speist Ticket 03 (Bestandteilskatalog) und liefert 02 (Datenmodell)
Vergleichspunkte.

## Answer

Vollständige Befunde mit Quellenbelegen je Aussage: [01-findings.md](./01-findings.md).

**1. Katalog — was belegt häufig ist.** Weihnachtsgeld 53 %, Urlaubsgeld 44 %,
betriebliche Altersvorsorge 51,9 %, vermögenswirksame Leistungen ~65 % Nutzung,
Schichtzulage (15 % Schichtarbeit), Nacht-/Sonntags-/Feiertagszuschlag (9 / 15 / 6 %),
Dienstwagen ~5 %, Jobticket, Sachbezug (50-€-Freigrenze), Bonus/Provision. Für
Sachbezüge, Essenszuschuss, Trinkgeld und Erschwerniszulage gibt es **keine** amtliche
Verbreitungsquote — Destatis erhebt Zuschläge, veröffentlicht aber keine Empfängerquoten
je Art. Diese Arten sind also nach Gefühl aufzunehmen oder wegzulassen, nicht nach Zahl.

**2. Zwei Negativbefunde.** Die **Inflationsausgleichsprämie ist ausgelaufen** —
§ 3 Nr. 11c EStG trägt die Befristung „bis 31.12.2024" im Wortlaut und gehört nicht in
einen Katalog für 2026. Die **Homeoffice-Pauschale ist kein Gehaltsbestandteil**, sondern
Werbungskostenabzug. Der Kinder-/Familienzuschlag existiert im TVöD nur noch als
Altfall-Besitzstand.

**3. Periodizität — die tragende Unterscheidung ist eine andere als angenommen.** Nicht
„monatlich vs. jährlich", sondern **„Rhythmus fest vs. Betrag fest"**:

| Klasse | Beispiele | Folge fürs Modell |
|---|---|---|
| (a) beides fest | VL, Sachbezug, Dienstwagen | `monthly`/`annual` genügt |
| (b) Rhythmus fest, Betrag schwankend | **alle** Zuschläge, Rufbereitschaft, Mehrstunden | braucht einen Durchschnittswert — dieselbe Mechanik wie Mehrstunden |
| (c) frei variabel | Bonus, Provision | weder Rhythmus noch Betrag verlässlich |

Ein Modell mit nur `monthly|annual` bildet Klasse (b) nicht ab. Das ist der wichtigste
Befund für Ticket 03 und macht das Stundenmodell aus 04 vom Sonderfall zum Regelfall.

**4. Modellierung anderswo — drei Muster.** Eine Gruppensumme wird nur dort *gespeichert*,
wo der Elternteil eine **echte Kontobewegung** ist (Actual, YNAB); wo er reine Klammer
ist, wird immer summiert (Firefly III `GroupCollector`, `bcadd`). Doppelzählung ist
überall ein **Query-Problem**, keine Modellfrage — Actual braucht dafür vier
Split-Semantiken und `is_parent = 0` in jedem Aggregat. Auf der *Plan*-Ebene spiegeln
Firefly (`recurrences_transactions`) und YNAB (`ScheduledSubTransaction`) die Bestandteile
voll; Actual bildet sie nur über Rules ab.

**5. Finanzguru** hat **keine** Gehaltsaufgliederung, nur generische Buchungs-Splits — mit
einem harten Verbot: „Teilbuchungen können nicht in Verträgen enthalten sein", d. h. der
Split entzieht das Gehalt der Statistik. MoneyMoney ist Closed Source; das Modell bleibt
unbelegt.

**Empfehlung der Recherche** (Eingabe für 02 und 03, keine Entscheidung): Gestalt A
(eigene Tabellen); Wahrheit bei den **Posten**, nicht bei einer gespeicherten Summe;
`/12` auf dem Posten; eine aufklappbare Zeile. YNABs Unveränderlichkeit nicht übernehmen.
Periodizität vorbelegen statt erzwingen. Eine Art mehrfach erlauben — dann braucht jeder
Bestandteil eine eigene Bezeichnung. Negative Beträge werden nur nötig, wenn bAV und
Jobrad in den Katalog sollen.
