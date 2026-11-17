# 08 · Wie sieht die Eingabemaske für ein Gehalt aus?

Type: prototype
Status: resolved
Assignee: Anri
Blocked by: 03, 04
Speist: 09 (Darstellung), 12 (Umsetzung Routen/MCP)
Gespeist von: 05 (Konto-Bindung) — zwei bereits entschiedene Regeln, siehe Punkt 6 ·
06 (Bestehende Einnahmen) — nachgereichte Frage, siehe Punkt 7

## Question

Skill: `/prototype`. Ziel ist ein wegwerfbarer, anfassbarer Entwurf des Formulars —
kein fertiges Bauteil.

Der Auslöser der ganzen Karte war „detaillierter **eingeben** können". Dieses Ticket
ist deshalb das Herzstück, nicht ein Nachklapp.

1. **Ein Formular oder zwei Schritte?** Gehaltskopf (Arbeitgeber, Konto, Stundendaten)
   und Bestandteilsliste in einer Maske, oder erst das Gehalt anlegen und dann
   Bestandteile hinzufügen? Zwei Schritte sind einfacher zu bauen und schlechter zu
   bedienen.
2. **Wie sieht eine Bestandteilszeile aus?** Art (Auswahl), Bezeichnung, Betrag,
   Periodizität, bei stundenbasierten Arten Satz und Stunden. Fünf bis sechs Felder je
   Zeile — passt das in eine Zeile oder braucht es eine Karte je Bestandteil?
3. **Zeigt das Formular die laufende Summe?** Ein „macht 4.200 €/Monat" beim Tippen ist
   die eigentliche Antwort auf „Zusammensetzung sichtbar machen".
4. **Wie fängt man an?** Leeres Formular oder mit Grundgehalt vorbelegt?
5. **Bestehende Muster einhalten:** jede Seite hält ihre Modale lokal
   (`useState`), und der Modal-Zustand steht **über** den `useApi`-Aufrufen, damit
   `{ paused }` das Nachladen bei Fokus anhält (`CLAUDE.md`, „Frische-Mechanik"). Ein
   Formular dieser Größe macht das wichtiger, nicht unwichtiger.

6. **Zwei Regeln sind schon entschieden, nicht mehr offen** — sie kommen aus
   [05 · Konto-Bindung](./05-konto-bindung.md) und schützen den Nutzer vor
   unbeabsichtigter Offenlegung des Grundgehalts. Der Prototyp muss sie *gestalten*,
   nicht in Frage stellen:
   - Die Kontoauswahl ist auf das **persönliche** Standardkonto vorbelegt, ausdrücklich
     **nicht** auf `is_default` (das kann auf einem Gemeinschaftskonto stehen). Bei Wahl
     eines Gemeinschaftskontos ein Hinweis, **wer namentlich mitliest** (aktive
     `account_members`).
   - Wechselt ein bestehendes Gehalt von persönlich auf geteilt, braucht es eine
     **ausdrückliche Bestätigung** mit den Namen der Mitleser vor dem Speichern —
     schärfer als der Hinweis bei der Anlage, weil niemand erwartet, dass eine
     Feldänderung im Bearbeitungsformular das Grundgehalt offenlegt. Umgekehrt
     (geteilt → persönlich) nichts.

7. **Sammelt das Formular vorhandene Einnahmezeilen ein?** Nachgereicht aus
   [06 · Bestehende Gehalts-Einnahmen](./06-migration.md): Dort ist der
   Umwandlungsknopf an der Einnahmezeile **abgelehnt** worden, weil 1:1 die falsche Form
   erzeugt — drei Zeilen („Gehalt", „Weihnachtsgeld", „Zulage") würden zu drei Gehältern
   mit je einem Posten statt zu einem mit dreien. Der zusammengesetzte Fall ist aber genau
   der, der Hilfe verdient. Offen ist deshalb, ob die Maske beim **Anlegen** anbietet,
   bestehende Einnahmen *desselben Kontos* anzukreuzen: sie werden zu Posten, die
   Quellzeilen verschwinden. Das ist ein Formular-Merkmal, kein Migrationsweg — und es
   darf auch „nein" heißen, dann legt der Nutzer neu an und löscht selbst.

Der Prototyp wird als Anlage neben diesem Ticket abgelegt und von hier verlinkt.

---

## Anlage · Prototyp (läuft)

Drei Varianten auf der bestehenden Route `/income`, umschaltbar über `?variant=`:

- `src/pages/prototype/GehaltFormularPrototyp.tsx` — `VarianteA` / `VarianteB` / `VarianteC`
- `src/components/PrototypeSwitcher.tsx` — schwebende Leiste (in Produktion ausgeblendet)
- `src/pages/Income.tsx` — Montage (Prototyp zählt als offenes Modal, `{ paused }` greift)

| | Q1 Aufbau | Q3 Summe | Q4 Start | Q7 Einnahmen einsammeln |
|---|---|---|---|---|
| **A** Eine dichte Maske | ein breites Modal, Bestandteile als Tabellenzeilen | Fußzeile, dezent | Grundgehaltszeile steht schon da | **nein** |
| **B** Assistent | zwei Schritte (Kopf → Bestandteile als Karten) | klebende Fußleiste | leer, Katalog-Chips | **ja**, Ankreuzliste in Schritt 1 |
| **C** Vollseiten-Gehaltszettel | eigene Ansicht, Palette links, Zettel rechts | große Zahl oben, aufgeteilt fest/schwankend | leer, Palette | **ja**, als Palettenquelle |

Gleich in allen dreien (aus 05, nicht mehr offen): Vorbelegung auf das persönliche
Konto, namentlicher Mitleser-Hinweis, Bestätigungsdialog bei persönlich → geteilt
(sichtbar über `?modus=edit` + Konto wechseln). Keine Mutationen — „Speichern" zeigt
nur die Nutzlast.

Der Prototyp liegt als Primärquelle auf dem Wegwerf-Branch
`prototype/gehalt-formular-08`, nicht in `master`.

---

## Antwort

**Variante C gewinnt: der Gehaltszettel.** Kein Modal, keine Assistentenschritte —
eine Vollseite, links die Katalog-Palette, rechts der wachsende Zettel.

### Was C an den offenen Fragen entscheidet

**1. Ein Formular, aber keine Maske.** Weder ein Modal (A) noch zwei Schritte (B). Der
Assistent scheitert am Zweck der Karte: er versteckt die Zusammensetzung hinter einem
„Weiter", und beim *Bearbeiten* — dem häufigeren Fall — ist der erste Schritt reiner
Weg. Die Vollseite kostet die Modal-Bequemlichkeit und kauft dafür den Platz, den
fünfzehn Arten neben einer Live-Summe brauchen.

**2. Die Bestandteilszeile ist zweistufig, nicht sechsfeldrig.** Zugeklappt eine
Zettelzeile — Bezeichnung, Merkmale als kleine Marken (*schwankt*, *jährlich*),
Monatsbetrag rechtsbündig. Aufgeklappt darunter die Felder: Bezeichnung, Betrag,
Periodizität, `betragSchwankt`, bei den drei Arten mit `stundenhilfe` der
Satz-×-Stunden-Rechner. Damit fällt die Frage „eine Zeile oder eine Karte je
Bestandteil" weg: es ist eine Zeile, die zur Karte wird, solange man an ihr arbeitet.
Ein Gehalt mit acht Posten bleibt auf einen Blick lesbar.

**3. Die Summe ist die größte Zahl der Seite** und steht im Zettelkopf, aufgeteilt in
*fest*, *schwankend* und *Abzug*. Das ist keine Fußnote wie in A, sondern die
eigentliche Antwort auf den Zweck der Karte — und der einzige Ort, an dem
`betragSchwankt` (03) dem Nutzer beim Eintippen etwas nützt.

**4. Der Editor startet leer.** Kein vorbelegtes Grundgehalt: die Palette *ist* die
Vorbelegung, „Grundgehalt" steht als erster Eintrag oben. Eine vorbelegte Zeile in
einem sonst leeren Zettel sieht aus wie ein Wert, den jemand schon eingetragen hat.

**5. Hier bricht das Modal-Muster — bewusst, mit Auflage.** `CLAUDE.md`
(„Frische-Mechanik") stützt sich darauf, dass jede Seite ihre Modale lokal hält und
`{ paused }` das Nachladen anhält. Eine eigene Route hat kein Modal, das man pausieren
könnte. Die Begründung der Pause gilt aber unverändert: **die Editorseite lädt Konten
und Einnahmen einmal beim Betreten und danach nicht mehr** — kein Nachladen bei Fokus.
Umgesetzt als dauerhaft pausiertes `useApi` nach dem ersten Zug oder als einmaliger
Ladeaufruf. Wer das vergisst, bekommt genau den Fehler, gegen den die Pause erfunden
wurde, nur schlimmer: das Formular steht hier länger offen als jedes Modal.

**6. Konto und Mitleser sitzen im Zettelkopf.** Die Kontowahl ist eine Chip-Reihe in
Kontofarben (kein Auswahlfeld — bei einer Angabe, die über Offenlegung entscheidet,
soll die aktuelle Wahl ohne Aufklappen sichtbar sein), darunter das Mitleser-Banner mit
den Namen. Der Bestätigungsdialog aus 05 bleibt wie im Prototyp: eigener Dialog vor dem
Speichern, Namen im Fließtext, Knopf „Ja, offenlegen".

**7. Ja — die Übernahme bleibt, und die Quellzeile wird gelöscht.** Die Palette trägt
unter dem Katalog einen Abschnitt „Bestehende Einnahmen" mit den Einnahmen *des
gewählten Kontos*; ein Klick macht daraus einen Posten. Beim Speichern verschwinden die
übernommenen Zeilen aus `income_sources`. Das ist der Fall, den 06 dem Formular
ausdrücklich überlassen hat: drei Zeilen werden **ein** Gehalt mit drei Posten, nicht
drei Gehälter. Kopieren ohne Löschen wurde verworfen — bis zum Aufräumen von Hand steht
das Geld doppelt in Dashboard und Statistik, und das ist die eine Sorte Fehler, die die
ganze Karte vermeiden will.

### Routen

| Route | Bedeutung |
|---|---|
| `/income` | Liste wie heute, zusätzlich Knopf „Gehalt anlegen" |
| `/income/gehalt/neu` | Zettel-Editor, leer |
| `/income/gehalt/:id` | Zettel-Editor an einem bestehenden Gehalt |

Teilbarer Link und funktionierendes Browser-Zurück sind bei einer Ansicht dieser Größe
mehr wert als die Musterreinheit.

### Auflagen an andere Tickets

- **[09 · Darstellung](./09-darstellung.md)** — die Einnahmen-Seite braucht den Weg in
  den Editor: Knopf zum Anlegen, und die aufklappbare Gehaltszeile führt beim
  Bearbeiten auf `/income/gehalt/:id` statt in ein Modal.
- **[12 · Umsetzung Routen/MCP](./12-umsetzung-routen-mcp.md)** — die dort offen
  gehaltene Frage ist mit **ja** beantwortet: es braucht eine **atomare** Operation
  „Einnahmezeilen in Posten überführen und Quellzeilen löschen" in einer Transaktion.
  Halb ausgeführt wäre sie eine Doppelzählung oder ein Datenverlust.
