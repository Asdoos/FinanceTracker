# 15 · Ist `betragSchwankt` am Posten änderbar — oder gehört es dem Katalog?

Type: grilling
Status: open
Blocked by: —
Gespeist von: 13 (beim Bauen der Maske gefunden)
Speist: 14 (Statistik-Achse)

## Question

**Ein Widerspruch im Bestand, keine neue Idee.** Die Karte hat sich in dieser Frage
selbst überholt, und beim Bauen der Eingabemaske ist es aufgefallen.

- [03](./03-bestandteilskatalog.md), Regel 2, entscheidet: „**Ein zweites Merkmal am
  Bestandteil: `betragSchwankt`** (Boolean, aus der Art vorbelegt, **änderbar**)."
  [04](./04-stundenmodell.md) baut darauf auf und grenzt es ausdrücklich gegen die
  *Katalog*spalte `stundenhilfe` ab — „das ist der Beleg dafür, dass die beiden Merkmale
  nicht dasselbe sind".
- [06](./06-migration.md) legt den endgültigen Spaltensatz von `salary_components` fest.
  **Die Spalte ist nicht dabei.** 06 hat die Skizze aus [02](./02-datenmodell.md)
  übernommen, und 02 entstand *vor* 03; die dort aufgeführten „drei Abweichungen von 02s
  Skizze, alle begründet" nennen `betragSchwankt` nicht.
- [11](./11-umsetzung-schema.md) hat 06 treu gebaut. [12](./12-umsetzung-routen-mcp.md)
  liefert das Feld in der Nutzlast, **abgeleitet aus dem Katalog** über `kind`.
  [13](./13-umsetzung-editor.md) zeigt es deshalb als Marke, nicht als Ankreuzfeld.

Es ist also ein **Versehen, keine Entscheidung** — und der heutige Zustand
(katalog-abgeleitet) ist eine Antwort, die niemand getroffen hat.

Zu klären:

1. **Braucht es die Änderbarkeit überhaupt?** Der belegte Fall wäre ein Grundgehalt, das
   in Wahrheit schwankt (Teilzeit auf Abruf), oder ein Bonus, der vertraglich fest ist.
   Beide sind selten. 03 hat die Änderbarkeit mit „der Katalog belegt vor und erzwingt
   nie" begründet — dieselbe Regel gilt für Periodizität und Vorzeichen, und **die** sind
   beide am Posten gespeichert. Ist die Ableitung hier eine Ausnahme mit Grund oder ein
   Bruch der Regel?
2. **Was hängt daran?** [09](./09-darstellung.md) macht `betragSchwankt` zur **einzigen
   neuen Statistik-Achse** („welcher Anteil meines Einkommens ist variabel?"). Bei
   Ableitung aus dem Katalog ist diese Achse eine Funktion von `kind` und damit
   redundant — die Auswertung könnte genauso über `kind` gruppieren. Das ist das
   stärkste Argument *für* die Spalte, und es betrifft 14.
3. **Wenn ja: Migration 9.** `betrag_schwankt` an `salary_components`, Vorbelegung aus dem
   Katalog beim Anlegen (nicht als Backfill über `kind` — oder doch? Bestandszeilen
   müssten sonst einen Wert bekommen). Dazu ein Feld in der Zod-Grenze, in der Nutzlast
   (`salaryPayload` leitet es heute ab), im Editor und in `stats.ts`.
4. **Wenn nein:** 03s Regel 2 wird ausdrücklich **zurückgenommen** und in `CLAUDE.md`
   vermerkt, damit die nächste Sitzung nicht denselben Widerspruch wiederfindet. Die
   Ableitung im Baustein ist dann die beschlossene Antwort, nicht ein Rückstand.

**Vor der Sitzung lesen:** 03 Regel 2, 04 („Kein zweites Boolean — eine Katalogspalte"),
06 Punkt 4, sowie `server/lib/salary.ts` (`salaryPayload`) und
`shared/salaryCatalog.ts`.

### Erwartetes Ergebnis

Eine Entscheidung mit Begründung — Spalte oder Ableitung — und, falls Spalte, ein
Umsetzungsticket. **14 sollte darauf warten**, wenn die Statistik-Achse aus 09 in 14
gebaut wird: sonst entsteht sie zweimal.
