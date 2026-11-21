import { describe, expect, it } from 'vitest';
import { alertSummary, averageSpent, budgetAlerts, budgetMonth, budgetStatus, budgetsForMonth, planBudgetWrite, savingsProgress, spendIndex } from './budget';
import { tx } from './test-utils';
import type { Budget, CategoryGroup } from './types';

const categories = [
  { id: 'cat_cibo', groupId: 'grp_svago', order: 2 },
  { id: 'cat_svago', groupId: 'grp_svago', order: 1 },
  { id: 'cat_alimentari', groupId: 'grp_spesa', order: 0 },
  { id: 'cat_mutuo', groupId: 'grp_casa', order: 3 },
];
const groups: CategoryGroup[] = [
  { id: 'grp_casa', name: 'Casa', kind: 'expense', order: 0 },
  { id: 'grp_spesa', name: 'Spesa', kind: 'expense', order: 1 },
  { id: 'grp_svago', name: 'Svago', kind: 'expense', order: 2 },
];
let n = 0;
const budget = (over: Partial<Budget>): Budget => ({
  id: `b_${++n}`,
  scope: 'category',
  targetId: 'cat_cibo',
  monthlyLimitCents: 10000,
  rollover: false,
  validFrom: '2026-01',
  ...over,
});
const month = (budgets: Budget[], transactions = [tx({ date: '2026-03-10', amountCents: 1 })], m = '2026-03') =>
  budgetMonth({ budgets, transactions, categories, groups, month: m });

describe('budgetsForMonth', () => {
  it('takes the latest row per target and drops removed ones', () => {
    const b = [
      budget({ validFrom: '2026-01', monthlyLimitCents: 10000 }),
      budget({ validFrom: '2026-06', monthlyLimitCents: 15000 }),
      budget({ validFrom: '2027-01', monthlyLimitCents: 1 }),
      budget({ targetId: 'cat_svago', validFrom: '2026-01' }),
      budget({ targetId: 'cat_svago', validFrom: '2026-05', monthlyLimitCents: 0 }),
    ];
    expect(budgetsForMonth(b, '2026-11').map((x) => x.monthlyLimitCents)).toEqual([15000]);
    expect(budgetsForMonth(b, '2026-03').map((x) => x.monthlyLimitCents)).toEqual([10000, 10000]);
    expect(budgetsForMonth(b, '2025-12')).toEqual([]);
  });
});

describe('budgetStatus', () => {
  it('warns at 80% and flags 100%', () => {
    expect(budgetStatus(0.79)).toBe('ok');
    expect(budgetStatus(0.8)).toBe('warning');
    expect(budgetStatus(0.999)).toBe('warning');
    expect(budgetStatus(1)).toBe('over');
  });
});

describe('budgetMonth', () => {
  const transactions = [
    tx({ date: '2026-03-02', amountCents: 6000 }), // cibo
    tx({ date: '2026-03-03', amountCents: 4000, split: { totalCents: 4000, myShareCents: 2000, paidBy: 'me', shares: [] } }),
    tx({ date: '2026-03-04', amountCents: 3000, categoryId: 'cat_svago' }),
    tx({ date: '2026-03-05', amountCents: 9000, categoryId: 'cat_alimentari' }),
    tx({ date: '2026-03-06', amountCents: 73443, categoryId: 'cat_mutuo' }),
    tx({ date: '2026-03-07', amountCents: 5000, status: 'pending' }),
    tx({ date: '2026-02-27', accrualMonth: '2026-03', amountCents: 500 }),
    tx({ date: '2026-03-08', accrualMonth: '2026-04', amountCents: 99999 }),
    tx({ date: '2026-03-09', kind: 'income', amountCents: 100000, categoryId: 'cat_stipendio' }),
  ];

  it('measures each budget on confirmed expenses by accrual month', () => {
    const r = month([budget({ monthlyLimitCents: 10000 }), budget({ targetId: 'cat_alimentari', monthlyLimitCents: 20000 })], transactions);
    const cibo = r.lines.find((l) => l.targetId === 'cat_cibo');
    expect(cibo?.spentCents).toBe(6000 + 2000 + 500);
    expect(cibo?.remainingCents).toBe(1500);
    expect(cibo?.status).toBe('warning');
    const alim = r.lines.find((l) => l.targetId === 'cat_alimentari');
    expect(alim?.status).toBe('ok');
    expect(r.totals).toMatchObject({ availableCents: 30000, spentCents: 17500, remainingCents: 12500 });
  });

  it('a group budget covers its categories and replaces their budgets in the totals', () => {
    const r = month(
      [budget({ monthlyLimitCents: 5000 }), budget({ scope: 'group', targetId: 'grp_svago', monthlyLimitCents: 20000 })],
      transactions,
    );
    const group = r.lines.find((l) => l.scope === 'group');
    expect(group?.spentCents).toBe(8500 + 3000);
    expect(r.totals?.availableCents).toBe(20000);
    expect(r.totals?.spentCents).toBe(11500);
    expect([...r.covered].sort()).toEqual(['cat_cibo', 'cat_svago']);
    expect(r.unbudgeted).toEqual([
      { categoryId: 'cat_mutuo', spentCents: 73443 },
      { categoryId: 'cat_alimentari', spentCents: 9000 },
    ]);
    expect(r.lines.find((l) => l.targetId === 'cat_cibo')?.status).toBe('over');
  });

  it('groups lines by macro-voce in list order', () => {
    const r = month([
      budget({ targetId: 'cat_cibo' }),
      budget({ targetId: 'cat_svago' }),
      budget({ scope: 'group', targetId: 'grp_svago' }),
      budget({ targetId: 'cat_alimentari' }),
    ]);
    expect(r.sections.map((s) => s.group.id)).toEqual(['grp_spesa', 'grp_svago']);
    const svago = r.sections[1];
    expect(svago?.groupLine?.targetId).toBe('grp_svago');
    expect(svago?.categoryLines.map((l) => l.targetId)).toEqual(['cat_svago', 'cat_cibo']);
  });

  it('is empty without budgets', () => {
    const r = month([], transactions);
    expect(r.totals).toBeNull();
    expect(r.lines).toEqual([]);
    expect(r.unbudgeted).toHaveLength(4);
  });

  it('alerts list warning and over lines, most used first', () => {
    const r = month(
      [budget({ monthlyLimitCents: 10000 }), budget({ targetId: 'cat_svago', monthlyLimitCents: 2000 }), budget({ targetId: 'cat_alimentari', monthlyLimitCents: 90000 })],
      transactions,
    );
    expect(budgetAlerts(r.lines).map((l) => l.targetId)).toEqual(['cat_svago', 'cat_cibo']);
    expect(alertSummary(r.lines)?.tone).toBe('over');
    expect(alertSummary(r.lines.filter((l) => l.targetId === 'cat_cibo'))?.tone).toBe('warning');
    expect(alertSummary(r.lines.filter((l) => l.targetId === 'cat_alimentari'))).toBeNull();
  });
});

describe('rollover', () => {
  const spend = (m: string, cents: number) => tx({ date: `${m}-10`, amountCents: cents });

  it('carries the unspent amount forward and accumulates', () => {
    const b = [budget({ monthlyLimitCents: 10000, rollover: true })];
    const t = [spend('2026-01', 7000), spend('2026-02', 9000), spend('2026-03', 1000)];
    // Jan: 3000 left → Feb has 13000, spends 9000 → 4000 → Mar has 14000.
    const r = month(b, t);
    expect(r.lines[0]).toMatchObject({ limitCents: 10000, carryCents: 4000, availableCents: 14000, spentCents: 1000 });
  });

  it('does not carry overspending', () => {
    const b = [budget({ monthlyLimitCents: 10000, rollover: true })];
    const r = month(b, [spend('2026-01', 7000), spend('2026-02', 25000)]);
    expect(r.lines[0]?.carryCents).toBe(0);
  });

  it('only with rollover on, and the chain restarts after a month without it', () => {
    expect(month([budget({})], [spend('2026-01', 0)]).lines[0]?.carryCents).toBe(0);
    const b = [
      budget({ monthlyLimitCents: 10000, rollover: true, validFrom: '2026-01' }),
      budget({ monthlyLimitCents: 10000, rollover: false, validFrom: '2026-02' }),
      budget({ monthlyLimitCents: 10000, rollover: true, validFrom: '2026-03' }),
    ];
    // Jan unspent (10000) is lost in Feb; Feb's unspent 10000 − 4000 moves to Mar.
    expect(month(b, [spend('2026-02', 4000)]).lines[0]?.carryCents).toBe(6000);
  });

  it('starts over after a removed month', () => {
    const b = [
      budget({ monthlyLimitCents: 10000, rollover: true, validFrom: '2026-01' }),
      budget({ monthlyLimitCents: 0, rollover: false, validFrom: '2026-02' }),
      budget({ monthlyLimitCents: 10000, rollover: true, validFrom: '2026-03' }),
    ];
    expect(month(b, []).lines[0]?.carryCents).toBe(0);
  });

  it('carries on a group budget too', () => {
    const b = [budget({ scope: 'group', targetId: 'grp_svago', monthlyLimitCents: 10000, rollover: true, validFrom: '2026-02' })];
    const r = month(b, [spend('2026-02', 2000), tx({ date: '2026-02-11', amountCents: 1000, categoryId: 'cat_svago' })]);
    expect(r.lines[0]?.carryCents).toBe(7000);
  });
});

describe('planBudgetWrite', () => {
  const id = () => 'b_new';

  it('adds a row from the current month, keeping the past', () => {
    const old = budget({ validFrom: '2026-01' });
    expect(planBudgetWrite([old], 'category', 'cat_cibo', '2026-03', { limitCents: 20000, rollover: true }, id)).toEqual({
      put: { id: 'b_new', scope: 'category', targetId: 'cat_cibo', monthlyLimitCents: 20000, rollover: true, validFrom: '2026-03' },
    });
  });

  it('updates a row that already starts this month', () => {
    const cur = budget({ validFrom: '2026-03' });
    expect(planBudgetWrite([cur], 'category', 'cat_cibo', '2026-03', { limitCents: 5000, rollover: false }, id).put).toEqual({
      ...cur,
      monthlyLimitCents: 5000,
    });
  });

  it('removing deletes a budget created this month, otherwise ends it with a 0 row', () => {
    const cur = budget({ validFrom: '2026-03' });
    expect(planBudgetWrite([cur], 'category', 'cat_cibo', '2026-03', null, id)).toEqual({ deleteId: cur.id });
    const old = budget({ validFrom: '2026-01' });
    expect(planBudgetWrite([old], 'category', 'cat_cibo', '2026-03', null, id).put).toMatchObject({ id: 'b_new', monthlyLimitCents: 0, validFrom: '2026-03' });
    expect(planBudgetWrite([old, cur], 'category', 'cat_cibo', '2026-03', null, id).put).toMatchObject({ id: cur.id, monthlyLimitCents: 0 });
    expect(planBudgetWrite([], 'category', 'cat_cibo', '2026-03', null, id)).toEqual({});
  });
});

describe('savingsProgress', () => {
  const t = [
    tx({ date: '2026-01-27', kind: 'income', amountCents: 200000, categoryId: 'cat_stipendio' }),
    tx({ date: '2026-02-27', kind: 'income', amountCents: 200000, categoryId: 'cat_stipendio' }),
    tx({ date: '2026-02-10', amountCents: 150000 }),
    tx({ date: '2026-02-11', amountCents: 20000, split: { totalCents: 20000, myShareCents: 10000, paidBy: 'me', shares: [] } }),
    tx({ date: '2026-03-01', amountCents: 50000, status: 'pending' }),
    tx({ date: '2026-03-02', kind: 'transfer', amountCents: 50000 }),
    tx({ date: '2025-12-31', accrualMonth: '2026-01', amountCents: 40000 }),
    tx({ date: '2025-06-10', kind: 'income', amountCents: 999999, categoryId: 'cat_stipendio' }),
  ];

  it('counts income minus expenses accrued to the year', () => {
    const p = savingsProgress(t, { year: 2026, targetCents: 600000 }, '2026-03-15');
    expect(p.savedCents).toBe(400000 - 150000 - 10000 - 40000);
    expect(p.ratio).toBeCloseTo(200000 / 600000);
    expect(p.monthsLeft).toBe(10);
    expect(p.neededPerMonthCents).toBe(40000);
    expect(p.expectedCents).toBe(100000);
    expect(p.onTrack).toBe(true);
  });

  it('handles reached goals, past and future years', () => {
    expect(savingsProgress(t, { year: 2026, targetCents: 100000 }, '2026-03-15').neededPerMonthCents).toBe(0);
    const past = savingsProgress(t, { year: 2025, targetCents: 100000 }, '2026-03-15');
    expect(past).toMatchObject({ monthsLeft: 0, neededPerMonthCents: 0, expectedCents: 100000, onTrack: true });
    const future = savingsProgress(t, { year: 2027, targetCents: 120000 }, '2026-03-15');
    expect(future).toMatchObject({ savedCents: 0, monthsLeft: 12, neededPerMonthCents: 10000, onTrack: true });
  });

  it('rounds the monthly need up', () => {
    expect(savingsProgress([], { year: 2026, targetCents: 100 }, '2026-10-01').neededPerMonthCents).toBe(34);
  });
});

describe('averageSpent', () => {
  it('averages the previous months, empty months included', () => {
    const index = spendIndex([
      tx({ date: '2026-02-10', amountCents: 3000 }),
      tx({ date: '2026-01-10', amountCents: 6000, categoryId: 'cat_svago' }),
      tx({ date: '2026-03-10', amountCents: 99999 }),
    ]);
    expect(averageSpent(index, categories, 'category', 'cat_cibo', '2026-03')).toBe(1000);
    expect(averageSpent(index, categories, 'group', 'grp_svago', '2026-03')).toBe(3000);
  });
});
