import { describe, expect, it } from 'vitest';
import { monthOverview, todayPeriod } from './month';
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
    // The budget covers grp_svago only: cat_cibo rows count, Abbonamenti and the mortgage do not.
    expect(o.budget?.availableCents).toBe(150000);
    expect(o.budget?.spentCents).toBe(17500);
    expect(o.budget?.dueCents).toBe(3000);
    expect(o.leftCents).toBe(150000 - 17500 - 3000);
    expect(o.perDayCents).toBe(Math.floor((150000 - 17500 - 3000) / 21));
    expect(o.budget?.ratio).toBeCloseTo(17500 / 150000);
  });

  it('counts fixed costs still due when their category is budgeted', () => {
    const b = [...budgets, budget({ targetId: 'cat_mutuo', monthlyLimitCents: 80000 })];
    const o = monthOverview({ transactions, rules, budgets: b, categories: [...cats, { id: 'cat_mutuo', groupId: 'grp_casa' }], kindOf, today });
    expect(o.budget?.availableCents).toBe(230000);
    expect(o.budget?.dueCents).toBe(3000 + 73443);
    expect(o.leftCents).toBe(230000 - 17500 - 76443);
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
    expect(none.budget).toBeNull();
    expect(none.perDayCents).toBeNull();
  });

  it('on the last day only today counts', () => {
    const o = monthOverview({ transactions: [], rules: [], budgets, categories: cats, kindOf, today: '2026-11-30' });
    expect(o.daysLeft).toBe(1);
    expect(o.perDayCents).toBe(150000);
    expect(o.projectedExpenseCents).toBe(0);
  });
});

describe('todayPeriod (Today follows the salary)', () => {
  const salary = (date: string, accrualMonth: string, over = {}) =>
    tx({ date, accrualMonth, kind: 'income', amountCents: 200000, categoryId: 'cat_stipendio', ...over });

  it('is the calendar month without a salary for next month', () => {
    expect(todayPeriod([salary('2026-10-27', '2026-11')], '2026-11-20')).toEqual({ month: '2026-11', start: '2026-11-01', salaryDate: null });
  });

  it('moves to next month as soon as its salary is in', () => {
    const p = todayPeriod([salary('2026-10-27', '2026-11'), salary('2026-11-27', '2026-12')], '2026-11-27');
    expect(p).toEqual({ month: '2026-12', start: '2026-11-27', salaryDate: '2026-11-27' });
  });

  it('works across the new year', () => {
    expect(todayPeriod([salary('2026-12-23', '2027-01')], '2026-12-28').month).toBe('2027-01');
  });

  it('ignores pending salaries, other income, and salaries accrued further ahead', () => {
    const today = '2026-11-27';
    expect(todayPeriod([salary('2026-11-27', '2026-12', { status: 'pending' })], today).month).toBe('2026-11');
    expect(todayPeriod([salary('2026-11-27', '2026-12', { categoryId: 'cat_altre_entrate' })], today).month).toBe('2026-11');
    expect(todayPeriod([salary('2026-11-27', '2027-01')], today).month).toBe('2026-11');
  });

  it('starts the pace today when the salary is dated in the future', () => {
    expect(todayPeriod([salary('2026-11-30', '2026-12')], '2026-11-27').start).toBe('2026-11-27');
  });
});

describe('monthOverview for next month (salary already in)', () => {
  const kindOf = (id: string) => (id === 'cat_stipendio' ? ('income' as const) : ('expense' as const));
  const today = '2026-11-27';
  const period = { month: '2026-12', start: '2026-11-27' };
  const transactions = [
    tx({ date: '2026-11-27', accrualMonth: '2026-12', kind: 'income', amountCents: 200000, categoryId: 'cat_stipendio' }),
    tx({ date: '2026-11-27', accrualMonth: '2026-12', amountCents: 2000 }),
    tx({ date: '2026-11-20', amountCents: 9999 }), // November: not in December's view
  ];
  const rules = [
    rule({ id: 'r_nov', dayOfMonth: 29, categoryId: 'cat_mutuo', amountCents: 1000 }), // 29 Nov (November) + 29 Dec
  ];
  const budgets = [budget({ targetId: 'cat_cibo', monthlyLimitCents: 70000 })];

  it('shows December numbers with the days left until 31 December', () => {
    const o = monthOverview({ transactions, rules, budgets, categories: cats, kindOf, today, period });
    expect(o.month).toBe('2026-12');
    expect(o.spentCents).toBe(2000);
    expect(o.incomeCents).toBe(200000);
    expect(o.daysLeft).toBe(35); // 27–30 Nov + 31 days of December
    expect(o.dueExpenseCents).toBe(1000); // only the December occurrence
    expect(o.perDayCents).toBe(Math.floor((70000 - 2000) / 35)); // the 20 € expense is in the budgeted cat_cibo
    // everyday pace: 2000 over 1 elapsed day, for the 34 days after today
    expect(o.projectedExpenseCents).toBe(2000 + 1000 + 2000 * 34);
  });

  it("doesn't expect another salary in a month its salary opened early", () => {
    const salaryRule = rule({ id: 'r_stip', title: 'Stipendio', amountCents: 200000, dayOfMonth: 27, categoryId: 'cat_stipendio' });
    const opened = monthOverview({ transactions, rules: [salaryRule], budgets, categories: cats, kindOf, today, period: { ...period, salaryDate: '2026-11-27' } });
    expect(opened.dueIncomeCents).toBe(0);
    expect(opened.projectedIncomeCents).toBe(200000);
    const calendar = monthOverview({ transactions, rules: [salaryRule], budgets, categories: cats, kindOf, today, period });
    expect(calendar.dueIncomeCents).toBe(200000);
  });
});
