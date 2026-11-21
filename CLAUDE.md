# Rendiconto — project guide

Personal-finance PWA for iPhone. Data lives only on the device (IndexedDB).
The owner works **only from an iPhone**: never ask them to run commands.
Everything is built, tested and deployed by GitHub Actions; they verify by
opening https://cnjd64258d-art.github.io/rendiconto/ in Safari / from the Home Screen.

## Language
- Talk to the owner in **Italian**. UI text is **Italian only**.
- Code, identifiers, comments, commit messages: **English**.

## Commands (CI runs them; useful for agents)
| Command | What |
| --- | --- |
| `npm ci` | install from lockfile |
| `npm run dev` | dev server (base `/rendiconto/`) |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | `tsc` for app (`tsconfig.json`) and configs (`tsconfig.node.json`) |
| `npm test` | Vitest (all logic in `src/core/`) |
| `npm run build` | typecheck + Vite build + PWA assets/service worker into `dist/` |

## Deploy
- `.github/workflows/deploy.yml`: on every PR → lint, test, build.
  On push to `main` → same, then deploy `dist/` to GitHub Pages.
- Repo setting (one-time, done by owner): Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- `base` is `/rendiconto/` (vite.config.ts). Routing is hash-based (`#/…`) because Pages has no SPA fallback.

## Stack and dependencies (keep it small; justify every new one)
- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- CSS Modules + design tokens as CSS variables (`src/ui/tokens.css`). No UI frameworks.
- `dexie` + `dexie-react-hooks`: IndexedDB with versioned migrations and live queries.
- `vite-plugin-pwa` (+ `@vite-pwa/assets-generator`, build-only): service worker, manifest,
  icons/apple-touch-icon/iOS splash generated from `public/logo.svg` (`pwa-assets.config.ts`).
- `@tanstack/react-virtual`: virtualised lists (5,000+ rows).
- Charts: hand-made SVG. Router: hand-made (`src/app/router.ts`).
- Dev: Vitest, ESLint (typescript-eslint, react-hooks), fake-indexeddb.

## Structure
```
src/core/      pure TS domain logic, no React/Dexie/DOM (lint-enforced). Tests beside files.
src/db/        Dexie schema, migrations, seed, demo data (from M2)
src/ui/        design system: tokens.css, global.css, components/
src/features/  one folder per screen (today, transactions, add, analysis, budget, settings, design…)
src/app/       App shell, router, tab bar, PWA update prompt, storage persistence
tests/fixtures synthetic CSVs only
```

## Rules
- **Money is integer cents** (`Cents`), never floats. Parse with `parseAmount` (string based).
- Dates are `YYYY-MM-DD` strings, accrual months `YYYY-MM`. No time zones.
- **No calculations in components.** Totals, accrual, budgets, splits, insights… live in `src/core/` with Vitest tests.
- Categories and payment methods come only from closed lists (stable ids like `cat_alimentari`, `pm_paypal`).
- Formatting via `src/core/format.ts` (Intl it-IT): `1.234,56 €`, `mar 13 gen`, weeks start Monday.
- Never commit personal data: `*.csv` is git-ignored except `tests/fixtures/`.
- No network calls besides loading the app. No analytics, no backend, no accounts.
- iOS details: inputs ≥ 16px, `inputmode="decimal"` for amounts, safe-area insets, no page bounce
  (body doesn't scroll; each screen has its own scroll container), tap targets ≥ 44px,
  respect `prefers-reduced-motion`, no `navigator.vibrate` (use micro-animations instead).
- To open the keyboard from a tap, call `primeKeyboard()` synchronously in the handler
  (iOS only focuses inside a user gesture), then autofocus the real input.
  `openNewTransaction()` (src/app/editor.ts) does this for the quick-add sheet.
- Web Share also needs the tap: backup files are prepared ahead of time (BackupPage) and
  `shareOrDownload()` is called directly in the handler.

## Implementation notes (M2)
- Seed lists live in `src/core/seed.ts`; Dexie seeds them on first open (`populate`) and after "Cancella tutto".
- Demo rows have ids `demo_00001…` and tag `demo`, so they can be removed without touching real data.
- `meta.lastBackupAt` drives the 7-day reminder; it is also set after a restore (to the backup's date).
- Quick add: suggestions come from `core/suggest.ts` (history-based, deterministic). Category auto-fills from
  keywords until the user taps a chip; the payment method follows the category's usual one until tapped.
- Deleting shows a toast with "Annulla" that puts the row back.

## Implementation notes (M3)
- CSV import: `core/csv/parse.ts` (RFC-4180-ish, BOM, CRLF, delimiter detection) and `core/csv/import.ts`
  (`planImport` is pure: mapping, normalisation, aliases, duplicates, totals by accrual year, `checkTotals`).
  `db/imports.ts` commits a plan as an `importBatch`; "Annulla import" deletes rows by `importBatchId`.
- Idempotent re-import counts occurrences: the n-th identical row (same date, amount, description) in a file is
  skipped when the DB already has n rows with that `dedupeKey`. Legit identical rows in one file are kept (warning).
- Income files (period, amount): `YYYY` → `YYYY-12-31`, accrual `YYYY-12`, note "Importato da Rendiconto".
- Screen: `#/impostazioni/import`. Acceptance test: `tests/import.acceptance.test.ts` with synthetic fixtures
  (imported via `?raw`, no Node types needed).

## Implementation notes (M4)
- Recurring rules (`core/recurring.ts`): monthly / quarterly / yearly on `dayOfMonth` (clamped to short months),
  counted from the start month. `generatedThrough` is the generation cursor: at app open and on return to
  foreground (`App.tsx` → `db/recurring.ts#generateRecurring`) every matured occurrence becomes a
  `status: 'pending'` transaction linked by `recurringRuleId`. New rules, schedule changes and resumed rules never
  back-fill past dates. Pending rows are excluded from totals until confirmed (tap "Conferma", or edit + Salva).
  Deleting a rule deletes only its pending rows.
- Today (`core/month.ts#monthOverview`, accrual month): spent/income/balance (confirmed only), budget =
  latest budget per target (a group budget replaces its categories), "al giorno" per decision 3, projection =
  spent + still-due fixed costs + everyday (non-recurring) daily pace × remaining days, vs income + due income.
  Without budgets (until M6) the hero shows spent only.
- Categories / methods (`core/lists.ts`): names unique after normalisation, ids are stable slugs (`cat_cene_fuori`),
  archive instead of delete, ↑/↓ reorder keeps `order` dense. Demo data also adds demo rules (`demo_rule_*`).

## Implementation notes (M5)
- Views (`core/views.ts`, pure): `ViewConfig { layout, filter, sort, groupBy, boardBy, columns }` is what a
  `savedViews` row stores (`normalizeConfig` reads old/partial rows defensively). Filters: OR inside a property,
  AND across properties; period on accrual month by default or payment date; amount range on my share; search
  over title, notes, tags, category and method (normalised), and an amount typed in the search matches exactly.
  `SearchCache` keeps the per-row search text for a data snapshot so typing stays instant with 6,000+ rows.
- Transactions screen: Notion-like tabs (Tutte + saved views; tap the active tab to rename/delete), search,
  Filtri sheet, layout/sort/group sheet. Unsaved changes live in `features/transactions/viewState.ts`
  (survive tab switches, not reloads) with "Salva" / "Ripristina". List and Table are virtualised; the table
  pins its header under the nav bar and its first column, and syncs header scroll in JS. Board caps 60 cards
  per column. Calendar heatmap is by payment date, intensity vs the month's 90th-percentile day.

## Data model (agreed plan, Dexie v1 from M2)
transactions, categoryGroups, categories, paymentMethods, people, recurringRules,
installmentPlans, settlements, budgets, savingsGoals, savedViews, importBatches, yearNotes, meta.
Key fields: `amountCents` (positive int), `kind` expense|income|transfer, `date`, `accrualMonth`,
`status` confirmed|pending, `split { totalCents, myShareCents, paidBy, shares[] }`, `dedupeKey`, `importBatchId`.
Effective expense = `myShareCents` when split, else `amountCents` (single function in core).
Backups: `{ format: "rendiconto-backup", schemaVersion, appVersion, exportedAt, tables }`,
migrated forward by pure functions in `src/core/backup/`.

## Product decisions (owner-approved)
1. Installments: each instalment inherits the plan's accrual month (editable).
2. When a friend repays their share it closes the debt; it is **not** income.
   Category "Rimborsi" is for real refunds (employer, insurance).
3. "Puoi spendere ancora X € al giorno" = (monthly budget − spent − fixed/recurring still due this month) ÷ days left (today included).
4. Income category "Altro" is named "Altre entrate". Tags are free text but normalised (trim, lowercase) with autocomplete.
5. Analysis uses accrual month by default, with a toggle to payment date.
6. PIN is an app-open lock (hash + salt), not encryption.

## Milestones
M1 setup/CI/PWA/design system · M2 DB, quick add, list, backup · M3 CSV import with totals check ·
M4 Today, categories, methods, recurring · M5 Notion-like views · M6 Budget ·
M7 Analysis, insights, "Tira una linea" + PDF · M8 Installments and shared expenses · M9 Polish.
Each milestone: branch → PR with a short "what to try on iPhone" list → green CI → owner merges → Pages deploy. Then stop and wait.

Import acceptance totals (expenses by accrual): 2023 = 26.515,57 €, 2024 = 19.773,87 €, 2025 = 19.593,59 €;
2026 = sum of the CSV (128,12 € above the old Numbers file, which had two wrong cells).
