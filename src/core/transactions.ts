import { compareISO, isISODate, isYearMonth, monthOf, type ISODate, type YearMonth } from './dates';
import { centsToInput, parseAmount, type Cents } from './money';
import type { Id, Transaction, TransactionKind } from './types';

/** Lowercase, no accents differences in spacing, typographic quotes unified. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02BC`´]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT');
}

/** Clean display title: trimmed, single spaces, unified apostrophes. */
export function cleanTitle(text: string): string {
  return text.normalize('NFKC').replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\s+/g, ' ').trim();
}

export function normalizeTag(tag: string): string {
  return normalizeText(tag).replace(/^#/, '');
}

/** "Lavoro, milano ,#Lavoro" → ["lavoro", "milano"] */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[,;\n]/)) {
    const tag = normalizeTag(raw);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export function dedupeKey(date: ISODate, amountCents: Cents, title: string): string {
  return `${date}|${amountCents}|${normalizeText(title)}`;
}

/** What this transaction really costs me: my share when split. */
export function effectiveCents(t: Pick<Transaction, 'amountCents' | 'split'>): Cents {
  return t.split ? t.split.myShareCents : t.amountCents;
}

/** Contribution to the balance: income positive, expense negative, transfers zero. */
export function balanceEffect(t: Pick<Transaction, 'kind' | 'amountCents' | 'split'>): Cents {
  if (t.kind === 'income') return t.amountCents;
  if (t.kind === 'expense') return -effectiveCents(t);
  return 0;
}

export function countsInTotals(t: Pick<Transaction, 'status'>): boolean {
  return t.status === 'confirmed';
}

/** Newest first; same day → most recently created first. */
export function compareTransactionsDesc(a: Transaction, b: Transaction): number {
  return compareISO(b.date, a.date) || compareISO(b.createdAt, a.createdAt);
}

export interface DayGroup {
  date: ISODate;
  spentCents: Cents;
  incomeCents: Cents;
  items: Transaction[];
}

/** Groups (already sorted) transactions by payment day, with daily totals. */
export function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | undefined;
  for (const t of transactions) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, spentCents: 0, incomeCents: 0, items: [] };
      groups.push(current);
    }
    current.items.push(t);
    if (!countsInTotals(t)) continue;
    if (t.kind === 'expense') current.spentCents += effectiveCents(t);
    else if (t.kind === 'income') current.incomeCents += t.amountCents;
  }
  return groups;
}

export interface SelectionSummary {
  count: number;
  spentCents: Cents;
  incomeCents: Cents;
  balanceCents: Cents;
}

export function summarize(transactions: readonly Transaction[]): SelectionSummary {
  let spent = 0;
  let income = 0;
  for (const t of transactions) {
    if (!countsInTotals(t)) continue;
    if (t.kind === 'expense') spent += effectiveCents(t);
    else if (t.kind === 'income') income += t.amountCents;
  }
  return { count: transactions.length, spentCents: spent, incomeCents: income, balanceCents: income - spent };
}

/* ---------- Drafts coming from the quick-add sheet ---------- */

export interface TransactionDraft {
  kind: TransactionKind;
  amount: string;
  title: string;
  categoryId: Id | null;
  paymentMethodId: Id | null;
  toPaymentMethodId: Id | null;
  date: string;
  /** Empty → same month as the date. */
  accrualMonth: string;
  notes: string;
  tags: string;
}

export type DraftField = 'amount' | 'title' | 'categoryId' | 'paymentMethodId' | 'toPaymentMethodId' | 'date' | 'accrualMonth';

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export type DraftResult =
  | { ok: true; value: TransactionInput }
  | { ok: false; errors: Partial<Record<DraftField, string>> };

export function validateDraft(draft: TransactionDraft): DraftResult {
  const errors: Partial<Record<DraftField, string>> = {};
  const amountCents = parseAmount(draft.amount, ',');
  if (amountCents === null || amountCents <= 0) errors.amount = "Inserisci un importo maggiore di zero";

  const title = cleanTitle(draft.title);
  if (!title) errors.title = 'Aggiungi una descrizione';

  if (!isISODate(draft.date)) errors.date = 'Data non valida';
  const accrualMonth: YearMonth = draft.accrualMonth.trim() || (isISODate(draft.date) ? monthOf(draft.date) : '');
  if (!isYearMonth(accrualMonth)) errors.accrualMonth = 'Mese di competenza non valido';

  if (!draft.paymentMethodId) errors.paymentMethodId = 'Scegli un metodo di pagamento';
  if (draft.kind === 'transfer') {
    if (!draft.toPaymentMethodId) errors.toPaymentMethodId = 'Scegli la destinazione';
    else if (draft.toPaymentMethodId === draft.paymentMethodId) errors.toPaymentMethodId = 'Origine e destinazione coincidono';
  } else if (!draft.categoryId) {
    errors.categoryId = 'Scegli una categoria';
  }

  if (Object.keys(errors).length > 0 || amountCents === null || !draft.paymentMethodId) {
    return { ok: false, errors };
  }

  const value: TransactionInput = {
    title,
    amountCents,
    kind: draft.kind,
    date: draft.date,
    accrualMonth,
    paymentMethodId: draft.paymentMethodId,
    status: 'confirmed',
    notes: draft.notes.trim(),
    tags: parseTags(draft.tags),
    dedupeKey: dedupeKey(draft.date, amountCents, title),
  };
  if (draft.kind === 'transfer' && draft.toPaymentMethodId) value.toPaymentMethodId = draft.toPaymentMethodId;
  if (draft.kind !== 'transfer' && draft.categoryId) value.categoryId = draft.categoryId;
  return { ok: true, value };
}

/** Turns a stored transaction back into an editable draft. */
export function draftFromTransaction(t: Transaction): TransactionDraft {
  return {
    kind: t.kind,
    amount: centsToInput(t.amountCents),
    title: t.title,
    categoryId: t.categoryId ?? null,
    paymentMethodId: t.paymentMethodId,
    toPaymentMethodId: t.toPaymentMethodId ?? null,
    date: t.date,
    accrualMonth: t.accrualMonth === monthOf(t.date) ? '' : t.accrualMonth,
    notes: t.notes,
    tags: t.tags.join(', '),
  };
}
