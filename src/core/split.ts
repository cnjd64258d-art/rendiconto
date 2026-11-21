import type { ISODate } from './dates';
import { centsToInput, parseAmount, splitEvenly, type Cents } from './money';
import { cleanTitle, normalizeText } from './transactions';
import type { Id, Person, Settlement, Split, Transaction } from './types';

/* ---------- Editing a shared expense ---------- */

export interface SplitDraft {
  enabled: boolean;
  /** 'me' or the person who paid the whole bill. */
  paidBy: 'me' | Id;
  /** The other people sharing it (never 'me'). */
  people: Id[];
  /** 'equal': everyone the same; 'mine': I type my share, the others split the rest evenly. */
  mode: 'equal' | 'mine';
  myShare: string;
}

export const EMPTY_SPLIT: SplitDraft = { enabled: false, paidBy: 'me', people: [], mode: 'equal', myShare: '' };

export type SplitResult = { ok: true; value: Split | undefined } | { ok: false; error: string };

/**
 * The stored split for a total. Only my share counts as an expense (`effectiveCents`).
 * Remainder cents of an even split go to the others first, so my share is never rounded up.
 */
export function buildSplit(totalCents: Cents, draft: SplitDraft): SplitResult {
  if (!draft.enabled) return { ok: true, value: undefined };
  const people = [...new Set(draft.people)];
  if (draft.paidBy !== 'me' && !people.includes(draft.paidBy)) people.unshift(draft.paidBy);
  if (people.length === 0) return { ok: false, error: 'Scegli con chi dividi la spesa' };

  let mine: Cents;
  let others: Cents[];
  if (draft.mode === 'equal') {
    const parts = splitEvenly(totalCents, people.length + 1);
    mine = parts[parts.length - 1] ?? 0;
    others = parts.slice(0, -1);
  } else {
    const typed = parseAmount(draft.myShare, ',');
    if (typed === null || typed < 0) return { ok: false, error: 'Inserisci la tua quota' };
    if (typed > totalCents) return { ok: false, error: 'La tua quota supera il totale' };
    mine = typed;
    others = splitEvenly(totalCents - typed, people.length);
  }
  return {
    ok: true,
    value: {
      totalCents,
      myShareCents: mine,
      paidBy: draft.paidBy,
      shares: people.map((personId, i) => ({ personId, amountCents: others[i] ?? 0 })),
    },
  };
}

export function draftFromSplit(split: Split | undefined): SplitDraft {
  if (!split) return EMPTY_SPLIT;
  const people = split.shares.map((s) => s.personId);
  const equal = buildSplit(split.totalCents, { enabled: true, paidBy: split.paidBy, people, mode: 'equal', myShare: '' });
  const isEqual = equal.ok && equal.value?.myShareCents === split.myShareCents;
  return { enabled: true, paidBy: split.paidBy, people, mode: isEqual ? 'equal' : 'mine', myShare: centsToInput(split.myShareCents) };
}

/* ---------- Who owes what ---------- */

export interface DebtItem {
  transaction: Transaction;
  /** Positive: the person owes me; negative: I owe them. */
  cents: Cents;
  /** How much of it is covered by repayments (oldest debts first). */
  settledCents: Cents;
  status: 'open' | 'partial' | 'settled';
}

export interface PersonBalance {
  personId: Id;
  /** Positive: they owe me; negative: I owe them. */
  netCents: Cents;
  /** Shared expenses with this person, newest first. */
  items: DebtItem[];
  settlements: Settlement[];
}

/** What a shared, confirmed transaction means between me and one person. */
function debtWith(t: Transaction, personId: Id): Cents {
  const s = t.split;
  if (!s || t.status !== 'confirmed' || t.kind !== 'expense') return 0;
  if (s.paidBy === 'me') return s.shares.find((x) => x.personId === personId)?.amountCents ?? 0;
  return s.paidBy === personId ? -s.myShareCents : 0;
}

/**
 * Balances per person (decision 2: a friend's repayment closes the debt and is not income).
 * net = what they owe me for bills I paid − my share of bills they paid − what they gave back + what I gave them.
 */
export function balances(transactions: readonly Transaction[], settlements: readonly Settlement[], people: readonly Pick<Person, 'id'>[]): PersonBalance[] {
  const byPerson = new Map<Id, { debts: { t: Transaction; cents: Cents }[]; settlements: Settlement[] }>();
  const entry = (id: Id) => {
    let e = byPerson.get(id);
    if (!e) byPerson.set(id, (e = { debts: [], settlements: [] }));
    return e;
  };
  for (const p of people) entry(p.id);
  for (const t of transactions) {
    if (!t.split) continue;
    const ids = new Set([...t.split.shares.map((s) => s.personId), ...(t.split.paidBy === 'me' ? [] : [t.split.paidBy])]);
    for (const id of ids) {
      const cents = debtWith(t, id);
      if (cents !== 0) entry(id).debts.push({ t, cents });
    }
  }
  for (const s of settlements) entry(s.personId).settlements.push(s);

  const out: PersonBalance[] = [];
  for (const [personId, e] of byPerson) {
    const owed = e.debts.reduce((sum, d) => sum + d.cents, 0);
    const paid = e.settlements.reduce((sum, s) => sum + (s.direction === 'in' ? s.amountCents : -s.amountCents), 0);
    const netCents = owed - paid;
    out.push({ personId, netCents, items: allocate(e.debts, e.settlements), settlements: [...e.settlements].sort((a, b) => (a.date < b.date ? 1 : -1)) });
  }
  return out;
}

/** FIFO: repayments cover the oldest debts in their direction first; what is left shows as open. */
function allocate(debts: { t: Transaction; cents: Cents }[], settlements: readonly Settlement[]): DebtItem[] {
  // Money that flowed towards closing debts in each direction.
  let theyPaid = settlements.filter((s) => s.direction === 'in').reduce((a, s) => a + s.amountCents, 0);
  let iPaid = settlements.filter((s) => s.direction === 'out').reduce((a, s) => a + s.amountCents, 0);
  // Debts in opposite directions offset each other, as with any shared tab.
  const owedToMe = debts.filter((d) => d.cents > 0).reduce((a, d) => a + d.cents, 0);
  const iOwe = debts.filter((d) => d.cents < 0).reduce((a, d) => a - d.cents, 0);
  const offset = Math.min(owedToMe, iOwe);
  theyPaid += offset;
  iPaid += offset;

  const chronological = [...debts].sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.t.createdAt < b.t.createdAt ? -1 : 1));
  const items = chronological.map(({ t, cents }) => {
    const abs = Math.abs(cents);
    let covered: Cents;
    if (cents > 0) {
      covered = Math.min(abs, theyPaid);
      theyPaid -= covered;
    } else {
      covered = Math.min(abs, iPaid);
      iPaid -= covered;
    }
    const status: DebtItem['status'] = covered >= abs ? 'settled' : covered > 0 ? 'partial' : 'open';
    return { transaction: t, cents, settledCents: covered, status };
  });
  return items.reverse();
}

/** Total others owe me and total I owe, over all people. */
export function balanceTotals(list: readonly PersonBalance[]): { owedToMeCents: Cents; iOweCents: Cents } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const b of list) {
    if (b.netCents > 0) owedToMe += b.netCents;
    else iOwe -= b.netCents;
  }
  return { owedToMeCents: owedToMe, iOweCents: iOwe };
}

/* ---------- Settlements ---------- */

export interface SettlementDraft {
  personId: Id | null;
  direction: 'in' | 'out';
  amount: string;
  date: ISODate;
  paymentMethodId: Id | null;
  note: string;
}

export type SettlementResult = { ok: true; value: Omit<Settlement, 'id'> } | { ok: false; error: string };

export function validateSettlement(d: SettlementDraft): SettlementResult {
  if (!d.personId) return { ok: false, error: 'Scegli la persona' };
  const amount = parseAmount(d.amount, ',');
  if (amount === null || amount <= 0) return { ok: false, error: 'Inserisci un importo maggiore di zero' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return { ok: false, error: 'Data non valida' };
  if (!d.paymentMethodId) return { ok: false, error: 'Scegli il metodo' };
  return { ok: true, value: { personId: d.personId, direction: d.direction, amountCents: amount, date: d.date, paymentMethodId: d.paymentMethodId, note: d.note.trim() } };
}

/** The repayment that closes a balance: they pay me back when they owe me, otherwise I pay them. */
export function settlementForBalance(netCents: Cents): Pick<SettlementDraft, 'direction' | 'amount'> {
  return { direction: netCents >= 0 ? 'in' : 'out', amount: netCents === 0 ? '' : centsToInput(Math.abs(netCents)) };
}

/* ---------- People ---------- */

export type PersonResult = { ok: true; value: Person } | { ok: false; error: string };

/** Unique names after normalisation, like categories ("Nicola" = "nicola "). */
export function buildPerson(name: string, all: readonly Person[], newId: () => Id, existing?: Person): PersonResult {
  const clean = cleanTitle(name);
  if (!clean) return { ok: false, error: 'Scrivi un nome' };
  if (clean.length > 40) return { ok: false, error: 'Il nome è troppo lungo (massimo 40 caratteri)' };
  const clash = all.find((p) => p.id !== existing?.id && normalizeText(p.name) === normalizeText(clean));
  if (clash) return { ok: false, error: `Esiste già «${clash.name}»` };
  return { ok: true, value: existing ? { ...existing, name: clean } : { id: newId(), name: clean, archived: false } };
}
