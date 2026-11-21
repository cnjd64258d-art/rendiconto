/**
 * Dates are plain calendar strings: "YYYY-MM-DD" for days and "YYYY-MM" for
 * accrual months. No time zones are involved, so a date never shifts.
 */
export type ISODate = string;
export type YearMonth = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isISODate(value: string): value is ISODate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isYearMonth(value: string): value is YearMonth {
  const m = MONTH_RE.exec(value);
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar day of `now` (defaults to the device clock). */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid ISO date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Accrual month defaults to the payment month. */
export function monthOf(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

export function yearOf(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4));
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: YearMonth, delta: number): YearMonth {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, '0')}`;
}

/** 1 = Monday … 7 = Sunday (ISO 8601, as used in Italy). */
export function isoWeekday(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

/** Days left in the month, today included. */
export function daysLeftInMonth(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  return daysInMonth(year, month) - day + 1;
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Last day of a `YYYY-MM` month. */
export function endOfMonthDate(month: YearMonth): ISODate {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}
