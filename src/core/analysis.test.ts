import { describe, expect, it } from 'vitest';
import { breakdown, inPeriod, monthlySeries, monthsIn, normalizePeriod, totalsOf, yearOverYear, yearPeriod, yearsWithData } from './analysis';
import { tx } from './test-utils';

const categories = [
  { id: 'cat_cibo', groupId: 'grp_svago' },
  { id: 'cat_svago', groupId: 'grp_svago' },
  { id: 'cat_alimentari', groupId: 'grp_spesa' },
  { id: 'cat_stipendio', groupId: 'grp_entrate' },
];
const income = (date: string, cents: number, over = {}) => tx({ date, kind: 'income', amountCents: cents, categoryId: 'cat_stipendio', ...over });

describe('periods', () => {
  it('lists months and normalises reversed ranges', () => {
    expect(monthsIn({ from: '2025-11', to: '2026-02' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(normalizePeriod({ from: '2026-05', to: '2026-02' })).toEqual({ from: '2026-02', to: '2026-05' });
  });

  it('uses the accrual month by default and the payment date on request', () => {
    const rows = [
      tx({ date: '2025-12-20', accrualMonth: '2026-04', amountCents: 30000 }), // flight paid in December for Easter
      tx({ date: '2026-01-10', amountCents: 1000 }),
      tx({ date: '2026-01-11', amountCents: 999, status: 'pending' }),
      tx({ date: '2026-01-12', kind: 'transfer', amountCents: 5000 }),
    ];
    expect(inPeriod(rows, yearPeriod(2026), 'accrual')).toHaveLength(2);
    expect(inPeriod(rows, yearPeriod(2026), 'payment')).toHaveLength(1);
    expect(inPeriod(rows, yearPeriod(2025), 'payment')).toHaveLength(1);
  });
});

describe('totalsOf', () => {
  it('counts my share, and the savings rate only with income', () => {
    const t = totalsOf([
      income('2026-01-27', 200000),
      tx({ amountCents: 4000, split: { totalCents: 4000, myShareCents: 1500, paidBy: 'me', shares: [] } }),
      tx({ amountCents: 48500 }),
    ]);
    expect(t).toEqual({ incomeCents: 200000, expenseCents: 50000, savingsCents: 150000, savingsRate: 0.75 });
    expect(totalsOf([tx({ amountCents: 100 })]).savingsRate).toBeNull();
  });
});

describe('breakdown', () => {
  it('sorts macro-voci and categories by amount with shares', () => {
    const rows = [
      tx({ amountCents: 3000 }),
      tx({ amountCents: 1000, categoryId: 'cat_svago' }),
      tx({ amountCents: 6000, categoryId: 'cat_alimentari' }),
      income('2026-01-27', 100000),
    ];
    const b = breakdown(rows, 'expense', { categories });
    expect(b.map((g) => [g.groupId, g.cents, g.share])).toEqual([
      ['grp_spesa', 6000, 0.6],
      ['grp_svago', 4000, 0.4],
    ]);
    expect(b[1]?.categories.map((c) => [c.categoryId, c.cents, c.share, c.count])).toEqual([
      ['cat_cibo', 3000, 0.75, 1],
      ['cat_svago', 1000, 0.25, 1],
    ]);
    expect(breakdown(rows, 'income', { categories })[0]?.cents).toBe(100000);
  });
});

describe('monthlySeries', () => {
  it('fills empty months and accumulates savings', () => {
    const rows = [income('2026-01-27', 200000), tx({ date: '2026-01-10', amountCents: 50000 }), tx({ date: '2026-03-10', amountCents: 30000 })];
    const s = monthlySeries(rows, { from: '2026-01', to: '2026-03' }, 'accrual');
    expect(s.map((p) => [p.month, p.savingsCents, p.cumulativeSavingsCents])).toEqual([
      ['2026-01', 150000, 150000],
      ['2026-02', 0, 150000],
      ['2026-03', -30000, 120000],
    ]);
    expect(s[0]?.savingsRate).toBe(0.75);
    expect(s[1]?.savingsRate).toBeNull();
  });
});

describe('yearOverYear', () => {
  const rows = [
    tx({ date: '2024-03-01', amountCents: 10000 }),
    tx({ date: '2025-03-01', amountCents: 12000 }),
    tx({ date: '2025-11-01', amountCents: 5000 }),
    tx({ date: '2025-03-02', amountCents: 2000, categoryId: 'cat_alimentari' }),
    tx({ date: '2026-03-01', amountCents: 9000 }),
  ];

  it('gives € and % change between the last two years', () => {
    const y = yearOverYear(rows, [2024, 2025, 2026], 'accrual', { categories });
    expect(y.total.values).toEqual([10000, 19000, 9000]);
    expect(y.total.deltaCents).toBe(-10000);
    expect(y.total.deltaRatio).toBeCloseTo(-10000 / 19000);
    const svago = y.groups.find((g) => g.id === 'grp_svago');
    expect(svago?.values).toEqual([10000, 17000, 9000]);
    const alim = y.groups.find((g) => g.id === 'grp_spesa');
    expect(alim?.deltaRatio).toBe(-1);
    expect(yearOverYear(rows, [2026], 'accrual', { categories }).total.deltaRatio).toBeNull();
  });

  it('compares the same months when the year is in progress', () => {
    const y = yearOverYear(rows, [2025, 2026], 'accrual', { categories }, 10);
    expect(y.total.values).toEqual([14000, 9000]);
  });

  it('lists the years with data', () => {
    expect(yearsWithData(rows, 'accrual')).toEqual([2024, 2025, 2026]);
  });
});
