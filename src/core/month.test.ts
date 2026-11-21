import { describe, expect, it } from 'vitest';
import { monthOverview, monthlyBudgetCents } from './month';
import { tx } from './test-utils';
import type { Budget, RecurringRule } from './types';

const cats = [
  { id: 'cat_cibo', groupId: 'grp_svago' },
  { id: 'cat_svago', groupId: 'grp_svago' },
  { id: 'cat_alimentari', groupId: 'grp_spesa' },
];
const budget = (over: Partial<Budget>): Budget => ({
  id: Math.random().toString(36),
  scope: 'category',
  targetId: 'cat_cibo',
  monthlyLimitCents: 10000,
  rollover: false,
  validFrom: '2026-01',
  ...over,
});

describe('monthlyBudgetCents', () => {
  it('is null without budgets', () => {
    expect(monthlyBudgetCents([], cats, '2026-11')).toBeNull();
  });
  it('takes the latest valid budget per target', () => {
    const b = [budget({ validFrom: '2026-01', monthlyLimitCents: 10000 }), budget({ validFrom: '2026-06', monthlyLimitCents: 15000 }), budget({ validFrom: '2027-01', monthlyLimitCents: 1 })];
    expect(monthlyBudgetCents(b, cats, '2026-11')).toBe(15000);
    expect(monthlyBudgetCents(b, cats, '2026-03')).toBe(10000);
  });
  it('a group budget replaces its categories', () => {
    const b = [
      budget({ targetId: 'cat_cibo', monthlyLimitCents: 10000 }),
      budget({ scope: 'group', targetId: 'grp_svago', monthlyLimitCents: 30000 }),
      budget({ targetId: 'cat_alimentari', monthlyLimitCents: 40000 }),
    ];
    expect(monthlyBudgetCents(b, cats, '2026-11')).toBe(70000);
  });
});

const rule = (over: Partial<RecurringRule>): RecurringRule => ({
  id: 'r_mutuo',
  title: 'Rata Mutuo',
  amountCents: 73443,
  isEstimate: false,
  frequency: 'monthly',
  dayOfMonth: 15,
  startDate: '2026-01-01',
  categoryId: 'cat_mutuo',
  paymentMethodId: 'pm_conto',
  active: true,
  generatedThrough: '2026-11-10',
  ...over,
});
const kindOf = (id: string) => (id === 'cat_stipendio' ? ('income' as const) : ('expense' as const));

describe('monthOverview', () => {
  const today = '2026-11-10'; // 21 days left including today
  const transactions = [
    tx({ date: '2026-11-02', amountCents: 5000 }),
    tx({ date: '2026-11-05', amountCents: 5000, split: { totalCents: 5000, myShareCents: 2500, paidBy: 'me', shares: [] } }),
    tx({ date: '2026-11-03', amountCents: 4590, recurringRuleId: 'r_gym', categoryId: 'cat_abbonamenti' }),
    tx({ date: '2026-11-08', amountCents: 3000, status: 'pending', recurringRuleId: 'r_tel' }),
    tx({ date: '2026-10-30', accrualMonth: '2026-11', amountCents: 10000 }), // paid in October, belongs to November
    tx({ date: '2026-11-01', accrualMonth: '2026-12', amountCents: 99999 }), // belongs to December
    tx({ date: '2026-11-01', kind: 'income', amountCents: 50000, categoryId: 'cat_altre_entrate' }),
    tx({ date: '2026-11-04', kind: 'transfer', amountCents: 77777 }),
  ];
  const rules = [
    rule({}),
    rule({ id: 'r_stip', title: 'Stipendio', amountCents: 200000, dayOfMonth: 27, categoryId: 'cat_stipendio' }),
    rule({ id: 'r_off', active: false, dayOfMonth: 20 }),
  ];
  const budgets = [budget({ scope: 'group', targetId: 'grp_svago', monthlyLimitCents: 150000 })];

  it('computes spent, income, due and the daily allowance (decision 3B)', () => {
    const o = monthOverview({ transactions, rules, budgets, categories: cats, kindOf, today });
    expect(o.month).toBe('2026-11');
    expect(o.spentCents).toBe(5000 + 2500 + 4590 + 10000);
    expect(o.incomeCents).toBe(50000);
    expect(o.balanceCents).toBe(50000 - 22090);
    expect(o.dueExpenseCents).toBe(3000 + 73443);
    expect(o.dueIncomeCents).toBe(200000);
    expect(o.daysLeft).toBe(21);
    expect(o.budgetCents).toBe(150000);
    expect(o.leftCents).toBe(150000 - 22090 - 76443);
    expect(o.perDayCents).toBe(Math.floor((150000 - 22090 - 76443) / 21));
    expect(o.budgetRatio).toBeCloseTo(22090 / 150000);
  });

  it('projects month-end savings from the everyday pace', () => {
    const o = monthOverview({ transactions, rules, budgets, categories: cats, kindOf, today });
    const everyday = 5000 + 2500 + 10000; // recurring-linked rows excluded from the pace
    const pace = Math.round((everyday / 10) * 20);
    expect(o.projectedExpenseCents).toBe(22090 + 76443 + pace);
    expect(o.projectedIncomeCents).toBe(250000);
    expect(o.projectedSavingsCents).toBe(250000 - (22090 + 76443 + pace));
  });

  it('never suggests a negative daily amount and works without a budget', () => {
    const over = monthOverview({ transactions, rules, budgets: [budget({ scope: 'group', targetId: 'grp_svago', monthlyLimitCents: 100 })], categories: cats, kindOf, today });
    expect(over.perDayCents).toBe(0);
    expect(over.leftCents).toBeLessThan(0);
    const none = monthOverview({ transactions, rules, budgets: [], categories: cats, kindOf, today });
    expect(none.budgetCents).toBeNull();
    expect(none.perDayCents).toBeNull();
    expect(none.budgetRatio).toBe(0);
  });

  it('on the last day only today counts', () => {
    const o = monthOverview({ transactions: [], rules: [], budgets, categories: cats, kindOf, today: '2026-11-30' });
    expect(o.daysLeft).toBe(1);
    expect(o.perDayCents).toBe(150000);
    expect(o.projectedExpenseCents).toBe(0);
  });
});
