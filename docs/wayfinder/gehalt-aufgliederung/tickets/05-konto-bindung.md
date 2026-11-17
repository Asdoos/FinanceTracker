# 05 · Konto-Bindung, Sichtbarkeit und Schreibrecht des Gehalts

Type: grilling
Status: resolved
Blocked by: 02
Speist: 06 (Migration/Kaskade), 07 (API und MCP), 08 (Eingabemaske)

## Question

**Vor der Sitzung `CLAUDE.md`, Abschnitt „Sichtbarkeit und Schreibrecht", sowie
`server/lib/visibility.ts` lesen.** Die Sichtbarkeit hängt ausschließlich am Konto,
nicht am Nutzer — ein neues Konstrukt, das das verletzt, ist ein Datenleck.

1. **Hängt das Gehalt an einem Konto?** `income_sources` verlangt heute eine
   `account_id`. Für Gehalt naheliegend dasselbe — dann greift `accountIn` unverändert.
2. **Erben Bestandteile das Konto des Gehalts, oder tragen sie ein eigenes?** Eigenes
   Konto je Bestandteil wäre denkbar (Weihnachtsgeld aufs Gemeinschaftskonto), macht
   aber die Klammer löchrig und die Aggregation raumübergreifend.
3. **Wie lautet das Sichtbarkeitsprädikat der Bestandteilstabelle?** Über die eigene
   `account_id` oder über den Join aufs Gehalt? Ein Join ist eine Stelle mehr, an der
   das Prädikat vergessen werden kann.
4. **Was heißt das im Gemeinschaftsraum?** Ein Gehalt auf einem Gemeinschaftskonto
   sieht der Partner samt Bestandteilen — inklusive Grundgehalt. Ist das gewollt, oder
   braucht es hier eine Grenze? Falls eine Grenze: sie widerspricht dem Prinzip
   „Sichtbarkeit ist das Konto" und muss eigens begründet sein.
5. **Wer darf ändern?** Nach dem bestehenden Muster darf jedes Mitglied die Zeilen des
   anderen ändern; `created_by` trägt nur die Urheberschaft. Gilt das auch hier?
6. **Zieht das Gehalt einen Raumwechsel nach sich?** Die Einnahmen-Seite und das
   Dashboard filtern nach Raum — ein Gehalt gehört genau einem Raum an, seine
   Bestandteile müssen mitwandern.

## Answer

**Der Kern: dieses Ticket fügt dem System kein neues Sichtbarkeitskonstrukt hinzu.**
Es ordnet das Gehalt dem bestehenden unter. Der einzige technische Zuwachs ist ein
Baustein plus ein Guard (Frage 3); die einzigen echten Neuheiten sind zwei
Oberflächenregeln (Fragen 4 und 6), die nicht das Modell schützen, sondern den Nutzer
vor unbeabsichtigter Offenlegung. Sie stehen absichtlich hier und nicht in 08, weil
sie aus dem Sichtbarkeitsmodell folgen und nicht aus dem Formularentwurf.

### 1 · `salaries.account_id` ist `NOT NULL`

Wie jede kontogebundene Tabelle; `accountIn("s.account_id", acc.all)` greift
unverändert. **Kein `NULL`-Zweig.** Der hybride Zweig bei `categories` und `goals` ist
erkauft, weil eine Kategorie kontoübergreifend gilt („Wohnen" für alle meine Konten).
Ein Gehalt gilt nicht kontoübergreifend — das Geld landet auf genau einem Konto. Der
`NULL`-Zweig hätte hier keinen Gegenwert, nur seinen Preis: einen zweiten
Sichtbarkeitsschlüssel, den `server/lib/visibility.ts` in seinem Kopfkommentar
ausdrücklich als Leck beschreibt.

Der Fall „Gehalt planen, bevor das Zielkonto existiert" wurde geprüft und ist keiner.

### 2 · Kein eigenes Konto je Bestandteil

Ein Gehalt liegt in genau **einem** Raum. Der Grund ist nicht Bauaufwand, sondern das
Ziel der Karte: es verlangt *eine* aufklappbare Zeile, und Einnahmen wie Dashboard sind
nach Raum gefiltert (`?raum=<id>`). Ein Gehalt mit Bestandteilen in zwei Räumen hat
keine Zeile, sondern zwei halbe — und die aufgeklappte Summe zeigt je Raum einen
anderen Wert als die zugeklappte. Genau die Sorte Zahl, die man falsch liest.

**Bewusst in Kauf genommen:** „Weihnachtsgeld landet real aufs Gemeinschaftskonto"
lässt sich in dieser Karte nicht ausdrücken, ohne die Klammer zu verlassen — es ist
dann ein zweites Gehalt oder eine gewöhnliche `income_sources`-Zeile. Der Geldfluss ist
ohnehin nicht Thema: monatsgenaue Fälligkeit steht in **Out of scope**.

### 3 · Prädikat über den Join — aber gebündelt, plus dritter Guard

`salary_components` trägt **keine** `account_id`. Das Prädikat lautet

```
FROM salary_components c JOIN salaries s ON s.id = c.salary_id
WHERE ${accountIn("s.account_id", acc.all)}
```

und steht **nie handgeschrieben** in einer Route, sondern ausschließlich in dem
Baustein, den 02 schon beschlossen hat: `server/lib/salary.ts`, in der Rolle von
`EXCLUDE_TRANSFERS_SQL`. Sichtbarkeit und Summenlogik im gleichen Fragment ist kein
Zufall — beide sind Eigenschaften „des Gehalts als Ganzem".

Entschieden wurde über das Scheitern-Verhalten der Alternativen:

- **Kopie `account_id` am Bestandteil** scheitert **still**: eine Kopie ist ein zweiter
  Ort für eine Tatsache. Wechselt das Gehalt das Konto (Frage 6) und die Kinder werden
  nicht mitgezogen, liefert das Prädikat weiter Zeilen — Leck ohne Fehlermeldung. Das
  verstößt gegen die Regel „eine Tatsache, ein Ort" aus 03.
- **Handgeschriebener Join** scheitert an jeder vergessenen Stelle, und 02 listet zehn
  Lesestellen. Ein vergessenes `WHERE` liefert *alle* Bestandteile aller Nutzer.

Deshalb ein **dritter ESLint-Guard** neben den beiden aus `CLAUDE.md`: rohes
`FROM salary_components` außerhalb `server/lib/salary.ts` ist ein Verstoß.
Falschpositive sind erwünscht; Ausnahmen als `eslint-disable-next-line` **mit
Begründung an der Fundstelle**, nicht in einer zentralen Liste. Der Guard ist wie die
anderen syntaktisch, nicht semantisch — er ersetzt kein Review, er verhindert das
Übersehen.

### 4 · Im Gemeinschaftsraum sieht der Partner alles — keine Grenze im Konto

Arbeitgeber, Grundgehalt, jeden Zuschlag, jede Stunde. Das ist gewollt.

Eine Maskierung „nur der Urheber sieht die Bestandteile" wäre **kein** Analogon zur
`masked`-Maskierung bei Übertragungen, sondern deren Umkehrung: dort wird ein Konto
maskiert, das der Anfragende **nicht sehen darf**, und Betrag, Datum, Label bleiben laut
`CLAUDE.md` immer vollständig. Hier würde der Inhalt eines Kontos maskiert, das er
sehen **darf**.

**Die Grenze existiert bereits — sie heißt Kontowahl.** Eine zweite Grenze *innerhalb*
des geteilten Raums würde die erste entwerten: „geteiltes Konto" hieße dann nicht mehr
verlässlich „geteilte Sicht", und ab da muss man bei jeder Zahl im Gemeinschaftsraum
fragen, ob sie vollständig ist.

**Was daraus für die Oberfläche folgt** (Umsetzung → 08):

- Die Kontoauswahl im Gehaltsformular ist auf das **persönliche Standardkonto**
  vorbelegt — *nicht* auf `is_default`, das auf einem Gemeinschaftskonto stehen kann.
  Eine Offenlegung durch Vorbelegung wäre kein Modellfehler, aber derselbe Schaden.
- Bei Wahl eines Gemeinschaftskontos ein Hinweis, **wer namentlich mitliest** (aus
  `account_members`, aktive Mitglieder).

### 5 · Schreibrecht = Sichtbarkeit

Wie bei `expense_items`, `income_sources`, `transaction_templates`: jedes aktive
Mitglied darf ändern und löschen, `created_by` trägt nur Urheberschaft. Das engere
Schreibprädikat von `transactions` ist eine Eigenheit der Übertragung („du bewegst nur
Salden, die du sehen darfst"), kein allgemeines Muster.

„Nur der Urheber darf ändern" wäre eine Halbheit: wer das Grundgehalt lesen darf
(Frage 4), gewinnt keinen Schutz dadurch, dass er es nicht bearbeiten darf — geteilt ist
es längst. Der Preis wäre eine **dritte** Schreibregel im System und damit eine
Gelegenheit mehr, die falsche einzusetzen.

Ausformungen:

- **Bestandteile erben das Schreibrecht des Elternteils**, über denselben Baustein aus
  Frage 3, nicht als eigenes Prädikat.
- **Löschen kaskadiert** (`salary_components` mit dem Gehalt) — Mechanik in **06**.
- Ein Gehalt zählt als Inhalt bei den beiden Zählstellen aus 02:
  `server/routes/accounts.ts:254` (Konto löschen) und `server/routes/convert.ts:68`
  (in Gemeinschaftskonto umwandeln). **Ein Konto mit Gehalt darf nicht als leer gelten.**

### 6 · Kontowechsel erlaubt — mit Bestätigung in Richtung geteilt

`accountId` ist per PATCH änderbar; das Zielkonto muss sichtbar sein, geprüft wie in
`server/routes/income.ts` über `checkAccountAndCategory`.

Weil die Bestandteile keine `account_id` tragen (Frage 3), **wandern sie von selbst
mit** — ein `UPDATE salaries SET account_id = ?` genügt, es gibt nichts zu bewegen. Bei
der verworfenen Kopie-Variante wäre derselbe Wechsel ein Mehrzeilen-Update mit
Leck-Risiko bei Abbruch.

Unveränderlichkeit wäre nicht sicherer, nur unbequemer: löschen und neu anlegen erreicht
dasselbe und kostet alle Bestandteile von Hand. Einen Irreversibilitäts-Grund wie bei
`convert-to-shared` gibt es nicht — zurück ins Persönliche ist eine gewöhnliche
Rückbewegung.

**Die Substanz dieser Frage:** persönlich → geteilt ist derselbe Offenlegungsakt wie die
Anlage, nur unauffälliger — niemand erwartet, dass eine Feldänderung im
Bearbeitungsformular das Grundgehalt für den Partner sichtbar macht. Dort gilt die Regel
aus Frage 4 **schärfer**: nicht nur Hinweis, sondern **ausdrückliche Bestätigung mit den
Namen der Mitleser**, bevor gespeichert wird. Umgekehrt (geteilt → persönlich) braucht es
nichts — das entzieht nur Sicht.

### Weitergabe

- **06** — Kaskaden-Mechanik beim Löschen; ob `salary_components` in `USER_COLUMNS`
  gehört oder die Adoption über den Elternteil läuft.
- **07** — die Prädikate dieses Tickets sind für Routen **und** MCP dieselben; MCP hat
  keine Sonderrolle.
- **08** — Umsetzung von Vorbelegung, Mitleser-Hinweis und Wechsel-Bestätigung.
