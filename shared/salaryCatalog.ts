/**
 * Der Bestandteilskatalog des Gehalts — **eine Konstante, keine Tabelle.**
 *
 * Warum hier und nicht in `server/lib/salary.ts`: der Katalog ist weder Server- noch
 * Frontendbelang. Der Server prüft `kind` dagegen (Zod), das Frontend baut daraus die
 * Palette und die Vorbelegungen. `salary.ts` trägt dagegen Summen- und
 * Sichtbarkeitslogik, die im Browser-Bündel nichts verloren hat.
 *
 * **Der Katalog belegt vor und erzwingt nie.** `type`, `vorzeichen` und
 * `betragSchwankt` sind Vorbelegungen für einen neuen Posten; gespeichert wird, was
 * am Posten steht. Zwei Klassen von Arten („bei Weihnachtsgeld ist jährlich Pflicht")
 * wären eine Fallunterscheidung im Modell, in Zod, in der Maske und in jeder
 * Fehlermeldung — bezahlt für einen Fall, der nicht weh tut.
 *
 * **`kind` steht ohne `CHECK` in der Datenbank** (Migration 8): der Katalog soll
 * wachsen, und auf SQLite ist ein `CHECK` nur per Tabellen-Rebuild änderbar. Der Preis
 * ist, dass ein `INSERT` an der API vorbei ein unbekanntes `kind` schreiben kann —
 * deshalb fällt {@link salaryComponentLabel} auf den **rohen Schlüssel** zurück statt
 * zu scheitern.
 */

/** Periodizität — dieselben zwei Werte wie bei `income_sources` und `expense_items`. */
export type SalaryPeriodicity = "monthly" | "annual";

/**
 * Fünfzehn Arten, **gebündelt statt granular**.
 *
 * Der Bündelungshebel ist „eine Art darf mehrfach vorkommen und trägt eine eigene
 * Bezeichnung": „Internetzuschuss" braucht keine eigene Art, er ist ein `zuschuss`
 * namens „Internet". Das drückt die 21 belegten Arten auf 15, ohne Ausdruckskraft zu
 * verlieren.
 *
 * **Schlüssel und Anzeigename sind getrennt** — in der Datenbank steht die stabile
 * Kleinbuchstaben-Kennung, ein Umbenennen der deutschen Anzeige ist damit keine
 * Migration.
 *
 * Die drei Merkmale:
 * - `betragSchwankt` — der eigentliche Befund der Recherche: die tragende
 *   Unterscheidung ist *Rhythmus fest vs. Betrag fest*, nicht monatlich/jährlich. Alle
 *   Zuschläge haben festen Rhythmus bei schwankendem Betrag. Ein Boolean, keine
 *   dreiwertige Aufzählung: „schwankend" und „frei variabel" heißen für die App beide
 *   „das ist ein Schätzwert".
 * - `vorzeichen` — der Abzug ist ein **negatives `amount`**, kein Flag neben einem
 *   positiven Betrag. Nur `entgeltumwandlung` ist negativ vorbelegt.
 * - `stundenhilfe` — entscheidet **nur**, ob der Stundenrechner bei dieser Art
 *   aufgeklappt startet. Verboten ist er nirgends. `bonus` und `provision` schwanken
 *   **ohne** Stundenhilfe; das ist der Beleg, dass die beiden Merkmale nicht dasselbe
 *   sind.
 */
export const SALARY_CATALOG = [
  {
    kind: "grundgehalt",
    label: "Grundgehalt",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "mehrstunden",
    label: "Mehrstunden",
    type: "monthly",
    betragSchwankt: true,
    vorzeichen: 1,
    stundenhilfe: true,
  },
  {
    kind: "weihnachtsgeld",
    label: "Weihnachtsgeld / Jahressonderzahlung",
    type: "annual",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "urlaubsgeld",
    label: "Urlaubsgeld",
    type: "annual",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "zuschlag",
    label: "Zuschlag",
    beispiele: "Nacht, Sonntag, Feiertag",
    type: "monthly",
    betragSchwankt: true,
    vorzeichen: 1,
    stundenhilfe: true,
  },
  {
    kind: "zulage",
    label: "Zulage",
    beispiele: "Schicht, Wechselschicht, Erschwernis",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "rufbereitschaft",
    label: "Rufbereitschaft / Bereitschaftsdienst",
    type: "monthly",
    betragSchwankt: true,
    vorzeichen: 1,
    stundenhilfe: true,
  },
  {
    kind: "vl",
    label: "Vermögenswirksame Leistungen",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "bonus",
    label: "Bonus / Prämie / Tantieme",
    type: "annual",
    betragSchwankt: true,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "provision",
    label: "Provision",
    type: "monthly",
    betragSchwankt: true,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "dienstwagen",
    label: "Dienstwagen",
    beispiele: "geldwerter Vorteil",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "sachbezug",
    label: "Sachbezug",
    beispiele: "Gutschein, 50-€-Freigrenze",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "zuschuss",
    label: "Zuschuss",
    beispiele: "Jobticket, Fahrtkosten, Internet, Essen",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
  {
    kind: "entgeltumwandlung",
    label: "Entgeltumwandlung",
    beispiele: "bAV, Jobrad, Dienstrad",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: -1,
    stundenhilfe: false,
  },
  {
    kind: "sonstiges",
    label: "Sonstiges",
    type: "monthly",
    betragSchwankt: false,
    vorzeichen: 1,
    stundenhilfe: false,
  },
] as const satisfies readonly {
  kind: string;
  label: string;
  /** Beispiele für die Palette — die *Bündelung* sichtbar machen, kein Teil des Namens. */
  beispiele?: string;
  type: SalaryPeriodicity;
  betragSchwankt: boolean;
  vorzeichen: 1 | -1;
  stundenhilfe: boolean;
}[];

export type SalaryCatalogEntry = (typeof SALARY_CATALOG)[number];

/** Der stabile Schlüssel einer Bestandteilsart. */
export type SalaryComponentKind = SalaryCatalogEntry["kind"];

/**
 * Die Schlüssel als nicht-leeres Tupel — die Form, die `z.enum()` verlangt. Die
 * Zod-Prüfung ist nach Ticket 06 die **einzige** Stelle, an der `kind` eingegrenzt
 * wird, und sie deckt HTTP-Routen und MCP gemeinsam ab.
 */
export const SALARY_COMPONENT_KINDS = SALARY_CATALOG.map((e) => e.kind) as [
  SalaryComponentKind,
  ...SalaryComponentKind[],
];

/** Katalogeintrag zu einem Schlüssel, oder `undefined` bei einem unbekannten. */
export function salaryCatalogEntry(kind: string): SalaryCatalogEntry | undefined {
  return SALARY_CATALOG.find((e) => e.kind === kind);
}

export function isSalaryComponentKind(kind: string): kind is SalaryComponentKind {
  return salaryCatalogEntry(kind) !== undefined;
}

/**
 * Anzeigename eines Postens: eigene Bezeichnung, sonst Katalogname, sonst der rohe
 * Schlüssel.
 *
 * Die Kette ist die Umsetzung von zwei Entscheidungen: `label` ist `NULL`-fähig, weil
 * der Katalogname dem Katalog gehört und nicht zum Anlegezeitpunkt in jede Zeile
 * einfrieren soll — und der letzte Rückfall existiert, weil ohne `CHECK` auf `kind`
 * ein unbekannter Schlüssel in der Datenbank stehen kann. Die Anzeige muss das
 * **aushalten**, nicht abstürzen.
 */
export function salaryComponentLabel(kind: string, label?: string | null): string {
  if (label && label.trim() !== "") return label;
  return salaryCatalogEntry(kind)?.label ?? kind;
}
