import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { openNewTransaction } from '../../app/editor';
import { addDays, today } from '../../core/dates';
import { formatCents } from '../../core/format';
import { groupByDay, summarize, type DayGroup } from '../../core/transactions';
import type { Transaction } from '../../core/types';
import { useTransactions } from '../../db/hooks';
import { Button, EmptyState, Page } from '../../ui/components';
import { DayHeader, TransactionRow } from './TransactionRow';
import { useLookups } from './useLookups';

type Item = { type: 'header'; group: DayGroup } | { type: 'row'; t: Transaction };

export function TransactionsPage() {
  const transactions = useTransactions();
  const lookups = useLookups();
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const group of groupByDay(transactions ?? [])) {
      out.push({ type: 'header', group });
      for (const t of group.items) out.push({ type: 'row', t });
    }
    return out;
  }, [transactions]);
  const summary = useMemo(() => summarize(transactions ?? []), [transactions]);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer state is read during render by design
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === 'header' ? 48 : 60),
    getItemKey: (i) => {
      const item = items[i];
      return item?.type === 'header' ? `h-${item.group.date}` : (item?.t.id ?? i);
    },
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const todayISO = today();
  const yesterdayISO = addDays(todayISO, -1);
  const empty = transactions !== undefined && transactions.length === 0;

  return (
    <Page
      title="Transazioni"
      scrollRef={scrollRef}
      footer={
        empty || !transactions ? undefined : (
          <>
            <span>
              {summary.count} {summary.count === 1 ? 'transazione' : 'transazioni'}
            </span>
            <span>
              Uscite {formatCents(summary.spentCents)} · Entrate {formatCents(summary.incomeCents)}
            </span>
          </>
        )
      }
    >
      {empty && (
        <EmptyState
          emoji="🗂️"
          title="Ancora nessuna transazione"
          action={
            <Button variant="secondary" onClick={openNewTransaction}>
              Aggiungi la prima
            </Button>
          }
        >
          Tocca ＋ per registrare una spesa in pochi secondi, oppure carica i dati di esempio dalle Impostazioni.
        </EmptyState>
      )}
      {lookups && (
        <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            if (!item) return null;
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {item.type === 'header' ? (
                  <DayHeader group={item.group} todayISO={todayISO} yesterdayISO={yesterdayISO} />
                ) : (
                  <TransactionRow t={item.t} lookups={lookups} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
