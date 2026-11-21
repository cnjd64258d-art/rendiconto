import { describe, expect, it } from 'vitest';
import { installmentLabel, installmentTitle, instalmentFields, linkCandidates, planProgress, validatePlan, draftFromPlan } from './installments';
import { tx } from './test-utils';
import type { InstallmentPlan } from './types';

const plan: InstallmentPlan = {
  id: 'plan_madeira',
  title: 'Volo Madeira',
  totalCents: 45000,
  count: 3,
  accrualMonth: '2026-04',
  categoryId: 'cat_viaggi',
  paymentMethodId: 'pm_conto',
  notes: '',
  closed: false,
};

describe('planProgress', () => {
  it('counts paid instalments and suggests the next one', () => {
    const t = [
      tx({ date: '2025-12-10', amountCents: 15000, installmentPlanId: plan.id, installmentIndex: 1 }),
      tx({ date: '2026-01-10', amountCents: 15001, installmentPlanId: plan.id, installmentIndex: 2, status: 'pending' }),
      tx({ date: '2026-01-11', amountCents: 999, installmentPlanId: 'other' }),
    ];
    const p = planProgress(plan, t);
    expect(p).toMatchObject({ paidCount: 1, paidCents: 15000, remainingCents: 30000, remainingCount: 2, nextIndex: 2, nextAmountCents: 15000, complete: false, open: true });
  });

  it('the last instalment takes the rest, and a paid plan is complete', () => {
    const t = [
      tx({ amountCents: 14000, installmentPlanId: plan.id, installmentIndex: 1 }),
      tx({ amountCents: 16000, installmentPlanId: plan.id, installmentIndex: 2 }),
    ];
    expect(planProgress(plan, t).nextAmountCents).toBe(15000);
    const done = planProgress(plan, [...t, tx({ amountCents: 15000, installmentPlanId: plan.id, installmentIndex: 3 })]);
    expect(done).toMatchObject({ complete: true, open: false, nextAmountCents: 0, ratio: 1 });
    expect(planProgress({ ...plan, closed: true }, []).open).toBe(false);
  });

  it('counts my share of a shared instalment', () => {
    const t = [tx({ amountCents: 30000, installmentPlanId: plan.id, installmentIndex: 1, split: { totalCents: 30000, myShareCents: 15000, paidBy: 'me', shares: [] } })];
    expect(planProgress(plan, t).paidCents).toBe(15000);
  });
});

describe('labels', () => {
  it('names instalments as in the Numbers file', () => {
    expect(installmentLabel(1, 3)).toBe('Prima rata');
    expect(installmentLabel(2, 3)).toBe('Seconda rata');
    expect(installmentLabel(3, 3)).toBe('Ultima rata');
    expect(installmentLabel(1, 1)).toBe('Prima rata');
    expect(installmentLabel(11, 12)).toBe('Rata 11');
    expect(installmentTitle(plan, 2)).toBe('Volo Madeira · Seconda rata');
  });
});

describe('validatePlan', () => {
  const d = { title: ' Volo  Madeira ', total: '450', count: '3', accrualMonth: '2026-04', categoryId: 'cat_viaggi', paymentMethodId: 'pm_conto', notes: '' };
  it('builds a plan and round-trips', () => {
    const r = validatePlan(d);
    expect(r).toEqual({ ok: true, value: { title: 'Volo Madeira', totalCents: 45000, count: 3, accrualMonth: '2026-04', categoryId: 'cat_viaggi', paymentMethodId: 'pm_conto', notes: '', closed: false } });
    expect(draftFromPlan(plan)).toMatchObject({ total: '450,00', count: '3' });
  });
  it('rejects bad input', () => {
    expect(validatePlan({ ...d, count: '0' }).ok).toBe(false);
    expect(validatePlan({ ...d, total: '' }).ok).toBe(false);
    expect(validatePlan({ ...d, accrualMonth: '' }).ok).toBe(false);
  });
});

describe('instalmentFields', () => {
  it('inherits the plan accrual month (decision 1A)', () => {
    expect(instalmentFields(plan, 2)).toEqual({ installmentPlanId: plan.id, installmentIndex: 2, categoryId: 'cat_viaggi', accrualMonth: '2026-04' });
    const noMonth: InstallmentPlan = { ...plan };
    delete noMonth.accrualMonth;
    expect(instalmentFields(noMonth, 1)).not.toHaveProperty('accrualMonth');
  });
});

describe('linkCandidates', () => {
  it('lists unlinked expenses, by category or by search', () => {
    const t = [
      tx({ date: '2025-12-01', title: 'Volo Madeira prima rata', categoryId: 'cat_viaggi' }),
      tx({ date: '2025-12-02', title: 'Volo linked', categoryId: 'cat_viaggi', installmentPlanId: 'x' }),
      tx({ date: '2025-12-03', title: 'Madeira hotel', categoryId: 'cat_altro' }),
    ];
    expect(linkCandidates(plan, t, '').map((x) => x.title)).toEqual(['Volo Madeira prima rata']);
    expect(linkCandidates(plan, t, 'madeira').map((x) => x.title)).toEqual(['Madeira hotel', 'Volo Madeira prima rata']);
  });
});
