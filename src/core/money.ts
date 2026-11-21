/**
 * Money is always an integer number of euro cents. Floats never touch amounts:
 * parsing works on the string digits directly.
 */
export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export type DecimalSeparator = ',' | '.' | 'auto';

/**
 * Parses a user or CSV amount into cents.
 * - "12,4" / "12.40" / "1.234,56" / "1,234.56" / "271.5" / "€ 3" / "-5"
 * - `decimal: 'auto'` treats the last "," or "." as decimal separator when it is
 *   followed by 1–2 digits, otherwise as a thousands separator.
 * Returns null for anything that is not a clean amount (never guesses).
 */
export function parseAmount(input: string, decimal: DecimalSeparator = 'auto'): Cents | null {
  let s = input.normalize('NFKC').replace(/[\s\u00A0\u202F€]/g, '');
  if (s === '') return null;

  let sign = 1;
  if (s.startsWith('-') || s.startsWith('−')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  let intPart: string;
  let fracPart = '';

  const explicit = decimal === 'auto' ? null : s.includes(decimal) ? decimal : null;
  const sep = decimal === 'auto' ? detectDecimalSeparator(s) : explicit;
  if (sep === null) {
    intPart = s;
  } else {
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
    if (fracPart.includes(',') || fracPart.includes('.')) return null;
  }

  if (sep !== null && intPart.includes(sep)) return null;
  if (/[.,]/.test(intPart)) {
    // Thousands groups must be well-formed and use one separator: 1.234.567
    const forced = decimal === 'auto' ? sep : decimal;
    const thousands = forced === ',' ? '.' : forced === '.' ? ',' : intPart.includes('.') ? '.' : ',';
    const group = thousands === '.' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!group.test(intPart)) return null;
    intPart = intPart.split(thousands).join('');
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || fracPart.length > 2 || !/^\d*$/.test(fracPart)) return null;

  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return sign * cents;
}

function detectDecimalSeparator(s: string): ',' | '.' | null {
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const last = Math.max(lastComma, lastDot);
  if (last === -1) return null;
  const candidate = lastComma > lastDot ? ',' : '.';
  const digitsAfter = s.length - last - 1;
  const bothPresent = lastComma !== -1 && lastDot !== -1;
  if (bothPresent) return candidate;
  // Repeated separators, or a single one followed by exactly 3 digits, are
  // thousands separators ("1.234" is 1234 €). CSV imports pass an explicit separator.
  const occurrences = s.split(candidate).length - 1;
  if (occurrences > 1) return null;
  if (digitsAfter === 3) return null;
  return candidate;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Splits a total into `parts` integer shares; the remainder goes to the first shares. */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(remainder) ? Math.sign(remainder) : 0));
}

/** Integer percentage helper: share of `part` over `whole`, as a ratio (0..n). */
export function ratio(part: Cents, whole: Cents): number {
  return whole === 0 ? 0 : part / whole;
}

/**
 * Cleans what the user types in an amount field: digits and one decimal comma
 * with at most two decimals (the it-IT iOS keypad shows ","; "." is accepted too).
 */
export function sanitizeAmountTyping(raw: string): string {
  let s = raw.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const first = s.indexOf(',');
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/,/g, '').slice(0, 2);
  }
  return s.replace(/^0+(?=\d)/, '');
}
