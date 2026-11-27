import { parseISODate, type ISODate, type YearMonth } from './dates';
import type { Cents } from './money';

const LOCALE = 'it-IT';

const currency = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});
const currencyNoDecimals = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const decimalInput = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

/* ---------- hidden amounts ("nascondi importi", bank style) ---------- */

let amountsHidden = false;
/** What a hidden amount looks like: no digits and no sign, so nothing leaks. */
export const HIDDEN_AMOUNT = '•••••\u00a0€';

/** Display setting, set by the app shell; exports and inputs never go through the masked formatters. */
export function setAmountsHidden(hidden: boolean): void {
  amountsHidden = hidden;
}

export function areAmountsHidden(): boolean {
  return amountsHidden;
}

/** 123456 → "1.234,56 €" (or "••••• €" while amounts are hidden). */
export function formatCents(cents: Cents, opts: { decimals?: boolean; signed?: boolean } = {}): string {
  if (amountsHidden) return HIDDEN_AMOUNT;
  const fmt = opts.decimals === false ? currencyNoDecimals : currency;
  const text = fmt.format(Math.abs(cents) / 100);
  if (cents < 0) return `−${text}`;
  if (opts.signed && cents > 0) return `+${text}`;
  return text;
}

/** 123456 → "1.234,56" (no currency symbol), for inputs and tables. */
export function formatCentsPlain(cents: Cents): string {
  const text = decimalInput.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${text}` : text;
}

/** Screen-reader friendly amount: "1234 euro e 56 centesimi". */
export function spokenCents(cents: Cents): string {
  if (amountsHidden) return 'importo nascosto';
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const c = abs % 100;
  const sign = cents < 0 ? 'meno ' : '';
  const e = `${euros} ${euros === 1 ? 'euro' : 'euro'}`;
  return c === 0 ? `${sign}${e}` : `${sign}${e} e ${c} centesim${c === 1 ? 'o' : 'i'}`;
}

/** 0.342 → "34%" */
export function formatPercent(r: number): string {
  return percent.format(r);
}

function utcDate(date: ISODate): Date {
  const { year, month, day } = parseISODate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

const dayShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOnly = new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' });

/** "2026-01-13" → "mar 13 gen" */
export function formatDayShort(date: ISODate): string {
  const parts = dayShort.formatToParts(utcDate(date));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`.replace(/\./g, '');
}

/** "2026-01-13" → "martedì 13 gennaio" */
export function formatDayLong(date: ISODate): string {
  return dayLong.format(utcDate(date));
}

/** "2026-01-13" → "13 gennaio 2026" */
export function formatFullDate(date: ISODate): string {
  return fullDate.format(utcDate(date));
}

/** "2026-01" → "gennaio 2026" */
export function formatMonth(month: YearMonth, withYear = true): string {
  const d = utcDate(`${month}-01`);
  return (withYear ? monthLong : monthOnly).format(d);
}

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2026-01" → "gen", or "gen 26" with the year (chart axes). */
export function formatMonthShort(month: YearMonth, withYear = false): string {
  const name = MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month;
  return withYear ? `${name} ${month.slice(2, 4)}` : name;
}

/** Compact amount for chart axes: 123456 → "1,2k €", 45000 → "450 €". */
export function formatCentsCompact(cents: number): string {
  if (amountsHidden) return '••\u00a0€';
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}k €`;
  return `${Math.round(euros).toLocaleString(LOCALE)} €`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

const bytesFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** 1536000 → "1,5 MB" */
export function formatBytes(bytes: number): string {
  const units = ['byte', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${bytesFmt.format(value)} ${units[unit]}`;
}
