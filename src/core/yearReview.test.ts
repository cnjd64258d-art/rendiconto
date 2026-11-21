import { describe, expect, it } from 'vitest';
import { tx } from './test-utils';
import type { Category, CategoryGroup } from './types';
import { reviewCsv, suggestedReviewYear, yearReview } from './yearReview';

const cat = (id: string, name: string, groupId: string): Category => ({ id, name, emoji: '•', color: 'gray', groupId, order: 0, archived: false });
const categories = [cat('cat_cibo', 'Cibo', 'grp_svago'), cat('cat_alimentari', 'Alimentari', 'grp_spesa'), cat('cat_stipendio', 'Stipendio', 'grp_entrate')];
const groups: CategoryGroup[] = [
  { id: 'grp_svago', name: 'Svago', kind: 'expense', order: 0 },
  { id: 'grp_spesa', name: 'Spesa', kind: 'expense', order: 1 },
  { id: 'grp_entrate', name: 'Entrate', kind: 'income', order: 2 },
];
const income = (date: string, cents: number) => tx({ date, kind: 'income', amountCents: cents, categoryId: 'cat_stipendio' });

const rows = [
  income('2025-12-31', 3000000),
  ...Array.from({ length: 12 }, (_, i) => tx({ date: `2025-${String(i + 1).padStart(2, '0')}-10`, amountCents: 100000 + i * 1000, title: `Spesa ${i}` })),
  tx({ date: '2025-06-11', amountCents: 50000, categoryId: 'cat_alimentari' }),
  tx({ date: '2024-12-20', accrualMonth: '2025-01', amountCents: 7000, title: 'Volo' }),
  income('2024-12-31', 2800000),
  tx({ date: '2024-05-01', amountCents: 1765500 }),
  tx({ date: '2026-01-10', amountCents: 20000 }),
  tx({ date: '2026-02-10', amountCents: 10000 }),
  tx({ date: '2026-03-01', amountCents: 40000 }),
];

describe('yearReview', () => {
  it('reproduces the yearly statement for a closed year', () => {
    const r = yearReview({ transactions: rows, categories, year: 2025, basis: 'accrual', today: '2026-11-21' });
    const expense = 1200000 + 66000 + 50000 + 7000;
    expect(r.totals).toMatchObject({ incomeCents: 3000000, expenseCents: expense, savingsCents: 3000000 - expense });
    expect(r.inProgress).toBe(false);
    expect(r.income[0]?.categories[0]).toMatchObject({ categoryId: 'cat_stipendio', cents: 3000000 });
    expect(r.expenses.map((g) => g.groupId)).toEqual(['grp_svago', 'grp_spesa']);
    expect(r.previous).toEqual([{ year: 2024, totals: { incomeCents: 2800000, expenseCents: 1765500, savingsCents: 1034500, savingsRate: 1034500 / 2800000 } }]);
    expect(r.top).toHaveLength(10);
    expect(r.top[0]?.title).toBe('Spesa 11');
    expect(r.priciest).toEqual({ month: '2025-06', cents: 155000 });
    expect(r.cheapest).toEqual({ month: '2025-02', cents: 101000 });
    expect(r.days).toBe(365);
    expect(r.dailyAverageCents).toBe(Math.round(expense / 365));
  });

  it('switches to payment dates', () => {
    const r = yearReview({ transactions: rows, categories, year: 2025, basis: 'payment', today: '2026-11-21' });
    expect(r.totals.expenseCents).toBe(1200000 + 66000 + 50000);
  });

  it('a year in progress averages over the days so far and skips the current month as cheapest', () => {
    const r = yearReview({ transactions: rows, categories, year: 2026, basis: 'accrual', today: '2026-03-15' });
    expect(r.inProgress).toBe(true);
    expect(r.days).toBe(31 + 28 + 15);
    expect(r.priciest).toEqual({ month: '2026-03', cents: 40000 });
    expect(r.cheapest).toEqual({ month: '2026-02', cents: 10000 });
    expect(r.months).toHaveLength(12);
  });

  it('exports a CSV with totals, items and top expenses', () => {
    const r = yearReview({ transactions: rows, categories, year: 2025, basis: 'accrual', today: '2026-11-21' });
    const csv = reviewCsv(r, categories, groups);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('sezione,voce,importo,percentuale');
    expect(lines).toContain('Totali,Entrate,30000.00,');
    expect(lines).toContain('Entrate,Stipendio,30000.00,100.0%');
    expect(lines.some((l) => l.startsWith('Uscite per macro-voce,Svago,'))).toBe(true);
    expect(lines).toContain('Top spese,1. 2025-12-10 Spesa 11,1110.00,');
  });
});

describe('suggestedReviewYear', () => {
  it('is the closing year in December and January only', () => {
    expect(suggestedReviewYear('2026-12-01')).toBe(2026);
    expect(suggestedReviewYear('2027-01-31')).toBe(2026);
    expect(suggestedReviewYear('2026-11-21')).toBeNull();
  });
});
