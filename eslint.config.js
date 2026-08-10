import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "data", "node_modules"] },

  // ── Frontend (Browser) ────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ── Backend (Node) ────────────────────────────────────────────────────────
  {
    files: ["server/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // Die Routen arbeiten durchgehend auf den untypisierten Zeilen des
      // DbAdapters — `any` ist dort die Regel, nicht die Ausnahme.
      "@typescript-eslint/no-explicit-any": "off",

      // Jede Verzweigung über `transactions.type` soll auf den Tisch, sobald ein
      // weiterer Typ dazukommt. Falschpositive sind erwünscht: die Regel soll
      // nicht recht haben, sie soll den Autor zwingen hinzusehen. Ausnahmen
      // stehen als `eslint-disable-next-line` **mit Begründung an der Fundstelle**,
      // nicht in einer zentralen Allowlist.
      "no-restricted-syntax": [
        "error",
        // ── Regel 1: `user_id` in SQL ──────────────────────────────────────
        // Seit v0.26 ist Sichtbarkeit **ausschließlich durch das Konto** bestimmt.
        // `user_id` bedeutet nur noch dort etwas, wo es echten Besitz trägt
        // (accounts, goals) oder Sichtbarkeitsschlüssel des NULL-Zweigs ist
        // (categories) — überall sonst ist es der alte, weggefallene Zweig.
        //
        // Grenze: die Regel ist syntaktisch, nicht semantisch. Ein gesetzter
        // Disable-Kommentar über einer falschen Query rutscht durch. Der Guard
        // ersetzt kein Review, er verhindert das Übersehen.
        {
          selector: "Literal[value=/user_id/]",
          message:
            "`user_id` in SQL. Sichtbarkeit kommt seit v0.26 aus account_members, nicht aus user_id — nutze den Sichtbarkeits-Helper. Bewusste Ausnahme (Besitz an accounts/goals, NULL-Zweig bei categories, Auth-Tabellen): eslint-disable-next-line mit Begründung.",
        },
        {
          selector: "TemplateElement[value.raw=/user_id/]",
          message:
            "`user_id` in SQL. Sichtbarkeit kommt seit v0.26 aus account_members, nicht aus user_id — nutze den Sichtbarkeits-Helper. Bewusste Ausnahme (Besitz an accounts/goals, NULL-Zweig bei categories, Auth-Tabellen): eslint-disable-next-line mit Begründung.",
        },
        // ── Regel 2: rohe Buchungstyp-Namen ────────────────────────────────
        {
          selector: "Literal[value='income']",
          message:
            "Roher Typ-Name 'income'. Über `transactions.type` wird nicht per Hand verzweigt — nutze signedAmount() oder EXCLUDE_TRANSFERS_SQL aus server/lib/transactions.ts. Bewusste Ausnahme: eslint-disable-next-line mit Begründung.",
        },
        {
          selector: "Literal[value='expense']",
          message:
            "Roher Typ-Name 'expense'. Über `transactions.type` wird nicht per Hand verzweigt — nutze signedAmount() oder EXCLUDE_TRANSFERS_SQL aus server/lib/transactions.ts. Bewusste Ausnahme: eslint-disable-next-line mit Begründung.",
        },
      ],
    },
  },

  // ── Schema- und Adapterdateien ────────────────────────────────────────────
  // Regel 1 gilt hier **nicht**: `user_id` ist in `server/db/` eine
  // Spaltendefinition (CREATE TABLE, ALTER, Backfill), kein Sichtbarkeits-Prädikat.
  // Die Regel soll Queries auf den Tisch bringen, nicht das Schema, das die Spalte
  // überhaupt erst anlegt — sonst stünden dort ~60 Disable-Kommentare und
  // erreichten das Gegenteil ihres Zwecks.
  {
    files: ["server/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='income']",
          message: "Roher Typ-Name 'income' — siehe server/lib/transactions.ts.",
        },
        {
          selector: "Literal[value='expense']",
          message: "Roher Typ-Name 'expense' — siehe server/lib/transactions.ts.",
        },
      ],
    },
  },

  // ── Konfigurationsdateien (Node) ──────────────────────────────────────────
  {
    files: ["*.config.{js,ts}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  }
);
