import { useMemo } from 'react';
import { useCategories, usePaymentMethods } from '../../db/hooks';
import type { Lookups } from './TransactionRow';

export function useLookups(): Lookups | undefined {
  const categories = useCategories();
  const methods = usePaymentMethods();
  return useMemo(
    () =>
      categories && methods
        ? { categories: new Map(categories.map((c) => [c.id, c])), methods: new Map(methods.map((m) => [m.id, m])) }
        : undefined,
    [categories, methods],
  );
}
