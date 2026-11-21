import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCents,
  formatCentsPlain,
  formatDayShort,
  formatMonth,
  formatPercent,
  spokenCents,
} from './format';

// Intl uses narrow no-break spaces in some locales; normalise for readability.
const n = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

describe('format it-IT', () => {
  it('formats euro amounts', () => {
    expect(n(formatCents(123456))).toBe('1.234,56 €');
    expect(n(formatCents(73443))).toBe('734,43 €');
    expect(n(formatCents(5))).toBe('0,05 €');
    expect(n(formatCents(-1290))).toBe('−12,90 €');
    expect(n(formatCents(84200, { signed: true }))).toBe('+842,00 €');
    expect(n(formatCents(1034500, { decimals: false }))).toBe('10.345 €');
    expect(n(formatCentsPlain(123456))).toBe('1.234,56');
  });

  it('formats days like "mar 13 gen"', () => {
    expect(formatDayShort('2026-01-13')).toBe('mar 13 gen');
    expect(formatDayShort('2026-11-21')).toBe('sab 21 nov');
  });

  it('formats months and percentages', () => {
    expect(formatMonth('2026-05')).toBe('maggio 2026');
    expect(formatMonth('2026-05', false)).toBe('maggio');
    expect(n(formatPercent(0.342))).toBe('34%');
  });

  it('spells amounts for screen readers', () => {
    expect(spokenCents(123456)).toBe('1234 euro e 56 centesimi');
    expect(spokenCents(3000)).toBe('30 euro');
  });
});

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(512)).toBe('512 byte');
    expect(formatBytes(1_536_000)).toBe('1,5 MB');
    expect(formatBytes(2_000_000_000)).toBe('2 GB');
  });
});
