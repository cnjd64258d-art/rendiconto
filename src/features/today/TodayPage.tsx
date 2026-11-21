import { useMemo } from 'react';
import { openNewTransaction } from '../../app/editor';
import { backupReminder } from '../../core/backup/backup';
import { addDays, today } from '../../core/dates';
import { capitalize, formatDayLong } from '../../core/format';
import { groupByDay } from '../../core/transactions';
import { useMeta, useTransactions } from '../../db/hooks';
import { META_LAST_BACKUP } from '../../db/repo';
import { Banner, Button, EmptyState, IconButton, Page } from '../../ui/components';
import { GearIcon } from '../../ui/components/icons';
import { DayHeader, TransactionRow } from '../transactions/TransactionRow';
import { useLookups } from '../transactions/useLookups';
import styles from './TodayPage.module.css';

const RECENT_DAYS = 7;

export function TodayPage() {
  const transactions = useTransactions();
  const lookups = useLookups();
  const lastBackup = useMeta<string>(META_LAST_BACKUP);
  const todayISO = today();

  const recent = useMemo(() => {
    const from = addDays(todayISO, -(RECENT_DAYS - 1));
    return groupByDay((transactions ?? []).filter((t) => t.date >= from && t.date <= todayISO));
  }, [transactions, todayISO]);

  const reminder = backupReminder(lastBackup ?? null, transactions?.length ?? 0);

  return (
    <Page
      title="Oggi"
      subtitle={capitalize(formatDayLong(todayISO))}
      trailing={
        <IconButton label="Impostazioni" href="#/impostazioni">
          <GearIcon />
        </IconButton>
      }
    >
      {reminder.due && lastBackup !== undefined && (
        <Banner
          icon="💾"
          tone="warning"
          action={{ label: 'Backup', onClick: () => (window.location.hash = '/impostazioni/backup') }}
        >
          {reminder.daysAgo === null ? 'Non hai ancora fatto un backup' : `L'ultimo backup è di ${reminder.daysAgo} giorni fa`}
        </Banner>
      )}

      {transactions !== undefined && transactions.length === 0 && (
        <EmptyState
          emoji="🌱"
          title="Benvenuto in Rendiconto"
          action={
            <Button variant="secondary" onClick={openNewTransaction}>
              Registra la prima spesa
            </Button>
          }
        >
          Qui vedrai le spese degli ultimi giorni. Il riepilogo del mese e le spese fisse in arrivo arrivano con la
          milestone 4.
        </EmptyState>
      )}

      {lookups && recent.length > 0 && (
        <section aria-label="Ultimi 7 giorni">
          {recent.map((group) => (
            <div key={group.date}>
              <DayHeader group={group} todayISO={todayISO} yesterdayISO={addDays(todayISO, -1)} />
              {group.items.map((t) => (
                <TransactionRow key={t.id} t={t} lookups={lookups} />
              ))}
            </div>
          ))}
          <a className={styles.more} href="#/transazioni">
            Tutte le transazioni
          </a>
        </section>
      )}

      {transactions !== undefined && transactions.length > 0 && recent.length === 0 && (
        <EmptyState emoji="☕️" title="Niente negli ultimi 7 giorni">
          <a href="#/transazioni">Vedi tutte le transazioni</a>
        </EmptyState>
      )}
    </Page>
  );
}
