import { describe, expect, it } from 'vitest';
import { busiestWeekday, categorySpikes, insights, savingsPace, subscriptions, topMerchant, type InsightInput } from './insights';
import { tx } from './test-utils';
import type { Category, CategoryGroup, RecurringRule, Transaction } from './types';

const plain = (s: string | undefined) => s?.replace(/\u00a0|\u202f/g, ' ');
const cat = (id: string, name: string, groupId: string): Category => ({ id, name, emoji: '•', color: 'gray', groupId, order: 0, archived: false });
const categories = [
  cat('cat_cibo', 'Cibo', 'grp_svago'),
  cat('cat_trasporti', 'Trasporti', 'grp_trasporti'),
  cat('cat_abbonamenti', 'Abbonamenti', 'grp_abbonamenti'),
  cat('cat_mutuo', 'Mutuo', 'grp_casa'),
  cat('cat_stipendio', 'Stipendio', 'grp_entrate'),
];
const groups: CategoryGroup[] = [
  { id: 'grp_svago', name: 'Svago', kind: 'expense', order: 0 },
  { id: 'grp_trasporti', name: 'Trasporti', kind: 'expense', order: 1 },
  { id: 'grp_abbonamenti', name: 'Abbonamenti', kind: 'expense', order: 2 },
  { id: 'grp_casa', name: 'Casa', kind: 'expense', order: 3 },
  { id: 'grp_entrate', name: 'Entrate', kind: 'income', order: 4 },
];
const input = (transactions: Transaction[], over: Partial<InsightInput> = {}): InsightInput => ({
  transactions,
  rules: [],
  categories,
  groups,
  basis: 'accrual',
  month: '2026-10',
  today: '2026-11-21',
  ...over,
});
const rule = (over: Partial<RecurringRule>): RecurringRule => ({
  id: 'r',
  title: 'Gympass',
  amountCents: 4590,
  isEstimate: false,
  frequency: 'monthly',
  dayOfMonth: 3,
  startDate: '2026-01-01',
  categoryId: 'cat_abbonamenti',
  paymentMethodId: 'pm_conto',
  active: true,
  ...over,
});

describe('categorySpikes', () => {
  const history = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => tx({ date: `${m}-10`, amountCents: 20000 }));

  it('says when a complete month is well above the average', () => {
    const [i] = categorySpikes(input([...history, tx({ date: '2026-10-10', amountCents: 26800 })]));
    expect(plain(i?.text)).toBe('A ottobre hai speso il 34% in più in Cibo rispetto alla tua media (268 € contro 200 € al mese).');
    expect(i?.tone).toBe('warning');
  });

  it('and when it is well below', () => {
    const [i] = categorySpikes(input([...history, tx({ date: '2026-10-10', amountCents: 10000 })]));
    expect(plain(i?.text)).toContain('il 50% in meno in Cibo');
    expect(i?.tone).toBe('positive');
  });

  it('ignores small changes and short histories', () => {
    expect(categorySpikes(input([...history, tx({ date: '2026-10-10', amountCents: 22000 })]))).toEqual([]);
    expect(categorySpikes(input([...history.slice(4), tx({ date: '2026-10-10', amountCents: 90000 })]))).toEqual([]);
  });

  it('ignores irregular categories and empty months', () => {
    const quarterly = ['2026-04', '2026-07'].map((m) => tx({ date: `${m}-10`, amountCents: 36000, categoryId: 'cat_trasporti' }));
    const rows = [...history, tx({ date: '2026-10-10', amountCents: 20000 }), ...quarterly, tx({ date: '2026-10-11', amountCents: 36000, categoryId: 'cat_trasporti' })];
    expect(categorySpikes(input(rows))).toEqual([]);
    expect(categorySpikes(input(history))).toEqual([]);
  });

  it('ignores fixed costs', () => {
    const fixed = (m: string, cents: number) => tx({ date: `${m}-15`, title: 'Rata Mutuo', amountCents: cents, categoryId: 'cat_mutuo' });
    const rows = [...history, tx({ date: '2026-10-10', amountCents: 20000 }), fixed('2026-08', 10000), fixed('2026-09', 10000), fixed('2026-10', 73443)];
    expect(categorySpikes(input(rows, { rules: [rule({ title: 'Rata mutuo', categoryId: 'cat_mutuo' })] }))).toEqual([]);
  });

  it('uses the last complete month when the selection is the current one', () => {
    const [i] = categorySpikes(input([...history, tx({ date: '2026-10-10', amountCents: 40000 })], { month: '2026-11' }));
    expect(plain(i?.text)).toMatch(/^A ottobre/);
  });
});

describe('topMerchant', () => {
  it('finds the everyday expense that cost most this year', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => tx({ date: `2026-0${i + 1}-03`, title: 'ShareNow', amountCents: 1490, categoryId: 'cat_trasporti' })),
      tx({ date: '2026-02-04', title: 'sharenow ', amountCents: 1000 }),
      ...Array.from({ length: 6 }, (_, i) => tx({ date: `2026-0${i + 1}-15`, title: 'Rata Mutuo', amountCents: 73443, recurringRuleId: 'r_m' })),
      ...Array.from({ length: 3 }, () => tx({ title: 'Volo', amountCents: 50000 })),
      // Imported history: same description as a rule, no link to it.
      ...Array.from({ length: 6 }, (_, i) => tx({ date: `2026-0${i + 1}-20`, title: 'Vodafone Fibra', amountCents: 3000 })),
      // Repeated but not everyday.
      ...Array.from({ length: 4 }, (_, i) => tx({ date: `2026-0${i + 1}-21`, title: 'Affitto box', amountCents: 20000 })),
    ];
    expect(plain(topMerchant(input(rows, { rules: [rule({ title: 'Vodafone fibra' })] }))[0]?.text)).toBe("ShareNow ti è costato 85 € quest'anno (6 volte, 14,08 € in media).");
    expect(topMerchant(input(rows, { month: '2025-06' }))).toEqual([]);
  });
});

describe('subscriptions', () => {
  it('counts active subscriptions and all fixed costs', () => {
    const rules = [
      rule({}),
      rule({ id: 'v', title: 'Vodafone', amountCents: 3000 }),
      rule({ id: 'x', active: false }),
      rule({ id: 'm', title: 'Mutuo', amountCents: 73443, categoryId: 'cat_mutuo' }),
      rule({ id: 's', title: 'Stipendio', amountCents: 200000, categoryId: 'cat_stipendio' }),
    ];
    const [subs, fixed] = subscriptions(input([], { rules }));
    expect(plain(subs?.text)).toBe('Abbonamenti attivi: 2, per un totale di 911 €/anno.');
    expect(plain(fixed?.text)).toBe('Spese fisse attive: 3, circa 810 € al mese (9.724 €/anno).');
    expect(subscriptions(input([]))).toEqual([]);
  });
});

describe('savingsPace', () => {
  const income = (date: string, cents: number) => tx({ date, kind: 'income', amountCents: cents, categoryId: 'cat_stipendio' });

  it('compares the savings rate with the same months of last year', () => {
    const rows = [income('2026-01-27', 100000), tx({ date: '2026-02-10', amountCents: 69000 }), income('2025-01-27', 100000), tx({ date: '2025-03-10', amountCents: 50000 }), tx({ date: '2025-12-10', amountCents: 50000 })];
    const [i] = savingsPace(input(rows));
    expect(plain(i?.text)).toBe('Da gennaio a ottobre hai risparmiato 310 €, il 31% delle entrate (stesso periodo del 2025: 50%).');
    expect(i?.tone).toBe('warning');
  });

  it('handles a year without comparison and overspending', () => {
    const [i] = savingsPace(input([income('2026-01-27', 100000), tx({ date: '2026-02-10', amountCents: 120000 })], { month: '2026-12' }));
    expect(plain(i?.text)).toBe('Nel 2026 hai speso 200 € più delle entrate.');
    expect(savingsPace(input([tx({})]))).toEqual([]);
  });
});

describe('busiestWeekday', () => {
  it('needs a clear winner over the last 12 weeks', () => {
    // 2026-11-21 is a Saturday.
    const rows: Transaction[] = [];
    for (let w = 0; w < 12; w++) {
      const sat = new Date(Date.UTC(2026, 10, 21 - w * 7)).toISOString().slice(0, 10);
      const mon = new Date(Date.UTC(2026, 10, 16 - w * 7)).toISOString().slice(0, 10);
      rows.push(tx({ date: sat, amountCents: 4000 }), tx({ date: mon, amountCents: 1000 }));
    }
    const [i] = busiestWeekday(input(rows));
    expect(plain(i?.text)).toMatch(/^Il sabato è il giorno in cui spendi di più: in media 40 €, contro 2 €/);
    expect(busiestWeekday(input(rows.slice(0, 10)))).toEqual([]);
  });
});

describe('insights', () => {
  it('is deterministic and never throws on empty data', () => {
    expect(insights(input([]))).toEqual([]);
  });
});
