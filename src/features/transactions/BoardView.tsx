import { openEditTransaction } from '../../app/editor';
import { formatCents, formatDayShort } from '../../core/format';
import { effectiveCents } from '../../core/transactions';
import type { Group } from '../../core/views';
import { cx, tagStyle } from '../../ui/components';
import type { Lookups } from './TransactionRow';
import styles from './BoardView.module.css';

/** Cards per column before "altre N": keeps the board light with thousands of rows. */
const MAX_CARDS = 60;

/** Notion-like board: one column per category, macro-voce or method, scrolling sideways. */
export function BoardView({ columns, lookups, by }: { columns: Group[]; lookups: Lookups; by: 'category' | 'group' | 'method' }) {
  return (
    <div className={styles.board} aria-label="Board">
      {columns.map((col) => (
        <section key={col.key} className={styles.column} aria-label={`${col.label}, ${col.count} transazioni`}>
          <header className={styles.colHeader}>
            <span className={styles.colTitle} style={col.color ? tagStyle(col.color as never) : undefined}>
              {col.emoji !== undefined && <span aria-hidden="true">{col.emoji}</span>}
              {col.label}
            </span>
            <span className={styles.colCount}>{col.count}</span>
          </header>
          <div className={styles.colTotal}>
            {col.spentCents > 0 || col.incomeCents === 0 ? formatCents(col.spentCents) : formatCents(col.incomeCents, { signed: true })}
          </div>
          <div className={styles.cards}>
            {col.items.slice(0, MAX_CARDS).map((t) => {
              const cat = t.categoryId ? lookups.categories.get(t.categoryId) : undefined;
              const method = lookups.methods.get(t.paymentMethodId);
              const cents = effectiveCents(t);
              return (
                <button key={t.id} type="button" className={cx(styles.card, t.status === 'pending' && styles.pending)} onClick={() => openEditTransaction(t)}>
                  <span className={styles.cardTitle}>{t.title}</span>
                  <span className={cx(styles.cardAmount, t.kind === 'income' && styles.income)}>
                    {t.kind === 'income' ? formatCents(cents, { signed: true }) : formatCents(cents)}
                  </span>
                  <span className={styles.cardMeta}>
                    {formatDayShort(t.date)}
                    {by !== 'method' && method ? ` · ${method.name}` : ''}
                    {by === 'method' && cat ? ` · ${cat.emoji} ${cat.name}` : ''}
                  </span>
                </button>
              );
            })}
            {col.items.length > MAX_CARDS && <p className={styles.more}>e altre {(col.items.length - MAX_CARDS).toLocaleString('it-IT')}</p>}
            {col.items.length === 0 && <p className={styles.empty}>Nessuna transazione</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
