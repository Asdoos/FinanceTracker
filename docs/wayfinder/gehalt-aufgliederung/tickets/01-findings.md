# 01 · Befunde — Gehaltsbestandteile in DE und Modellierung anderswo

Status: abgeschlossen
Speist: 03 (Bestandteilskatalog), 02 (Datenmodell)

**Abgrenzung eingehalten:** Brutto/Netto, Steuer- und Abgabenberechnung wurden nicht
recherchiert. Steuerrecht taucht nur dort auf, wo es erklärt, **warum** ein Bestandteil
überhaupt getrennt ausgewiesen wird — nicht, wie er besteuert wird.

Belegstufen durchgehend markiert: **[Gesetz]** Wortlaut aus gesetze-im-internet.de bzw.
offiziellem Tarifvertragstext · **[Zahl]** belegte Statistik mit Erhebung und Jahr ·
**[QC]** im Quellcode/Schema verifiziert · **[DOC]** nur offizielle Doku ·
**[Einschätzung]** abgeleitet, kein Beleg gefunden · **[?]** unbelegt geblieben.

---

## Teil 1+2 — Bestandteilsarten in Deutschland und ihre Periodizität

### Vorab: wo die Datenlage endet

Für Weihnachtsgeld, Urlaubsgeld, bAV und die Zuschlagsarten gibt es harte Zahlen aus
großen, wiederholten Erhebungen. Für Sachbezüge, Essenszuschuss, Fahrtkostenzuschuss,
Trinkgeld und Erschwerniszulage gibt es **keine** vergleichbare Zahl — Destatis erhebt
Zuschläge und Sonderzahlungen zwar als Verdienstbestandteile, veröffentlicht aber keine
*Empfängerquoten je Art*
([Methodenbeschreibung Verdiensterhebung](https://www.destatis.de/DE/Themen/Arbeit/Verdienste/Verdienste-Branche-Berufe/Methoden/Erlaeuterungen/erlaeuterung-Verdiensterhebung.html)).
Das Fehlen einer Zahl ist kein Beleg für Seltenheit; bei der 50-€-Sachbezugsfreigrenze
wäre dieser Schluss mit hoher Wahrscheinlichkeit falsch.

Zweiter Vorbehalt: die Destatis-Zuschlagsquoten sind **Obergrenzen, keine
Empfängerquoten**. Gemessen wird „hat nachts/sonntags gearbeitet", nicht „hat dafür
einen Zuschlag bekommen". § 3b EStG *erlaubt* Steuerfreiheit, *verpflichtet* zu nichts.

### Kern — statistisch belegt häufig genug für einen festen Katalog

| Bestandteil | Kurzbeschreibung | Periodizität | Fest durch die Art? | Verbreitung | Beleg |
|---|---|---|---|---|---|
| **Weihnachtsgeld / Jahressonderzahlung** | Sonderzahlung zum Jahresende, tariflich oft % eines Monatsentgelts | jährlich (meist November/Dezember) | ja | **53 %** aller Beschäftigten; mit Tarif 77 %, ohne 42 % | [WSI/Lohnspiegel, n=40.377](https://www.wsi.de/de/pressemitteilungen-15991-53-prozent-aller-beschaeftigten-bekommen-weihnachtsgeld-53695.htm) |
| **Urlaubsgeld** | Sonderzahlung, meist Mai–Juli | jährlich | ja | **44 %** in der Privatwirtschaft; mit Tarif 72 %, ohne 34 % | [WSI/Lohnspiegel 2024/25, n=67.380](https://www.wsi.de/de/pressemitteilungen-15991-lediglich-44-prozent-der-beschaftigten-in-der-privatwirtschaft-erhalten-urlaubsgeld-69428.htm) |
| **Nachtzuschlag** | Zuschlag für Nachtarbeit | monatlich, **Betrag schwankend** | Rhythmus ja, Betrag nein | **9 %** arbeiten nachts (Verkehr 22 %, Gesundheit 16 %) | [§ 3b EStG](https://www.gesetze-im-internet.de/estg/__3b.html) · [Destatis Mikrozensus 2023](https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/04/PD25_N022_13.html) |
| **Sonntagszuschlag** | Zuschlag für Sonntagsarbeit | monatlich, schwankend | Rhythmus ja | **15 %** arbeiten sonntags | wie oben |
| **Feiertagszuschlag** | Zuschlag für Feiertagsarbeit | unregelmäßig | nein | **6 %** arbeiten an Feiertagen | wie oben |
| **Schicht-/Wechselschichtzulage** | Pauschale; TVöD 105 €/Monat (Wechselschicht), 40 €/Monat (Schicht) | **monatlich, konstant** | ja | **15 %** arbeiten im Schichtsystem (Gesundheit 28 %) | [TVöD § 8](https://www.der-oeffentliche-sektor.de/tvoed_paragraf_8) · [Destatis](https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/04/PD25_N022_13.html) |
| **Vermögenswirksame Leistungen** | AG legt Geld für AN an; typ. 6,65–40 €/Monat | **monatlich, konstant** | ja | ~13 Mio. Nutzer von >20 Mio. Anspruchsberechtigten (**~65 %**) — Branchenanalyse, nicht amtlich | [§ 2 5. VermBG](https://www.gesetze-im-internet.de/vermbg_2/__2.html) · [§ 13 5. VermBG](https://www.gesetze-im-internet.de/vermbg_2/__13.html) · [BaFin](https://www.bafin.de/DE/Verbraucher/GeldanlageWertpapiere/Produkte/VermoegenswirksameLeistungen/VermoegenswirksameLeistungen_node.html) |
| **bAV / Entgeltumwandlung + AG-Zuschuss** | AN wandelt Entgelt um, AG schießt 15 % zu | **monatlich, konstant** | ja | **51,9 %** der SV-pflichtig Beschäftigten mit Anwartschaft; Großbetriebe 86 %, <10 MA 25 % | [§ 1a BetrAVG](https://www.gesetze-im-internet.de/betravg/__1a.html) · [Alterssicherungsbericht 2024, BMAS](https://www.bmas.de/SharedDocs/Downloads/DE/Rente/alterssicherungsbericht-2024.pdf?__blob=publicationFile&v=3) |
| **Bonus / Prämie / Tantieme** | erfolgs-/zielabhängig | jährlich **oder** unregelmäßig | **nein, frei** | ~**10 %** der Betriebe mit Gewinn-/Erfolgsbeteiligung (Betriebs-, nicht Beschäftigtenquote) | [IAB-Betriebspanel via Böckler](https://www.boeckler.de/fpdf/HBS-005416/mbf_bvd_gewinn_und_erfolgsbeteiligung.pdf) |
| **Provision** | umsatz-/abschlussabhängig | monatlich oder quartalsweise, **stark schwankend** | **nein, frei** | keine belastbare Zahl. [Einschätzung] hoch in Vertrieb/Handel/Versicherung | — |
| **Jobticket / Deutschlandticket** | AG-Zuschuss zum ÖPNV | **monatlich, konstant** | ja | ~14,6 Mio. D-Ticket-Abos; Jobticket-Anteil nicht separat ausgewiesen | [§ 3 Nr. 15 EStG](https://www.gesetze-im-internet.de/estg/__3.html) · [Bundesregierung](https://www.bundesregierung.de/breg-de/aktuelles/deutschlandticket-2134074) |
| **Dienstwagen (geldwerter Vorteil)** | 1 % Bruttolistenpreis/Monat + 0,03 %/Entfernungs-km, alternativ Fahrtenbuch | **monatlich, konstant** | ja | **~5 %** aller Beschäftigten; bei ≥6.000 €/Monat fast ein Drittel, bei ≤2.000 € nur 1 % | [§ 8 Abs. 2 EStG](https://www.gesetze-im-internet.de/estg/__8.html) · [UBA Texte 89/2026](https://www.umweltbundesamt.de/en/publikationen/quantifizierung-des-dienstwagenprivilegs) |
| **Sachbezug (50-€-Freigrenze)** | Gutscheine/Sachleistungen bis 50 €/Kalendermonat | **monatlich, konstant** (Freigrenze erzwingt Konstanz) | ja | keine amtliche Quote. [Einschätzung] weit verbreitet | [§ 8 Abs. 2 S. 11 EStG](https://www.gesetze-im-internet.de/estg/__8.html) |

### Erweiterung — real, aber seltener oder ohne belastbare Quote

| Bestandteil | Periodizität | Fest? | Beleg |
|---|---|---|---|
| **Essenszuschuss / Sachbezugswerte** (2026: Verpflegung 345 €/Monat, Mittag 137 €) | monatlich, arbeitstagabhängig → leicht schwankend | Rhythmus ja | [§ 2 SvEV](https://www.gesetze-im-internet.de/svev/__2.html) · [§ 40 Abs. 2 EStG](https://www.gesetze-im-internet.de/estg/__40.html) |
| **Fahrtkostenzuschuss (Pkw)** | monatlich, konstant | ja | [§ 40 Abs. 2 S. 2 EStG](https://www.gesetze-im-internet.de/estg/__40.html) |
| **Internet-/Telekommunikationszuschuss** | monatlich, konstant | ja | [§ 40 Abs. 2 Nr. 5 EStG](https://www.gesetze-im-internet.de/estg/__40.html) |
| **Rufbereitschaft / Bereitschaftsdienst** (TVöD: 2× bzw. 4× Stundenentgelt/Tag) | monatlich, **stark schwankend** | Rhythmus ja | [TVöD § 8](https://www.der-oeffentliche-sektor.de/tvoed_paragraf_8) · [BVA-Merkblatt](https://www.bva.bund.de/SharedDocs/Downloads/DE/Bundesbedienstete/Arbeit-Beruf/Bezuege/Entgelt/unstaendige_Bezuege_Entgelt/Merkblatt-Rufbereitschaft.html) |
| **Erschwerniszulage** (TVöD § 19: 5–15 %) | monatlich, schwankend | Rhythmus ja | [TVöD § 19](https://www.der-oeffentliche-sektor.de/tvoed_paragraf_19) |
| **Mitarbeiterbeteiligung / Aktien** (2.000 €/Jahr Freibetrag) | jährlich oder unregelmäßig | **nein, frei** | [§ 3 Nr. 39 EStG](https://www.gesetze-im-internet.de/estg/__3.html) · [IAB: ~2 % der Betriebe](https://www.boeckler.de/fpdf/HBS-005416/mbf_bvd_gewinn_und_erfolgsbeteiligung.pdf) |
| **Trinkgeld** (vollständig steuerfrei, unbegrenzt) | monatlich, **stark schwankend** | nein | [§ 3 Nr. 51 EStG](https://www.gesetze-im-internet.de/estg/__3.html) |
| **Kinder-/Familienzuschlag** | monatlich, konstant | ja | ⚠️ im TVöD **nicht mehr existent**, nur noch Besitzstandszulage für BAT-Altfälle ([TVÜ-Bund, BMI](https://www.bmi.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/themen/oeffentlicher-dienst/tarifvertraege/tvue-bund.pdf?__blob=publicationFile&v=25)); echter Familienzuschlag nur in der Beamtenbesoldung |

### Zwei Negativbefunde — gehören NICHT in den Katalog

**Inflationsausgleichsprämie.** § 3 Nr. 11c EStG steht noch im Gesetzestext, trägt aber
die Befristung „26. Oktober 2022 bis zum 31. Dezember 2024" **im Wortlaut selbst**. Keine
Verlängerung; Zahlungen ab 2025 sind normaler Arbeitslohn. Für 2026 nur historisch
relevant. ([§ 3 Nr. 11c EStG](https://www.gesetze-im-internet.de/estg/__3.html) ·
[BMF-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/2022-12-07-FAQ-Inflationsausgleichspraemie.html))
Als Kalibrierungspunkt bleibt sie lehrreich: **86,3 %** der Tarifbeschäftigten haben sie
bekommen, Ø 2.680 €
([Destatis PM 023/2025](https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/01/PD25_023_622.html))
— mehr als Weihnachts- und Urlaubsgeld je erreicht haben.

**Homeoffice-Pauschale.** Kein Gehaltsbestandteil. § 4 Abs. 5 S. 1 Nr. 6c EStG ist ein
**Werbungskostenabzug in der Steuererklärung des Arbeitnehmers**, taucht auf keiner
Abrechnung auf. Ein AG-Zuschuss fürs Homeoffice ist entweder Internetzuschuss oder
normaler Lohn.

### Der eigentliche Periodizitätsbefund: drei Muster, nicht zwei

Die zentrale Unterscheidung ist **nicht** „monatlich vs. jährlich", sondern
**„Rhythmus fest vs. Betrag fest"**. Ein Modell mit nur `type: monthly|annual` bildet das
mittlere Muster nicht ab:

1. **Rhythmus und Betrag fest** — VL, Schichtzulage-Pauschale, Dienstwagen, Jobticket,
   Sachbezug, bAV, Fahrtkosten-/Internetzuschuss. Bei der 50-€-Freigrenze ist die
   Konstanz sogar erzwungen: ein Cent darüber, und der gesamte Betrag kippt.
2. **Rhythmus fest, Betrag schwankend** — alle Zuschläge (Nacht, Sonntag, Erschwernis),
   Rufbereitschaft, Essenszuschuss, Trinkgeld. Kommen zuverlässig jeden Monat, in
   wechselnder Höhe. Für eine Planungs-App ist hier ein **Durchschnittswert** die
   richtige Eingabe — dieselbe Entscheidung, die die Karte für Mehrstunden schon
   getroffen hat.
3. **Frei variabel** — Bonus, Tantieme, Provision, Mitarbeiterbeteiligung, Prämien.
   Weder Rhythmus noch Betrag durch die Art bestimmt.

Weihnachts- und Urlaubsgeld sind ein Sonderfall: **Jährlichkeit fest, Auszahlungsmonat
verschieden** (TVöD-Jahressonderzahlung mit dem November-Entgelt, andere Tarife im
Dezember, Urlaubsgeld typischerweise Mai–Juli). Für diese Karte ohne Folge — der
Auszahlungsmonat liegt laut `map.md` ausdrücklich außerhalb des Ziels.

### Warum ein typisierter Katalog sachlich richtig ist (Randnotiz)

Drei Bestandteile müssen aus rein steuerlichem Grund **getrennt** geführt werden und
dürfen nicht ins Grundgehalt eingerechnet werden: § 3b-Zuschläge (Steuerfreiheit nur bei
getrennter Ausweisung), die 50-€-Sachbezugsfreigrenze (Summierung über alle Sachbezüge
des Monats entscheidet) und der § 3 Nr. 39-Freibetrag. Das stützt die bereits getroffene
Entscheidung für einen festen Katalog statt eines Freitextfelds — ohne dass die App
selbst irgendetwas berechnen müsste.

### Datenvorbehalt TVöD

Die konkreten Prozentsätze der TVöD-Jahressonderzahlung (historisch 90/80/60 %, seit 2022
abgesenkte VKA-Werte 84,51/70,28/51,78 %) konnten am
[BMI-Volltext](https://www.bmi.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/themen/oeffentlicher-dienst/tarifvertraege/tvoed.pdf?__blob=publicationFile&v=8)
nicht verifiziert werden (Timeout). Alle übrigen TVöD-Werte (§ 8 Zeitzuschläge, § 19
Erschwernis, 105 €/40 € Schichtzulage) waren über mehrere Quellen konsistent. Relevant
nur, falls Vorbelegungswerte hinterlegt werden sollen.

---

## Teil 3 — Wie vergleichbare Werkzeuge eine zusammengesetzte Einnahme modellieren

### Firefly III — eigene Gruppen-Entität, Summe immer berechnet [QC]

Dreistufig: `transaction_groups` → n `transaction_journals` → 2n `transactions`
(doppelte Buchführung).

- `transaction_groups` trägt `id, user_id, title` und **kein Betragsfeld** —
  [Migration 2019_01_28](https://github.com/firefly-iii/firefly-iii/blob/main/database/migrations/2019_01_28_193833_changes_for_v4710.php),
  [`app/Models/TransactionGroup.php`](https://github.com/firefly-iii/firefly-iii/blob/main/app/Models/TransactionGroup.php)
  (`$fillable = ['user_id','user_group_id','title']`).
- `TransactionJournal` hat ebenfalls **kein** `amount`; der Betrag liegt ausschließlich
  auf `transactions` —
  [`Transaction.php`](https://github.com/firefly-iii/firefly-iii/blob/main/app/Models/Transaction.php).
- **Wahrheit für Summen: immer aus den Posten.**
  [`GroupCollector.php`](https://github.com/firefly-iii/firefly-iii/blob/main/app/Helpers/Collector/GroupCollector.php)
  startet mit `'sums' => []` (Z. 818) und addiert per `bcadd` je Währung (Z. 973–989).
  Laufzeitwert, nirgends persistiert. Auch die API liefert keine Gruppensumme —
  [`TransactionGroupTransformer.php`](https://github.com/firefly-iii/firefly-iii/blob/main/app/Transformers/TransactionGroupTransformer.php)
  gibt nur `id, …, group_title, transactions[], links` aus.
- **Darstellung: Summen-Kopfzeile + n Zeilen, gerahmt** —
  [`resources/views/list/groups.twig`](https://github.com/firefly-iii/firefly-iii/blob/main/resources/views/list/groups.twig)
  (`{% if group.count > 1 %}` → Kopfzeile mit `group.sums`, dann eine Zeile je Posten).
  Keine aufklappbare Zeile.
- **Plan-Ebene mit Bestandteilen: ja, eigene Tabelle.** `recurrences_transactions` ist
  1:n an `recurrence_id` mit eigenem `amount` je Posten
  ([Migration 2018_06_08](https://github.com/firefly-iii/firefly-iii/blob/main/database/migrations/2018_06_08_200526_changes_for_v475.php));
  `recurrences` selbst hat keinen Betrag. Beim Ausführen entsteht ab zwei Posten eine
  Split-Gruppe mit dem Wiederkehr-Titel —
  [`CreateRecurringTransactions.php`](https://github.com/firefly-iii/firefly-iii/blob/main/app/Jobs/CreateRecurringTransactions.php)
  Z. 288–310 (`if ($count > 1) { $groupTitle = $recurrence->title; }`).
- Die Doku nennt unseren Anwendungsfall wörtlich [DOC]:
  [„Likewise, your salary may have multiple components. Your base salary may be 1200. Plus 100 bonus. […] All that information is lost when you enter it using a singular, not split deposit."](https://docs.firefly-iii.org/explanation/financial-concepts/transactions/)
  Einschränkung ebendort: alle Splits einer Einnahme müssen **auf einem** Zielkonto
  landen.

### Actual Budget — Eltern-Kind auf einer Tabelle; Elternbetrag ist Invariante, Aggregate zählen die Kinder [QC]

- `transactions.isParent`, `.isChild`, `.parent_id` —
  [Migration `1608652596043_parent_field.sql`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/migrations/1608652596043_parent_field.sql).
  (Vorher war die Elternschaft im Kind-`id`-String kodiert: `<parent>/<uuid>`.)
- **Der Elternbetrag wird nicht berechnet, sondern geprüft.**
  [`shared/transactions.ts`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/shared/transactions.ts)
  Z. 97–111, `recalculateSplit()`: Summe der Kinder ≠ Elternbetrag ⇒
  `SplitTransactionError` am Datensatz. Doku bestätigt
  ([Split Transactions](https://actualbudget.org/docs/transactions/split-transactions/)).
- **Doppelzählung wird auf der Query-Ebene gelöst, nicht in den Daten.**
  [`aql/schema/executors.ts`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/aql/schema/executors.ts)
  kennt eine Tabellen-Option `splits` mit vier Werten (Default `inline`):
  `inline` → `WHERE is_parent = 0`; `none` → `WHERE parent_id IS NULL`; `grouped` →
  Eltern mit verschachtelten `subtransactions`; `all` → kein Filter. Und der Kommentar
  Z. 107–112 im Original:
  > „Aggregate queries don't make sense for a grouped transactions query. We never should
  > include both parent and children transactions as it would duplicate amounts and the
  > final number would never make sense."

  `isAggregateQuery()` erzwingt daraufhin `is_parent = 0` (Z. 116). **Für jede Summe
  zählen die Kinder, nie der Elternteil.** Zweite Absicherung: die View
  [`1608652596044_trans_views.sql`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/migrations/1608652596044_trans_views.sql)
  setzt `CASE WHEN t.isParent = 1 THEN NULL … AS category` — der Elternteil hat per
  Definition keine Kategorie und trifft Kategoriesummen ohnehin nie. Dasselbe Muster
  außerhalb von AQL in
  [`server/budget/base.ts`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/budget/base.ts)
  Z. 378 (`WHERE isChild=0`).
- **Darstellung: eine Zeile, Kinder darunter aufgeklappt** (entspricht `splits: 'grouped'`).
- **Plan-Ebene: nur indirekt.** Die Schedule-Tabellen kennen genau **einen** Betragspfad
  ([`1618975177358_schedules.sql`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/migrations/1618975177358_schedules.sql));
  der Split entsteht über die verknüpfte Regel-Aktion `set-split-amount`
  ([`transaction-rules.ts`](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/transactions/transaction-rules.ts)
  Z. 712, `trans.subtransactions` Z. 1143). Diese Verknüpfung ist aus Code plus zwei
  Doku-Seiten zusammengesetzt, nicht als ein Doku-Satz belegt [DOC-Lücke].

### YNAB — Kind-Entität am Elternobjekt, Elternbetrag gespeichert, Struktur unveränderlich [QC gegen OpenAPI]

Belastbarste Primärquelle ist die offizielle Spezifikation
[api.ynab.com/papi/open_api_spec.yaml](https://api.ynab.com/papi/open_api_spec.yaml)
(Serverquellcode nicht öffentlich).

- `TransactionDetail` trägt ein **required** `subtransactions: SubTransaction[]`;
  `SubTransactionBase` (required: `amount`, `deleted`, `id`, `transaction_id`) hat eigenes
  `amount`, `memo`, Payee und Kategorie.
- Der Elternteil hat sein **eigenes gespeichertes `amount`**, bei einem Split ist
  `category_id = null` und `category_name = 'Split'`. Kontosummen laufen über den
  Elternteil, Budgetsummen über die Kinder.
- **[?]** Eine explizite Regel „Summe der Subtransactions = Parent-Betrag" steht **nicht**
  in der Spec; die Hilfeseite ist clientseitig gerendert und war maschinell nicht
  auslesbar. Produktverhalten ja, belegt nein.
- **Härteste Design-Aussage der ganzen Recherche** — aus
  `SaveTransactionWithOptionalFields`: „Updating `subtransactions` on an existing split
  transaction is not supported and will return an error." Und: „If an existing transaction
  is a split, the `category_id` cannot be changed." **YNAB behandelt die Zusammensetzung
  als nach der Anlage unveränderlich.**
- **Plan-Ebene: vollwertig gespiegelt.** `ScheduledTransactionDetail` hat ein required
  `subtransactions: ScheduledSubTransaction[]` mit eigenem Schema
  `ScheduledSubTransactionBase`. Wiederkehrendes Einkommen mit Bestandteilen ist damit
  explizit modelliert — Plan- und Ist-Ebene strukturgleich, mit je eigener Entität.

### MoneyMoney — Splits existieren, Modell nicht öffentlich [DOC/?]

- Herstellerseite [moneymoney-app.com](https://moneymoney-app.com/): „Nutzen Sie
  Splitbuchungen, um Beträge auf mehrere Kategorien aufzuteilen."
- Die [Hilfe](https://moneymoney-app.com/help/) nennt Splitbuchungen genau einmal, und
  zwar für einen Nebenfall: „»Splitbuchung« »Aus Sammler splitten« […] eine
  Sammelüberweisung […] in ihre Einzelposten aufgelöst" — das ist **Zerlegung**, nicht
  Eltern-Kind-Hierarchie.
- Struktur, Aggregationswahrheit und Darstellung: **[?]** Closed Source, verschlüsseltes
  SQLite-Format. Auch die
  [AppleScript-Schnittstelle](https://moneymoney-app.com/applescript/) dokumentiert
  `export transactions`, `export categories`, `add transaction`, `set … category to …` —
  **kein Feld und kein Befehl für Splits**.
- **Plan-Ebene mit Bestandteilen: nicht belegbar.** Keine dokumentierte
  Plan-Einnahme-Entität; die Automatisierung besteht aus Kategorisierungsregeln.

### Finanzguru — Splits auf beiden Ebenen, aber keine Gehaltsaufgliederung [DOC]

- **Ist-Ebene:**
  [„Wie teile ich eine Buchung in mehrere Teile auf?"](https://hilfe.finanzguru.de/de/articles/1333634)
  — „Die »Teilbuchung 1« ist in der Gesamthöhe der Buchung vorgegeben. […] Nach dem Teilen
  werden dir die neuen Teilbuchungen als ungelesen im Verlauf des Kontos angezeigt. In der
  Buchung werden dir die Teilbuchungen ebenfalls angezeigt. Über »Teilbuchung auflösen«
  kannst du deine Änderung rückgängig machen." ⇒ Eltern-Kind mit materialisierten
  Kindzeilen **und** Aufstellung im Elternteil; umkehrbar. Gesamtbetrag ist Bezugsgröße,
  ob er gespeichert bleibt: **[?]**
- **Plan-Ebene:**
  [„Wie teile ich einen Vertrag in mehrere Teile auf?"](https://hilfe.finanzguru.de/de/articles/1346370)
  — ein Vertrag zerfällt in Teilverträge mit je eigenem Betrag und eigener Kategorie,
  **„Alle Teile des Vertrags haben denselben Turnus"**, und ein Teil kann als „Betrag ist
  variabel" markiert werden (Ausgleichsposten).
- **Gehalt ist ein Vertrag wie jeder andere:**
  [„Der bekannteste Vertrag ist der Gehaltsvertrag. Dieser bildet die Grundlage für deine Statistik, sowie für die Berechnung des verfügbaren Einkommens."](https://hilfe.finanzguru.de/de/articles/1346306)
  Eine **explizite Gehaltsaufgliederung mit benannten Bestandteilen existiert nicht** — es
  gibt nur den generischen Buchungs- und den generischen Vertrags-Split.
- **Der interessanteste Einzelfund:** derselbe Hilfeartikel endet mit „**Bitte beachte:
  Teilbuchungen können nicht in Verträgen enthalten sein.**" Wer eine Gehaltsbuchung
  nachträglich aufteilt, entzieht sie damit dem Gehaltsvertrag — und der Statistik. Die
  beiden Split-Mechanismen sind **alternativ, nicht additiv**. Die Zusammensetzung muss
  dort zwingend auf der Plan-Ebene modelliert werden.

### Quervergleich

| | Modellform | Wahrheit für Summen | Liste | Plan-Ebene mit Bestandteilen |
|---|---|---|---|---|
| **Firefly III** [QC] | eigene Entität `transaction_groups` | **immer aus den Posten** (`bcadd`, mehrwährungsfähig), nirgends gespeichert | Summenkopf + n Zeilen | **ja**, eigene Tabelle `recurrences_transactions` |
| **Actual** [QC] | Eltern-Kind auf **derselben** Tabelle | Elternbetrag gespeichert als **Invariante**; **Aggregate zählen die Kinder** (`is_parent = 0`) | eine Zeile, Kinder aufgeklappt; Query-Option `splits` | indirekt über Rules |
| **YNAB** [QC] | Kind-Entität `SubTransaction` am Elternobjekt | Elternbetrag gespeichert = Kontobewegung; Kinder tragen die Kategorien; Summenzwang **[?]** | eine Zeile, `category_name = 'Split'` | **ja**, `ScheduledSubTransaction` spiegelt 1:1 |
| **MoneyMoney** [DOC] | **[?]** | **[?]** | **[?]** | nein belegbar |
| **Finanzguru** [DOC] | Eltern-Kind, Kinder materialisiert | **[?]**, Gesamtbetrag ist Bezugsgröße | n Zeilen **und** Aufstellung im Elternteil | **ja** auf Vertragsebene, gemeinsamer Turnus; schließt Buchungs-Split aus |

### Drei Muster, die über alle Werkzeuge tragen

1. **Eine Gruppensumme wird nur dort gespeichert, wo der Elternteil ohnehin eine echte
   Kontobewegung ist.** Firefly hat gar keinen Elternteil mit Betrag und summiert deshalb
   immer. Actual und YNAB haben eine Elternzeile, die die Bewegung *ist* — dort ist der
   Betrag gespeichert, und der Split zerlegt nur die Kategorisierung.
2. **Die Doppelzählung wird auf der Query-Ebene gelöst, nicht auf der Datenebene.** Actual
   formuliert das am schärfsten: vier Split-Semantiken und ein Zwang auf `is_parent = 0`
   für jedes Aggregat.
3. **Die Plan-Ebene ist überall dünner als die Ist-Ebene — außer bei YNAB und Firefly**,
   die beide eine eigene Bestandteils-Entität auf der Vorlagen-Ebene haben.

---

## Empfehlung

### Katalog (speist Ticket 03)

**Kern — belegt häufig, klare Periodizität:**
Grundgehalt · Urlaubsgeld · Weihnachtsgeld/Jahressonderzahlung · Mehrstunden ·
Nachtzuschlag · Sonntags-/Feiertagszuschlag · Schicht-/Wechselschichtzulage ·
Vermögenswirksame Leistungen · Bonus/Prämie · Provision · Dienstwagen (geldwerter
Vorteil) · Jobticket/Deutschlandticket · Sachbezug.

**Erweiterung — einblendbar, falls die Maske sonst zu lang wird:**
bAV-Entgeltumwandlung (+ AG-Zuschuss) · Essenszuschuss · Fahrtkostenzuschuss ·
Internetzuschuss · Rufbereitschaft · Erschwerniszulage · Mitarbeiterbeteiligung ·
Trinkgeld.

**Nicht aufnehmen:** Inflationsausgleichsprämie (ausgelaufen 31.12.2024),
Homeoffice-Pauschale (Werbungskosten, kein Gehaltsbestandteil), Kinder-/Familienzuschlag
(im Tarifrecht nur noch Altfall-Besitzstand).

**Plus „Sonstiges" mit freier Bezeichnung und frei wählbarer Periodizität.** Der Katalog
wird nie vollständig, und die Recherche zeigt genau, warum: die Verbreitungsdaten enden
dort, wo die Vielfalt anfängt.

**Zur Frage „bringt eine Art ihre Periodizität mit?" (03.3):** ja, aber als
**Vorbelegung, nicht als Zwang** — mit einer Ausnahme. Weihnachts-/Urlaubsgeld sind
belegbar immer jährlich, Grundgehalt/VL/Sachbezug/Dienstwagen immer monatlich; dort ist
Erzwingen vertretbar. Bonus, Provision und Mitarbeiterbeteiligung sind belegbar **frei
variabel** und dürfen es nicht sein. Wer eine einheitliche Regel will, nimmt
„vorbelegen und änderbar lassen" — das ist billiger als zwei Klassen von Arten.

**Zur Frage „darf eine Art mehrfach vorkommen?" (03.4):** ja. Zwei Zulagen, zwei
Sachbezüge, Provision aus zwei Produktlinien sind alltäglich; jeder Bestandteil braucht
daher eine eigene Bezeichnung neben der Art.

**Zur Frage „negative Beträge?" (03.5):** ja, aber nur wenn bAV-Entgeltumwandlung oder
Jobrad-Leasing in den Katalog sollen. Ohne diese beiden reicht `amount.positive()`. Das
ist eine Katalogentscheidung, keine Validierungsentscheidung — sie fällt in 03, nicht in 02.

### Modellierungsmuster (Vergleichspunkte für Ticket 02)

Der Vergleich stützt **Gestalt A (eigene Tabellen)** aus Ticket 02, und zwar aus dem
Grund, den Muster 1 oben benennt: eine gespeicherte Elternsumme rechtfertigt sich nur,
wenn der Elternteil eine **eigene echte Bewegung** ist. Ein geplantes Gehalt in
`income_sources` ist das nicht — es ist reine Klammer. Deshalb:

- **Wahrheit für Aggregationen: die Posten, nicht die Summe** — wie Firefly III. Die
  Summe am Gehalt ist ein Laufzeitwert. Actual/YNAB speichern sie, aber nur weil ihr
  Elternteil die Bewegung ist; dieser Grund fehlt hier.
- **Die `/12`-Umrechnung gehört auf den Posten**, nicht auf die Klammer — das ist die
  Konsequenz daraus, dass jeder Bestandteil eine eigene Periodizität trägt, und der Punkt,
  an dem Finanzgurus Einschränkung „alle Teile eines Vertrags haben denselben Turnus"
  bewusst *nicht* übernommen wird.
- **Doppelzählung ist ein Query-Problem, kein Schema-Problem** (Muster 2). Bei Gestalt A
  entsteht sie gar nicht erst — genau das ist ihr Vorteil gegenüber B, wo jede der
  bestehenden Abfragen in `summary.ts`, `stats.ts`, `export.ts` und MCP das Actual-Äquivalent
  von `WHERE is_parent = 0` lernen müsste. Actual braucht dafür vier Split-Semantiken und
  einen expliziten Zwang im Query-Executor; das ist der Preis von Gestalt B.
- **Darstellung: eine aufklappbare Zeile** (Actual/YNAB), nicht n Zeilen mit Summenkopf
  (Firefly). Das deckt sich mit dem Kartenziel („erscheint als **eine** aufklappbare
  Zeile").
- **YNABs Unveränderlichkeit nicht übernehmen.** Sie ist eine Folge davon, dass die
  Elternzeile eine gebuchte Kontobewegung ist. Eine Plan-Einnahme hat diesen Zwang nicht,
  und ein Gehalt, dessen Zulage sich nicht ändern lässt, wäre in einer Planungs-App
  unbrauchbar.
