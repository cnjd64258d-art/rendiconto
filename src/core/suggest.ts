import { compareISO, type ISODate } from './dates';
import type { Cents } from './money';
import { normalizeText } from './transactions';
import type { Category, Id, Transaction, TransactionKind } from './types';

/**
 * Local, deterministic suggestions learned from the user's own history:
 * no network, no randomness. Same history + same input → same output.
 */

interface HistoryEntry {
  key: string;
  title: string;
  kind: TransactionKind;
  count: number;
  lastDate: ISODate;
  categories: Map<Id, number>;
  methods: Map<Id, number>;
  amounts: Map<Cents, { count: number; lastDate: ISODate }>;
}

export interface History {
  entries: HistoryEntry[];
  categoryUse: Map<Id, number>;
  methodUse: Map<Id, number>;
  methodUseByCategory: Map<Id, Map<Id, number>>;
}

function bump<K>(map: Map<K, number>, key: K, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Highest count wins; ties broken by key so the result never depends on order. */
function top<K extends string | number>(map: Map<K, number>): K | undefined {
  let best: K | undefined;
  let bestCount = -1;
  for (const [k, n] of map) {
    if (n > bestCount || (n === bestCount && best !== undefined && String(k) < String(best))) {
      best = k;
      bestCount = n;
    }
  }
  return best;
}

export function buildHistory(transactions: readonly Transaction[]): History {
  const byKey = new Map<string, HistoryEntry>();
  const categoryUse = new Map<Id, number>();
  const methodUse = new Map<Id, number>();
  const methodUseByCategory = new Map<Id, Map<Id, number>>();

  for (const t of transactions) {
    if (t.status !== 'confirmed') continue;
    const key = `${t.kind}|${normalizeText(t.title)}`;
    let e = byKey.get(key);
    if (!e) {
      e = {
        key,
        title: t.title,
        kind: t.kind,
        count: 0,
        lastDate: t.date,
        categories: new Map(),
        methods: new Map(),
        amounts: new Map(),
      };
      byKey.set(key, e);
    }
    e.count += 1;
    if (compareISO(t.date, e.lastDate) >= 0) {
      e.lastDate = t.date;
      e.title = t.title;
    }
    if (t.categoryId) {
      bump(e.categories, t.categoryId);
      bump(categoryUse, t.categoryId);
      let m = methodUseByCategory.get(t.categoryId);
      if (!m) methodUseByCategory.set(t.categoryId, (m = new Map()));
      bump(m, t.paymentMethodId);
    }
    bump(e.methods, t.paymentMethodId);
    bump(methodUse, t.paymentMethodId);
    const a = e.amounts.get(t.amountCents);
    if (a) {
      a.count += 1;
      if (compareISO(t.date, a.lastDate) > 0) a.lastDate = t.date;
    } else {
      e.amounts.set(t.amountCents, { count: 1, lastDate: t.date });
    }
  }
  return { entries: [...byKey.values()], categoryUse, methodUse, methodUseByCategory };
}

export interface TitleSuggestion {
  title: string;
  kind: TransactionKind;
  categoryId?: Id;
  paymentMethodId?: Id;
  /** Usual amount: most frequent, then most recent. */
  amountCents?: Cents;
  count: number;
}

function usualAmount(e: HistoryEntry): Cents | undefined {
  let best: Cents | undefined;
  let bestInfo: { count: number; lastDate: ISODate } | undefined;
  for (const [amount, info] of e.amounts) {
    if (
      !bestInfo ||
      info.count > bestInfo.count ||
      (info.count === bestInfo.count && compareISO(info.lastDate, bestInfo.lastDate) > 0) ||
      (info.count === bestInfo.count && info.lastDate === bestInfo.lastDate && best !== undefined && amount < best)
    ) {
      best = amount;
      bestInfo = info;
    }
  }
  return best;
}

/** Autocomplete for the description field. */
export function suggestTitles(history: History, query: string, kind: TransactionKind, limit = 4): TitleSuggestion[] {
  const q = normalizeText(query);
  if (q.length === 0) return [];
  const scored: { e: HistoryEntry; rank: number }[] = [];
  for (const e of history.entries) {
    if (e.kind !== kind) continue;
    const t = normalizeText(e.title);
    if (t === q) continue; // already typed in full
    let rank: number;
    if (t.startsWith(q)) rank = 0;
    else if (t.split(/[\s\-/.,()]+/).some((w) => w.startsWith(q))) rank = 1;
    else continue;
    scored.push({ e, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.e.count - a.e.count ||
      compareISO(b.e.lastDate, a.e.lastDate) ||
      (a.e.key < b.e.key ? -1 : 1),
  );
  return scored.slice(0, limit).map(({ e }) => {
    const s: TitleSuggestion = { title: e.title, kind: e.kind, count: e.count };
    const cat = top(e.categories);
    const method = top(e.methods);
    const amount = usualAmount(e);
    if (cat !== undefined) s.categoryId = cat;
    if (method !== undefined) s.paymentMethodId = method;
    if (amount !== undefined) s.amountCents = amount;
    return s;
  });
}

/** Exact match on a title already used: returns what it was used with. */
export function lookupTitle(history: History, title: string, kind: TransactionKind): TitleSuggestion | null {
  const key = `${kind}|${normalizeText(title)}`;
  const e = history.entries.find((x) => x.key === key);
  if (!e) return null;
  const s: TitleSuggestion = { title: e.title, kind: e.kind, count: e.count };
  const cat = top(e.categories);
  const method = top(e.methods);
  const amount = usualAmount(e);
  if (cat !== undefined) s.categoryId = cat;
  if (method !== undefined) s.paymentMethodId = method;
  if (amount !== undefined) s.amountCents = amount;
  return s;
}

const STOP_WORDS = new Set(['del', 'della', 'dei', 'per', 'con', 'the', 'and', 'alla', 'allo', 'dal', 'una', 'uno']);

function keywords(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Suggests a category for a new title from keywords seen in past titles
 * ("Pranzo Mensa" → Cibo because of earlier "Mensa Allianz").
 */
export function suggestCategory(history: History, title: string, kind: TransactionKind): Id | null {
  const exact = lookupTitle(history, title, kind);
  if (exact?.categoryId) return exact.categoryId;
  const words = new Set(keywords(title));
  if (words.size === 0) return null;
  const votes = new Map<Id, number>();
  for (const e of history.entries) {
    if (e.kind !== kind) continue;
    const shared = keywords(e.title).filter((w) => words.has(w)).length;
    if (shared === 0) continue;
    for (const [cat, n] of e.categories) bump(votes, cat, n * shared);
  }
  return top(votes) ?? null;
}

/** Category chips: most used first, then the configured order. */
export function orderCategoriesByUse(categories: readonly Category[], history: History): Category[] {
  return [...categories].sort(
    (a, b) => (history.categoryUse.get(b.id) ?? 0) - (history.categoryUse.get(a.id) ?? 0) || a.order - b.order,
  );
}

/** Preferred payment method: most used for that category (≥ 2 uses), else most used overall. */
export function defaultPaymentMethod(history: History, categoryId: Id | null, fallback: Id): Id {
  if (categoryId) {
    const perCategory = history.methodUseByCategory.get(categoryId);
    if (perCategory) {
      const best = top(perCategory);
      if (best !== undefined && (perCategory.get(best) ?? 0) >= 2) return best;
    }
  }
  return top(history.methodUse) ?? fallback;
}
