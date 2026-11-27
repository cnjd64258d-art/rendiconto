import { budgetMonth, type BudgetTotals, type SpendIndex } from './budget';
import { addDays, addMonths, daysBetween, endOfMonthDate, monthOf, type ISODate, type YearMonth } from './dates';
import type { Cents } from './money';
import { occurrencesBetween, type KindOf } from './recurring';
import { effectiveCents } from './transactions';
import type { Budget, Category, RecurringRule, Transaction } from './types';

export interface MonthOverview {
  month: YearMonth;
  /** Confirmed expenses accrued to the month (my share for split ones). */
  spentCents: Cents;
  /** Confirmed income accrued to the month. */
  incomeCents: Cents;
  /** incomeCents − spentCents. */
  balanceCents: Cents;
  /**
   * The month's budget, counting only the categories it covers (a category budget, or its macro-voce's).
   * Available includes the unspent amount carried over by rollover. Null without budgets.
   */
  budget: (BudgetTotals & { dueCents: Cents }) | null;
  /** Expenses still expected this month: pending recurring ones plus occurrences after today. */
  dueExpenseCents: Cents;
  /** Income still expected this month, same rule. */
  dueIncomeCents: Cents;
  /** Days left in the month, today included. */
  daysLeft: number;
  /**
   * "Puoi spendere ancora X € al giorno": (budget − spent − due) ÷ days left, never below 0, on the budgeted
   * categories only. Null without a budget.
   */
  perDayCents: Cents | null;
  /** budget − spent − due on the budgeted categories (can be negative). Null without a budget. */
  leftCents: Cents | null;
  /** Expected expenses at month end: spent + due + everyday spending at this month's daily pace for the remaining days. */
  projectedExpenseCents: Cents;
  projectedIncomeCents: Cents;
  projectedSavingsCents: Cents;
}

/** Income category whose accrual month moves the Today screen forward. */
export const SALARY_CATEGORY_ID = 'cat_stipendio';

/** The stretch of time the Today screen summarises. */
export interface TodayPeriod {
  /** Accrual month shown. */
  month: YearMonth;
  /** First day counted for the everyday pace: the 1st, or the salary's payment date when it opens the month early. */
  start: ISODate;
  /** Payment date of the salary that moved the view forward; null when the view is the calendar month. */
  salaryDate: ISODate | null;
}

/**
 * The month Today shows: the calendar month, or the accrual month of the latest confirmed salary when that is the
 * next month (salary paid on 27 November for December switches the view to December straight away). A salary
 * accrued further ahead is ignored, so a typo can't move the screen months forward.
 */
export function todayPeriod(transactions: readonly Transaction[], today: ISODate): TodayPeriod {
  const calendar = monthOf(today);
  const next = addMonths(calendar, 1);
  let salary: Transaction | undefined;
  for (const t of transactions) {
    if (t.kind !== 'income' || t.categoryId !== SALARY_CATEGORY_ID || t.status !== 'confirmed') continue;
    if (t.accrualMonth !== next) continue;
    if (salary === undefined || t.date < salary.date) salary = t;
  }
  if (salary === undefined) return { month: calendar, start: `${calendar}-01`, salaryDate: null };
  const start = salary.date < today ? salary.date : today;
  return { month: next, start, salaryDate: salary.date };
}

export interface OverviewInput {
  transactions: readonly Transaction[];
  rules: readonly RecurringRule[];
  budgets: readonly Budget[];
  categories: readonly Pick<Category, 'id' | 'groupId'>[];
  kindOf: KindOf;
  today: ISODate;
  /** Reuse an index built for the same transactions. */
  index?: SpendIndex;
  /** Month to summarise (from `todayPeriod`); the calendar month by default. */
  period?: Pick<TodayPeriod, 'month' | 'start'> & Partial<Pick<TodayPeriod, 'salaryDate'>>;
}

/** The numbers on the Today screen. Uses the accrual month (decision: analysis by competenza by default). */
export function monthOverview({ transactions, rules, budgets, categories, kindOf, today, index, period }: OverviewInput): MonthOverview {
  const month = period?.month ?? monthOf(today);
  const start = period?.start ?? `${month}-01`;
  // Opened early by its salary, the month already has it: a salary still due this month belongs to the next one.
  const salaryIn = (period?.salaryDate ?? null) !== null;
  const dueIncomeOf = (categoryId: string | undefined) => !(salaryIn && categoryId === SALARY_CATEGORY_ID);
  const bm = budgetMonth({ budgets, transactions, categories, groups: [], month, ...(index ? { index } : {}) });
  let coveredDue = 0;
  let spent = 0;
  let income = 0;
  let everyday = 0;
  let dueExpense = 0;
  let dueIncome = 0;

  for (const t of transactions) {
    if (t.accrualMonth !== month) continue;
    if (t.status === 'pending') {
      if (t.kind === 'expense') {
        dueExpense += effectiveCents(t);
        if (t.categoryId !== undefined && bm.covered.has(t.categoryId)) coveredDue += effectiveCents(t);
      }
      else if (t.kind === 'income' && dueIncomeOf(t.categoryId)) dueIncome += t.amountCents;
      continue;
    }
    if (t.kind === 'expense') {
      const c = effectiveCents(t);
      spent += c;
      if (t.recurringRuleId === undefined) everyday += c;
    } else if (t.kind === 'income') {
      income += t.amountCents;
    }
  }

  // Occurrences after today and inside the month (today's ones are already pending transactions).
  const monthEnd = endOfMonthDate(month);
  const tomorrow = addDays(today, 1);
  const from = tomorrow > `${month}-01` ? tomorrow : `${month}-01`;
  for (const rule of rules) {
    if (!rule.active) continue;
    const dates = from <= monthEnd ? occurrencesBetween(rule, from, monthEnd) : [];
    if (dates.length === 0) continue;
    const kind = kindOf(rule.categoryId);
    if (kind === 'expense') {
      dueExpense += rule.amountCents * dates.length;
      if (bm.covered.has(rule.categoryId)) coveredDue += rule.amountCents * dates.length;
    }
    else if (kind === 'income' && dueIncomeOf(rule.categoryId)) dueIncome += rule.amountCents * dates.length;
  }

  // Today included. Viewing next month early (salary already in), the days run from today to its last day.
  const daysLeft = Math.max(1, daysBetween(today, monthEnd) + 1);
  const elapsed = Math.max(1, daysBetween(start, today) + 1);
  const budget = bm.totals ? { ...bm.totals, dueCents: coveredDue } : null;
  const leftCents = budget === null ? null : budget.remainingCents - coveredDue;
  const perDayCents = leftCents === null ? null : Math.max(0, Math.floor(leftCents / daysLeft));

  // Everyday (non-recurring) pace so far, projected over the days after today.
  const pace = Math.round((everyday / elapsed) * (daysLeft - 1));
  const projectedExpenseCents = spent + dueExpense + pace;
  const projectedIncomeCents = income + dueIncome;

  return {
    month,
    spentCents: spent,
    incomeCents: income,
    balanceCents: income - spent,
    budget,
    dueExpenseCents: dueExpense,
    dueIncomeCents: dueIncome,
    daysLeft,
    perDayCents,
    leftCents,
    projectedExpenseCents,
    projectedIncomeCents,
    projectedSavingsCents: projectedIncomeCents - projectedExpenseCents,
  };
}
