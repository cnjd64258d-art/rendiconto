import { addMonths, monthOf, yearOf, type YearMonth } from './dates';
import type { Cents } from './money';
import { effectiveCents } from './transactions';
import type { Category, CategoryGroup, Id, Transaction } from './types';

/** Accrual month ("competenza", default) or payment date (decision 5). */
export type Basis = 'accrual' | 'payment';

export const BASIS_LABELS: Record<Basis, string> = { accrual: 'Competenza', payment: 'Data di pagamento' };

/** Inclusive range of months. */
export interface Period {
  from: YearMonth;
  to: YearMonth;
}

export function monthPeriod(month: YearMonth): Period {
  return { from: month, to: month };
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01`, to: `${year}-12` };
}

/** Swaps the ends when needed, so a custom range typed backwards still works. */
export function normalizePeriod(p: Period): Period {
  return p.from <= p.to ? p : { from: p.to, to: p.from };
}

export function monthsIn(p: Period): YearMonth[] {
  const out: YearMonth[] = [];
  for (let m = p.from; m <= p.to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function monthKey(t: Pick<Transaction, 'accrualMonth' | 'date'>, basis: Basis): YearMonth {
  return basis === 'accrual' ? t.accrualMonth : monthOf(t.date);
}

/** Confirmed income and expenses (my share) inside the period; transfers and pending rows never count. */
export function inPeriod(transactions: readonly Transaction[], period: Period, basis: Basis): Transaction[] {
  return transactions.filter((t) => {
    if (t.status !== 'confirmed' || t.kind === 'transfer') return false;
    const m = monthKey(t, basis);
    return m >= period.from && m <= period.to;
  });
}

export interface Totals {
  incomeCents: Cents;
  expenseCents: Cents;
  /** income − expense. */
  savingsCents: Cents;
  /** savings ÷ income; null without income. */
  savingsRate: number | null;
}

export function totalsOf(rows: readonly Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of rows) {
    if (t.status !== 'confirmed') continue;
    if (t.kind === 'income') income += t.amountCents;
    else if (t.kind === 'expense') expense += effectiveCents(t);
  }
  const savings = income - expense;
  return { incomeCents: income, expenseCents: expense, savingsCents: savings, savingsRate: income > 0 ? savings / income : null };
}

export interface CategoryAmount {
  categoryId: Id;
  cents: Cents;
  /** Share of the group's total. */
  share: number;
  count: number;
}

export interface GroupAmount {
  groupId: Id;
  cents: Cents;
  /** Share of all expenses (or income) in the period. */
  share: number;
  categories: CategoryAmount[];
}

type Lists = { categories: readonly Pick<Category, 'id' | 'groupId'>[] };

/** Amounts by macro-voce and category, biggest first ("barre orizzontali ordinate"). */
export function breakdown(rows: readonly Transaction[], kind: 'expense' | 'income', { categories }: Lists): GroupAmount[] {
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  const byCat = new Map<Id, { cents: number; count: number }>();
  for (const t of rows) {
    if (t.kind !== kind || t.status !== 'confirmed') continue;
    const id = t.categoryId ?? '';
    const cur = byCat.get(id) ?? { cents: 0, count: 0 };
    cur.cents += kind === 'expense' ? effectiveCents(t) : t.amountCents;
    cur.count += 1;
    byCat.set(id, cur);
  }
  const groups = new Map<Id, GroupAmount>();
  let total = 0;
  for (const [categoryId, v] of byCat) {
    const groupId = groupOf.get(categoryId) ?? '';
    let g = groups.get(groupId);
    if (!g) groups.set(groupId, (g = { groupId, cents: 0, share: 0, categories: [] }));
    g.cents += v.cents;
    g.categories.push({ categoryId, cents: v.cents, share: 0, count: v.count });
    total += v.cents;
  }
  const out = [...groups.values()].filter((g) => g.cents !== 0);
  for (const g of out) {
    g.share = total > 0 ? g.cents / total : 0;
    for (const c of g.categories) c.share = g.cents > 0 ? c.cents / g.cents : 0;
    g.categories.sort((a, b) => b.cents - a.cents);
  }
  return out.sort((a, b) => b.cents - a.cents);
}

export interface MonthPoint extends Totals {
  month: YearMonth;
  /** Savings from the start of the period through this month. */
  cumulativeSavingsCents: Cents;
}

/** "Andamento mensile entrate vs uscite" plus cumulative savings. */
export function monthlySeries(transactions: readonly Transaction[], period: Period, basis: Basis): MonthPoint[] {
  const buckets = new Map<YearMonth, Transaction[]>();
  for (const t of inPeriod(transactions, period, basis)) {
    const m = monthKey(t, basis);
    const list = buckets.get(m);
    if (list) list.push(t);
    else buckets.set(m, [t]);
  }
  let cumulative = 0;
  return monthsIn(period).map((month) => {
    const totals = totalsOf(buckets.get(month) ?? []);
    cumulative += totals.savingsCents;
    return { month, ...totals, cumulativeSavingsCents: cumulative };
  });
}

/** Years with at least one confirmed income or expense, oldest first. */
export function yearsWithData(transactions: readonly Transaction[], basis: Basis): number[] {
  const years = new Set<number>();
  for (const t of transactions) if (t.status === 'confirmed' && t.kind !== 'transfer') years.add(yearOf(monthKey(t, basis)));
  return [...years].sort((a, b) => a - b);
}

export interface YoyRow {
  id: Id;
  /** Expenses per year, aligned with `years`. */
  values: Cents[];
  /** Last year − previous year. */
  deltaCents: Cents;
  /** delta ÷ previous year; null when the previous year is 0. */
  deltaRatio: number | null;
}

export interface YearOverYear {
  years: number[];
  total: YoyRow;
  groups: (YoyRow & { categories: YoyRow[] })[];
}

function yoyRow(id: Id, values: Cents[]): YoyRow {
  const last = values[values.length - 1] ?? 0;
  const prev = values[values.length - 2] ?? 0;
  return { id, values, deltaCents: last - prev, deltaRatio: prev > 0 ? (last - prev) / prev : null };
}

/**
 * "Confronto anno su anno" by macro-voce and category. The last two years give the variation.
 * `upToMonth` (1–12) compares the same months of every year, so a year in progress is fair.
 */
export function yearOverYear(
  transactions: readonly Transaction[],
  years: readonly number[],
  basis: Basis,
  lists: Lists,
  upToMonth = 12,
): YearOverYear {
  const index = new Map(years.map((y, i) => [y, i]));
  const groupOf = new Map(lists.categories.map((c) => [c.id, c.groupId]));
  const byCat = new Map<Id, Cents[]>();
  const total = years.map(() => 0);
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed') continue;
    const m = monthKey(t, basis);
    const i = index.get(yearOf(m));
    if (i === undefined || Number(m.slice(5, 7)) > upToMonth) continue;
    const id = t.categoryId ?? '';
    let v = byCat.get(id);
    if (!v) byCat.set(id, (v = years.map(() => 0)));
    v[i] = (v[i] ?? 0) + effectiveCents(t);
    total[i] = (total[i] ?? 0) + effectiveCents(t);
  }
  const groups = new Map<Id, { values: Cents[]; categories: YoyRow[] }>();
  for (const [categoryId, values] of byCat) {
    const groupId = groupOf.get(categoryId) ?? '';
    let g = groups.get(groupId);
    if (!g) groups.set(groupId, (g = { values: years.map(() => 0), categories: [] }));
    values.forEach((c, i) => (g.values[i] = (g.values[i] ?? 0) + c));
    g.categories.push(yoyRow(categoryId, values));
  }
  const last = (r: { values: Cents[] }) => r.values[r.values.length - 1] ?? 0;
  return {
    years: [...years],
    total: yoyRow('total', total),
    groups: [...groups.entries()]
      .map(([id, g]) => ({ ...yoyRow(id, g.values), categories: g.categories.sort((a, b) => last(b) - last(a)) }))
      .sort((a, b) => last(b) - last(a)),
  };
}

/** Context for names in charts and texts. */
export function nameMaps(categories: readonly Category[], groups: readonly CategoryGroup[]) {
  return {
    category: new Map(categories.map((c) => [c.id, c])),
    group: new Map(groups.map((g) => [g.id, g])),
  };
}
