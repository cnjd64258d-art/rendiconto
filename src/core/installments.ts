import { isYearMonth, type YearMonth } from './dates';
import { parseAmount, type Cents } from './money';
import { cleanTitle, effectiveCents } from './transactions';
import type { Id, InstallmentPlan, Transaction } from './types';

export interface PlanProgress {
  plan: InstallmentPlan;
  /** Confirmed instalments, oldest first. */
  paid: Transaction[];
  paidCount: number;
  paidCents: Cents;
  remainingCents: Cents;
  remainingCount: number;
  /** 1-based index of the next instalment. */
  nextIndex: number;
  /** Suggested amount of the next one: what is left ÷ instalments left (the last one takes the rest). */
  nextAmountCents: Cents;
  /** Everything paid (by count or by amount). */
  complete: boolean;
  /** Not complete and not closed by hand: shown in "È una rata di…". */
  open: boolean;
  ratio: number;
}

export function planProgress(plan: InstallmentPlan, transactions: readonly Transaction[]): PlanProgress {
  const paid = transactions
    .filter((t) => t.installmentPlanId === plan.id && t.status === 'confirmed')
    .sort((a, b) => (a.installmentIndex ?? 0) - (b.installmentIndex ?? 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const paidCents = paid.reduce((s, t) => s + effectiveCents(t), 0);
  const paidCount = paid.length;
  const remainingCents = Math.max(0, plan.totalCents - paidCents);
  const remainingCount = Math.max(0, plan.count - paidCount);
  const complete = paidCount >= plan.count || remainingCents === 0;
  const nextAmountCents = complete ? 0 : remainingCount <= 1 ? remainingCents : Math.round(remainingCents / remainingCount);
  const maxIndex = paid.reduce((m, t) => Math.max(m, t.installmentIndex ?? 0), 0);
  return {
    plan,
    paid,
    paidCount,
    paidCents,
    remainingCents,
    remainingCount,
    nextIndex: Math.max(maxIndex, paidCount) + 1,
    nextAmountCents,
    complete,
    open: !complete && !plan.closed,
    ratio: plan.totalCents > 0 ? Math.min(1, paidCents / plan.totalCents) : 0,
  };
}

const ORDINALS = ['Prima', 'Seconda', 'Terza', 'Quarta', 'Quinta', 'Sesta', 'Settima', 'Ottava', 'Nona', 'Decima'];

/** "Prima rata", "Seconda rata"… "Ultima rata" (as in the old Numbers file), then "Rata 11". */
export function installmentLabel(index: number, count: number): string {
  if (count > 1 && index === count) return 'Ultima rata';
  const word = ORDINALS[index - 1];
  return word ? `${word} rata` : `Rata ${index}`;
}

/** Title for an instalment row: "Volo Madeira · Seconda rata". */
export function installmentTitle(plan: Pick<InstallmentPlan, 'title' | 'count'>, index: number): string {
  return `${plan.title} · ${installmentLabel(index, plan.count)}`;
}

export interface PlanDraft {
  title: string;
  total: string;
  count: string;
  accrualMonth: string;
  categoryId: Id | null;
  paymentMethodId: Id | null;
  notes: string;
}

export type PlanResult = { ok: true; value: Omit<InstallmentPlan, 'id'> } | { ok: false; error: string };

export function validatePlan(d: PlanDraft, existing?: InstallmentPlan): PlanResult {
  const title = cleanTitle(d.title);
  if (!title) return { ok: false, error: 'Dai un nome al piano (es. Volo Madeira)' };
  const total = parseAmount(d.total, ',');
  if (total === null || total <= 0) return { ok: false, error: 'Inserisci il totale' };
  const count = Number(d.count);
  if (!Number.isInteger(count) || count < 1 || count > 120) return { ok: false, error: 'Le rate vanno da 1 a 120' };
  if (!isYearMonth(d.accrualMonth)) return { ok: false, error: 'Mese di competenza non valido' };
  if (!d.categoryId) return { ok: false, error: 'Scegli una categoria' };
  if (!d.paymentMethodId) return { ok: false, error: 'Scegli il metodo di pagamento' };
  return {
    ok: true,
    value: {
      title,
      totalCents: total,
      count,
      accrualMonth: d.accrualMonth,
      categoryId: d.categoryId,
      paymentMethodId: d.paymentMethodId,
      notes: d.notes.trim(),
      closed: existing?.closed ?? false,
    },
  };
}

export function draftFromPlan(p: InstallmentPlan): PlanDraft {
  return {
    title: p.title,
    total: (p.totalCents / 100).toFixed(2).replace('.', ','),
    count: String(p.count),
    accrualMonth: p.accrualMonth ?? '',
    categoryId: p.categoryId,
    paymentMethodId: p.paymentMethodId,
    notes: p.notes,
  };
}

/**
 * Fields an instalment takes from its plan (decision 1A: the plan's accrual month, editable later).
 * A plan without an accrual month keeps the instalment's own.
 */
export function instalmentFields(plan: InstallmentPlan, index: number): { installmentPlanId: Id; installmentIndex: number; categoryId: Id; accrualMonth?: YearMonth } {
  return {
    installmentPlanId: plan.id,
    installmentIndex: index,
    categoryId: plan.categoryId,
    ...(plan.accrualMonth ? { accrualMonth: plan.accrualMonth } : {}),
  };
}

/** Existing expenses that could be past instalments of a plan: not already linked, same category first, by date. */
export function linkCandidates(plan: InstallmentPlan, transactions: readonly Transaction[], query: string): Transaction[] {
  const q = query.trim().toLocaleLowerCase('it-IT');
  return transactions
    .filter((t) => t.kind === 'expense' && t.installmentPlanId === undefined && t.status === 'confirmed')
    .filter((t) => (q ? t.title.toLocaleLowerCase('it-IT').includes(q) : t.categoryId === plan.categoryId))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50);
}
