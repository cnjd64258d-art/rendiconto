import { describe, expect, it } from 'vitest';
import { tx } from './test-utils';
import {
  balanceEffect,
  cleanTitle,
  compareTransactionsDesc,
  dedupeKey,
  draftFromTransaction,
  effectiveCents,
  groupByDay,
  normalizeText,
  parseTags,
  summarize,
  validateDraft,
  type TransactionDraft,
} from './transactions';

const draft = (o: Partial<TransactionDraft> = {}): TransactionDraft => ({
  kind: 'expense',
  amount: '12,40',
  title: '  Pranzo   Mensa ',
  categoryId: 'cat_cibo',
  paymentMethodId: 'pm_satispay',
  toPaymentMethodId: null,
  date: '2026-11-21',
  accrualMonth: '',
  notes: '',
  tags: '',
  ...o,
});

describe('normalisation', () => {
  it('fixes the typos that broke the Numbers totals', () => {
    expect(normalizeText('Alimentari ')).toBe(normalizeText('alimentari'));
    expect(normalizeText('  ALIMENTARI')).toBe('alimentari');
    expect(normalizeText('McDonald’s')).toBe("mcdonald's");
    expect(cleanTitle('  Pranzo   Mensa ')).toBe('Pranzo Mensa');
  });

  it('parses tags into a clean unique list', () => {
    expect(parseTags('Lavoro, milano ,#lavoro;; Viaggio ')).toEqual(['lavoro', 'milano', 'viaggio']);
    expect(parseTags('')).toEqual([]);
  });

  it('builds the same dedupe key for the same purchase written differently', () => {
    expect(dedupeKey('2026-01-02', 1240, 'Pranzo Mensa')).toBe(dedupeKey('2026-01-02', 1240, ' pranzo  mensa'));
    expect(dedupeKey('2026-01-02', 1240, 'Pranzo')).not.toBe(dedupeKey('2026-01-03', 1240, 'Pranzo'));
  });
});

describe('amounts', () => {
  it('counts only my share of a shared expense', () => {
    const t = tx({ amountCents: 6000, split: { totalCents: 6000, myShareCents: 2000, paidBy: 'me', shares: [] } });
    expect(effectiveCents(t)).toBe(2000);
    expect(balanceEffect(t)).toBe(-2000);
  });
  it('treats transfers as neutral', () => {
    expect(balanceEffect(tx({ kind: 'transfer', amountCents: 5000 }))).toBe(0);
    expect(balanceEffect(tx({ kind: 'income', amountCents: 5000 }))).toBe(5000);
  });
});

describe('groupByDay', () => {
  it('groups sorted transactions and sums each day, skipping pending ones', () => {
    const list = [
      tx({ date: '2026-01-02', amountCents: 240 }),
      tx({ date: '2026-01-02', amountCents: 1000 }),
      tx({ date: '2026-01-02', amountCents: 9999, status: 'pending' }),
      tx({ date: '2026-01-01', amountCents: 150000, kind: 'income' }),
      tx({ date: '2026-01-01', amountCents: 500, kind: 'transfer' }),
    ];
    const groups = groupByDay(list);
    expect(groups.map((g) => g.date)).toEqual(['2026-01-02', '2026-01-01']);
    expect(groups[0]?.spentCents).toBe(1240);
    expect(groups[0]?.items).toHaveLength(3);
    expect(groups[1]?.incomeCents).toBe(150000);
    expect(groups[1]?.spentCents).toBe(0);
  });

  it('sorts newest first, then by creation time', () => {
    const a = tx({ date: '2026-01-02', createdAt: '2026-01-02T08:00:00Z' });
    const b = tx({ date: '2026-01-02', createdAt: '2026-01-02T09:00:00Z' });
    const c = tx({ date: '2026-01-03', createdAt: '2026-01-01T00:00:00Z' });
    expect([a, b, c].sort(compareTransactionsDesc).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });

  it('summarises a selection like the Notion footer', () => {
    const s = summarize([tx({ amountCents: 1000 }), tx({ amountCents: 300000, kind: 'income' }), tx({ amountCents: 50, status: 'pending' })]);
    expect(s).toEqual({ count: 3, spentCents: 1000, incomeCents: 300000, balanceCents: 299000 });
  });
});

describe('validateDraft', () => {
  it('produces a clean transaction', () => {
    const r = validateDraft(draft({ tags: 'Lavoro', notes: ' ok ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      title: 'Pranzo Mensa',
      amountCents: 1240,
      accrualMonth: '2026-11',
      categoryId: 'cat_cibo',
      notes: 'ok',
      tags: ['lavoro'],
      status: 'confirmed',
    });
  });

  it('keeps an explicit accrual month (Easter flight paid in December)', () => {
    const r = validateDraft(draft({ date: '2025-12-10', accrualMonth: '2026-04' }));
    expect(r.ok && r.value.accrualMonth).toBe('2026-04');
  });

  it('reports every missing field', () => {
    const r = validateDraft(draft({ amount: '', title: ' ', categoryId: null, date: '2026-02-30' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['accrualMonth', 'amount', 'categoryId', 'date', 'title']);
  });

  it('validates transfers without a category', () => {
    const ok = validateDraft(draft({ kind: 'transfer', categoryId: null, toPaymentMethodId: 'pm_paypal', paymentMethodId: 'pm_conto' }));
    expect(ok.ok && ok.value.categoryId).toBeUndefined();
    const same = validateDraft(draft({ kind: 'transfer', toPaymentMethodId: 'pm_conto', paymentMethodId: 'pm_conto' }));
    expect(same.ok).toBe(false);
  });

  it('round-trips through draftFromTransaction', () => {
    const t = tx({ amountCents: 73443, date: '2025-12-15', accrualMonth: '2026-01', tags: ['casa'] });
    const d = draftFromTransaction(t);
    expect(d.amount).toBe('734,43');
    expect(d.accrualMonth).toBe('2026-01');
    const r = validateDraft(d);
    expect(r.ok && r.value.amountCents).toBe(73443);
  });
});
