import { describe, expect, it } from 'vitest';
import { applyExtras } from './entry';
import { balanceTotals, balances, buildPerson, buildSplit, draftFromSplit, EMPTY_SPLIT, settlementForBalance, validateSettlement } from './split';
import { tx } from './test-utils';
import { effectiveCents } from './transactions';
import type { Person, Settlement } from './types';

const shared = (over: Partial<typeof EMPTY_SPLIT>) => ({ ...EMPTY_SPLIT, enabled: true, ...over });

describe('buildSplit', () => {
  it('splits evenly, my share never rounded up', () => {
    const r = buildSplit(1000, shared({ people: ['p_ste', 'p_nic'] }));
    expect(r).toEqual({
      ok: true,
      value: { totalCents: 1000, myShareCents: 333, paidBy: 'me', shares: [{ personId: 'p_ste', amountCents: 334 }, { personId: 'p_nic', amountCents: 333 }] },
    });
  });

  it('with my share typed, the others split the rest', () => {
    const r = buildSplit(9000, shared({ people: ['p_ste', 'p_nic'], mode: 'mine', myShare: '30' }));
    expect(r.ok && r.value?.shares.map((s) => s.amountCents)).toEqual([3000, 3000]);
    expect(r.ok && r.value?.myShareCents).toBe(3000);
    expect(buildSplit(9000, shared({ people: ['p_ste'], mode: 'mine', myShare: '100' }))).toEqual({ ok: false, error: 'La tua quota supera il totale' });
  });

  it('adds whoever paid to the people, and needs someone', () => {
    const r = buildSplit(4000, shared({ paidBy: 'p_ste' }));
    expect(r.ok && r.value).toMatchObject({ paidBy: 'p_ste', myShareCents: 2000, shares: [{ personId: 'p_ste', amountCents: 2000 }] });
    expect(buildSplit(4000, shared({}))).toEqual({ ok: false, error: 'Scegli con chi dividi la spesa' });
    expect(buildSplit(4000, EMPTY_SPLIT)).toEqual({ ok: true, value: undefined });
  });

  it('round-trips through the draft', () => {
    const equal = buildSplit(1000, shared({ people: ['a', 'b'] }));
    expect(equal.ok && draftFromSplit(equal.value).mode).toBe('equal');
    const mine = buildSplit(1000, shared({ people: ['a'], mode: 'mine', myShare: '2' }));
    expect(mine.ok && draftFromSplit(mine.value)).toMatchObject({ mode: 'mine', myShare: '2,00', people: ['a'] });
  });

  it('only my share counts as an expense', () => {
    const r = buildSplit(5000, shared({ people: ['p_ste'] }));
    expect(effectiveCents(tx({ amountCents: 5000, ...(r.ok && r.value ? { split: r.value } : {}) }))).toBe(2500);
  });
});

describe('applyExtras', () => {
  const base = { ...tx({ amountCents: 6000 }) };
  it('links instalments and splits only on expenses', () => {
    const r = applyExtras(base, { split: shared({ people: ['p'] }), installment: { planId: 'plan_1', index: 2 } });
    expect(r.ok && r.value).toMatchObject({ installmentPlanId: 'plan_1', installmentIndex: 2, split: { myShareCents: 3000 } });
    const income = applyExtras({ ...base, kind: 'income' }, { split: shared({ people: ['p'] }), installment: { planId: 'x', index: 1 } });
    expect(income.ok && income.value.split).toBeUndefined();
    expect(income.ok && income.value.installmentPlanId).toBeUndefined();
  });
  it('removes links the user turned off', () => {
    const r = applyExtras({ ...base, installmentPlanId: 'old', installmentIndex: 1, split: { totalCents: 1, myShareCents: 1, paidBy: 'me', shares: [] } }, { split: EMPTY_SPLIT, installment: null });
    expect(r.ok && 'split' in r.value).toBe(false);
    expect(r.ok && 'installmentPlanId' in r.value).toBe(false);
  });
});

describe('balances', () => {
  const people: Person[] = [
    { id: 'p_ste', name: 'Stefano', archived: false },
    { id: 'p_nic', name: 'Nicola', archived: false },
  ];
  const split = (total: number, paidBy: string, people: string[]) => {
    const r = buildSplit(total, shared({ paidBy, people }));
    if (!r.ok || !r.value) throw new Error('bad split');
    return r.value;
  };
  const settle = (over: Partial<Settlement>): Settlement => ({ id: 's', personId: 'p_ste', direction: 'in', amountCents: 0, date: '2026-03-01', paymentMethodId: 'pm', note: '', ...over });

  const transactions = [
    tx({ date: '2026-01-10', title: 'Benzina', amountCents: 6000, split: split(6000, 'me', ['p_ste']) }), // Stefano owes 30
    tx({ date: '2026-02-10', title: 'Cena', amountCents: 9000, split: split(9000, 'me', ['p_ste', 'p_nic']) }), // each owes 30
    tx({ date: '2026-02-20', title: 'Padel', amountCents: 4000, split: split(4000, 'p_nic', ['p_nic']) }), // I owe Nicola 20
    tx({ date: '2026-02-21', title: 'Pending', amountCents: 4000, status: 'pending', split: split(4000, 'me', ['p_ste']) }),
  ];

  it('nets what each person owes, with repayments closing debts (not income)', () => {
    const b = balances(transactions, [settle({ amountCents: 3000 })], people);
    const ste = b.find((x) => x.personId === 'p_ste');
    const nic = b.find((x) => x.personId === 'p_nic');
    expect(ste?.netCents).toBe(3000);
    expect(nic?.netCents).toBe(1000);
    expect(balanceTotals(b)).toEqual({ owedToMeCents: 4000, iOweCents: 0 });
  });

  it('marks the oldest debts as repaid first', () => {
    const ste = balances(transactions, [settle({ amountCents: 4000 })], people).find((x) => x.personId === 'p_ste');
    expect(ste?.items.map((i) => [i.transaction.title, i.status, i.settledCents])).toEqual([
      ['Cena', 'partial', 1000],
      ['Benzina', 'settled', 3000],
    ]);
  });

  it('debts in both directions offset each other', () => {
    const nic = balances(transactions, [], people).find((x) => x.personId === 'p_nic');
    expect(nic?.items.map((i) => [i.transaction.title, i.cents, i.status])).toEqual([
      ['Padel', -2000, 'settled'],
      ['Cena', 3000, 'partial'],
    ]);
    const paidBack = balances(transactions, [settle({ personId: 'p_nic', amountCents: 1000 })], people).find((x) => x.personId === 'p_nic');
    expect(paidBack?.netCents).toBe(0);
    expect(paidBack?.items.every((i) => i.status === 'settled')).toBe(true);
  });

  it('an outgoing payment closes what I owe', () => {
    const t = [tx({ date: '2026-02-20', amountCents: 4000, split: split(4000, 'p_nic', []) })];
    expect(balances(t, [], people).find((x) => x.personId === 'p_nic')?.netCents).toBe(-2000);
    expect(balances(t, [settle({ personId: 'p_nic', direction: 'out', amountCents: 2000 })], people).find((x) => x.personId === 'p_nic')?.netCents).toBe(0);
  });
});

describe('settlements', () => {
  it('suggests the amount and direction that close a balance', () => {
    expect(settlementForBalance(2550)).toEqual({ direction: 'in', amount: '25,50' });
    expect(settlementForBalance(-1000)).toEqual({ direction: 'out', amount: '10,00' });
  });
  it('validates', () => {
    const d = { personId: 'p', direction: 'in' as const, amount: '10', date: '2026-03-01', paymentMethodId: 'pm', note: ' ok ' };
    expect(validateSettlement(d)).toEqual({ ok: true, value: { personId: 'p', direction: 'in', amountCents: 1000, date: '2026-03-01', paymentMethodId: 'pm', note: 'ok' } });
    expect(validateSettlement({ ...d, amount: '0' }).ok).toBe(false);
    expect(validateSettlement({ ...d, personId: null }).ok).toBe(false);
  });
});

describe('buildPerson', () => {
  const all: Person[] = [{ id: 'p1', name: 'Nicola', archived: false }];
  it('keeps names unique after normalisation', () => {
    expect(buildPerson(' nicola ', all, () => 'x')).toEqual({ ok: false, error: 'Esiste già «Nicola»' });
    expect(buildPerson('Stefano', all, () => 'p2')).toEqual({ ok: true, value: { id: 'p2', name: 'Stefano', archived: false } });
    expect(buildPerson('Nico', all, () => 'x', all[0])).toEqual({ ok: true, value: { id: 'p1', name: 'Nico', archived: false } });
  });
});
