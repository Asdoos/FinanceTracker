# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start both frontend + backend dev servers
npm run dev:all

# Frontend only (Vite dev server, proxies /api to backend)
npm run dev

# Backend only (Express + SQLite, hot-reload via tsx)
npm run server

# Production build (runs tsc + vite build)
npm run build

# Lint
npm run lint
```

No test framework is configured.

## Environment

- `JWT_SECRET` — **Required.** Secret for JWT token signing (min 32 chars). Server will not start without it. Für die lokale Entwicklung setzt das `server`-Script (und damit `dev:all`) per `cross-env` ein festes Dev-Secret — es überschreibt ein extern gesetztes `JWT_SECRET`. Produktion ist nicht betroffen: der Container startet über `CMD ["tsx", "server/index.ts"]`, nicht über npm.
- `DATABASE_PATH` — path to SQLite database file (default: `./data/finance.db`)
- `DATABASE_URL` — PostgreSQL connection string; when set, SQLite is not used (e.g. `postgres://user:pass@host:5432/db`)
- `PORT` — server port (default: `3001`)
- The SQLite database and `data/` directory are created automatically on first server start

## Architecture

**Frontend** (`src/`) is a Vite + React + TypeScript SPA. Tailwind CSS for styling. All server state is fetched via REST API using a custom `useApi` hook in `src/lib/api.ts`.

**Backend** (`server/`) is an Express.js REST API. Uses a `DbAdapter` interface (`server/db/adapter.ts`) so either SQLite or PostgreSQL can be used — selected at runtime based on whether `DATABASE_URL` is set. Route handlers call `getDb()` from `server/db/index.ts` to get the singleton adapter.

### Authentication

Multi-user JWT-based authentication. First user is created via `/api/auth/setup` and becomes admin. Only admins can create additional users.

- **Auth middleware** (`server/auth/middleware.ts`): `requireAuth` validates Bearer tokens (JWT or API key), sets `req.user`. `requireAdmin` additionally checks `isAdmin`.
- **Middleware chain** in `server/index.ts`: Auth routes (`/api/auth/*`) are registered WITHOUT middleware. Then `requireAuth` is applied to all other `/api/*` routes.
- **JWT tokens**: Access token (15 min), Refresh token (30 days). Stored in `localStorage` on the frontend.
- **API keys**: For MCP server and external integrations. `ft_` prefix, SHA-256 hashed in DB. Managed via `/api/auth/api-keys`.
- **Frontend auth**: `AuthContext` (`src/context/AuthContext.tsx`) manages state. On app load: checks `/api/auth/status` → redirects to `/setup` or `/login` if needed. The API client (`src/lib/api.ts`) auto-attaches Bearer tokens and handles 401 with token refresh.
- **Data isolation**: **Sichtbarkeit ist ausschließlich durch das Konto bestimmt**, nicht mehr durch `user_id`. Jede Query filtert über `account_id IN (<sichtbare Konten>)` aus `visibleAccounts()` — siehe „Sichtbarkeit und Schreibrecht". Der alte Zweig `WHERE user_id = ?` ist **weggefallen** und nicht als `OR` stehen geblieben: additiv wäre er ein Leck, weil er einem ausgetretenen Mitglied weiterhin seine Alt-Buchungen zeigte.
- **Data migration**: When first admin is created via setup, all existing orphaned data is assigned to that admin (`server/db/migrate.ts`) — direkt gefolgt von `ensureOwnerMembershipsForUser`, weil die adoptierten Konten ohne Mitgliedschaftszeile unsichtbar wären.

### Data model (`server/db/sqlite.ts`)

| Table | Key fields |
|---|---|
| `users` | `email` (unique), `password_hash`, `display_name`, `is_admin`, `created_at` |
| `api_keys` | `user_id` (FK), `key_hash`, `label`, `created_at` |
| `accounts` | `name`, `color`, `is_shared`, `actual_balance`, `actual_balance_by`, `interest_rate`, `user_id` |
| `account_members` | `account_id`, `user_id`, `role` (`owner`\|`member`), `status` (`pending`\|`active`), `freibetrag`, `freibetrag_year`, `is_default` |
| `categories` | `name`, `color`, `icon`, `budget_limit`, `budget_set_by`, `account_id`, `user_id` |
| `expense_items` | `label`, `amount`, `type` (`monthly`\|`annual`), `category_id`, `account_id`, `is_active`, `end_date`, `created_by` |
| `income_sources` | `label`, `amount`, `type` (`monthly`\|`annual`), `account_id`, `is_active`, `created_by` |
| `transactions` | `date`, `amount`, `type` (`income`\|`expense`\|`transfer`), `label`, `category_id`, `account_id`, `counter_account_id`, `created_by` |
| `transaction_templates` | `label`, `amount`, `type`, `category_id`, `account_id`, `created_by` |
| `goals` | `name`, `target_amount`, `current_amount`, `color`, `due_date`, `account_id`, `user_id` |
| `schema_migrations` | `version`, `applied_at` |

Annual amounts are divided by 12 wherever monthly totals are computed. The `GET /api/summary` endpoint is the single source of truth for the Dashboard — it returns pre-aggregated totals, per-account breakdown, per-category breakdown, and enriched expense items with `shareOfTotal`.

#### Zwei Dinge, die wie Schlamperei aussehen und Absicht sind

**1. Die Spalte heißt je Tabelle anders.** `expense_items`, `income_sources`,
`transactions` und `transaction_templates` tragen `created_by`; `accounts`,
`categories` und `goals` tragen weiter `user_id`. Das ist kein
Migrationsrückstand:

- Seit v0.26 ist **Sichtbarkeit ausschließlich durch das Konto bestimmt**
  (`account_members`). Auf den vier kontogebundenen Tabellen trägt die Spalte
  deshalb nur noch **Urheberschaft** — daher `created_by`.
- Auf `accounts` bedeutet `user_id` **Besitz**, auf `categories` und `goals` ist
  sie der **Sichtbarkeitsschlüssel des NULL-Zweigs** im hybriden Prädikat
  (`account_id IN (<shared>) OR (account_id IS NULL AND user_id = ?)`) —
  persönliche Kategorien haben kein Konto.

Die Umbenennung ist der eigentliche Leck-Schutz: eine vergessene Stelle mit
`WHERE user_id = ?` ist danach ein **SQL-Fehler** statt einer Query, die still die
falschen Zeilen liefert. `server/db/migrate.ts` hält die Zuordnung als
`USER_COLUMNS`. Zwei ESLint-Regeln bewachen das (siehe unten).

**2. Manche Nutzlast-Felder bedeuten „mein Wert", nicht „der Wert".** Dieselbe
Zeile sieht für zwei Mitglieder unterschiedlich aus:

| Feld | Bedeutung |
|---|---|
| `freibetrag`, `freibetragYear`, `isDefault` an einem Konto | **mein** Wert, aus `account_members` flach ins Konto-Objekt gemischt — nicht der des Kontos |
| `freibetragByMember` | nur an Gemeinschaftskonten: alle Mitglieder-Freibeträge aufgeschlüsselt |
| `account` / `counterAccount` einer Buchung | `{ masked: true, by: "<Urheber>" }`, wenn der Anfragende dieses Konto nicht sehen darf. Betrag, Datum und Label bleiben immer vollständig |
| `canEdit` | vom Server, weil das Frontend es nicht ableiten kann: bei einer maskierten Zeile steht das fremde Ende gar nicht in der Nutzlast |

Die flache Zusammenführung war eine bewusste Wahl: sie lässt jede **Lese**stelle
in Frontend und MCP unverändert. Der Preis ist genau diese Doppelbedeutung.

### Sichtbarkeit und Schreibrecht

`server/lib/visibility.ts` ist die einzige Quelle. `visibleAccounts(db, userId)`
liefert `{ all, personal, shared }`; die IDs werden als **interpolierte Integer**
ins SQL gesetzt, nicht als Platzhalter — `convertPlaceholders` im
Postgres-Adapter nummeriert `?` positionell, und die Routen bauen ihr SQL
dynamisch zusammen.

| Tabelle | Prädikat |
|---|---|
| `expense_items`, `income_sources`, `transaction_templates` | `account_id IN (<all>)` |
| `transactions` **lesen** | `account_id IN (<all>) OR counter_account_id IN (<all>)` |
| `transactions` **schreiben** | `account_id IN (<all>) AND (counter_account_id IS NULL OR counter_account_id IN (<all>))` |
| `categories`, `goals` | `account_id IN (<shared>) OR (account_id IS NULL AND user_id = ?)` |
| `accounts` | `id IN (<all>)` |

**Lese- und Schreibprädikat für `transactions` sind absichtlich verschieden:** wer
schreiben will, muss **beide** Enden sehen („du bewegst nur Salden, die du sehen
darfst"). Für alle anderen Tabellen ist Schreibrecht deckungsgleich mit
Sichtbarkeit — jedes Mitglied darf die Zeilen des anderen ändern.
Owner-Sonderrechte hängen ausschließlich an der Konto-Entität (löschen, einladen,
entfernen, umwandeln).

### Zwei ESLint-Guards

Beide sind `no-restricted-syntax` in `eslint.config.js`, Ausnahmen stehen als
`eslint-disable-next-line` **mit Begründung an der Fundstelle** — nicht in einer
zentralen Liste, die nach drei Monaten Einträge enthält, die niemand mehr
rechtfertigen kann. Falschpositive sind erwünscht.

1. **`user_id` in SQL** — bringt jede Query auf den Tisch, die noch am alten
   Sichtbarkeitszweig hängt. Ausgenommen ist `server/db/**`: dort ist `user_id`
   eine Spaltendefinition, kein Prädikat.
2. **rohe `'income'`/`'expense'`-Literale** — bringt jede Verzweigung über
   `transactions.type` auf den Tisch, sobald ein Typ dazukommt. Nutze
   `signedAmount()` oder `EXCLUDE_TRANSFERS_SQL` aus `server/lib/transactions.ts`.

Die Regeln sind **syntaktisch, nicht semantisch**: ein gesetzter
Disable-Kommentar über einer falschen Query rutscht durch. Sie ersetzen kein
Review, sie verhindern das Übersehen.

### Migrationen

`server/db/migrations.ts` hält ein Array nummerierter Schritte mit je einem
SQLite- und einem Postgres-Zweig. Die Versionsnummern sind **engine-übergreifend**:
ein Schritt darf auf einer Engine leer sein, die Versionsmarke wird trotzdem
gesetzt. Jeder Schritt läuft in einer Transaktion **gemeinsam mit seiner
Versionsmarke**; beim ersten Fehler startet der Server nicht. SQLite legt vorher
eine Kopie der Datei an.

Die alten `try/catch`-`ALTER`s in den Adaptern sind die **Prä-Versions-Präambel**
(Bestand = Version 0) und laufen **nur auf Version 0** — sonst legte sie Spalten
wieder an, die ein späterer Schritt gedroppt hat. Neue Schemaänderungen gehören
ausschließlich nach `migrations.ts`.

### API endpoints

Auth routes (no middleware):

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/status` | `{ setupComplete: boolean }` |
| POST | `/api/auth/setup` | Create first admin user + migrate orphaned data |
| POST | `/api/auth/login` | Email/password → JWT (rate-limited: 5/min per IP) |
| POST | `/api/auth/refresh` | Refresh token → new access token |
| GET | `/api/auth/me` | Current user info (requires auth) |
| GET/POST/PATCH/DELETE | `/api/auth/users[/:id]` | User CRUD (admin only) |
| GET/POST/DELETE | `/api/auth/api-keys[/:id]` | API key management |

All other routes require `Authorization: Bearer <token>` and follow REST conventions:

| Resource | Endpoints | Route file |
|---|---|---|
| `/api/accounts` | GET, POST, PATCH /:id, DELETE /:id | `accounts.ts` |
| `/api/categories` | GET, POST, PATCH /:id, DELETE /:id | `categories.ts` |
| `/api/expenses` | GET, POST, PATCH /:id, DELETE /:id | `expenses.ts` |
| `/api/income` | GET, POST, PATCH /:id, DELETE /:id | `income.ts` |
| `/api/transactions` | GET, POST, PATCH /:id, DELETE /:id | `transactions.ts` |
| `/api/templates` | GET, GET /suggestions, POST, PATCH /:id, DELETE /:id | `templates.ts` |
| `/api/goals` | GET, POST, PATCH /:id, DELETE /:id | `goals.ts` |
| `/api/summary` | GET | `summary.ts` |
| `/api/accounts/:id/members` | GET, POST (einladen), DELETE /:userId (entfernen/austreten) | `members.ts` |
| `/api/invitations` | GET, POST /:accountId/accept, POST /:accountId/decline | `members.ts` |
| `/api/accounts/:id/convert-preview` | GET (Owner) | `convert.ts` |
| `/api/accounts/:id/convert-to-shared` | POST (Owner, atomar, **nicht umkehrbar**) | `convert.ts` |
| `/api/stats` | GET, GET /budget-comparison | `stats.ts` |
| `/api/export` | GET /expenses, GET /income, GET /transactions | `export.ts` |

### Frontend pages

| Route | File | Data source |
|---|---|---|
| `/setup` | `Setup.tsx` | `POST /api/auth/setup` |
| `/login` | `Login.tsx` | `POST /api/auth/login` |
| `/` | `Dashboard.tsx` | `GET /api/summary` |
| `/expenses` | `Expenses.tsx` | `GET /api/expenses` |
| `/income` | `Income.tsx` | `GET /api/income` |
| `/transactions` | `Transactions.tsx` | `GET /api/transactions` |
| `/accounts` | `Accounts.tsx` | `GET /api/accounts` + `GET /api/summary` |
| `/categories` | `Categories.tsx` | `GET /api/categories` |
| `/statistics` | `Statistics.tsx` | `GET /api/stats` |
| `/templates` | `Templates.tsx` | `GET /api/templates` |
| `/calendar` | `Calendar.tsx` | `GET /api/transactions` |
| `/goals` | `Goals.tsx` | `GET /api/goals` |
| `/users` | `UserManagement.tsx` | Auth API (admin only) |

All pages manage their own CRUD modals locally with `useState`. No shared modal/dialog component — each page contains its own.

### Gemeinschaftskonten im Frontend

**Prinzip: erst den Raum, dann den Inhalt.** Die *Form* des Raum-Wählers folgt der
Informationsdichte, nicht der Seite: `RoomTiles` (Kachelleiste mit `rest` als
Leitkennzahl) auf Dashboard und Statistik, `RoomRail` (schmale Leiste) dort, wo
der Inhalt keine Kachel füllt — beide in `src/components/RoomSwitcher.tsx`.

Der aktive Raum steht in der **URL** (`?raum=<id>`), **nicht** im `localStorage`:
verworfen wurde persistierter Zustand, nicht die Weitergabe über die URL. Ein
unbekannter Wert fällt auf „persönlich" zurück statt zu scheitern.

Der Kalender **bricht das Raum-Prinzip bewusst** und mischt alle Räume — er ist
Liquiditäts-Vorschau und hat keine raumgebundene Bezugsgröße, die eine Mischung
verfälschen könnte.

Was keinem Raum gehört, steht im Dashboard **unter** dem Raum-Inhalt in einem
eigenen Abschnitt „Über alle Räume" (gestrichelte Trennlinie): Freistellungsauftrag
(das 1.000-€-Limit gilt pro Person), die Bewegungen des Monats (die Buchungssummen
laufen über alle sichtbaren Konten) und der Zinssatz-Hinweis (Zinssätze hängen an
Konten). Die Kennzeichnung ist der Zweck des Abschnitts — vorher standen diese
Blöcke unmarkiert im raumgefilterten Inhalt und änderten sich beim Umschalten nicht.

Die dritte KPI-Karte des Dashboards trägt je Raum eine **andere Größe**: persönlich
den Rest mit Vorzeichen, im Gemeinschaftsraum den monatlichen Bedarf — also den
gespiegelten Wert. Sie ist deshalb anders gestaltet (eigenes Icon, farbiger Rahmen);
gleiche Gestalt bei gespiegeltem Vorzeichen ist die Stelle, an der man die falsche
Zahl liest. Im Gemeinschaftsraum steht außerdem nur **eine** Konto-Karte, deshalb
fällt das zweispaltige Grid dort auf eine Spalte und der Donut trägt die Legende
rechts.

`RoomTiles` ist eine **Reiterreihe**, keine Kartenreihe: mit derselben Sprache wie
die Karten darunter war der Wähler nicht von Inhalt zu unterscheiden. Die aktive
Kante trägt die Kontofarbe, und der Raumname steht zusätzlich in der Überschrift,
weil die Leiste beim Scrollen aus dem Blick gerät.

### Frische-Mechanik

Das Problem an geteilten Daten ist **Veralterung, nicht Kollision**: „zwei
Mitglieder bearbeiten gleichzeitig" tritt bei zwei Personen praktisch nie ein,
„ein Tab steht seit gestern offen" garantiert. Last-write-wins bleibt akzeptiert —
kein `updated_at`, keine Version, kein 409 im Modal.

`useApi` lädt deshalb bei **Fokus** neu (kein Polling) und nimmt ein
`{ paused }`-Flag. Die Pause bei offenem Modal ist **Teil der Entscheidung, kein
Umsetzungsdetail**: sonst wechselt man zum Taschenrechner, kommt zurück, und die
Daten unter dem halb gefüllten Formular haben sich verschoben — schlimmer als
veraltet. Deshalb steht der Modal-Zustand auf jeder Seite **über** den
`useApi`-Aufrufen.

### MCP Server

`server/mcp.ts` provides an MCP (Model Context Protocol) server with ~22 tools for reading and writing financial data. Authentication is via API key (`?apiKey=...` query param or `X-API-Key` header). Each MCP session is scoped to the API key's owner — all queries are filtered by `user_id`.

### Docker

- Multi-stage Dockerfile: `node:22-alpine` builds the Vite bundle and native modules, then copies to a lean runner image
- Express serves both the API and statically built frontend from `dist/`
- SQLite database is persisted via Docker volume at `/data/finance.db`
- GitHub Actions (`.github/workflows/docker-publish.yml`) publishes to Docker Hub as `anri04/finance-tracker` — triggered only on `v*` tags
- `docker-compose.yml` is gitignored; commit `docker-compose.example.yml` instead
- `JWT_SECRET` must be set in the environment (see `docker-compose.example.yml`)

### Important gitignore notes

- `data/` and `*.db` are gitignored — SQLite database files
- `docker-compose.yml` is gitignored; commit `docker-compose.example.yml` instead

## Release-Prozess

**Wichtig:** Den Release-Prozess (Tag + GitHub Release) nur ausführen, wenn der Nutzer explizit darum bittet. Normale Code-Änderungen werden nur committed und gepusht.

Reihenfolge bei einem neuen Release (Beispiel: `v0.5.0`):

```bash
# 1. Version in package.json aktualisieren
#    (manuell oder per Edit-Tool)

# 2. Commit
git add <geänderte Dateien> package.json
git commit -m "feat/fix: ..."

# 3. Push
git push origin master

# 4. Tag erstellen & pushen  →  löst GitHub Actions Docker-Build aus
git tag v0.5.0
git push origin v0.5.0

# 5. GitHub Release erstellen
"/c/Program Files/GitHub CLI/gh.exe" release create v0.5.0 \
  --title "v0.5.0" \
  --notes "## Was ist neu
- ...

## Docker
\`\`\`
docker pull anri04/finance-tracker:v0.5.0
\`\`\`"
```

**Hinweise:**
- `gh` ist nur über den vollen Pfad erreichbar: `/c/Program Files/GitHub CLI/gh.exe`
- Der Tag-Push triggert automatisch den Docker-Build via GitHub Actions (`v*`-Muster)
- Versionierung: Patch (`x.x.1`) für Bugfixes, Minor (`x.1.0`) für neue Features
