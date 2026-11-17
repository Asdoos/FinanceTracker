# 09 · Wie erscheint das Gehalt in Liste, Dashboard und Statistik?

Type: prototype
Status: resolved
Assignee: Anri
Blocked by: 02
Speist: 10 (Mehrfachdarstellung entschieden), 14 (Umsetzung Liste, Dashboard, Statistik)
Gespeist von: 06 — **Auflage, keine offene Frage:** `kind` trägt bewusst keinen
DB-`CHECK` (der Katalog lebt im Code und soll wachsen). Ein unbekannter Katalogschlüssel
ist damit möglich und die Anzeige muss ihn **auf den rohen Schlüssel zurückfallen
lassen statt abzustürzen**.

## Question

Skill: `/prototype`. Das Ziel verlangt **eine** aufklappbare Zeile — was das an drei
Stellen heißt, ist offen.

1. **Einnahmen-Seite (`src/pages/Income.tsx`)** — Summenzeile mit Aufklapp-Pfeil.
   Standardmäßig zu oder auf? Wie sortiert sie sich zwischen gewöhnlichen Einnahmen
   ein — nach Betrag der Summe?
2. **Dashboard (`src/pages/Dashboard.tsx`, aus `GET /api/summary`)** — ein Posten
   „Gehalt 4.200 €" oder vier Posten? Ein Posten ist der Sinn der Klammer; vier
   Posten zeigen mehr. Beides gleichzeitig zählt doppelt.
3. **Statistik und Kategorien** — Einnahmen tragen heute keine Kategorie. Wird die
   Bestandteilsart zu einer Auswertungsdimension („wie viel meines Einkommens ist
   variabel?"), oder bleibt die Statistik unberührt?
4. **Raum-Prinzip** — das Gehalt hängt an einem Konto und damit an einem Raum
   (`CLAUDE.md`, „Gemeinschaftskonten im Frontend"). Erscheint es im persönlichen Raum,
   im Gemeinschaftsraum, oder je nach Konto? Der Abschnitt „Über alle Räume" ist
   **nicht** der richtige Ort — das Gehalt hat sehr wohl eine raumgebundene Bezugsgröße.
5. **Kalender** — der mischt bewusst alle Räume und zeigt Buchungen, keine Planwerte.
   Vermutlich unberührt; kurz bestätigen statt annehmen.

Der Prototyp wird als Anlage neben diesem Ticket abgelegt und von hier verlinkt.

---

## Anlage · Prototyp

Drei Varianten der Einnahmen-Liste auf `/income?variant=A|B|C`, Branch
`prototype/gehalt-darstellung-09` (`src/pages/prototype/GehaltListePrototyp.tsx`).
Das Gehalt ist erfunden und enthält absichtlich einen schwankenden Posten, einen
jährlichen, einen Abzug und den **unbekannten Katalogschlüssel** `praemie_neu`, damit
der Rückfall aus 06 im echten Layout zu sehen ist.

| | Einordnung | Standardzustand | Aufriss |
|---|---|---|---|
| **A** | einsortiert nach Summe | zu | eingerückte Unterzeilen |
| **B** | eigener Block über der Liste | immer offen | zweispaltig im Block |
| **C** | einsortiert nach Summe | zu, mit Balken | Seitenpanel rechts |

---

## Antwort

**Variante B: das Gehalt ist kein Listeneintrag, sondern ein eigener Block über der
Einnahmenliste.**

### 1. Einnahmen-Seite

Der Block trägt Arbeitgeber, Kontochip, die Monatssumme groß rechts und die
Bestandteile zweispaltig darunter — **immer offen**, kein Aufklappen im Normalfall.
Darunter, unverändert, die Tabelle der gewöhnlichen Einnahmen.

Damit ist die Frage nach der Einsortierung **weggefallen statt beantwortet**: eine
Aufklappzeile (A) hätte sich nach ihrer Summe einsortieren müssen und wäre beim
Aufklappen mitten durch die Liste gewachsen; das Gehalt wäre optisch eine Einnahme
unter vielen gewesen, obwohl es eine Klammer über mehreren ist. C löste das Wachsen
über ein Seitenpanel, versteckte die Zusammensetzung damit aber hinter einem Klick —
gegen den Zweck der Karte. B zahlt dafür mit zwei Orten auf einer Seite; das ist der
akzeptierte Preis.

**Bei mehreren Gehältern stapeln sich die Blöcke, ab dem zweiten zugeklappt.** Das
größte Gehalt steht offen, weitere erscheinen als zugeklappte Kopfzeile (Arbeitgeber +
Summe) und lassen sich aufklappen. Der Normalfall — ein Gehalt — bleibt unberührt, und
zwei Gehälter mit je sechs Posten schieben die Einnahmenliste nicht aus dem Bild.
Dass es überhaupt mehrere geben *darf* und wie eines endet, bleibt Sache von
[10](./10-mehrere-gehaelter.md); hier steht nur, wie sie aussehen.

### 2. Dashboard — die Frage war fehlgestellt

Dieselbe Sorte Fund wie in 07: **das Dashboard listet heute überhaupt keine
Einnahmen.** Es zeigt die KPI „Monatliche Einnahmen" und je Konto eine Zahl
(`Dashboard.tsx:129`, `:322`). „Ein Posten oder vier Posten" existiert dort nicht.

Entschieden ist deshalb die eigentliche Frage: **das Dashboard bekommt keinen
Gehaltsblock.** Das Gehalt fließt ausschließlich in die Summen ein, die 07 bereits
festgelegt hat (`totalMonthlyIncome`, `rest`, `monthlyIncome` je Konto). Ein zweiter
Anzeigeort hätte die Klammer an zwei Stellen zu pflegen — und genau dort, wo 07 die
Bestandteile bewusst *zusammengerechnet* hat, wieder zerlegt. Die Aufgliederung hat
einen Ort: die Einnahmen-Seite.

Die flache Liste `salaries` in `GET /api/summary` (07) bleibt trotzdem richtig — sie
speist die Einnahmen-Seite, nicht das Dashboard.

### 3. Statistik — eine Achse, nicht mehr

Neu ist **fest vs. schwankend** aus `betragSchwankt`, nichts weiter. Das ist die
Auswertung, für die 03 das Merkmal eingeführt hat, und die einzige Achse, die
Einnahmen überhaupt haben — sie tragen keine Kategorie. Die Bestandteils*art* wird
**keine** Auswertungsdimension: fünfzehn Schlüssel als Pseudo-Kategorien neben den
echten Kategorien der Ausgaben wären eine zweite, unverbundene Taxonomie in derselben
Ansicht.

### 4. Raum — keine Sonderregel

Das Gehalt erscheint im Raum seines Kontos, weil `salaries.account_id` `NOT NULL` ist
(05). Kein Eintrag im Abschnitt „Über alle Räume": das Gehalt hat eine raumgebundene
Bezugsgröße, anders als Freistellungsauftrag und Zinssatz.

### 5. Kalender — unberührt

Bestätigt statt angenommen: der Kalender zeigt Buchungen aus `transactions`, das
Gehalt ist ein Planwert. Er mischt zwar alle Räume, aber es gibt nichts zu mischen.

### Nachtrag zum Ziel der Karte

Das Ziel spricht von „**eine** aufklappbare Zeile in Einnahmen und Dashboard". Beides
stimmt nach dieser Entscheidung nicht mehr wörtlich: es ist ein **Block** statt einer
Zeile, und im Dashboard erscheint sie **gar nicht**. Die Absicht dahinter — das Gehalt
tritt als eine Einheit auf, nicht als n Einnahmen — ist unverändert erfüllt. Der
Zielsatz auf der Karte ist entsprechend nachgezogen; das ist eine Schärfung der
Formulierung, keine Verschiebung des Ziels.
