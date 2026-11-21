import { memo } from 'react';
import { openEditTransaction } from '../../app/editor';
import { formatCents, formatDayShort, formatMonth, spokenCents } from '../../core/format';
import { effectiveCents, type DayGroup } from '../../core/transactions';
import type { Category, PaymentMethod, Transaction } from '../../core/types';
import { SwipeRow, cx, tagStyle } from '../../ui/components';
import { deleteTransaction, restoreTransaction } from '../../db/repo';
import { showToast } from '../../ui/components';
import styles from './TransactionRow.module.css';

export interface Lookups {
  categories: Map<string, Category>;
  methods: Map<string, PaymentMethod>;
}

export async function deleteWithUndo(t: Transaction) {
  const deleted = await deleteTransaction(t.id);
  if (deleted) showToast('Eliminata', { icon: 'none', action: { label: 'Annulla', onClick: () => void restoreTransaction(deleted) } });
}

export const TransactionRow = memo(function TransactionRow({ t, lookups }: { t: Transaction; lookups: Lookups }) {
  const category = t.categoryId ? lookups.categories.get(t.categoryId) : undefined;
  const method = lookups.methods.get(t.paymentMethodId);
  const toMethod = t.toPaymentMethodId ? lookups.methods.get(t.toPaymentMethodId) : undefined;
  const cents = effectiveCents(t);

  const meta =
    t.kind === 'transfer'
      ? `${method?.name ?? '?'} → ${toMethod?.name ?? '?'}`
      : [category?.name ?? 'Senza categoria', method?.name].filter(Boolean).join(' · ');
  const accrual = t.accrualMonth !== t.date.slice(0, 7) ? ` · competenza ${formatMonth(t.accrualMonth)}` : '';
  const amount = t.kind === 'income' ? formatCents(cents, { signed: true }) : formatCents(cents);
  const label = `${t.title}, ${t.kind === 'income' ? 'entrata' : t.kind === 'transfer' ? 'trasferimento' : 'uscita'} di ${spokenCents(cents)}, ${meta}`;

  return (
    <SwipeRow
      actions={[
        { label: 'Modifica', tone: 'accent', onAction: () => openEditTransaction(t) },
        { label: 'Elimina', tone: 'destructive', onAction: () => void deleteWithUndo(t) },
      ]}
    >
      <button
        type="button"
        className={cx(styles.row, t.status === 'pending' && styles.pending)}
        onClick={() => openEditTransaction(t)}
        aria-label={label}
      >
        <span className={styles.emoji} style={category ? tagStyle(category.color) : undefined} aria-hidden="true">
          {t.kind === 'transfer' ? '⇄' : (category?.emoji ?? '•')}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{t.title}</span>
          <span className={styles.meta}>
            {meta}
            {accrual}
            {t.split ? ' · condivisa' : ''}
          </span>
        </span>
        <span className={cx(styles.amount, t.kind === 'income' && styles.income, t.kind === 'transfer' && styles.transfer)} aria-hidden="true">
          {amount}
        </span>
      </button>
    </SwipeRow>
  );
});

export function DayHeader({ group, todayISO, yesterdayISO }: { group: DayGroup; todayISO: string; yesterdayISO: string }) {
  const name = group.date === todayISO ? 'Oggi' : group.date === yesterdayISO ? 'Ieri' : formatDayShort(group.date);
  return (
    <div className={styles.dayHeader}>
      <span>{name}</span>
      <span className={styles.dayTotal}>
        {group.spentCents > 0 && formatCents(group.spentCents)}
        {group.incomeCents > 0 && `${group.spentCents > 0 ? ' · ' : ''}${formatCents(group.incomeCents, { signed: true })}`}
      </span>
    </div>
  );
}

/** Header of a group in the list view (day, month, category…), with the group's totals. */
export function GroupHeader({ label, emoji, spentCents, incomeCents, count }: { label: string; emoji?: string | undefined; spentCents: number; incomeCents: number; count: number }) {
  return (
    <div className={styles.dayHeader}>
      <span>
        {emoji !== undefined && <span aria-hidden="true">{emoji} </span>}
        {label}
        <span className={styles.groupCount}> · {count}</span>
      </span>
      <span className={styles.dayTotal}>
        {spentCents > 0 && formatCents(spentCents)}
        {incomeCents > 0 && `${spentCents > 0 ? ' · ' : ''}${formatCents(incomeCents, { signed: true })}`}
      </span>
    </div>
  );
}
