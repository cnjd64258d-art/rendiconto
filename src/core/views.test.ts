import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from './seed';
import { tx } from './test-utils';
import {
  DEFAULT_VIEW,
  EMPTY_FILTER,
  activeFilterCount,
  boardColumns,
  buildSavedView,
  calendarMonth,
  configToSaved,
  filterTransactions,
  groupTransactions,
  makeCtx,
  normalizeConfig,
  resolvePeriod,
  sameConfig,
  sortTransactions,
  tagsByUse,
  type ViewFilter,
} from './views';

const ctx = makeCtx(SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS);
const TODAY = '2026-11-21';
const f = (over: Partial<ViewFilter>): ViewFilter => ({ ...EMPTY_FILTER, ...over });

function transfer() {
  const t = tx({ id: 'e', title: 'Ricarica PayPal', date: '2026-11-03', amountCents: 5000, kind: 'transfer', paymentMethodId: 'pm_conto', toPaymentMethodId: 'pm_paypal' });
  delete t.categoryId;
  return t;
}

const data = [
  tx({ id: 'a', title: 'ShareNow', date: '2026-11-20', amountCents: 1250, categoryId: 'cat_trasporti', paymentMethodId: 'pm_paypal', tags: ['milano'] }),
  tx({ id: 'b', title: 'Colazione', date: '2026-11-20', amountCents: 280, categoryId: 'cat_cibo', paymentMethodId: 'pm_satispay', createdAt: '2026-11-20T09:00:00Z' }),
  tx({ id: 'c', title: 'Volo Pasqua', date: '2026-12-02', accrualMonth: '2027-04', amountCents: 18900, categoryId: 'cat_viaggi', paymentMethodId: 'pm_conto', notes: 'Ryanair' }),
  tx({ id: 'd', title: 'Stipendio', date: '2026-10-27', amountCents: 205000, kind: 'income', categoryId: 'cat_stipendio', paymentMethodId: 'pm_conto' }),
  transfer(),
  tx({ id: 'f', title: 'Cena con Nicola', date: '2026-11-14', amountCents: 6000, categoryId: 'cat_cibo', paymentMethodId: 'pm_conto', tags: ['milano', 'amici'], split: { totalCents: 6000, myShareCents: 3000, paidBy: 'me', shares: [] } }),
  tx({ id: 'g', title: 'Padel', date: '2025-11-20', amountCents: 1000, categoryId: 'cat_svago', paymentMethodId: 'pm_conto' }),
];
const run = (filter: ViewFilter) => filterTransactions(data, filter, ctx, TODAY).map((t) => t.id).sort();

describe('resolvePeriod', () => {
  it('handles the presets', () => {
    expect(resolvePeriod(f({ period: 'thisMonth' }), TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(resolvePeriod(f({ period: 'lastMonth' }), '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolvePeriod(f({ period: 'last30' }), TODAY)).toEqual({ from: '2026-10-23', to: TODAY });
    expect(resolvePeriod(f({ period: 'lastYear' }), TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolvePeriod(f({ period: 'all' }), TODAY)).toBeNull();
    expect(resolvePeriod(f({ period: 'custom', from: '2026-11-10' }), TODAY)).toEqual({ from: '2026-11-10', to: '9999-12-31' });
    expect(resolvePeriod(f({ period: 'custom' }), TODAY)).toBeNull();
  });
});

describe('filterTransactions', () => {
  it('period uses the accrual month by default and the payment date on request', () => {
    expect(run(f({ period: 'thisMonth' }))).toEqual(['a', 'b', 'e', 'f']);
    // The December flight belongs to April 2027 by accrual, to December by payment.
    expect(run(f({ period: 'custom', from: '2026-12-01', to: '2026-12-31' }))).toEqual([]);
    expect(run(f({ period: 'custom', from: '2026-12-01', to: '2026-12-31', basis: 'payment' }))).toEqual(['c']);
  });
  it('combines conditions: OR inside a condition, AND across them', () => {
    expect(run(f({ categoryIds: ['cat_cibo', 'cat_trasporti'] }))).toEqual(['a', 'b', 'f']);
    expect(run(f({ categoryIds: ['cat_cibo', 'cat_trasporti'], methodIds: ['pm_satispay'] }))).toEqual(['b']);
    expect(run(f({ groupIds: ['grp_svago'] }))).toEqual(['b', 'c', 'f', 'g']);
    expect(run(f({ kinds: ['income', 'transfer'] }))).toEqual(['d', 'e']);
    expect(run(f({ tags: ['amici'] }))).toEqual(['f']);
  });
  it('methods match transfers on either side', () => {
    expect(run(f({ methodIds: ['pm_paypal'] }))).toEqual(['a', 'e']);
  });
  it('amount range uses my share for split expenses', () => {
    expect(run(f({ minCents: 2000, maxCents: 5000 }))).toEqual(['e', 'f']);
    expect(run(f({ minCents: 100000 }))).toEqual(['d']);
  });
  it('searches title, notes, tags, category and method, case and accent insensitive', () => {
    expect(run(f({ text: 'sharenow' }))).toEqual(['a']);
    expect(run(f({ text: 'RYANAIR' }))).toEqual(['c']);
    expect(run(f({ text: 'milano cena' }))).toEqual(['f']);
    expect(run(f({ text: 'satispay' }))).toEqual(['b']);
    expect(run(f({ text: 'viaggi' }))).toEqual(['c']);
  });
  it('an amount in the search matches the exact amount', () => {
    expect(run(f({ text: '12,50' }))).toEqual(['a']);
    expect(run(f({ text: '30' }))).toEqual(['f']);
  });
  it('handles 5,000+ rows quickly', () => {
    const many = Array.from({ length: 6000 }, (_, i) => tx({ title: `Spesa ${i % 97}`, date: `2026-${String((i % 12) + 1).padStart(2, '0')}-10` }));
    const start = performance.now();
    const cache = new Map<string, string>();
    filterTransactions(many, f({ text: 'spesa 4' }), ctx, TODAY, cache);
    const second = performance.now();
    const out = filterTransactions(many, f({ text: 'spesa 42', period: 'thisYear' }), ctx, TODAY, cache);
    expect(out.length).toBeGreaterThan(0);
    expect(performance.now() - second).toBeLessThan(100);
    expect(second - start).toBeLessThan(500);
  });
});

describe('activeFilterCount', () => {
  it('counts conditions, not the search text', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount(f({ period: 'thisYear', categoryIds: ['x'], minCents: 1, maxCents: 2, text: 'ciao' }))).toBe(3);
  });
});

describe('sortTransactions', () => {
  it('sorts by amount and title, with newest-first ties', () => {
    expect(sortTransactions(data, { field: 'amount', direction: 'desc' }, ctx).map((t) => t.id)).toEqual(['d', 'c', 'e', 'f', 'a', 'g', 'b']);
    expect(sortTransactions(data, { field: 'title', direction: 'asc' }, ctx).map((t) => t.title)[0]).toBe('Cena con Nicola');
    expect(sortTransactions(data, { field: 'date', direction: 'desc' }, ctx).map((t) => t.id).slice(0, 3)).toEqual(['c', 'b', 'a']);
  });
  it('sorts by category order (groups first, then position)', () => {
    const ids = sortTransactions(data, { field: 'category', direction: 'asc' }, ctx).map((t) => t.categoryId ?? '-');
    expect(ids).toEqual(['cat_trasporti', 'cat_svago', 'cat_viaggi', 'cat_cibo', 'cat_cibo', 'cat_stipendio', '-']);
  });
});

describe('groupTransactions', () => {
  const sorted = sortTransactions(data, DEFAULT_VIEW.sort, ctx);
  it('by day keeps the sort order and labels today/yesterday', () => {
    const g = groupTransactions(sorted, 'day', ctx, TODAY);
    expect(g.map((x) => x.label).slice(0, 2)).toEqual(['mer 2 dic', 'Ieri']);
    expect(g[1]?.spentCents).toBe(1530);
  });
  it('by category follows the category order; totals count my share and ignore transfers', () => {
    const g = groupTransactions(sorted, 'category', ctx, TODAY);
    expect(g.map((x) => x.key)).toEqual(['cat_trasporti', 'cat_svago', 'cat_viaggi', 'cat_cibo', 'cat_stipendio', '~none']);
    expect(g.find((x) => x.key === 'cat_cibo')?.spentCents).toBe(3280);
    expect(g.find((x) => x.key === 'cat_stipendio')?.incomeCents).toBe(205000);
    expect(g.at(-1)?.label).toBe('Trasferimenti');
  });
  it('by tag puts a row in each of its tags', () => {
    const g = groupTransactions(sorted, 'tag', ctx, TODAY);
    expect(g.map((x) => [x.key, x.count])).toEqual([
      ['#amici', 1],
      ['#milano', 2],
      ['~none', 5],
    ]);
  });
  it('by month uses the accrual month', () => {
    expect(groupTransactions(sorted, 'month', ctx, TODAY)[0]?.key).toBe('2027-04');
  });
});

describe('boardColumns', () => {
  it('shows every active method, including empty ones, in their order', () => {
    const cols = boardColumns(data.filter((t) => t.paymentMethodId !== 'pm_contanti'), 'method', ctx, TODAY, true);
    expect(cols.map((c) => [c.key, c.count])).toEqual([
      ['pm_conto', 5],
      ['pm_paypal', 1],
      ['pm_satispay', 1],
      ['pm_contanti', 0],
    ]);
  });
});

describe('calendarMonth', () => {
  it('builds Monday-first weeks with spending levels', () => {
    const weeks = calendarMonth(data, '2026-11');
    expect(weeks[0]?.[0]?.date).toBe('2026-10-26');
    expect(weeks.at(-1)?.at(-1)?.date).toBe('2026-12-06');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const day = (d: string) => weeks.flat().find((x) => x.date === d);
    expect(day('2026-11-20')).toMatchObject({ spentCents: 1530, count: 2, inMonth: true });
    expect(day('2026-11-03')).toMatchObject({ spentCents: 0, count: 1, level: 0 });
    expect(day('2026-11-14')?.level).toBe(4);
    expect(day('2026-11-20')?.level).toBe(3);
    expect(day('2026-10-27')).toMatchObject({ inMonth: false, spentCents: 0 });
  });
  it('a month starting on Monday has no leading days', () => {
    expect(calendarMonth([], '2026-06')[0]?.[0]?.date).toBe('2026-06-01');
  });
});

describe('saved views', () => {
  const config = { ...DEFAULT_VIEW, layout: 'table' as const, filter: f({ categoryIds: ['cat_trasporti'], text: 'sharenow' }) };
  it('round-trips a config', () => {
    const r = buildSavedView(' 🚗 Car  sharing ', '🚗', config, [], undefined, () => 'v1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ id: 'v1', name: '🚗 Car sharing', emoji: '🚗', order: 0 });
    expect(sameConfig(normalizeConfig(r.value), config)).toBe(true);
  });
  it('rejects empty and duplicate names', () => {
    const existing = { id: 'v1', name: 'Car sharing', emoji: '🚗', order: 0, ...configToSaved(config) };
    expect(buildSavedView('  ', '', config, [existing]).ok).toBe(false);
    expect(buildSavedView('car SHARING', '', config, [existing])).toEqual({ ok: false, error: 'Esiste già la vista «Car sharing»' });
    const renamed = buildSavedView('Car sharing', '🚕', config, [existing], existing);
    expect(renamed.ok && renamed.value).toMatchObject({ id: 'v1', emoji: '🚕' });
  });
  it('normalizes partial or broken stored views', () => {
    const c = normalizeConfig({ layout: 'board', filter: { period: 'nope', kinds: 'x' }, sort: [], columns: ['bogus'] });
    expect(c.layout).toBe('board');
    expect(c.filter).toEqual(EMPTY_FILTER);
    expect(c.sort).toEqual(DEFAULT_VIEW.sort);
    expect(c.columns).toEqual(DEFAULT_VIEW.columns);
  });
});

describe('tagsByUse', () => {
  it('orders tags by frequency', () => {
    expect(tagsByUse(data)).toEqual(['milano', 'amici']);
  });
});
