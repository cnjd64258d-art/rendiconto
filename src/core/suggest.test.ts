import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from './seed';
import {
  buildHistory,
  defaultPaymentMethod,
  lookupTitle,
  orderCategoriesByUse,
  suggestCategory,
  suggestTitles,
} from './suggest';
import { tx } from './test-utils';

const history = buildHistory([
  tx({ title: 'ShareNow', categoryId: 'cat_trasporti', paymentMethodId: 'pm_paypal', amountCents: 1490, date: '2026-01-02' }),
  tx({ title: 'sharenow ', categoryId: 'cat_trasporti', paymentMethodId: 'pm_paypal', amountCents: 890, date: '2026-01-05' }),
  tx({ title: 'ShareNow', categoryId: 'cat_trasporti', paymentMethodId: 'pm_paypal', amountCents: 1490, date: '2026-01-09' }),
  tx({ title: 'Padel', categoryId: 'cat_svago', paymentMethodId: 'pm_conto', amountCents: 1000, date: '2026-01-03' }),
  tx({ title: 'Padel', categoryId: 'cat_svago', paymentMethodId: 'pm_conto', amountCents: 1200, date: '2026-01-10' }),
  tx({ title: 'Mensa Allianz', categoryId: 'cat_cibo', paymentMethodId: 'pm_satispay', amountCents: 650, date: '2026-01-07' }),
  tx({ title: 'Rinnovo Vodafone Fibra', categoryId: 'cat_abbonamenti', paymentMethodId: 'pm_conto', amountCents: 3000, date: '2026-01-12' }),
  tx({ title: 'Pranzo Mensa', categoryId: 'cat_cibo', paymentMethodId: 'pm_satispay', amountCents: 700, date: '2026-01-08' }),
  tx({ title: 'Stipendio', kind: 'income', categoryId: 'cat_stipendio', amountCents: 200000, date: '2026-01-27' }),
  tx({ title: 'Padel bozza', status: 'pending', categoryId: 'cat_viaggi' }),
]);

describe('suggestTitles', () => {
  it('fills category, method and usual amount from history', () => {
    const [s] = suggestTitles(history, 'sha', 'expense');
    expect(s).toMatchObject({ title: 'ShareNow', categoryId: 'cat_trasporti', paymentMethodId: 'pm_paypal', amountCents: 1490, count: 3 });
  });

  it('matches word starts and ranks title prefixes first', () => {
    const titles = suggestTitles(history, 'mensa', 'expense').map((s) => s.title);
    expect(titles).toEqual(['Mensa Allianz', 'Pranzo Mensa']);
  });

  it('suggests Vodafone at 30 € under Abbonamenti', () => {
    const [s] = suggestTitles(history, 'vodaf', 'expense');
    expect(s).toMatchObject({ categoryId: 'cat_abbonamenti', amountCents: 3000 });
  });

  it('uses the most recent amount when frequencies tie', () => {
    expect(lookupTitle(history, 'padel', 'expense')?.amountCents).toBe(1200);
  });

  it('ignores pending rows, other kinds and empty queries', () => {
    expect(suggestTitles(history, 'padel b', 'expense')).toEqual([]);
    expect(suggestTitles(history, 'stip', 'expense')).toEqual([]);
    expect(suggestTitles(history, 'stip', 'income')[0]?.categoryId).toBe('cat_stipendio');
    expect(suggestTitles(history, '  ', 'expense')).toEqual([]);
  });

  it('is deterministic', () => {
    expect(suggestTitles(history, 'p', 'expense')).toEqual(suggestTitles(history, 'p', 'expense'));
  });
});

describe('suggestCategory', () => {
  it('learns from keywords of past titles', () => {
    expect(suggestCategory(history, 'Cena mensa aziendale', 'expense')).toBe('cat_cibo');
    expect(suggestCategory(history, 'Padel con Marco', 'expense')).toBe('cat_svago');
    expect(suggestCategory(history, 'Vodafone', 'expense')).toBe('cat_abbonamenti');
  });
  it('returns null without a signal', () => {
    expect(suggestCategory(history, 'Regalo', 'expense')).toBeNull();
    expect(suggestCategory(history, '12', 'expense')).toBeNull();
  });
});

describe('ordering and defaults', () => {
  it('orders category chips by use, then by configured order', () => {
    const expense = SEED_CATEGORIES.filter((c) => c.groupId !== 'grp_entrate');
    const ids = orderCategoriesByUse(expense, history).map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(['cat_trasporti', 'cat_svago', 'cat_cibo']); // Svago and Cibo tie at 2: configured order decides
    expect(ids[3]).toBe('cat_abbonamenti');
    expect(ids[4]).toBe('cat_mutuo');
  });

  it('picks the usual payment method for a category', () => {
    expect(defaultPaymentMethod(history, 'cat_trasporti', 'pm_conto')).toBe('pm_paypal');
    expect(defaultPaymentMethod(history, 'cat_cibo', 'pm_conto')).toBe('pm_satispay');
    expect(defaultPaymentMethod(history, null, 'pm_contanti')).toBe('pm_conto');
    expect(defaultPaymentMethod(buildHistory([]), null, 'pm_contanti')).toBe('pm_contanti');
  });
});
