import { describe, expect, it } from 'vitest';
import { parseAmount, sanitizeAmountTyping, splitEvenly, sumCents } from './money';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12,4', 1240],
    ['12,40', 1240],
    ['12.4', 1240],
    ['271.5', 27150],
    ['0,99', 99],
    [',5', 50],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['1.234.567,8', 123456780],
    ['€ 734,43', 73443],
    ['734,43 €', 73443],
    ['  30  ', 3000],
    ['-5,10', -510],
    ['−5,10', -510],
    ['+3', 300],
    ['1\u00A0234,00', 123400],
  ])('parses %j as %i cents', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it.each(['', 'abc', '12,345,6', '1,2,3', '12.345,678', '1.23.4', '--3', '12a', '.', ','])(
    'rejects %j',
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );

  it('uses an explicit decimal separator when given (CSV)', () => {
    expect(parseAmount('197.0', '.')).toBe(19700);
    expect(parseAmount('1234.5', '.')).toBe(123450);
    expect(parseAmount('1.234', '.')).toBeNull(); // 3 decimals: refuse, never guess
    expect(parseAmount('1,234', '.')).toBe(123400);
  });

  it('never suffers from float rounding', () => {
    expect((parseAmount('0.1') ?? NaN) + (parseAmount('0.2') ?? NaN)).toBe(30);
    expect(parseAmount('19593.59')).toBe(1959359);
    expect(parseAmount('1.005', '.')).toBeNull();
  });
});

describe('splitEvenly', () => {
  it('keeps the total exact', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(sumCents(splitEvenly(73443, 7))).toBe(73443);
  });
  it('rejects invalid parts', () => {
    expect(() => splitEvenly(100, 0)).toThrow();
  });
});

describe('sanitizeAmountTyping', () => {
  it.each([
    ['12', '12'],
    ['12.4', '12,4'],
    ['12,456', '12,45'],
    ['1,2,3', '1,23'],
    ['007', '7'],
    ['0,5', '0,5'],
    ['€ 3a', '3'],
    [',', ','],
  ])('%j → %j', (raw, clean) => {
    expect(sanitizeAmountTyping(raw)).toBe(clean);
  });
});
