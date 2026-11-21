import { useLiveQuery } from 'dexie-react-hooks';
import { alertSummary, budgetMonth } from '../../core/budget';
import { monthOf, today } from '../../core/dates';
import { db } from '../../db/db';

/**
 * 'warning' / 'over' when a budget of the current month is at 80% / 100%, for the tab bar badge.
 * Reads only the months a budget can look back on (rollover), not the whole history.
 */
export function useBudgetAlert(): 'warning' | 'over' | null {
  const month = monthOf(today());
  return (
    useLiveQuery(async () => {
      const budgets = await db.budgets.toArray();
      if (budgets.length === 0) return null;
      const from = budgets.reduce((min, b) => (b.validFrom < min ? b.validFrom : min), month);
      const [transactions, categories] = await Promise.all([
        db.transactions.where('accrualMonth').between(from, month, true, true).toArray(),
        db.categories.toArray(),
      ]);
      return alertSummary(budgetMonth({ budgets, transactions, categories, groups: [], month }).lines)?.tone ?? null;
    }, [month]) ?? null
  );
}
