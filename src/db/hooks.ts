import { useLiveQuery } from 'dexie-react-hooks';
import { compareTransactionsDesc } from '../core/transactions';
import type { Budget, Category, CategoryGroup, PaymentMethod, RecurringRule, SavedView, SavingsGoal, Transaction } from '../core/types';
import { db } from './db';

/** All transactions, newest first. `undefined` while loading. */
export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(async () => (await db.transactions.toArray()).sort(compareTransactionsDesc), []);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
}

export function useCategoryGroups(): CategoryGroup[] | undefined {
  return useLiveQuery(() => db.categoryGroups.orderBy('order').toArray(), []);
}

export function usePaymentMethods(): PaymentMethod[] | undefined {
  return useLiveQuery(() => db.paymentMethods.orderBy('order').toArray(), []);
}

export function useMeta<T>(key: string): T | null | undefined {
  return useLiveQuery(async () => ((await db.meta.get(key))?.value as T | undefined) ?? null, [key]);
}

export function useRecurringRules(): RecurringRule[] | undefined {
  return useLiveQuery(() => db.recurringRules.toArray(), []);
}

export function useBudgets(): Budget[] | undefined {
  return useLiveQuery(() => db.budgets.toArray(), []);
}

export function useSavedViews(): SavedView[] | undefined {
  return useLiveQuery(() => db.savedViews.orderBy('order').toArray(), []);
}

/** The savings goal of `year`; null when not set, undefined while loading. */
export function useSavingsGoal(year: number): SavingsGoal | null | undefined {
  return useLiveQuery(async () => (await db.savingsGoals.get(year)) ?? null, [year]);
}

/** Free notes of a year ("Tira una linea"); '' when none, undefined while loading. */
export function useYearNote(year: number): string | undefined {
  return useLiveQuery(async () => (await db.yearNotes.get(year))?.text ?? '', [year]);
}
