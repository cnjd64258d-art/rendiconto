import { daysInMonth, isISODate, isYearMonth, monthOf, yearOf, type ISODate, type YearMonth } from '../dates';
import { parseAmount, type Cents } from '../money';
import { cleanTitle, dedupeKey, normalizeText, type TransactionInput } from '../transactions';
import type { Category, CategoryGroup, Id, PaymentMethod, TransactionKind } from '../types';
import type { ParsedCsv } from './parse';

/* ---------------------------------------------------------------------------
 * Generic CSV importer. Two shapes are supported out of the box:
 * - "transactions": one row per movement (date, description, amount, …)
 * - "income": yearly or monthly income totals (period, item, amount)
 * Columns are mapped by name (with synonyms) and can be remapped by the user.
 * ------------------------------------------------------------------------- */

export type ImportKind = 'transactions' | 'income';

export const TX_FIELDS = ['date', 'title', 'amount', 'category', 'method', 'period', 'notes', 'kind'] as const;
export type TxField = (typeof TX_FIELDS)[number];
export const INCOME_FIELDS = ['period', 'item', 'amount', 'method'] as const;
export type IncomeField = (typeof INCOME_FIELDS)[number];

export const FIELD_LABELS: Record<TxField | IncomeField, string> = {
  date: 'Data',
  title: 'Descrizione',
  amount: 'Importo',
  category: 'Categoria',
  method: 'Metodo di pagamento',
  period: 'Periodo / competenza',
  notes: 'Note',
  kind: 'Tipo (uscita/entrata)',
  item: 'Voce',
};

export const REQUIRED_FIELDS: Record<ImportKind, readonly string[]> = {
  transactions: ['date', 'title', 'amount', 'category'],
  income: ['period', 'item', 'amount'],
};

const SYNONYMS: Record<string, string[]> = {
  date: ['data', 'date', 'giorno', 'data pagamento', 'data operazione'],
  title: ['descrizione', 'description', 'titolo', 'causale', 'nome'],
  amount: ['importo', 'amount', 'valore', 'euro', 'spesa', 'totale'],
  category: ['categoria', 'category', 'voce di spesa'],
  method: ['metodo_pagamento', 'metodo pagamento', 'metodo', 'tipo pagamento', 'pagamento', 'payment method'],
  period: ['periodo_rendiconto', 'periodo', 'competenza', 'mese competenza', 'period'],
  notes: ['note', 'notes', 'nota'],
  kind: ['tipo', 'kind', 'type'],
  item: ['voce', 'item', 'categoria'],
};

export type ColumnMapping = Partial<Record<TxField | IncomeField, number>>;

function headerKey(h: string): string {
  return normalizeText(h).replace(/[_-]+/g, ' ');
}

export function detectImportKind(header: readonly string[]): ImportKind {
  const keys = header.map(headerKey);
  const has = (field: string) => (SYNONYMS[field] ?? []).some((s) => keys.includes(headerKey(s)));
  return has('date') || has('title') ? 'transactions' : has('item') && has('period') ? 'income' : 'transactions';
}

export function guessMapping(header: readonly string[], kind: ImportKind): ColumnMapping {
  const keys = header.map(headerKey);
  const fields = kind === 'transactions' ? TX_FIELDS : INCOME_FIELDS;
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of fields) {
    for (const syn of SYNONYMS[field] ?? []) {
      const idx = keys.indexOf(headerKey(syn));
      if (idx !== -1 && !used.has(idx)) {
        mapping[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

/* ---------- cell parsers ---------- */

/** ISO, dd/mm/yyyy, d/m/yy, dd-mm-yyyy, dd.mm.yyyy → ISO date, or null. */
export function parseDateCell(value: string): ISODate | null {
  const v = value.trim();
  if (isISODate(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const iso = `${year}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** Accrual month from the Numbers sheet period ("2023" or "2026-05"). */
export function accrualFromPeriod(date: ISODate, period: string): YearMonth | null {
  const p = period.trim();
  if (p === '') return monthOf(date);
  if (isYearMonth(p)) return p;
  if (/^\d{4}$/.test(p)) {
    const y = Number(p);
    const dy = yearOf(date);
    if (dy === y) return monthOf(date);
    // Paid in late December for next year's sheet (or early January for the previous one).
    return dy < y ? `${p}-01` : `${p}-12`;
  }
  return null;
}

export function detectDecimal(values: readonly string[]): ',' | '.' {
  let dot = 0;
  let comma = 0;
  for (const v of values) {
    if (/\d\.\d{1,2}$/.test(v.trim())) dot += 1;
    else if (/\d,\d{1,2}$/.test(v.trim())) comma += 1;
  }
  return comma > dot ? ',' : '.';
}

/* ---------- lookups with synonyms ---------- */

const CATEGORY_ALIASES: Record<string, Id> = {
  altro: 'cat_altre_entrate',
  'altre entrate': 'cat_altre_entrate',
  'oggetti personali': 'cat_altri_oggetti',
  oggetti: 'cat_altri_oggetti',
  bolletta: 'cat_utenze',
  bollette: 'cat_utenze',
  abbonamento: 'cat_abbonamenti',
  rimborso: 'cat_rimborsi',
  spesa: 'cat_alimentari',
  trasporto: 'cat_trasporti',
  viaggio: 'cat_viaggi',
};

const METHOD_ALIASES: Record<string, Id> = {
  conto: 'pm_conto',
  'conto corrente': 'pm_conto',
  cc: 'pm_conto',
  bancomat: 'pm_conto',
  carta: 'pm_conto',
  'carta di debito': 'pm_conto',
  bonifico: 'pm_conto',
  contante: 'pm_contanti',
  cash: 'pm_contanti',
};

function lookupTable<T extends { id: Id; name: string }>(items: readonly T[], aliases: Record<string, Id>): Map<string, Id> {
  const map = new Map<string, Id>();
  const ids = new Set(items.map((i) => i.id));
  for (const [alias, id] of Object.entries(aliases)) if (ids.has(id)) map.set(alias, id);
  for (const item of items) map.set(normalizeText(item.name), item.id);
  return map;
}

/* ---------- planning ---------- */

export interface ImportContext {
  categories: readonly Category[];
  groups: readonly CategoryGroup[];
  methods: readonly PaymentMethod[];
  /** How many times each dedupe key already exists in the database. */
  existing: ReadonlyMap<string, number>;
}

export interface ImportOptions {
  kind: ImportKind;
  mapping: ColumnMapping;
  decimal: ',' | '.';
  /** normalised CSV value → category id chosen by the user */
  categoryOverrides: Readonly<Record<string, Id>>;
  methodOverrides: Readonly<Record<string, Id>>;
  defaultMethodId: Id;
  /** Note added to every imported row (e.g. "Importato da Rendiconto"). */
  extraNote?: string;
}

export interface RowIssue {
  line: number;
  message: string;
}

export interface UnknownValue {
  key: string;
  value: string;
  count: number;
}

export interface YearTotals {
  year: number;
  expenseCents: Cents;
  incomeCents: Cents;
  count: number;
}

export interface ImportPlan {
  kind: ImportKind;
  totalRows: number;
  toImport: TransactionInput[];
  duplicates: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  unknownCategories: UnknownValue[];
  unknownMethods: UnknownValue[];
  totalsByYear: YearTotals[];
  missingColumns: string[];
}

export const IMPORT_NOTE = 'Importato da Rendiconto';

export function planImport(csv: ParsedCsv, options: ImportOptions, ctx: ImportContext): ImportPlan {
  const { mapping } = options;
  const missing = REQUIRED_FIELDS[options.kind].filter((f) => mapping[f as TxField] === undefined);
  const plan: ImportPlan = {
    kind: options.kind,
    totalRows: csv.rows.length,
    toImport: [],
    duplicates: 0,
    errors: [],
    warnings: [],
    unknownCategories: [],
    unknownMethods: [],
    totalsByYear: [],
    missingColumns: missing,
  };
  if (missing.length > 0) return plan;

  const categoryById = new Map(ctx.categories.map((c) => [c.id, c]));
  const incomeGroups = new Set(ctx.groups.filter((g) => g.kind === 'income').map((g) => g.id));
  const catLookup = lookupTable(ctx.categories, CATEGORY_ALIASES);
  const methodLookup = lookupTable(ctx.methods, METHOD_ALIASES);
  const unknownCats = new Map<string, UnknownValue>();
  const unknownMethods = new Map<string, UnknownValue>();
  const seenInFile = new Map<string, { count: number; firstLine: number }>();
  const years = new Map<number, YearTotals>();

  const cell = (cells: string[], field: TxField | IncomeField) => {
    const idx = mapping[field];
    return idx === undefined ? '' : (cells[idx] ?? '').trim();
  };

  const resolve = (
    raw: string,
    lookup: Map<string, Id>,
    overrides: Readonly<Record<string, Id>>,
    unknown: Map<string, UnknownValue>,
  ): Id | null => {
    const key = normalizeText(raw);
    const id = overrides[key] ?? lookup.get(key);
    if (id) return id;
    const u = unknown.get(key);
    if (u) u.count += 1;
    else unknown.set(key, { key, value: raw.trim(), count: 1 });
    return null;
  };

  for (const { line, cells } of csv.rows) {
    const issues: string[] = [];
    let date: ISODate | null;
    let accrual: YearMonth | null;
    let title: string;
    let categoryRaw: string;

    if (options.kind === 'income') {
      const period = cell(cells, 'period');
      title = cleanTitle(cell(cells, 'item'));
      categoryRaw = title;
      if (/^\d{4}$/.test(period)) {
        date = `${period}-12-31`;
        accrual = `${period}-12`;
      } else if (isYearMonth(period)) {
        const y = Number(period.slice(0, 4));
        const m = Number(period.slice(5, 7));
        date = `${period}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
        accrual = period;
      } else {
        date = null;
        accrual = null;
        issues.push(`Periodo non valido «${period}»`);
      }
    } else {
      const rawDate = cell(cells, 'date');
      date = parseDateCell(rawDate);
      if (!date) issues.push(rawDate ? `Data non valida «${rawDate}»` : 'Data mancante');
      title = cleanTitle(cell(cells, 'title'));
      categoryRaw = cell(cells, 'category');
      accrual = date ? accrualFromPeriod(date, cell(cells, 'period')) : null;
      if (date && !accrual) issues.push(`Periodo non valido «${cell(cells, 'period')}»`);
    }

    if (!title) issues.push('Descrizione mancante');

    const rawAmount = cell(cells, 'amount');
    const amount = parseAmount(rawAmount, options.decimal);
    if (amount === null) issues.push(rawAmount ? `Importo non valido «${rawAmount}»` : 'Importo mancante');
    else if (amount <= 0) issues.push(`Importo non positivo «${rawAmount}»`);

    const categoryId = categoryRaw ? resolve(categoryRaw, catLookup, options.categoryOverrides, unknownCats) : null;
    if (!categoryRaw) issues.push('Categoria mancante');
    else if (!categoryId) issues.push(`Categoria sconosciuta «${categoryRaw}»`);

    const methodRaw = cell(cells, 'method');
    const methodId = methodRaw
      ? resolve(methodRaw, methodLookup, options.methodOverrides, unknownMethods)
      : options.defaultMethodId;
    if (methodRaw && !methodId) issues.push(`Metodo sconosciuto «${methodRaw}»`);

    if (issues.length > 0 || !date || !accrual || amount === null || amount <= 0 || !categoryId || !methodId) {
      plan.errors.push({ line, message: issues.join(' · ') });
      continue;
    }

    const category = categoryById.get(categoryId);
    let kind: TransactionKind = category && incomeGroups.has(category.groupId) ? 'income' : 'expense';
    const kindRaw = normalizeText(cell(cells, 'kind'));
    if (kindRaw.startsWith('entrat') || kindRaw === 'income') kind = 'income';
    else if (kindRaw.startsWith('uscit') || kindRaw === 'expense') kind = 'expense';

    const notes = [cell(cells, 'notes'), options.extraNote ?? ''].filter(Boolean).join(' · ');
    const key = dedupeKey(date, amount, title);

    // Idempotent: the n-th identical row in the file is skipped if the DB already has n of them.
    const seen = seenInFile.get(key);
    const occurrence = seen ? seen.count : 0;
    if (seen) {
      seen.count += 1;
      plan.warnings.push({ line, message: `Uguale alla riga ${seen.firstLine} (stessa data, importo e descrizione)` });
    } else {
      seenInFile.set(key, { count: 1, firstLine: line });
    }
    if ((ctx.existing.get(key) ?? 0) > occurrence) {
      plan.duplicates += 1;
      continue;
    }

    plan.toImport.push({
      title,
      amountCents: amount,
      kind,
      date,
      accrualMonth: accrual,
      categoryId,
      paymentMethodId: methodId,
      status: 'confirmed',
      notes,
      tags: [],
      dedupeKey: key,
    });

    const year = yearOf(accrual);
    let y = years.get(year);
    if (!y) years.set(year, (y = { year, expenseCents: 0, incomeCents: 0, count: 0 }));
    y.count += 1;
    if (kind === 'income') y.incomeCents += amount;
    else y.expenseCents += amount;
  }

  plan.unknownCategories = [...unknownCats.values()].sort((a, b) => b.count - a.count);
  plan.unknownMethods = [...unknownMethods.values()].sort((a, b) => b.count - a.count);
  plan.totalsByYear = [...years.values()].sort((a, b) => a.year - b.year);
  return plan;
}

/** Expense totals by accrual year from the owner's Numbers file (acceptance check). */
export const EXPECTED_EXPENSE_TOTALS: Readonly<Record<number, Cents>> = {
  2023: 2_651_557,
  2024: 1_977_387,
  2025: 1_959_359,
};

/** Counts dedupe keys, for `ImportContext.existing`. */
export function countKeys(keys: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

export interface TotalsCheck extends YearTotals {
  expectedCents: Cents | null;
  /** imported − expected, null when there is no reference value. */
  diffCents: Cents | null;
}

/** Year totals next to the reference values, for the confirmation screen. */
export function checkTotals(
  totals: readonly YearTotals[],
  expected: Readonly<Record<number, Cents>> = EXPECTED_EXPENSE_TOTALS,
): TotalsCheck[] {
  return totals.map((t) => {
    const e = expected[t.year];
    return { ...t, expectedCents: e ?? null, diffCents: e === undefined ? null : t.expenseCents - e };
  });
}
