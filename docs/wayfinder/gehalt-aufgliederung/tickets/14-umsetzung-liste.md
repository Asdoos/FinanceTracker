# 14 · Umsetzung: Einnahmen-Liste, Dashboard und Statistik

Type: task
Status: open
Blocked by: 12, 13, 15

## Question

Kein Entscheidungsticket — die Gestalt steht in [09 · Darstellung](./09-darstellung.md)
(Variante B, der eigene Block). Aus dem Nebel „Umsetzung Frontend, Rest" graduiert,
nachdem 09 ihn scharf gemacht hat.

**Warum blockiert:** von 12, weil die Seite die Daten aus `GET /api/summary` bzw.
`/api/salaries` braucht; von 13, weil der Bearbeiten-Weg auf `/income/gehalt/:id`
zeigt und diese Route dort entsteht. **12 und 13 stehen** — der Weg in den Editor ist
`/income/gehalt/neu` bzw. `/income/gehalt/:id`, und `?vorlage=<id>` ist der Vorlagenweg.

**Neu blockiert von [15](./15-betrag-schwankt.md).** Die Statistik-Achse „fest vs.
schwankend" aus 09 ist die eine neue Auswertung dieses Tickets — und ob `betragSchwankt`
eine **Spalte** ist oder aus dem Katalog **abgeleitet** wird, ist offen (die Spalte fehlt,
und zwar aus Versehen). Vorher gebaut, entsteht die Achse zweimal.

Der Prototyp liegt auf `prototype/gehalt-darstellung-09` (`VarianteB`). Er ist
Wegwerfcode — Vorlage, keine Übernahme; unter anderem deckt er nur die Desktop-Tabelle
ab, die Kartenliste für Mobil fehlt.

### Umfang

1. **`src/pages/Income.tsx`** — über der Tabelle ein Block je Gehalt: Arbeitgeber,
   Kontochip, Monatssumme groß, Bestandteile zweispaltig. Bei mehreren Gehältern nach
   Summe absteigend; **das erste offen, alle weiteren zugeklappt** (Kopfzeile mit
   Arbeitgeber und Summe). Dazu der Knopf „Gehalt anlegen" → `/income/gehalt/neu`, und
   Bearbeiten am Block → `/income/gehalt/:id` (13).
2. **Mobil** — dieselbe Ordnung als Karte, der Prototyp lässt das offen.
   **Inaktive Gehälter** (10) erscheinen gedämpft wie inaktive Einnahmenzeilen, und der
   bestehende Filter „Alle / Nur aktive / Nur inaktive" greift auf Blöcke genauso wie
   auf die Tabelle. Am Block außerdem der Eintrag „Als Vorlage für ein neues Gehalt"
   → `/income/gehalt/neu?vorlage=<id>` (10, umgesetzt in 13).
3. **Anzeigename eines Postens**: `label ?? Katalogname ?? roher Schlüssel` (03, 06).
   Marken für `betragSchwankt` und `annual` an der Zeile, Abzüge mit Minus und in Rot.
4. **Dashboard: nichts.** Ausdrücklich kein Gehaltsblock — das Gehalt steckt in den
   Summen, die 12 bereits füllt. Dieser Punkt steht hier, damit „vergessen" und
   „entschieden" unterscheidbar bleiben.
5. **`src/pages/Statistics.tsx`** — eine neue Achse **fest vs. schwankend** aus
   `betragSchwankt`, gespeist aus `/api/stats`. Nur diese eine; die Bestandteilsart
   wird keine Dimension (09.3). Ob `/api/stats` dafür ein Feld nachreichen muss, fällt
   beim Bauen — der Rest von `stats.ts` ist in 12 erledigt.
6. **Kalender: nichts** (09.5).

### Erwartetes Ergebnis

Ein angelegtes Gehalt erscheint als Block auf der Einnahmen-Seite, im Raum seines
Kontos, und die Statistik zeigt den festen gegen den schwankenden Anteil;
`npm run lint` und `npm run build` sind grün.
