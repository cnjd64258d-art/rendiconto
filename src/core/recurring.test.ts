import { describe, expect, it } from 'vitest';
import {
  demoRecurringRules,
  draftFromRule,
  dueDates,
  emptyRuleDraft,
  generateDue,
  kindResolver,
  nextOccurrence,
  occurrencesBetween,
  upcoming,
  validateRuleDraft,
  yearlyCents,
} from './recurring';
import type { RecurringRule } from './types';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  title: 'Rata Mutuo',
  amountCents: 73443,
  isEstimate: false,
  frequency: 'monthly',
  dayOfMonth: 15,
  startDate: '2026-01-01',
  categoryId: 'cat_mutuo',
  paymentMethodId: 'pm_conto',
  active: true,
  ...over,
});

const expenseKind = () => 'expense' as const;

describe('occurrencesBetween', () => {
  it('monthly on a fixed day', () => {
    expect(occurrencesBetween(rule(), '2026-01-01', '2026-04-30')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });
  it('clamps the day to short months', () => {
    expect(occurrencesBetween(rule({ dayOfMonth: 31 }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrencesBetween(rule({ dayOfMonth: 29, startDate: '2028-01-01' }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });
  it('quarterly counts from the start month', () => {
    const r = rule({ frequency: 'quarterly', dayOfMonth: 1, startDate: '2026-02-01' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual(['2026-02-01', '2026-05-01', '2026-08-01', '2026-11-01']);
    expect(occurrencesBetween(r, '2026-06-01', '2027-03-01')).toEqual(['2026-08-01', '2026-11-01', '2027-02-01']);
  });
  it('yearly', () => {
    const r = rule({ frequency: 'yearly', dayOfMonth: 10, startDate: '2025-03-10' });
    expect(occurrencesBetween(r, '2025-01-01', '2027-12-31')).toEqual(['2025-03-10', '2026-03-10', '2027-03-10']);
  });
  it('respects start and end dates', () => {
    const r = rule({ startDate: '2026-01-20', endDate: '2026-04-14' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual(['2026-02-15', '2026-03-15']);
  });
  it('is empty for an inverted range', () => {
    expect(occurrencesBetween(rule(), '2026-05-01', '2026-04-01')).toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('finds the next date, including the same day', () => {
    expect(nextOccurrence(rule(), '2026-11-15')).toBe('2026-11-15');
    expect(nextOccurrence(rule(), '2026-11-16')).toBe('2026-12-15');
  });
  it('is null after the end', () => {
    expect(nextOccurrence(rule({ endDate: '2026-06-30' }), '2026-07-01')).toBeNull();
  });
});

describe('generation', () => {
  it('generates from the start when never run, up to today included', () => {
    expect(dueDates(rule({ startDate: '2026-09-01' }), '2026-11-15')).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
  });
  it('resumes after generatedThrough and is idempotent', () => {
    const r = rule({ generatedThrough: '2026-10-20' });
    expect(dueDates(r, '2026-11-21')).toEqual(['2026-11-15']);
    const first = generateDue([r], '2026-11-21', expenseKind);
    expect(first.transactions).toHaveLength(1);
    expect(first.advanced).toEqual({ r1: '2026-11-21' });
    const again = generateDue([{ ...r, generatedThrough: '2026-11-21' }], '2026-11-21', expenseKind);
    expect(again.transactions).toHaveLength(0);
    expect(again.advanced).toEqual({});
  });
  it('skips paused rules', () => {
    expect(generateDue([rule({ active: false })], '2026-11-21', expenseKind).transactions).toEqual([]);
  });
  it('builds pending transactions linked to the rule', () => {
    const [t] = generateDue([rule({ generatedThrough: '2026-11-01' })], '2026-11-21', () => 'expense').transactions;
    expect(t).toMatchObject({
      title: 'Rata Mutuo',
      amountCents: 73443,
      kind: 'expense',
      date: '2026-11-15',
      accrualMonth: '2026-11',
      status: 'pending',
      recurringRuleId: 'r1',
      categoryId: 'cat_mutuo',
      paymentMethodId: 'pm_conto',
    });
  });
});

describe('upcoming', () => {
  it('lists the next days, excluding today, soonest first', () => {
    const rules = [
      rule(),
      rule({ id: 'r2', title: 'Vodafone', amountCents: 3000, dayOfMonth: 18 }),
      rule({ id: 'r3', title: 'Pausa', dayOfMonth: 16, active: false }),
    ];
    const list = upcoming(rules, '2026-11-14', 7, expenseKind);
    expect(list.map((u) => [u.rule.id, u.date])).toEqual([
      ['r1', '2026-11-15'],
      ['r2', '2026-11-18'],
    ]);
    expect(upcoming(rules, '2026-11-15', 7, expenseKind).map((u) => u.rule.id)).toEqual(['r2']);
  });
});

describe('yearlyCents', () => {
  it('scales by frequency', () => {
    expect(yearlyCents({ amountCents: 3000, frequency: 'monthly' })).toBe(36000);
    expect(yearlyCents({ amountCents: 300, frequency: 'quarterly' })).toBe(1200);
    expect(yearlyCents({ amountCents: 5000, frequency: 'yearly' })).toBe(5000);
  });
});

describe('validateRuleDraft', () => {
  const valid = { ...emptyRuleDraft('2026-11-21'), title: ' Rinnovo  Vodafone ', amount: '30', categoryId: 'cat_abbonamenti', paymentMethodId: 'pm_conto' };

  it('reports every missing field', () => {
    const r = validateRuleDraft(emptyRuleDraft('2026-11-21'), '2026-11-21');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['amount', 'categoryId', 'paymentMethodId', 'title']);
  });
  it('rejects a bad day and an end before the start', () => {
    const r = validateRuleDraft({ ...valid, dayOfMonth: '32', endDate: '2026-01-01' }, '2026-11-21');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['dayOfMonth', 'endDate']);
  });
  it('new rules starting today generate from today (no back-fill)', () => {
    const r = validateRuleDraft({ ...valid, startDate: '2026-01-01', dayOfMonth: '3' }, '2026-11-21');
    expect(r.ok && r.value).toMatchObject({ title: 'Rinnovo Vodafone', amountCents: 3000, dayOfMonth: 3, generatedThrough: '2026-11-20' });
    if (r.ok) expect(dueDates({ id: 'x', ...r.value }, '2026-11-21')).toEqual([]);
  });
  it('a future start leaves generation to the start date', () => {
    const r = validateRuleDraft({ ...valid, startDate: '2027-01-01' }, '2026-11-21');
    expect(r.ok && r.value.generatedThrough).toBeUndefined();
  });
  it('keeps the cursor when only the amount changes', () => {
    const prev = rule({ generatedThrough: '2026-11-21' });
    const r = validateRuleDraft({ ...draftFromRule(prev), amount: '750,00' }, '2026-11-25', prev);
    expect(r.ok && r.value).toMatchObject({ amountCents: 75000, generatedThrough: '2026-11-21' });
  });
  it('does not back-fill when a paused rule is resumed', () => {
    const prev = rule({ active: false, generatedThrough: '2026-06-30' });
    const r = validateRuleDraft({ ...draftFromRule(prev), active: true }, '2026-11-21', prev);
    expect(r.ok && r.value.generatedThrough).toBe('2026-11-20');
  });
  it('round-trips through a draft', () => {
    const prev = rule({ endDate: '2027-12-31', isEstimate: true, generatedThrough: '2026-11-01' });
    const r = validateRuleDraft(draftFromRule(prev), '2026-11-21', prev);
    const { id, ...rest } = prev;
    expect(id).toBe('r1');
    expect(r.ok && r.value).toEqual(rest);
  });
});

describe('demoRecurringRules', () => {
  it('only the bollo is due right after loading the demo', () => {
    const rules = demoRecurringRules('2026-11-21');
    const due = generateDue(rules, '2026-11-21', expenseKind).transactions;
    expect(due.map((t) => [t.title, t.date])).toEqual([['Bollo conto', '2026-11-19']]);
  });
  it('resolves kinds from category groups', () => {
    const kindOf = kindResolver([{ id: 'cat_stipendio', groupId: 'grp_entrate' }], [{ id: 'grp_entrate', kind: 'income' }]);
    expect(kindOf('cat_stipendio')).toBe('income');
    expect(kindOf('cat_unknown')).toBe('expense');
  });
});
