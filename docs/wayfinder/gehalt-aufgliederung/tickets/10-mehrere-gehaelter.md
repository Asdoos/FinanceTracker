# 10 · Wie viele Gehälter gleichzeitig, und was passiert beim Jobwechsel?

Type: grilling
Status: resolved
Assignee: Anri
Blocked by: 02, 05
Speist: 11 (v8 unverändert), 13 (Vorlagenweg), 14 (inaktive Blöcke)
Gespeist von: 09 — **entschieden, nicht mehr offen:** *wie* mehrere Gehälter aussehen,
falls es sie gibt (Blöcke nach Summe absteigend, das erste offen, alle weiteren
zugeklappt). Ob es sie geben darf und wie eines endet, ist weiter die Frage dieses
Tickets.

## Question

Aus dem Nebel graduiert, nachdem 05 die Frage scharf gemacht hat: die Antwort auf
Frage 2 („kein eigenes Konto je Bestandteil") verweist den Fall „Weihnachtsgeld landet
auf einem anderen Konto" ausdrücklich auf ein **zweites Gehalt beim selben
Arbeitgeber**. Damit ist „mehrere Gehälter gleichzeitig" keine Randfrage mehr, sondern
ein eingeplanter Ausweg — und ungeklärt.

1. **Mehrere aktive Gehälter erlaubt?** Nebenjob, zweites Gehalt desselben Arbeitgebers
   auf anderem Konto, Jobwechsel mit Überlappung. Gibt es eine Obergrenze oder eine
   Eindeutigkeitsregel (etwa Arbeitgeber + Konto)? 03 hat für Bestandteilsarten bewusst
   *keine* Eindeutigkeitsregel gesetzt — gilt hier dasselbe?
2. **Wie endet ein Gehalt?** `salaries.is_active = false` (02), löschen, oder ein
   `end_date` wie bei `expense_items`? Die drei bedeuten Verschiedenes: inaktiv heißt
   „zählt nicht mehr, steht noch da", `end_date` heißt „zählt bis zu einem Datum".
   Hängt daran, ob die Statistik je rückblickend über Gehälter auswerten soll.
3. **Was zeigt die Oberfläche bei zwei Gehältern?** Das Ziel verlangt *eine*
   aufklappbare Zeile **je Gehalt** — bei zwei Gehältern zwei Zeilen. Braucht die
   Einnahmen-Seite dann eine Ordnung oder Gruppierung, oder reicht die bestehende
   Sortierung?
4. **Berührt das die Aggregation?** Der Baustein aus 02/05 summiert Bestandteile über
   das Gehalt; bei mehreren Gehältern summiert er über alle sichtbaren. Hier nur
   bestätigen, dass daran nichts zu ändern ist.

Erwartetes Ergebnis: entschieden, ob und wie viele Gehälter koexistieren, wie ein
Gehalt endet, und was das für Liste und Aggregation heißt.

---

## Antwort

### Zwei Fakten vorab

- **`end_date` gibt es nur an `expense_items`** (`server/db/sqlite.ts:53`), nicht an
  `income_sources`. Die Einnahmenseite kennt heute ausschließlich `is_active`.
- **Die Statistik wertet Planwerte nie rückblickend aus.** Die Monatsreihen kommen aus
  `transactions`; Planwerte gehen nur als „Stand heute" ein (`stats.ts:133`, `:223`).

### 1. Beliebig viele, keine Eindeutigkeitsregel

Nebenjob, zweites Gehalt desselben Arbeitgebers auf einem anderen Konto (der in 05
eingeplante Ausweg für „Weihnachtsgeld landet woanders") und Jobwechsel mit Überlappung
sind **derselbe Fall** und brauchen keinen eigenen Zweig. Dieselbe Begründung wie in 03
für Mehrfachvorkommen von Bestandteilsarten: zwei versehentlich doppelte Gehälter sind
harmloser, sofort sichtbarer Unsinn — zwei Blöcke untereinander, doppelte Summe im
Dashboard.

Verworfen: **eindeutig je Arbeitgeber + Konto**, weil der Arbeitgeber damit zum
Schlüssel würde. „Musterfirma GmbH" und „Musterfirma" sind zwei verschiedene — die
Regel greift genau dann nicht, wenn sie soll, und steht beim Vertragswechsel innerhalb
desselben Arbeitgebers im Weg. **Genau eines aktiv** wäre ein Rückzug aus 05.

### 2. Ein Gehalt endet über `is_active` — kein `end_date`

Löschen bleibt für „war ein Irrtum", inaktiv für „war mal so". Beides existiert bereits
(02). Drei Gründe gegen das Enddatum:

1. **Asymmetrie mit hohem Preis.** Ein `end_date` am Gehalt, aber keines an der
   gewöhnlichen Einnahme daneben, müsste **jede** Aggregationsstelle einzeln lernen —
   `summary.ts`, `stats.ts` zweimal, `export.ts`, MCP. Ein vergessener Zusatzfilter
   zählt still zu viel. Genau das Scheitern-Kriterium aus 02.
2. **Kein Gegenwert.** Weil Planwerte nie rückblickend ausgewertet werden, bringt ein
   Enddatum keine einzige neue Auswertung — nur die Automatik, am Stichtag nicht daran
   denken zu müssen.
3. **`end_date` für beide Tabellen** wäre die konsistente Auflösung, ist aber eine
   Änderung an einer bestehenden, unabhängigen Tabelle samt Route, Formular, MCP-Werkzeug
   und Export — ein eigenes Vorhaben, das diese Karte nur mitschleppen würde.

**Damit bleibt Migration Version 8 aus [11](./11-umsetzung-schema.md) unverändert**, und
die Blockade von 11 durch dieses Ticket ist aufgelöst.

**Akzeptierter Preis:** im Überlappungsmonat zählen zwei aktive Gehälter beide voll, bis
das alte von Hand abgeschaltet wird. Das ist derselbe Umgang, den `income_sources` heute
verlangt, und keine neue Unbequemlichkeit.

### 3. Inaktive Gehälter bleiben in der Liste

Gedämpft dargestellt wie inaktive Einnahmenzeilen; der bestehende Seitenfilter
„Alle / Nur aktive / Nur inaktive" greift auf Blöcke genauso wie auf die Tabelle
darunter. Kein neuer Mechanismus — und der Filter, den es schon gibt, bleibt für die
ganze Seite wahr. Ein inaktiver Block steht in der Sortierung nach Summe, trägt aber
0 € zu jeder Summe bei. Verworfen: „gar nicht in der Liste", weil das Wiedereinschalten
dann keinen Weg mehr hätte.

### 4. An der Aggregation ändert sich nichts

Bestätigt: der Baustein aus 02/05 summiert Bestandteile über alle sichtbaren Gehälter;
ein Posten zählt nur, wenn **Gehalt und Posten** aktiv sind (zweistufiges `is_active`,
02). `itemCount` (07) zählt je Gehalt eins, bei n Gehältern also n.

### 5. Vorlagenweg beim Jobwechsel (neu, nicht im Ticket gefragt)

08 konnte die Frage nicht stellen, weil dieses Ticket damals offen war. Entschieden:
am Block ein Eintrag **„Als Vorlage für ein neues Gehalt"** → `/income/gehalt/neu?vorlage=<id>`.
Der Editor startet mit denselben Posten **samt Beträgen**, der Arbeitgeber bleibt leer.

Das kostet **kein Backend**: der Editor lädt das Quellgehalt und legt beim Speichern ein
neues an — ein Punkt mehr in [13](./13-umsetzung-editor.md), null Änderung an
[12](./12-umsetzung-routen-mcp.md). Nur die Struktur ohne Beträge zu übernehmen wurde
verworfen: VL, Jobrad und Zuschüsse bleiben beim Wechsel meist gleich.
