import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysLeftInMonth,
  isISODate,
  isYearMonth,
  isoWeekday,
  monthOf,
  startOfWeek,
} from './dates';

describe('dates', () => {
  it('validates ISO dates including leap years', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
    expect(isYearMonth('2026-05')).toBe(true);
    expect(isYearMonth('2026-00')).toBe(false);
  });

  it('defaults accrual month to the payment month', () => {
    expect(monthOf('2025-12-23')).toBe('2025-12');
  });

  it('adds days and months across boundaries', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-01', -13)).toBe('2024-12');
  });

  it('starts weeks on Monday', () => {
    expect(isoWeekday('2026-11-23')).toBe(1); // Monday
    expect(isoWeekday('2026-11-22')).toBe(7); // Sunday
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16');
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23');
  });

  it('counts the days left in the month, today included', () => {
    expect(daysLeftInMonth('2026-11-21')).toBe(10);
    expect(daysLeftInMonth('2026-02-28')).toBe(1);
  });
});
