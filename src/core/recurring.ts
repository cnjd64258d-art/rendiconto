import { addDays, addMonths, daysInMonth, isISODate, monthOf, parseISODate, type ISODate } from './dates';
import { parseAmount, type Cents } from './money';
import { cleanTitle, dedupeKey, type TransactionInput } from './transactions';
import type { Frequency, Id, RecurringRule, TransactionKind } from './types';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Ogni mese',
  quarterly: 'Ogni 3 mesi',
  yearly: 'Ogni anno',
};

const STEP: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Upper bound on occurrences produced in one call (protects against absurd ranges). */
const MAX_OCCURRENCES = 400;

/** The rule's date in a given month: `dayOfMonth`, clamped to the month's length (31 → 30 Nov, 28/29 Feb). */
function dateInMonth(month: string, dayOfMonth: number): ISODate {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const day = Math.min(Math.max(1, dayOfMonth), daysInMonth(y, m));
  return `${month}-${String(day).padStart(2, '0')}`;
}

function monthsBetween(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

/**
 * Occurrence dates of a rule in [from, to], both inclusive, ascending.
 * Monthly rules fall every month, quarterly ones every 3 months and yearly ones every 12, counting from the
 * start date's month. Dates before `startDate` or after `endDate` are excluded. `active` is not considered.
 */
export function occurrencesBetween(
  rule: Pick<RecurringRule, 'frequency' | 'dayOfMonth' | 'startDate' | 'endDate'>,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const lo = from > rule.startDate ? from : rule.startDate;
  const hi = rule.endDate !== undefined && rule.endDate < to ? rule.endDate : to;
  if (lo > hi) return [];
  const step = STEP[rule.frequency];
  const startMonth = monthOf(rule.startDate);
  const offset = monthsBetween(startMonth, monthOf(lo));
  let k = Math.max(0, Math.floor(offset / step));
  const out: ISODate[] = [];
  for (;;) {
    const date = dateInMonth(addMonths(startMonth, k * step), rule.dayOfMonth);
    k += 1;
    if (date > hi || out.length >= MAX_OCCURRENCES) break;
    if (date >= lo) out.push(date);
  }
  return out;
}

/** First occurrence on or after `date`, or null if the rule has ended. */
export function nextOccurrence(rule: Pick<RecurringRule, 'frequency' | 'dayOfMonth' | 'startDate' | 'endDate'>, date: ISODate): ISODate | null {
  // Within 12 months there is always an occurrence unless the rule has ended.
  return occurrencesBetween(rule, date, addDays(date, 400))[0] ?? null;
}

/** Dates that must become pending transactions now: after `generatedThrough` (or from the start) up to today. */
export function dueDates(rule: RecurringRule, today: ISODate): ISODate[] {
  if (!rule.active) return [];
  const from = rule.generatedThrough !== undefined ? addDays(rule.generatedThrough, 1) : rule.startDate;
  return occurrencesBetween(rule, from, today);
}

/** Kind of the transactions a rule produces, from its category's group. */
export type KindOf = (categoryId: Id) => TransactionKind;

/** The pending transaction for one occurrence. Its accrual month is the occurrence's month. */
export function pendingTransaction(rule: RecurringRule, date: ISODate, kind: TransactionKind): TransactionInput {
  return {
    title: rule.title,
    amountCents: rule.amountCents,
    kind,
    date,
    accrualMonth: monthOf(date),
    categoryId: rule.categoryId,
    paymentMethodId: rule.paymentMethodId,
    status: 'pending',
    notes: '',
    tags: [],
    recurringRuleId: rule.id,
    dedupeKey: dedupeKey(date, rule.amountCents, rule.title),
  };
}

export interface GenerationResult {
  transactions: TransactionInput[];
  /** New `generatedThrough` per rule that advanced. */
  advanced: Record<Id, ISODate>;
}

/** Everything that matured up to `today`, for all active rules. Pure: the caller writes it. */
export function generateDue(rules: readonly RecurringRule[], today: ISODate, kindOf: KindOf): GenerationResult {
  const transactions: TransactionInput[] = [];
  const advanced: Record<Id, ISODate> = {};
  for (const rule of rules) {
    if (!rule.active) continue;
    const dates = dueDates(rule, today);
    for (const d of dates) transactions.push(pendingTransaction(rule, d, kindOf(rule.categoryId)));
    if (rule.generatedThrough === undefined || rule.generatedThrough < today) advanced[rule.id] = today;
  }
  return { transactions, advanced };
}

export interface Upcoming {
  rule: RecurringRule;
  date: ISODate;
  kind: TransactionKind;
}

/** Occurrences of active rules in (today, today + days], soonest first. */
export function upcoming(rules: readonly RecurringRule[], today: ISODate, days: number, kindOf: KindOf): Upcoming[] {
  const out: Upcoming[] = [];
  const to = addDays(today, days);
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule, addDays(today, 1), to)) out.push({ rule, date, kind: kindOf(rule.categoryId) });
  }
  return out.sort((a, b) => (a.date === b.date ? a.rule.title.localeCompare(b.rule.title, 'it') : a.date < b.date ? -1 : 1));
}

/** Yearly cost of a rule at its current amount. */
export function yearlyCents(rule: Pick<RecurringRule, 'amountCents' | 'frequency'>): Cents {
  return rule.amountCents * (12 / STEP[rule.frequency]);
}

// ---------------------------------------------------------------------------------------------------------------
// Editing

export interface RuleDraft {
  title: string;
  amount: string;
  isEstimate: boolean;
  frequency: Frequency;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  categoryId: Id | null;
  paymentMethodId: Id | null;
  active: boolean;
}

export type RuleField = 'title' | 'amount' | 'dayOfMonth' | 'startDate' | 'endDate' | 'categoryId' | 'paymentMethodId';
export type RuleInput = Omit<RecurringRule, 'id'>;
export type RuleResult = { ok: true; value: RuleInput } | { ok: false; errors: Partial<Record<RuleField, string>> };

export function emptyRuleDraft(today: ISODate): RuleDraft {
  return {
    title: '',
    amount: '',
    isEstimate: false,
    frequency: 'monthly',
    dayOfMonth: String(parseISODate(today).day),
    startDate: today,
    endDate: '',
    categoryId: null,
    paymentMethodId: null,
    active: true,
  };
}

export function draftFromRule(rule: RecurringRule): RuleDraft {
  return {
    title: rule.title,
    amount: (rule.amountCents / 100).toFixed(2).replace('.', ','),
    isEstimate: rule.isEstimate,
    frequency: rule.frequency,
    dayOfMonth: String(rule.dayOfMonth),
    startDate: rule.startDate,
    endDate: rule.endDate ?? '',
    categoryId: rule.categoryId,
    paymentMethodId: rule.paymentMethodId,
    active: rule.active,
  };
}

/**
 * Validates a draft. `today` decides where generation starts for a new rule (or one whose schedule changed):
 * nothing before today is generated, so a rule created mid-month does not back-fill past payments.
 */
export function validateRuleDraft(draft: RuleDraft, today: ISODate, previous?: RecurringRule): RuleResult {
  const errors: Partial<Record<RuleField, string>> = {};
  const title = cleanTitle(draft.title);
  if (!title) errors.title = 'Aggiungi un nome';
  const amountCents = parseAmount(draft.amount, ',');
  if (amountCents === null || amountCents <= 0) errors.amount = 'Inserisci un importo maggiore di zero';
  const day = Number(draft.dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 31) errors.dayOfMonth = 'Il giorno va da 1 a 31';
  if (!isISODate(draft.startDate)) errors.startDate = 'Data di inizio non valida';
  const endDate = draft.endDate.trim();
  if (endDate && !isISODate(endDate)) errors.endDate = 'Data di fine non valida';
  else if (endDate && isISODate(draft.startDate) && endDate < draft.startDate) errors.endDate = 'La fine è prima dell’inizio';
  if (!draft.categoryId) errors.categoryId = 'Scegli una categoria';
  if (!draft.paymentMethodId) errors.paymentMethodId = 'Scegli un metodo';
  if (Object.keys(errors).length > 0 || amountCents === null || !draft.categoryId || !draft.paymentMethodId) {
    return { ok: false, errors };
  }

  const value: RuleInput = {
    title,
    amountCents,
    isEstimate: draft.isEstimate,
    frequency: draft.frequency,
    dayOfMonth: day,
    startDate: draft.startDate,
    categoryId: draft.categoryId,
    paymentMethodId: draft.paymentMethodId,
    active: draft.active,
  };
  if (endDate) value.endDate = endDate;

  const scheduleChanged =
    previous === undefined ||
    previous.frequency !== value.frequency ||
    previous.dayOfMonth !== value.dayOfMonth ||
    previous.startDate !== value.startDate;
  const resumed = previous !== undefined && !previous.active && value.active;
  const yesterday = addDays(today, -1);
  if (scheduleChanged || resumed) {
    // Never back-fill: generation starts today, or at the start date if that is later.
    const floor = previous?.generatedThrough !== undefined && previous.generatedThrough > yesterday ? previous.generatedThrough : yesterday;
    if (value.startDate <= floor) value.generatedThrough = floor;
  } else if (previous.generatedThrough !== undefined) {
    value.generatedThrough = previous.generatedThrough;
  }
  return { ok: true, value };
}

/** Kind of transactions for each category, from its group (unknown → expense). */
export function kindResolver(
  categories: readonly { id: Id; groupId: Id }[],
  groups: readonly { id: Id; kind: 'expense' | 'income' }[],
): KindOf {
  const groupKind = new Map(groups.map((g) => [g.id, g.kind]));
  const kinds = new Map(categories.map((c) => [c.id, groupKind.get(c.groupId) ?? 'expense']));
  return (categoryId) => kinds.get(categoryId) ?? 'expense';
}

/** Demo rules matching the fixed costs in the demo data. Ids start with `demo_`. */
export function demoRecurringRules(today: ISODate): RecurringRule[] {
  const bolloDate = addDays(today, -2);
  const base = { isEstimate: false, frequency: 'monthly' as Frequency, startDate: '2025-01-01', active: true, generatedThrough: today, paymentMethodId: 'pm_conto' };
  return [
    { ...base, id: 'demo_rule_mutuo', title: 'Rata Mutuo', amountCents: 73443, dayOfMonth: 15, categoryId: 'cat_mutuo' },
    { ...base, id: 'demo_rule_vodafone', title: 'Rinnovo Vodafone Fibra', amountCents: 3000, dayOfMonth: 18, categoryId: 'cat_abbonamenti' },
    { ...base, id: 'demo_rule_gympass', title: 'Gympass', amountCents: 4590, dayOfMonth: 3, categoryId: 'cat_abbonamenti' },
    { ...base, id: 'demo_rule_unipol', title: 'UnipolMove', amountCents: 2000, isEstimate: true, dayOfMonth: 5, categoryId: 'cat_trasporti' },
    // Due two days ago and not generated yet: shows up as "da confermare" right after loading the demo.
    {
      ...base,
      id: 'demo_rule_bollo',
      title: 'Bollo conto',
      amountCents: 850,
      frequency: 'quarterly',
      dayOfMonth: parseISODate(bolloDate).day,
      startDate: `${addMonths(monthOf(bolloDate), -3)}-01`,
      generatedThrough: addDays(bolloDate, -1),
      categoryId: 'cat_utenze',
    },
    { ...base, id: 'demo_rule_stipendio', title: 'Stipendio', amountCents: 205000, dayOfMonth: 27, categoryId: 'cat_stipendio' },
  ];
}
