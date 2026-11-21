import { addDays, daysLeftInMonth, endOfMonthDate, monthOf, parseISODate, type ISODate, type YearMonth } from './dates';
import type { Cents } from './money';
import { occurrencesBetween, type KindOf } from './recurring';
import { effectiveCents } from './transactions';
import type { Budget, Category, Id, RecurringRule, Transaction } from './types';

/**
 * Total monthly budget for `month`: for each target the most recent budget valid in that month.
 * A group budget replaces the budgets of its own categories (no double counting).
 * Returns null when nothing is budgeted.
 */
export function monthlyBudgetCents(budgets: readonly Budget[], categories: readonly Pick<Category, 'id' | 'groupId'>[], month: YearMonth): Cents | null {
  const latest = new Map<string, Budget>();
  for (const b of budgets) {
    if (b.validFrom > month) continue;
    const key = `${b.scope}:${b.targetId}`;
    const prev = latest.get(key);
    if (!prev || prev.validFrom < b.validFrom) latest.set(key, b);
  }
  if (latest.size === 0) return null;
  const groupsWithBudget = new Set<Id>();
  for (const b of latest.values()) if (b.scope === 'group') groupsWithBudget.add(b.targetId);
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  let total = 0;
  for (const b of latest.values()) {
    if (b.scope === 'category' && groupsWithBudget.has(groupOf.get(b.targetId) ?? '')) continue;
    total += b.monthlyLimitCents;
  }
  return total;
}

export interface MonthOverview {
  month: YearMonth;
  /** Confirmed expenses accrued to the month (my share for split ones). */
  spentCents: Cents;
  /** Confirmed income accrued to the month. */
  incomeCents: Cents;
  /** incomeCents − spentCents. */
  balanceCents: Cents;
  budgetCents: Cents | null;
  /** spent / budget (0 when there is no budget). */
  budgetRatio: number;
  /** Expenses still expected this month: pending recurring ones plus occurrences after today. */
  dueExpenseCents: Cents;
  /** Income still expected this month, same rule. */
  dueIncomeCents: Cents;
  /** Days left in the month, today included. */
  daysLeft: number;
  /** "Puoi spendere ancora X € al giorno": (budget − spent − due) ÷ days left, never below 0. Null without a budget. */
  perDayCents: Cents | null;
  /** budget − spent − due (can be negative). Null without a budget. */
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
}

/** The numbers on the Today screen. Uses the accrual month (decision: analysis by competenza by default). */
export function monthOverview({ transactions, rules, budgets, categories, kindOf, today }: OverviewInput): MonthOverview {
  const month = monthOf(today);
  let spent = 0;
  let income = 0;
  let everyday = 0;
  let dueExpense = 0;
  let dueIncome = 0;

  for (const t of transactions) {
    if (t.accrualMonth !== month) continue;
    if (t.status === 'pending') {
      if (t.kind === 'expense') dueExpense += effectiveCents(t);
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
    if (kind === 'expense') dueExpense += rule.amountCents * dates.length;
    else if (kind === 'income') dueIncome += rule.amountCents * dates.length;
  }

  const daysLeft = daysLeftInMonth(today);
  const elapsed = parseISODate(today).day;
  const budget = monthlyBudgetCents(budgets, categories, month);
  const leftCents = budget === null ? null : budget - spent - dueExpense;
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
    budgetCents: budget,
    budgetRatio: budget ? spent / budget : 0,
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
