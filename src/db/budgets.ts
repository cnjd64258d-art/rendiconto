import { planBudgetWrite, type BudgetChange, type BudgetScope } from '../core/budget';
import type { YearMonth } from '../core/dates';
import type { Cents } from '../core/money';
import type { Id } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';
import { newId } from './repo';

/** Sets (or with `null` removes) a budget from `month` on; earlier months keep what they had. */
export async function saveBudget(
  scope: BudgetScope,
  targetId: Id,
  month: YearMonth,
  change: BudgetChange | null,
  db: RendicontoDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.budgets, async () => {
    const rows = await db.budgets.where('[scope+targetId]').equals([scope, targetId]).toArray();
    const write = planBudgetWrite(rows, scope, targetId, month, change, newId);
    if (write.deleteId !== undefined) await db.budgets.delete(write.deleteId);
    if (write.put) await db.budgets.put(write.put);
  });
}

/** Sets the savings goal of a year; `null` or 0 removes it. */
export async function saveSavingsGoal(year: number, targetCents: Cents | null, db: RendicontoDB = defaultDb): Promise<void> {
  if (targetCents === null || targetCents <= 0) await db.savingsGoals.delete(year);
  else await db.savingsGoals.put({ year, targetCents });
}
