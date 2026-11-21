import { addMonths, monthOf, parseISODate, yearOf, type ISODate, type YearMonth } from './dates';
import type { Cents } from './money';
import { effectiveCents } from './transactions';
import type { Budget, Category, CategoryGroup, Id, SavingsGoal, Transaction } from './types';

/** Warning from 80% of the available amount, over from 100%. */
export const WARNING_RATIO = 0.8;

export type BudgetScope = Budget['scope'];
export type BudgetStatus = 'ok' | 'warning' | 'over';

export function budgetKey(scope: BudgetScope, targetId: Id): string {
  return `${scope}:${targetId}`;
}

export function budgetStatus(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'over';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'ok';
}

/** Budget rows of one target, oldest first. */
function rowsByTarget(budgets: readonly Budget[]): Map<string, Budget[]> {
  const map = new Map<string, Budget[]>();
  for (const b of budgets) {
    const key = budgetKey(b.scope, b.targetId);
    const list = map.get(key);
    if (list) list.push(b);
    else map.set(key, [b]);
  }
  for (const list of map.values()) list.sort((a, b) => (a.validFrom < b.validFrom ? -1 : a.validFrom > b.validFrom ? 1 : 0));
  return map;
}

/** The row in force in `month` (latest validFrom ≤ month); a 0 limit means the budget was removed. */
function rowInForce(rows: readonly Budget[], month: YearMonth): Budget | undefined {
  let found: Budget | undefined;
  for (const r of rows) {
    if (r.validFrom > month) break;
    found = r;
  }
  return found && found.monthlyLimitCents > 0 ? found : undefined;
}

/** For each target, the budget in force in `month`. Removed budgets (0 limit) are left out. */
export function budgetsForMonth(budgets: readonly Budget[], month: YearMonth): Budget[] {
  const out: Budget[] = [];
  for (const rows of rowsByTarget(budgets).values()) {
    const b = rowInForce(rows, month);
    if (b) out.push(b);
  }
  return out;
}

/** Confirmed expenses by accrual month and category (my share for split ones). */
export type SpendIndex = Map<YearMonth, Map<Id, Cents>>;

export function spendIndex(transactions: readonly Transaction[]): SpendIndex {
  const index: SpendIndex = new Map();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.categoryId === undefined) continue;
    let month = index.get(t.accrualMonth);
    if (!month) index.set(t.accrualMonth, (month = new Map()));
    month.set(t.categoryId, (month.get(t.categoryId) ?? 0) + effectiveCents(t));
  }
  return index;
}

type GroupOf = ReadonlyMap<Id, Id>;

function spentFor(index: SpendIndex, groupOf: GroupOf, scope: BudgetScope, targetId: Id, month: YearMonth): Cents {
  const byCat = index.get(month);
  if (!byCat) return 0;
  if (scope === 'category') return byCat.get(targetId) ?? 0;
  let sum = 0;
  for (const [cat, cents] of byCat) if (groupOf.get(cat) === targetId) sum += cents;
  return sum;
}

/**
 * Unspent budget carried into `month`. With rollover on, what is left of the previous month
 * (its limit plus its own carry, minus what was spent) moves forward; overspending is not carried.
 * The chain starts from the target's first budget and breaks on any month without rollover.
 */
function carryInto(rows: readonly Budget[], month: YearMonth, index: SpendIndex, groupOf: GroupOf): Cents {
  const first = rows[0];
  if (!first || first.validFrom >= month) return 0;
  let carry = 0;
  for (let m = first.validFrom; m < month; m = addMonths(m, 1)) {
    const b = rowInForce(rows, m);
    if (!b) {
      carry = 0;
      continue;
    }
    const available = b.monthlyLimitCents + (b.rollover ? carry : 0);
    const next = rowInForce(rows, addMonths(m, 1));
    carry = next?.rollover ? Math.max(0, available - spentFor(index, groupOf, b.scope, b.targetId, m)) : 0;
  }
  return carry;
}

export interface BudgetLine {
  budget: Budget;
  scope: BudgetScope;
  targetId: Id;
  limitCents: Cents;
  /** Unspent amount carried from previous months (rollover). */
  carryCents: Cents;
  /** limit + carry. */
  availableCents: Cents;
  spentCents: Cents;
  /** available − spent; negative when over. */
  remainingCents: Cents;
  /** spent / available. */
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetSection {
  group: CategoryGroup;
  /** The macro-voce budget, when there is one. */
  groupLine?: BudgetLine;
  /** Budgets of single categories in the group, in the categories' order. */
  categoryLines: BudgetLine[];
}

export interface BudgetTotals {
  availableCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetMonth {
  month: YearMonth;
  lines: BudgetLine[];
  sections: BudgetSection[];
  /** Null when nothing is budgeted. A group budget replaces its categories' ones. */
  totals: BudgetTotals | null;
  /** Category ids whose spending is covered by a budget (own or of its group). */
  covered: Set<Id>;
  /** Expense categories with spending this month and no budget covering them, highest first. */
  unbudgeted: { categoryId: Id; spentCents: Cents }[];
}

export interface BudgetMonthInput {
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  categories: readonly (Pick<Category, 'id' | 'groupId'> & { order?: number })[];
  groups: readonly CategoryGroup[];
  month: YearMonth;
  /** Reuse an index built for the same transactions. */
  index?: SpendIndex;
}

export function budgetMonth({ budgets, transactions, categories, groups, month, index: given }: BudgetMonthInput): BudgetMonth {
  const index = given ?? spendIndex(transactions);
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  const catOrder = new Map(categories.map((c) => [c.id, c.order ?? 0]));

  const lines: BudgetLine[] = [];
  for (const rows of rowsByTarget(budgets).values()) {
    const b = rowInForce(rows, month);
    if (!b) continue;
    const carryCents = b.rollover ? carryInto(rows, month, index, groupOf) : 0;
    const availableCents = b.monthlyLimitCents + carryCents;
    const spentCents = spentFor(index, groupOf, b.scope, b.targetId, month);
    const ratio = availableCents > 0 ? spentCents / availableCents : 0;
    lines.push({
      budget: b,
      scope: b.scope,
      targetId: b.targetId,
      limitCents: b.monthlyLimitCents,
      carryCents,
      availableCents,
      spentCents,
      remainingCents: availableCents - spentCents,
      ratio,
      status: budgetStatus(ratio),
    });
  }

  const groupBudgets = new Set(lines.filter((l) => l.scope === 'group').map((l) => l.targetId));
  const covered = new Set<Id>();
  for (const c of categories) if (groupBudgets.has(c.groupId)) covered.add(c.id);
  for (const l of lines) if (l.scope === 'category') covered.add(l.targetId);

  let totals: BudgetTotals | null = null;
  if (lines.length > 0) {
    let available = 0;
    let spent = 0;
    for (const l of lines) {
      if (l.scope === 'category' && groupBudgets.has(groupOf.get(l.targetId) ?? '')) continue;
      available += l.availableCents;
      spent += l.spentCents;
    }
    const ratio = available > 0 ? spent / available : 0;
    totals = { availableCents: available, spentCents: spent, remainingCents: available - spent, ratio, status: budgetStatus(ratio) };
  }

  const sections: BudgetSection[] = [];
  for (const g of [...groups].sort((a, b) => a.order - b.order)) {
    const groupLine = lines.find((l) => l.scope === 'group' && l.targetId === g.id);
    const categoryLines = lines
      .filter((l) => l.scope === 'category' && groupOf.get(l.targetId) === g.id)
      .sort((a, b) => (catOrder.get(a.targetId) ?? 0) - (catOrder.get(b.targetId) ?? 0));
    if (!groupLine && categoryLines.length === 0) continue;
    sections.push(groupLine ? { group: g, groupLine, categoryLines } : { group: g, categoryLines });
  }
  // Budgets whose category or group no longer exists still count; show them at the end.
  const known = new Set([...groups.map((g) => g.id), ...categories.map((c) => c.id)]);
  const orphans = lines.filter((l) => !known.has(l.targetId));
  if (orphans.length > 0) sections.push({ group: { id: '', name: 'Altro', kind: 'expense', order: Infinity }, categoryLines: orphans });

  const unbudgeted: { categoryId: Id; spentCents: Cents }[] = [];
  for (const [categoryId, spentCents] of index.get(month) ?? []) {
    if (!covered.has(categoryId) && spentCents > 0) unbudgeted.push({ categoryId, spentCents });
  }
  unbudgeted.sort((a, b) => b.spentCents - a.spentCents);

  return { month, lines, sections, totals, covered, unbudgeted };
}

/** Lines at or above 80%, the most used first. */
export function budgetAlerts(lines: readonly BudgetLine[]): BudgetLine[] {
  return lines.filter((l) => l.status !== 'ok').sort((a, b) => b.ratio - a.ratio);
}

export interface BudgetChange {
  limitCents: Cents;
  rollover: boolean;
}

export interface BudgetWrite {
  put?: Budget;
  deleteId?: Id;
}

/**
 * Changes apply from `month` on, so past months keep the budget they had.
 * A row already starting in `month` is updated; otherwise a new row starts in `month`.
 * Removing writes a 0 limit row, or deletes the row when it was created this month with nothing before it.
 */
export function planBudgetWrite(
  budgets: readonly Budget[],
  scope: BudgetScope,
  targetId: Id,
  month: YearMonth,
  change: BudgetChange | null,
  newId: () => Id,
): BudgetWrite {
  const rows = rowsByTarget(budgets).get(budgetKey(scope, targetId)) ?? [];
  const same = rows.find((r) => r.validFrom === month);
  const earlier = rows.filter((r) => r.validFrom < month);
  const before = rowInForce(earlier, month);

  if (change === null) {
    if (same && !before) return { deleteId: same.id };
    if (!before && !same) return {};
    const base = same ?? { id: newId(), scope, targetId, validFrom: month, rollover: false };
    return { put: { ...base, monthlyLimitCents: 0, rollover: false } };
  }
  const limit = Math.max(0, Math.round(change.limitCents));
  if (same) return { put: { ...same, monthlyLimitCents: limit, rollover: change.rollover } };
  return { put: { id: newId(), scope, targetId, monthlyLimitCents: limit, rollover: change.rollover, validFrom: month } };
}

export interface SavingsProgress {
  year: number;
  targetCents: Cents;
  /** Confirmed income − confirmed expenses accrued to the year. */
  savedCents: Cents;
  ratio: number;
  /** Months still available, the current one included (0 for a past year). */
  monthsLeft: number;
  /** What is still missing ÷ months left, rounded up to the cent. 0 when reached or no time left. */
  neededPerMonthCents: Cents;
  /** Where a steady pace would be by the end of last month. */
  expectedCents: Cents;
  onTrack: boolean;
}

export function savingsProgress(transactions: readonly Transaction[], goal: SavingsGoal, today: ISODate): SavingsProgress {
  let saved = 0;
  for (const t of transactions) {
    if (t.status !== 'confirmed' || yearOf(t.accrualMonth) !== goal.year) continue;
    if (t.kind === 'income') saved += t.amountCents;
    else if (t.kind === 'expense') saved -= effectiveCents(t);
  }
  const thisYear = yearOf(monthOf(today));
  const monthIndex = parseISODate(today).month; // 1..12
  const monthsLeft = goal.year < thisYear ? 0 : goal.year > thisYear ? 12 : 12 - monthIndex + 1;
  const elapsed = goal.year < thisYear ? 12 : goal.year > thisYear ? 0 : monthIndex - 1;
  const missing = Math.max(0, goal.targetCents - saved);
  const expectedCents = Math.round((goal.targetCents * elapsed) / 12);
  return {
    year: goal.year,
    targetCents: goal.targetCents,
    savedCents: saved,
    ratio: goal.targetCents > 0 ? saved / goal.targetCents : 0,
    monthsLeft,
    neededPerMonthCents: monthsLeft > 0 ? Math.ceil(missing / monthsLeft) : 0,
    expectedCents,
    onTrack: saved >= expectedCents,
  };
}

/** Demo budgets (ids `demo_budget_*`), starting three months ago so rollover shows. */
export function demoBudgets(today: ISODate): Budget[] {
  const validFrom = addMonths(monthOf(today), -3);
  const b = (id: string, scope: BudgetScope, targetId: Id, euros: number, rollover: boolean): Budget => ({
    id: `demo_budget_${id}`,
    scope,
    targetId,
    monthlyLimitCents: euros * 100,
    rollover,
    validFrom,
  });
  return [
    b('alimentari', 'category', 'cat_alimentari', 250, true),
    b('svago', 'group', 'grp_svago', 300, false),
    b('trasporti', 'category', 'cat_trasporti', 150, false),
    b('abbigliamento', 'category', 'cat_abbigliamento', 60, true),
  ];
}

/** Average monthly spending on a target over the `months` before `month` (a hint when setting a limit). */
export function averageSpent(
  index: SpendIndex,
  categories: readonly Pick<Category, 'id' | 'groupId'>[],
  scope: BudgetScope,
  targetId: Id,
  month: YearMonth,
  months = 3,
): Cents {
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  let sum = 0;
  for (let i = 1; i <= months; i++) sum += spentFor(index, groupOf, scope, targetId, addMonths(month, -i));
  return Math.round(sum / months);
}

export interface AlertSummary {
  /** 'over' when at least one budget is over 100%. */
  tone: 'warning' | 'over';
  lines: BudgetLine[];
}

/** What the Today banner and the tab badge show: null when every budget is under 80%. */
export function alertSummary(lines: readonly BudgetLine[]): AlertSummary | null {
  const alerts = budgetAlerts(lines);
  if (alerts.length === 0) return null;
  return { tone: alerts.some((l) => l.status === 'over') ? 'over' : 'warning', lines: alerts };
}
