import { describe, expect, it } from 'vitest';
import { generateDemoTransactions } from './demo';
import { isISODate } from './dates';

describe('demo data', () => {
  const data = generateDemoTransactions('2026-11-21');
  it('is deterministic and realistic', () => {
    expect(generateDemoTransactions('2026-11-21')).toEqual(data);
    expect(data.length).toBeGreaterThan(200);
    expect(data.every((t) => Number.isSafeInteger(t.amountCents) && t.amountCents > 0 && isISODate(t.date))).toBe(true);
    expect(new Set(data.map((t) => t.id)).size).toBe(data.length);
  });
  it('contains fixed expenses and income', () => {
    expect(data.filter((t) => t.title === 'Rata Mutuo').every((t) => t.amountCents === 73443 && t.date.endsWith('-15'))).toBe(true);
    expect(data.some((t) => t.kind === 'income')).toBe(true);
  });
});
