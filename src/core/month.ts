import { budgetMonth, type BudgetTotals, type SpendIndex } from './budget';
import { addDays, daysLeftInMonth, endOfMonthDate, monthOf, parseISODate, type ISODate, type YearMonth } from './dates';
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

export interface OverviewInput {
  transactions: readonly Transaction[];
  rules: readonly RecurringRule[];
  budgets: readonly Budget[];
  categories: readonly Pick<Category, 'id' | 'groupId'>[];
  kindOf: KindOf;
  today: ISODate;
  /** Reuse an index built for the same transactions. */
  index?: SpendIndex;
}

/** The numbers on the Today screen. Uses the accrual month (decision: analysis by competenza by default). */
export function monthOverview({ transactions, rules, budgets, categories, kindOf, today, index }: OverviewInput): MonthOverview {
  const month = monthOf(today);
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
      else if (t.kind === 'income') dueIncome += t.amountCents;
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

  // Occurrences after today and still in this month (today's ones are already pending transactions).
  const monthEnd = endOfMonthDate(month);
  for (const rule of rules) {
    if (!rule.active) continue;
    const dates = occurrencesBetween(rule, addDays(today, 1), monthEnd);
    if (dates.length === 0) continue;
    const kind = kindOf(rule.categoryId);
    if (kind === 'expense') {
      dueExpense += rule.amountCents * dates.length;
      if (bm.covered.has(rule.categoryId)) coveredDue += rule.amountCents * dates.length;
    }
    else if (kind === 'income') dueIncome += rule.amountCents * dates.length;
  }

  const daysLeft = daysLeftInMonth(today);
  const elapsed = parseISODate(today).day;
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
