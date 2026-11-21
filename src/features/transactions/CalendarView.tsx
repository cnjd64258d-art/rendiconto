import { useMemo, useState } from 'react';
import { addMonths } from '../../core/dates';
import { capitalize, formatCents, formatDayLong, formatMonth, spokenCents } from '../../core/format';
import { groupByDay } from '../../core/transactions';
import type { Transaction } from '../../core/types';
import { calendarMonth } from '../../core/views';
import { cx } from '../../ui/components';
import { TransactionRow, type Lookups } from './TransactionRow';
import styles from './CalendarView.module.css';

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Spending heatmap by payment date; tap a day to see its transactions. */
export function CalendarView({ transactions, lookups, initialMonth, todayISO }: { transactions: Transaction[]; lookups: Lookups; initialMonth: string; todayISO: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState<string | null>(null);
  const weeks = useMemo(() => calendarMonth(transactions, month), [transactions, month]);
  const monthTotal = weeks.flat().reduce((sum, d) => sum + d.spentCents, 0);
  const dayItems = useMemo(() => (selected ? (groupByDay(transactions.filter((t) => t.date === selected))[0]?.items ?? []) : []), [transactions, selected]);

  const go = (delta: number) => {
    setMonth((m) => addMonths(m, delta));
    setSelected(null);
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.nav}>
        <button type="button" className={styles.navButton} onClick={() => go(-1)} aria-label="Mese precedente">
          ‹
        </button>
        <div className={styles.navTitle}>
          <span>{capitalize(formatMonth(month))}</span>
          <span className={styles.navTotal}>{formatCents(monthTotal)} di uscite</span>
        </div>
        <button type="button" className={styles.navButton} onClick={() => go(1)} aria-label="Mese successivo">
          ›
        </button>
      </div>
      <div className={styles.grid} role="grid" aria-label={`Spese di ${formatMonth(month)}`}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} className={styles.weekday} aria-hidden="true">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) =>
          d.inMonth ? (
            <button
              key={d.date}
              type="button"
              role="gridcell"
              className={cx(styles.day, styles[`l${d.level}`], d.date === todayISO && styles.today, d.date === selected && styles.selected)}
              aria-label={`${formatDayLong(d.date)}: ${d.spentCents > 0 ? spokenCents(d.spentCents) : 'nessuna spesa'}`}
              aria-pressed={d.date === selected}
              onClick={() => setSelected(d.date === selected ? null : d.date)}
            >
              <span className={styles.dayNum}>{Number(d.date.slice(8))}</span>
              {d.spentCents > 0 && <span className={styles.dayAmount}>{formatCents(d.spentCents, { decimals: false }).replace(/\s?€/, '')}</span>}
            </button>
          ) : (
            <div key={d.date} className={styles.outside} aria-hidden="true" />
          ),
        )}
      </div>
      <div className={styles.legend} aria-hidden="true">
        Meno <span className={cx(styles.swatch, styles.l1)} />
        <span className={cx(styles.swatch, styles.l2)} />
        <span className={cx(styles.swatch, styles.l3)} />
        <span className={cx(styles.swatch, styles.l4)} /> Più
      </div>
      {selected && (
        <section aria-label={formatDayLong(selected)}>
          <h2 className={styles.dayTitle}>{capitalize(formatDayLong(selected))}</h2>
          {dayItems.length === 0 ? <p className={styles.none}>Nessuna transazione.</p> : dayItems.map((t) => <TransactionRow key={t.id} t={t} lookups={lookups} />)}
        </section>
      )}
    </div>
  );
}
