import { dedupeKey } from './transactions';
import { monthOf } from './dates';
import type { Transaction } from './types';

let counter = 0;

/** Test factory: a confirmed expense on 2026-01-15 unless overridden. */
export function tx(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1;
  const date = overrides.date ?? '2026-01-15';
  const amountCents = overrides.amountCents ?? 1000;
  const title = overrides.title ?? `Spesa ${counter}`;
  return {
    id: `tx_${counter}`,
    title,
    amountCents,
    kind: 'expense',
    date,
    accrualMonth: monthOf(date),
    categoryId: 'cat_cibo',
    paymentMethodId: 'pm_conto',
    status: 'confirmed',
    notes: '',
    tags: [],
    dedupeKey: dedupeKey(date, amountCents, title),
    createdAt: `2026-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
