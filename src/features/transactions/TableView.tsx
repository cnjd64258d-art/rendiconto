import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { openEditTransaction } from '../../app/editor';
import { formatCents, formatDayShort, formatMonth } from '../../core/format';
import { effectiveCents } from '../../core/transactions';
import type { Transaction } from '../../core/types';
import { COLUMN_LABELS, KIND_SINGULAR, type ColumnId, type Group, type SortField, type ViewConfig } from '../../core/views';
import { cx, tagStyle } from '../../ui/components';
import type { Lookups } from './TransactionRow';
import styles from './TableView.module.css';

const WIDTHS: Record<ColumnId, number> = {
  date: 96,
  title: 190,
  amount: 112,
  category: 160,
  method: 150,
  accrual: 120,
  tags: 150,
  notes: 200,
  kind: 120,
};
const SORTABLE: Partial<Record<ColumnId, SortField>> = { date: 'date', title: 'title', amount: 'amount', category: 'category', method: 'method' };
const ROW = 44;

type Item = { type: 'header'; group: Group } | { type: 'row'; t: Transaction; key: string };

/**
 * Notion-like table: configurable columns, horizontal scroll with the first column pinned,
 * header pinned under the navigation bar, virtualised rows. Tap a header to sort by it.
 */
export function TableView({
  groups,
  showHeaders,
  columns,
  lookups,
  scrollRef,
  sort,
  onSort,
}: {
  groups: Group[];
  showHeaders: boolean;
  columns: ColumnId[];
  lookups: Lookups;
  scrollRef: RefObject<HTMLDivElement | null>;
  sort: ViewConfig['sort'];
  onSort: (sort: ViewConfig['sort']) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headInner = useRef<HTMLDivElement>(null);
  const headFirst = useRef<HTMLDivElement>(null);
  const width = columns.reduce((w, c) => w + WIDTHS[c], 0);
  const template = columns.map((c) => `${WIDTHS[c]}px`).join(' ');

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const group of groups) {
      if (showHeaders) out.push({ type: 'header', group });
      for (const t of group.items) out.push({ type: 'row', t, key: `${group.key}/${t.id}` });
    }
    return out;
  }, [groups, showHeaders]);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer state is read during render by design
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    getItemKey: (i) => {
      const item = items[i];
      return item?.type === 'header' ? `h-${item.group.key}` : (item?.key ?? i);
    },
    overscan: 12,
    scrollMargin: bodyRef.current?.offsetTop ?? 0,
  });

  const syncHeader = () => {
    const x = bodyRef.current?.scrollLeft ?? 0;
    if (headInner.current) headInner.current.style.transform = `translateX(${-x}px)`;
    if (headFirst.current) headFirst.current.style.transform = `translateX(${x}px)`;
  };

  const rowStyle: CSSProperties = { gridTemplateColumns: template, width };

  return (
    <div className={styles.table} role="table" aria-label="Tabella delle transazioni" aria-rowcount={items.length + 1}>
      <div className={styles.head} role="rowgroup">
        <div ref={headInner} className={styles.row} style={rowStyle} role="row">
          {columns.map((c, i) => {
            const field = SORTABLE[c];
            const active = field !== undefined && sort.field === field;
            const label = (
              <>
                {COLUMN_LABELS[c]}
                {active && <span aria-hidden="true">{sort.direction === 'asc' ? ' ↑' : ' ↓'}</span>}
              </>
            );
            return (
              <div
                key={c}
                ref={i === 0 ? headFirst : undefined}
                className={cx(styles.th, i === 0 && styles.pinned, c === 'amount' && styles.num)}
                role="columnheader"
                aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {field ? (
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => onSort({ field, direction: active && sort.direction === 'desc' ? 'asc' : 'desc' })}
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div ref={bodyRef} className={styles.body} onScroll={syncHeader} role="rowgroup">
        <div style={{ height: virtualizer.getTotalSize(), width, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            if (!item) return null;
            const pos: CSSProperties = { position: 'absolute', top: 0, left: 0, transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` };
            if (item.type === 'header') {
              const g = item.group;
              return (
                <div key={v.key} className={styles.groupRow} style={{ ...pos, width }} role="row">
                  <span className={styles.groupLabel} role="cell">
                    {g.emoji !== undefined && <span aria-hidden="true">{g.emoji} </span>}
                    {g.label} <span className={styles.groupMeta}>· {g.count}</span>
                    {g.spentCents > 0 && <span className={styles.groupMeta}> · {formatCents(g.spentCents)}</span>}
                    {g.incomeCents > 0 && <span className={styles.groupMeta}> · {formatCents(g.incomeCents, { signed: true })}</span>}
                  </span>
                </div>
              );
            }
            const t = item.t;
            return (
              <div
                key={v.key}
                className={cx(styles.row, styles.bodyRow, t.status === 'pending' && styles.pending)}
                style={{ ...pos, ...rowStyle }}
                role="row"
                tabIndex={0}
                onClick={() => openEditTransaction(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openEditTransaction(t);
                }}
              >
                {columns.map((c, i) => (
                  <div key={c} className={cx(styles.td, i === 0 && styles.pinned, c === 'amount' && styles.num)} role="cell">
                    <Cell column={c} t={t} lookups={lookups} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell({ column, t, lookups }: { column: ColumnId; t: Transaction; lookups: Lookups }) {
  switch (column) {
    case 'date':
      return <>{formatDayShort(t.date)}</>;
    case 'title':
      return <span className={styles.ellipsis}>{t.title}</span>;
    case 'amount': {
      const cents = effectiveCents(t);
      return <span className={cx(t.kind === 'income' && styles.income, t.kind === 'transfer' && styles.muted)}>{t.kind === 'income' ? formatCents(cents, { signed: true }) : formatCents(cents)}</span>;
    }
    case 'category': {
      const c = t.categoryId ? lookups.categories.get(t.categoryId) : undefined;
      return c ? (
        <span className={styles.tag} style={tagStyle(c.color)}>
          {c.emoji} {c.name}
        </span>
      ) : (
        <span className={styles.muted}>—</span>
      );
    }
    case 'method': {
      const m = lookups.methods.get(t.paymentMethodId);
      const to = t.toPaymentMethodId ? lookups.methods.get(t.toPaymentMethodId) : undefined;
      return <span className={styles.ellipsis}>{to ? `${m?.name ?? '?'} → ${to.name}` : `${m?.emoji ?? ''} ${m?.name ?? '—'}`}</span>;
    }
    case 'accrual':
      return <span className={t.accrualMonth !== t.date.slice(0, 7) ? undefined : styles.muted}>{formatMonth(t.accrualMonth)}</span>;
    case 'tags':
      return <span className={styles.ellipsis}>{t.tags.length > 0 ? t.tags.map((x) => `#${x}`).join(' ') : ''}</span>;
    case 'notes':
      return <span className={cx(styles.ellipsis, styles.muted)}>{t.notes}</span>;
    case 'kind':
      return <>{KIND_SINGULAR[t.kind]}</>;
  }
}
