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
    },
  },

  // ── Konfigurationsdateien (Node) ──────────────────────────────────────────
  {
    files: ["*.config.{js,ts}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  }
);
