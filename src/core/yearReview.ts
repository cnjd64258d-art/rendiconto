import { breakdown, inPeriod, monthlySeries, totalsOf, yearPeriod, yearsWithData, type Basis, type GroupAmount, type MonthPoint, type Totals } from './analysis';
import { centsToDecimal, toCsv } from './csv';
import { daysInMonth, monthOf, parseISODate, yearOf, type ISODate, type YearMonth } from './dates';
import type { Cents } from './money';
import { compareTransactionsDesc, effectiveCents } from './transactions';
import type { Category, CategoryGroup, Transaction } from './types';

export const TOP_EXPENSES = 10;

export interface YearReview {
  year: number;
  basis: Basis;
  /** True while the year is not over: averages use the days elapsed so far. */
  inProgress: boolean;
  totals: Totals;
  income: GroupAmount[];
  expenses: GroupAmount[];
  /** Earlier years with data, newest first. */
  previous: { year: number; totals: Totals }[];
  top: Transaction[];
  months: MonthPoint[];
  priciest: { month: YearMonth; cents: Cents } | null;
  /** Among complete months with spending. */
  cheapest: { month: YearMonth; cents: Cents } | null;
  days: number;
  dailyAverageCents: Cents;
}

function isLeap(year: number): boolean {
  return daysInMonth(year, 2) === 29;
}

/** Day of the year, 1-based. */
function dayOfYear(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  let n = day;
  for (let m = 1; m < month; m++) n += daysInMonth(year, m);
  return n;
}

/** "Tira una linea": the yearly statement (decision 5: accrual month unless the toggle says otherwise). */
export function yearReview(input: {
  transactions: readonly Transaction[];
  categories: readonly Pick<Category, 'id' | 'groupId'>[];
  year: number;
  basis: Basis;
  today: ISODate;
}): YearReview {
  const { transactions, categories, year, basis, today } = input;
  const rows = inPeriod(transactions, yearPeriod(year), basis);
  const thisYear = yearOf(today);
  const inProgress = year === thisYear;
  const months = monthlySeries(transactions, yearPeriod(year), basis);
  const currentMonth = monthOf(today);

  const withSpend = months.filter((m) => m.expenseCents > 0 && (!inProgress || m.month <= currentMonth));
  let priciest: YearReview['priciest'] = null;
  let cheapest: YearReview['cheapest'] = null;
  for (const m of withSpend) {
    if (!priciest || m.expenseCents > priciest.cents) priciest = { month: m.month, cents: m.expenseCents };
    if (inProgress && m.month === currentMonth) continue;
    if (!cheapest || m.expenseCents < cheapest.cents) cheapest = { month: m.month, cents: m.expenseCents };
  }

  const totals = totalsOf(rows);
  const days = year > thisYear ? 0 : inProgress ? dayOfYear(today) : isLeap(year) ? 366 : 365;
  const previous = yearsWithData(transactions, basis)
    .filter((y) => y < year)
    .reverse()
    .map((y) => ({ year: y, totals: totalsOf(inPeriod(transactions, yearPeriod(y), basis)) }));

  return {
    year,
    basis,
    inProgress,
    totals,
    income: breakdown(rows, 'income', { categories }),
    expenses: breakdown(rows, 'expense', { categories }),
    previous,
    top: rows
      .filter((t) => t.kind === 'expense')
      .sort((a, b) => effectiveCents(b) - effectiveCents(a) || compareTransactionsDesc(a, b))
      .slice(0, TOP_EXPENSES),
    months,
    priciest,
    cheapest,
    days,
    dailyAverageCents: days > 0 ? Math.round(totals.expenseCents / days) : 0,
  };
}

/** CSV of the statement: one row per line of the page (section, item, amount with dot decimals, share). */
export function reviewCsv(r: YearReview, categories: readonly Category[], groups: readonly CategoryGroup[]): string {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const grp = new Map(groups.map((g) => [g.id, g.name]));
  const pct = (x: number | null) => (x === null ? '' : `${(x * 100).toFixed(1)}%`);
  const rows: string[][] = [['sezione', 'voce', 'importo', 'percentuale']];
  rows.push(['Totali', 'Entrate', centsToDecimal(r.totals.incomeCents), '']);
  rows.push(['Totali', 'Uscite', centsToDecimal(r.totals.expenseCents), '']);
  rows.push(['Totali', 'Delta', centsToDecimal(r.totals.savingsCents), pct(r.totals.savingsRate)]);
  rows.push(['Totali', 'Spesa media giornaliera', centsToDecimal(r.dailyAverageCents), '']);
  for (const g of r.income) for (const c of g.categories) rows.push(['Entrate', cat.get(c.categoryId) ?? 'Senza categoria', centsToDecimal(c.cents), pct(g.share * c.share)]);
  for (const g of r.expenses) {
    rows.push(['Uscite per macro-voce', grp.get(g.groupId) ?? 'Senza macro-voce', centsToDecimal(g.cents), pct(g.share)]);
    for (const c of g.categories) rows.push([`Uscite · ${grp.get(g.groupId) ?? ''}`, cat.get(c.categoryId) ?? 'Senza categoria', centsToDecimal(c.cents), pct(c.share)]);
  }
  for (const m of r.months) {
    rows.push(['Mesi', m.month, centsToDecimal(m.expenseCents), '']);
  }
  for (const p of r.previous) rows.push(['Anni precedenti', `${p.year} delta`, centsToDecimal(p.totals.savingsCents), pct(p.totals.savingsRate)]);
  r.top.forEach((t, i) => rows.push(['Top spese', `${i + 1}. ${t.date} ${t.title}`, centsToDecimal(effectiveCents(t)), '']));
  return toCsv(rows);
}

/** In December and January Today suggests "Tira una linea" (for the year ending or just ended). */
export function suggestedReviewYear(today: ISODate): number | null {
  const { year, month } = parseISODate(today);
  if (month === 12) return year;
  if (month === 1) return year - 1;
  return null;
}
