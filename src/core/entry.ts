import type { Id } from './types';
import { buildSplit, type SplitDraft } from './split';
import type { TransactionInput } from './transactions';

/** What the quick-add sheet adds on top of the basic fields. */
export interface EntryExtras {
  split: SplitDraft;
  /** "È una rata di…": the plan and which instalment this is. */
  installment: { planId: Id; index: number } | null;
}

export type EntryResult = { ok: true; value: TransactionInput } | { ok: false; error: string };

/** Links set by the sheet; on edit, a link missing here was removed by the user. */
export const EDITOR_LINKS = ['split', 'installmentPlanId', 'installmentIndex'] as const;

/** Adds the split and the instalment link to a validated transaction. Both only make sense for expenses. */
export function applyExtras(value: TransactionInput, extras: EntryExtras): EntryResult {
  const out: TransactionInput = { ...value };
  delete out.split;
  delete out.installmentPlanId;
  delete out.installmentIndex;
  if (value.kind !== 'expense') return { ok: true, value: out };
  const split = buildSplit(value.amountCents, extras.split);
  if (!split.ok) return split;
  if (split.value) out.split = split.value;
  if (extras.installment) {
    out.installmentPlanId = extras.installment.planId;
    out.installmentIndex = extras.installment.index;
  }
  return { ok: true, value: out };
}
