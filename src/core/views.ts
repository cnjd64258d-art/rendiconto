import { addDays, addMonths, endOfMonthDate, isISODate, isoWeekday, monthOf, startOfWeek, yearOf, type ISODate, type YearMonth } from './dates';
import { formatDayShort, formatMonth } from './format';
import { firstEmoji } from './lists';
import { parseAmount, type Cents } from './money';
import { countsInTotals, effectiveCents, normalizeText } from './transactions';
import type { Category, CategoryGroup, Id, PaymentMethod, SavedView, Transaction, TransactionKind } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Configuration (what a saved view stores)

export type Layout = 'list' | 'table' | 'board' | 'calendar';
export type PeriodPreset = 'all' | 'thisMonth' | 'lastMonth' | 'last30' | 'thisYear' | 'lastYear' | 'custom';
export type DateBasis = 'accrual' | 'payment';
export type SortField = 'date' | 'amount' | 'title' | 'category' | 'method';
export type GroupField = 'none' | 'day' | 'month' | 'category' | 'group' | 'method' | 'kind' | 'tag';
export type BoardField = 'category' | 'group' | 'method';
export type ColumnId = 'date' | 'title' | 'amount' | 'category' | 'method' | 'accrual' | 'tags' | 'notes' | 'kind';

export interface ViewFilter {
  period: PeriodPreset;
  /** Only for `custom`; both inclusive, either may be empty. */
  from: ISODate | '';
  to: ISODate | '';
  /** Period by accrual month (default, decision 5) or by payment date. */
  basis: DateBasis;
  kinds: TransactionKind[];
  categoryIds: Id[];
  groupIds: Id[];
  methodIds: Id[];
  tags: string[];
  minCents: Cents | null;
  maxCents: Cents | null;
  text: string;
}

export interface ViewConfig {
  layout: Layout;
  filter: ViewFilter;
  sort: { field: SortField; direction: 'asc' | 'desc' };
  groupBy: GroupField;
  boardBy: BoardField;
  columns: ColumnId[];
}

export const ALL_COLUMNS: ColumnId[] = ['date', 'title', 'amount', 'category', 'method', 'accrual', 'tags', 'notes', 'kind'];
export const COLUMN_LABELS: Record<ColumnId, string> = {
  date: 'Data',
  title: 'Descrizione',
  amount: 'Importo',
  category: 'Categoria',
  method: 'Metodo',
  accrual: 'Competenza',
  tags: 'Tag',
  notes: 'Note',
  kind: 'Tipo',
};
export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  all: 'Sempre',
  thisMonth: 'Questo mese',
  lastMonth: 'Mese scorso',
  last30: 'Ultimi 30 giorni',
  thisYear: "Quest'anno",
  lastYear: 'Anno scorso',
  custom: 'Personalizzato',
};
export const SORT_LABELS: Record<SortField, string> = {
  date: 'Data',
  amount: 'Importo',
  title: 'Descrizione',
  category: 'Categoria',
  method: 'Metodo',
};
export const GROUP_LABELS: Record<GroupField, string> = {
  none: 'Nessuno',
  day: 'Giorno',
  month: 'Mese',
  category: 'Categoria',
  group: 'Macro-voce',
  method: 'Metodo',
  kind: 'Tipo',
  tag: 'Tag',
};
export const KIND_LABELS: Record<TransactionKind, string> = { expense: 'Uscite', income: 'Entrate', transfer: 'Trasferimenti' };
export const KIND_SINGULAR: Record<TransactionKind, string> = { expense: 'Uscita', income: 'Entrata', transfer: 'Trasferimento' };

export const EMPTY_FILTER: ViewFilter = {
  period: 'all',
  from: '',
  to: '',
  basis: 'accrual',
  kinds: [],
  categoryIds: [],
  groupIds: [],
  methodIds: [],
  tags: [],
  minCents: null,
  maxCents: null,
  text: '',
};

export const DEFAULT_VIEW: ViewConfig = {
  layout: 'list',
  filter: EMPTY_FILTER,
  sort: { field: 'date', direction: 'desc' },
  groupBy: 'day',
  boardBy: 'category',
  columns: ['date', 'title', 'amount', 'category', 'method'],
};

/** Reads a stored config defensively (older or partial saved views get defaults). */
export function normalizeConfig(view: Partial<Pick<SavedView, 'layout' | 'filter' | 'sort' | 'groupBy' | 'columns'>> & { boardBy?: unknown }): ViewConfig {
  const f = (view.filter ?? {}) as Partial<ViewFilter>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const sort = view.sort?.[0];
  const columns = arr<ColumnId>(view.columns).filter((c) => ALL_COLUMNS.includes(c));
  return {
    layout: view.layout && ['list', 'table', 'board', 'calendar'].includes(view.layout) ? view.layout : 'list',
    filter: {
      period: f.period && f.period in PERIOD_LABELS ? f.period : 'all',
      from: typeof f.from === 'string' && isISODate(f.from) ? f.from : '',
      to: typeof f.to === 'string' && isISODate(f.to) ? f.to : '',
      basis: f.basis === 'payment' ? 'payment' : 'accrual',
      kinds: arr<TransactionKind>(f.kinds),
      categoryIds: arr<Id>(f.categoryIds),
      groupIds: arr<Id>(f.groupIds),
      methodIds: arr<Id>(f.methodIds),
      tags: arr<string>(f.tags),
      minCents: typeof f.minCents === 'number' ? f.minCents : null,
      maxCents: typeof f.maxCents === 'number' ? f.maxCents : null,
      text: typeof f.text === 'string' ? f.text : '',
    },
    sort: sort && sort.field in SORT_LABELS ? { field: sort.field as SortField, direction: sort.direction === 'asc' ? 'asc' : 'desc' } : DEFAULT_VIEW.sort,
    groupBy: view.groupBy && view.groupBy in GROUP_LABELS ? (view.groupBy as GroupField) : 'none',
    boardBy: view.boardBy === 'method' || view.boardBy === 'group' ? view.boardBy : 'category',
    columns: columns.length > 0 ? columns : DEFAULT_VIEW.columns,
  };
}

/** The SavedView fields for a config. */
export function configToSaved(config: ViewConfig): Pick<SavedView, 'layout' | 'filter' | 'sort' | 'groupBy' | 'columns'> & { boardBy: BoardField } {
  return {
    layout: config.layout,
    filter: config.filter,
    sort: [config.sort],
    groupBy: config.groupBy,
    boardBy: config.boardBy,
    columns: config.columns,
  };
}

export function sameConfig(a: ViewConfig, b: ViewConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------------------------------------------
// Filtering

export interface Ctx {
  categories: Map<Id, Category>;
  groups: Map<Id, CategoryGroup>;
  methods: Map<Id, PaymentMethod>;
}

export function makeCtx(categories: readonly Category[], groups: readonly CategoryGroup[], methods: readonly PaymentMethod[]): Ctx {
  return {
    categories: new Map(categories.map((c) => [c.id, c])),
    groups: new Map(groups.map((g) => [g.id, g])),
    methods: new Map(methods.map((m) => [m.id, m])),
  };
}

/** Inclusive date range for a period, or null for "always". */
export function resolvePeriod(filter: Pick<ViewFilter, 'period' | 'from' | 'to'>, today: ISODate): { from: ISODate; to: ISODate } | null {
  const month = monthOf(today);
  const year = yearOf(today);
  switch (filter.period) {
    case 'all':
      return null;
    case 'thisMonth':
      return { from: `${month}-01`, to: endOfMonthDate(month) };
    case 'lastMonth': {
      const m = addMonths(month, -1);
      return { from: `${m}-01`, to: endOfMonthDate(m) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'custom':
      if (!filter.from && !filter.to) return null;
      return { from: filter.from || '0000-01-01', to: filter.to || '9999-12-31' };
  }
}

/** Pre-computed filter, so the per-row test is cheap with 5,000+ rows. */
interface Compiled {
  range: { from: string; to: string } | null;
  basis: DateBasis;
  kinds: Set<TransactionKind> | null;
  categories: Set<Id> | null;
  groups: Set<Id> | null;
  methods: Set<Id> | null;
  tags: Set<string> | null;
  min: Cents | null;
  max: Cents | null;
  words: string[];
  amount: Cents | null;
}

const setOrNull = <T,>(items: readonly T[]): Set<T> | null => (items.length > 0 ? new Set(items) : null);

function compile(filter: ViewFilter, today: ISODate): Compiled {
  const range = resolvePeriod(filter, today);
  const text = normalizeText(filter.text);
  return {
    // Accrual basis compares months: a range of days becomes the months it touches.
    range: range && filter.basis === 'accrual' ? { from: monthOf(range.from), to: monthOf(range.to) } : range,
    basis: filter.basis,
    kinds: setOrNull(filter.kinds),
    categories: setOrNull(filter.categoryIds),
    groups: setOrNull(filter.groupIds),
    methods: setOrNull(filter.methodIds),
    tags: setOrNull(filter.tags),
    min: filter.minCents,
    max: filter.maxCents,
    words: text ? text.split(' ') : [],
    amount: /\d/.test(text) ? parseAmount(text, ',') : null,
  };
}

/** Text the search looks into: title, notes, tags, category and method names. */
function haystack(t: Transaction, ctx: Ctx): string {
  const cat = t.categoryId ? ctx.categories.get(t.categoryId) : undefined;
  return normalizeText(
    [t.title, t.notes, t.tags.join(' '), cat?.name ?? '', ctx.methods.get(t.paymentMethodId)?.name ?? ''].join(' '),
  );
}

function matches(t: Transaction, c: Compiled, ctx: Ctx, cache: Map<Id, string>): boolean {
  if (c.range) {
    const key = c.basis === 'accrual' ? t.accrualMonth : t.date;
    if (key < c.range.from || key > c.range.to) return false;
  }
  if (c.kinds && !c.kinds.has(t.kind)) return false;
  if (c.categories && !(t.categoryId && c.categories.has(t.categoryId))) return false;
  if (c.groups) {
    const groupId = t.categoryId ? ctx.categories.get(t.categoryId)?.groupId : undefined;
    if (!groupId || !c.groups.has(groupId)) return false;
  }
  if (c.methods && !c.methods.has(t.paymentMethodId) && !(t.toPaymentMethodId && c.methods.has(t.toPaymentMethodId))) return false;
  if (c.tags && !t.tags.some((tag) => c.tags?.has(tag))) return false;
  const cents = effectiveCents(t);
  if (c.min !== null && cents < c.min) return false;
  if (c.max !== null && cents > c.max) return false;
  if (c.words.length > 0) {
    // An amount typed in the search ("12,50") also matches the exact amount.
    if (c.amount !== null && (t.amountCents === c.amount || cents === c.amount)) return true;
    let text = cache.get(t.id);
    if (text === undefined) {
      text = haystack(t, ctx);
      cache.set(t.id, text);
    }
    for (const w of c.words) if (!text.includes(w)) return false;
  }
  return true;
}

/** Search text per transaction id. Keep one per data snapshot to make typing instant. */
export type SearchCache = Map<Id, string>;

export function filterTransactions(
  transactions: readonly Transaction[],
  filter: ViewFilter,
  ctx: Ctx,
  today: ISODate,
  cache: SearchCache = new Map(),
): Transaction[] {
  const c = compile(filter, today);
  return transactions.filter((t) => matches(t, c, ctx, cache));
}

/** How many filter conditions are active (search text excluded: it has its own field). */
export function activeFilterCount(filter: ViewFilter): number {
  return (
    (filter.period !== 'all' ? 1 : 0) +
    (filter.kinds.length > 0 ? 1 : 0) +
    (filter.categoryIds.length > 0 ? 1 : 0) +
    (filter.groupIds.length > 0 ? 1 : 0) +
    (filter.methodIds.length > 0 ? 1 : 0) +
    (filter.tags.length > 0 ? 1 : 0) +
    (filter.minCents !== null || filter.maxCents !== null ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Sorting

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

export function sortTransactions(list: readonly Transaction[], sort: ViewConfig['sort'], ctx: Ctx): Transaction[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const catOrder = (t: Transaction) => {
    const c = t.categoryId ? ctx.categories.get(t.categoryId) : undefined;
    const g = c ? ctx.groups.get(c.groupId) : undefined;
    return c ? (g?.order ?? 0) * 1000 + c.order : Number.MAX_SAFE_INTEGER;
  };
  const key: Record<SortField, (a: Transaction, b: Transaction) => number> = {
    date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
    amount: (a, b) => effectiveCents(a) - effectiveCents(b),
    title: (a, b) => collator.compare(a.title, b.title),
    category: (a, b) => catOrder(a) - catOrder(b),
    method: (a, b) => (ctx.methods.get(a.paymentMethodId)?.order ?? 0) - (ctx.methods.get(b.paymentMethodId)?.order ?? 0),
  };
  const primary = key[sort.field];
  // Ties: newest first, then most recently created, so the order is stable and predictable.
  return [...list].sort(
    (a, b) => primary(a, b) * dir || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Grouping (list, table and board)

export interface Group {
  key: string;
  label: string;
  emoji?: string;
  color?: string;
  count: number;
  spentCents: Cents;
  incomeCents: Cents;
  items: Transaction[];
}

interface KeyInfo {
  key: string;
  label: string;
  emoji?: string;
  color?: string;
  /** For groups whose order is not their first appearance (categories, methods…). */
  rank?: number;
}

function keysFor(t: Transaction, by: GroupField, ctx: Ctx, today: ISODate): KeyInfo[] {
  switch (by) {
    case 'none':
      return [{ key: 'all', label: 'Tutte' }];
    case 'day': {
      const yesterday = addDays(today, -1);
      const label = t.date === today ? 'Oggi' : t.date === yesterday ? 'Ieri' : formatDayShort(t.date);
      return [{ key: t.date, label }];
    }
    case 'month':
      return [{ key: t.accrualMonth, label: formatMonth(t.accrualMonth) }];
    case 'category': {
      const c = t.categoryId ? ctx.categories.get(t.categoryId) : undefined;
      if (!c) return [{ key: '~none', label: t.kind === 'transfer' ? 'Trasferimenti' : 'Senza categoria', rank: Number.MAX_SAFE_INTEGER }];
      return [{ key: c.id, label: c.name, emoji: c.emoji, color: c.color, rank: (ctx.groups.get(c.groupId)?.order ?? 0) * 1000 + c.order }];
    }
    case 'group': {
      const c = t.categoryId ? ctx.categories.get(t.categoryId) : undefined;
      const g = c ? ctx.groups.get(c.groupId) : undefined;
      if (!g) return [{ key: '~none', label: t.kind === 'transfer' ? 'Trasferimenti' : 'Senza macro-voce', rank: Number.MAX_SAFE_INTEGER }];
      return [{ key: g.id, label: g.name, rank: g.order }];
    }
    case 'method': {
      const m = ctx.methods.get(t.paymentMethodId);
      return [{ key: t.paymentMethodId, label: m?.name ?? 'Metodo sconosciuto', ...(m ? { emoji: m.emoji } : {}), rank: m?.order ?? Number.MAX_SAFE_INTEGER }];
    }
    case 'kind': {
      const rank = { expense: 0, income: 1, transfer: 2 }[t.kind];
      return [{ key: t.kind, label: KIND_LABELS[t.kind], rank }];
    }
    case 'tag':
      // A transaction with two tags appears in both groups (like Notion multi-select).
      return t.tags.length > 0 ? t.tags.map((tag) => ({ key: `#${tag}`, label: `#${tag}` })) : [{ key: '~none', label: 'Senza tag', rank: Number.MAX_SAFE_INTEGER }];
  }
}

/**
 * Groups an already sorted list. Date-like groups keep the order of the sort; the others follow their own
 * order (categories by group and position, methods by position, tags alphabetically).
 */
export function groupTransactions(sorted: readonly Transaction[], by: GroupField, ctx: Ctx, today: ISODate): Group[] {
  const map = new Map<string, Group & { rank?: number }>();
  for (const t of sorted) {
    for (const info of keysFor(t, by, ctx, today)) {
      let g = map.get(info.key);
      if (!g) {
        g = { key: info.key, label: info.label, count: 0, spentCents: 0, incomeCents: 0, items: [] };
        if (info.emoji !== undefined) g.emoji = info.emoji;
        if (info.color !== undefined) g.color = info.color;
        if (info.rank !== undefined) g.rank = info.rank;
        map.set(info.key, g);
      }
      g.items.push(t);
      g.count += 1;
      if (!countsInTotals(t)) continue;
      if (t.kind === 'expense') g.spentCents += effectiveCents(t);
      else if (t.kind === 'income') g.incomeCents += t.amountCents;
    }
  }
  const groups = [...map.values()];
  if (by === 'tag') groups.sort((a, b) => (a.key === '~none' ? 1 : b.key === '~none' ? -1 : collator.compare(a.key, b.key)));
  else if (by !== 'day' && by !== 'month' && by !== 'none') groups.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const g of groups) delete g.rank;
  return groups;
}

/** Board columns: every active category/group/method gets a column, even when empty (drop-zone feel of Notion). */
export function boardColumns(sorted: readonly Transaction[], by: BoardField, ctx: Ctx, today: ISODate, showEmpty: boolean): Group[] {
  const filled = groupTransactions(sorted, by, ctx, today);
  if (!showEmpty) return filled;
  const byKey = new Map(filled.map((g) => [g.key, g]));
  const empty = (key: string, label: string, emoji?: string, color?: string): Group => ({
    key,
    label,
    ...(emoji !== undefined ? { emoji } : {}),
    ...(color !== undefined ? { color } : {}),
    count: 0,
    spentCents: 0,
    incomeCents: 0,
    items: [],
  });
  const out: Group[] = [];
  if (by === 'category') {
    const cats = [...ctx.categories.values()]
      .filter((c) => !c.archived || byKey.has(c.id))
      .sort((a, b) => (ctx.groups.get(a.groupId)?.order ?? 0) - (ctx.groups.get(b.groupId)?.order ?? 0) || a.order - b.order);
    for (const c of cats) out.push(byKey.get(c.id) ?? empty(c.id, c.name, c.emoji, c.color));
  } else if (by === 'group') {
    for (const g of [...ctx.groups.values()].sort((a, b) => a.order - b.order)) out.push(byKey.get(g.id) ?? empty(g.id, g.name));
  } else {
    for (const m of [...ctx.methods.values()].filter((m) => !m.archived || byKey.has(m.id)).sort((a, b) => a.order - b.order))
      out.push(byKey.get(m.id) ?? empty(m.id, m.name, m.emoji));
  }
  const none = byKey.get('~none');
  if (none) out.push(none);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Calendar heatmap

export interface CalendarDay {
  date: ISODate;
  inMonth: boolean;
  spentCents: Cents;
  count: number;
  /** 0 = nothing spent, 1..4 = quarters of the month's 90th-percentile day (above it: 4). */
  level: 0 | 1 | 2 | 3 | 4;
}

/** Weeks (Monday first) covering `month`, with spending per day by payment date. */
export function calendarMonth(transactions: readonly Transaction[], month: YearMonth): CalendarDay[][] {
  const first = `${month}-01`;
  const last = endOfMonthDate(month);
  const spent = new Map<ISODate, { cents: number; count: number }>();
  for (const t of transactions) {
    if (t.date < first || t.date > last) continue;
    const d = spent.get(t.date) ?? { cents: 0, count: 0 };
    d.count += 1;
    if (t.kind === 'expense' && countsInTotals(t)) d.cents += effectiveCents(t);
    spent.set(t.date, d);
  }
  // Intensity relative to the month's 90th-percentile day, in four steps: one big payment (the mortgage)
  // gets the darkest colour without washing out every other day.
  const values = [...spent.values()].map((d) => d.cents).filter((c) => c > 0).sort((a, b) => a - b);
  const ref = values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] ?? 0;
  const level = (c: number): CalendarDay['level'] => (c <= 0 || ref <= 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((c / ref) * 4))) as 1 | 2 | 3 | 4));

  const weeks: CalendarDay[][] = [];
  let day = startOfWeek(first);
  while (day <= last || isoWeekday(day) !== 1) {
    if (isoWeekday(day) === 1) weeks.push([]);
    const d = spent.get(day);
    const inMonth = day >= first && day <= last;
    const cents = inMonth ? (d?.cents ?? 0) : 0;
    weeks[weeks.length - 1]?.push({ date: day, inMonth, spentCents: cents, count: inMonth ? (d?.count ?? 0) : 0, level: inMonth ? level(cents) : 0 });
    day = addDays(day, 1);
  }
  return weeks;
}

// ---------------------------------------------------------------------------------------------------------------
// Saved views

export type ViewResult = { ok: true; value: SavedView } | { ok: false; error: string };

export function buildSavedView(name: string, emoji: string, config: ViewConfig, all: readonly SavedView[], existing?: SavedView, newId?: () => Id): ViewResult {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, error: 'Dai un nome alla vista' };
  if (clean.length > 40) return { ok: false, error: 'Il nome è troppo lungo (massimo 40 caratteri)' };
  const key = normalizeText(clean);
  const clash = all.find((v) => v.id !== existing?.id && normalizeText(v.name) === key);
  if (clash) return { ok: false, error: `Esiste già la vista «${clash.name}»` };
  return {
    ok: true,
    value: {
      ...(existing ?? { order: all.reduce((m, v) => Math.max(m, v.order), -1) + 1 }),
      id: existing?.id ?? (newId ? newId() : `view_${Date.now().toString(36)}`),
      name: clean,
      emoji: firstEmoji(emoji, existing?.emoji ?? '📄'),
      ...configToSaved(config),
    },
  };
}

/** All distinct tags, most used first (for the tag filter). */
export function tagsByUse(transactions: readonly Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const t of transactions) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).map(([tag]) => tag);
}
