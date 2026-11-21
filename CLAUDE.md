# Ledgerline — project guide

Personal-finance PWA for iPhone, named **Ledgerline** (renamed from "Rendiconto" after M9). The visible name
(manifest, Home Screen title, page title, UI text, export file names) is Ledgerline; the repo, the URL
(`/rendiconto/`), the IndexedDB name (`rendiconto`), the backup format id (`rendiconto-backup`) and the class
`RendicontoDB` keep the old name so existing data, backups and installs keep working. "Rendiconto YYYY" stays as the
title of the yearly statement (it is the Italian word for it), and the import note "Importato da Rendiconto" refers
to the old spreadsheet. Data lives only on the device (IndexedDB).
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

## Implementation notes (M6)
- Budgets (`core/budget.ts`, pure): a `budgets` row applies from `validFrom` until a newer row for the same target;
  a 0 limit row means "removed from that month". `planBudgetWrite` keeps history: an edit updates the row that
  starts in the edited month, otherwise adds a row from that month (past months never change).
- Spent = confirmed expenses (my share) by accrual month. A group budget covers all its categories and replaces
  their own budgets in the totals (category lines still show, marked "Inclusa nella macro-voce").
- Rollover: unspent (limit + carry − spent, never negative) moves to the next month when the next month's row has
  rollover on; the chain starts at the target's first row and breaks on a month without rollover or budget.
- Status: warning ≥ 80%, over ≥ 100% (`budgetStatus`). Today shows a banner (`alertSummary`), the Budget tab a dot
  (`features/budget/useBudgetAlert.ts`, reads only months since the oldest budget).
- Today/"al giorno" (decision 3) works on the budgeted categories only: budget available − their spent − their
  fixed costs still due. With no budgets the hero shows spent only.
- Savings goal (`savingsGoals`, one row per year): saved = confirmed income − expenses accrued to the year;
  "servono X al mese" = missing ÷ months left (current included), "in linea" vs a steady pace to last month.
- Demo data adds `demo_budget_*` rows only for targets without a real budget; removing demo deletes them.

## Implementation notes (M7)
- Analysis (`core/analysis.ts`, pure): `Basis` accrual|payment (decision 5), `Period {from,to}` of months,
  `inPeriod` (confirmed income/expenses only, my share), `totalsOf`, `breakdown` (macro-voce → categories, sorted),
  `monthlySeries` (+ cumulative savings), `yearOverYear` (last two years give € and % change; a year in progress
  compares the same months of each year).
- Insights (`core/insights.ts`): deterministic rules, Italian text built in core. Spikes compare the last complete
  month with the 6 before (≥ 25% and ≥ 30 €); habits (spikes, top description, weekday) ignore fixed costs:
  rows with `recurringRuleId`/`installmentPlanId` or a description equal to a recurring rule's title.
- "Tira una linea" (`core/yearReview.ts` + `features/review/`, route `#/analisi/anno/YYYY`): statement, previous
  years, top 10, priciest/cheapest month (cheapest skips the month in progress), daily average over elapsed days,
  notes in `yearNotes` (autosave), CSV via `reviewCsv` + `shareOrDownload` in the tap, PDF via `window.print()`
  with the A4 print stylesheet in `ui/global.css` (`[data-noprint]` hides controls). Today shows a card in Dec/Jan.
- Analysis and Review pages are `React.lazy` chunks. Selection lives in `features/analysis/analysisState.ts`.
- Charts are hand-made SVG (`features/analysis/Charts.tsx`): paired income/expense bars, cumulative line,
  sorted horizontal bars; colours `--chart-income` / `--chart-expense` (checked for colour-blind separation).

## Implementation notes (M8)
- Split (`core/split.ts`, pure): `buildSplit(total, draft)` gives `split { totalCents, myShareCents, paidBy, shares[] }`;
  equal mode puts the rounding remainder on the others, "mine" mode takes my share as typed. Only my share counts as
  an expense (`effectiveCents`). If someone else paid, I owe them my share.
- `balances(transactions, settlements, people)`: net per person (+ they owe me). Settlements (decision 2) close debts
  and are never income; they are allocated FIFO to the oldest open items (open / partial / settled).
- Installments (`core/installments.ts`): `planProgress` (paid, remaining, next index/amount, complete). Instalments
  are expenses with `installmentPlanId` + `installmentIndex` and inherit the plan's accrual month (decision 1).
  Deleting a plan keeps its expenses and only unlinks them.
- Quick add advanced area (expenses only): "È una rata di…" (open plan or ＋ Nuovo piano, saved with index 1) and
  "Spesa condivisa" (people chips with inline ＋ Persona, who paid, equal / my share). `core/entry.ts#applyExtras`
  writes the links; `updateTransaction(..., EDITOR_LINKS)` removes links that were turned off.
- Screens: `#/impostazioni/rate` (plans, "Registra la prossima rata" via `openNewInstalment`, link past expenses) and
  `#/impostazioni/condivise` (people, balances, "Registra rimborso", archive). Today shows "Conti in sospeso".
- Demo: `demo_person_*`, `demo_plan_madeira`, `demo_shared_*`, `demo_settlement_1`.

## Implementation notes (M9)
- PIN (decision 6, `core/pin.ts`): PBKDF2-SHA256 (210k iterations, 16-byte salt) via Web Crypto, 4 or 6 digits,
  stored in `meta.pinLock`; failures in `meta.pinAttempts` (after 5: 30 s, doubling, max 15 min). `DEVICE_META_KEYS`
  never go into a backup and survive restore and "Cancella tutto". "Hai dimenticato il PIN?" erases everything
  (`clearAllData(db, false)`), then a backup can be restored.
- Lock (`app/lock.ts` store + `app/LockScreen.tsx`): status `checking` → `locked`/`open`; the app is `inert` behind an
  opaque cover (no fade-in, content must never show). Locks at launch and on return after `lockAfterSec`
  (Subito / 1 / 5 / 15 min; "Subito" also locks on hide for the app-switcher snapshot). `PinPad` is the shared keypad.
  Settings screen `#/impostazioni/pin`.
- Accessibility: text tokens ≥ 4.5:1 on every background (tertiary darkened), tap targets ≥ 44px (pseudo-element hit
  areas on compact pills), Dynamic Type via `font: -apple-system-body` on `html`. Motion: global reduced-motion rule
  plus duration tokens at 1ms; progress bars grow on open, screens rise slightly.
- Face ID / Touch ID (after M9): WebAuthn platform passkey "Ledgerline" (`app/biometric.ts`, ES256, UV required),
  verified locally in `core/biometric.ts` (challenge, origin, RP id hash, UP+UV flags, ECDSA signature with the stored
  SPKI). Config in `meta.biometricLock` (a `DEVICE_META_KEYS` entry); only available while a PIN is set, which stays
  the fallback; removing the PIN removes it. `create`/`get` run straight from a tap: iOS never starts Face ID in a
  web app without one (owner-verified, no automatic attempt). With Face ID on, the lock screen shows a big
  "Usa Face ID" button and the PIN keypad only after "Usa il PIN" (owner's choice). E2E-checked with Chromium's virtual authenticator.
- Today hero (owner's request): the spent amount is bold; Entrate / Uscite / Saldo are tinted cards using
  `--color-income(-soft)` (blue) and `--color-expense(-soft)` (orange), the charts' hues darkened for text contrast,
  and the balance green/red (`--color-positive-soft` / `--color-negative-soft`).
- Icon: `public/logo.svg` / `logo-dark.svg` (three entries, a ruled line, the total). Settings sub-pages have empty states.

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
