import { useMemo } from 'react';
import { openEditTransaction, openNewTransaction } from '../../app/editor';
import { backupReminder } from '../../core/backup/backup';
import { addDays, today } from '../../core/dates';
import { capitalize, formatCents, formatDayLong, formatDayShort, formatMonth, spokenCents } from '../../core/format';
import { monthOverview } from '../../core/month';
import { kindResolver, upcoming } from '../../core/recurring';
import { groupByDay } from '../../core/transactions';
import type { Transaction } from '../../core/types';
import { useBudgets, useCategories, useCategoryGroups, useMeta, useRecurringRules, useTransactions } from '../../db/hooks';
import { confirmPending } from '../../db/recurring';
import { META_LAST_BACKUP } from '../../db/repo';
import { AnimatedAmount, Banner, Button, EmptyState, IconButton, ListGroup, Page, ProgressBar, cx, showToast } from '../../ui/components';
import { GearIcon } from '../../ui/components/icons';
import { DayHeader, TransactionRow, type Lookups } from '../transactions/TransactionRow';
import { useLookups } from '../transactions/useLookups';
import styles from './TodayPage.module.css';

const RECENT_DAYS = 7;
const UPCOMING_DAYS = 7;

export function TodayPage() {
  const transactions = useTransactions();
  const rules = useRecurringRules();
  const budgets = useBudgets();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const lookups = useLookups();
  const lastBackup = useMeta<string>(META_LAST_BACKUP);
  const todayISO = today();

  const kindOf = useMemo(() => kindResolver(categories ?? [], groups ?? []), [categories, groups]);

  const overview = useMemo(
    () =>
      transactions && rules && budgets && categories
        ? monthOverview({ transactions, rules, budgets, categories, kindOf, today: todayISO })
        : null,
    [transactions, rules, budgets, categories, kindOf, todayISO],
  );

  const pending = useMemo(
    () => (transactions ?? []).filter((t) => t.status === 'pending' && t.date <= todayISO).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [transactions, todayISO],
  );
  const next = useMemo(() => upcoming(rules ?? [], todayISO, UPCOMING_DAYS, kindOf), [rules, todayISO, kindOf]);

  const recent = useMemo(() => {
    const from = addDays(todayISO, -(RECENT_DAYS - 1));
    return groupByDay((transactions ?? []).filter((t) => t.status === 'confirmed' && t.date >= from && t.date <= todayISO));
  }, [transactions, todayISO]);

  const reminder = backupReminder(lastBackup ?? null, transactions?.length ?? 0);
  const empty = transactions !== undefined && transactions.length === 0 && (rules?.length ?? 0) === 0;

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
        <Banner icon="💾" tone="warning" action={{ label: 'Backup', onClick: () => (window.location.hash = '/impostazioni/backup') }}>
          {reminder.daysAgo === null ? 'Non hai ancora fatto un backup' : `L'ultimo backup è di ${reminder.daysAgo} giorni fa`}
        </Banner>
      )}

      {empty && (
        <EmptyState
          emoji="🌱"
          title="Benvenuto in Rendiconto"
          action={
            <Button variant="secondary" onClick={openNewTransaction}>
              Registra la prima spesa
            </Button>
          }
        >
          Qui vedrai il riepilogo del mese, le spese fisse in arrivo e gli ultimi movimenti. Puoi anche importare il tuo
          storico da Impostazioni → Importa CSV.
        </EmptyState>
      )}

      {overview && !empty && (
        <section className={styles.hero} aria-label="Questo mese">
          <div className={styles.heroLabel}>Speso a {formatMonth(overview.month).split(' ')[0]}</div>
          <AnimatedAmount cents={overview.spentCents} className={styles.heroAmount} />
          {overview.budgetCents !== null ? (
            <>
              <div className={styles.heroBudget}>di {formatCents(overview.budgetCents, { decimals: false })} di budget</div>
              <ProgressBar value={overview.budgetRatio} label="Budget del mese usato" />
              <p className={cx(styles.perDay, overview.perDayCents === 0 && styles.perDayOver)}>
                {overview.perDayCents === 0 ? (
                  <>Budget esaurito, considerando le spese fisse ancora da pagare.</>
                ) : (
                  <>
                    Puoi spendere ancora <strong>{formatCents(overview.perDayCents ?? 0)}</strong> al giorno
                    {overview.daysLeft === 1 ? ' (ultimo giorno del mese)' : ` per ${overview.daysLeft} giorni`}.
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={styles.perDay}>
              Senza budget per ora: quando lo imposterai (milestone Budget) qui vedrai quanto puoi spendere al giorno.
            </p>
          )}

          <dl className={styles.stats}>
            <Stat label="Entrate" cents={overview.incomeCents} />
            <Stat label="Uscite" cents={overview.spentCents} />
            <Stat label="Saldo" cents={overview.balanceCents} signed />
          </dl>
          <p className={styles.projection}>
            Proiezione a fine mese:{' '}
            <strong className={overview.projectedSavingsCents < 0 ? styles.negative : styles.positive}>
              {overview.projectedSavingsCents < 0 ? 'mancano ' : 'risparmi '}
              {formatCents(Math.abs(overview.projectedSavingsCents), { decimals: false })}
            </strong>
            <span className={styles.projectionHint}>
              {' '}
              con le spese fisse ancora da pagare ({formatCents(overview.dueExpenseCents, { decimals: false })}) e il ritmo
              attuale delle spese quotidiane.
            </span>
          </p>
        </section>
      )}

      {lookups && pending.length > 0 && <PendingList items={pending} lookups={lookups} />}

      {lookups && next.length > 0 && (
        <ListGroup header={`In arrivo nei prossimi ${UPCOMING_DAYS} giorni`}>
          {next.map((u) => {
            const cat = lookups.categories.get(u.rule.categoryId);
            const amount = `${u.rule.isEstimate ? '≈ ' : ''}${u.kind === 'income' ? formatCents(u.rule.amountCents, { signed: true }) : formatCents(u.rule.amountCents)}`;
            return (
              <li key={`${u.rule.id}-${u.date}`} className={styles.upcoming}>
                <span className={styles.upEmoji} aria-hidden="true">
                  {cat?.emoji ?? '🔁'}
                </span>
                <span className={styles.upText}>
                  <span className={styles.upTitle}>{u.rule.title}</span>
                  <span className={styles.upMeta}>{u.date === addDays(todayISO, 1) ? 'Domani' : capitalize(formatDayShort(u.date))}</span>
                </span>
                <span className={cx(styles.upAmount, u.kind === 'income' && styles.positive)}>{amount}</span>
              </li>
            );
          })}
        </ListGroup>
      )}

      {lookups && recent.length > 0 && (
        <section aria-label="Ultimi 7 giorni" className={styles.recent}>
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

      {!empty && transactions !== undefined && recent.length === 0 && (
        <EmptyState emoji="☕️" title="Niente negli ultimi 7 giorni">
          <a href="#/transazioni">Vedi tutte le transazioni</a>
        </EmptyState>
      )}
    </Page>
  );
}

function Stat({ label, cents, signed = false }: { label: string; cents: number; signed?: boolean }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd aria-label={`${label}: ${spokenCents(cents)}`}>
        <AnimatedAmount cents={cents} decimals={false} signed={signed} />
      </dd>
    </div>
  );
}

function PendingList({ items, lookups }: { items: Transaction[]; lookups: Lookups }) {
  return (
    <ListGroup header="Da confermare" footer="Tocca una voce per correggere l'importo prima di confermarla (utile per Telepass e bollette).">
      {items.map((t) => {
        const cat = t.categoryId ? lookups.categories.get(t.categoryId) : undefined;
        return (
          <li key={t.id} className={styles.pending}>
            <button type="button" className={styles.pendingMain} onClick={() => openEditTransaction(t)} aria-label={`Modifica ${t.title}`}>
              <span className={styles.upEmoji} aria-hidden="true">
                {cat?.emoji ?? '🔁'}
              </span>
              <span className={styles.upText}>
                <span className={styles.upTitle}>{t.title}</span>
                <span className={styles.upMeta}>{capitalize(formatDayShort(t.date))}</span>
              </span>
              <span className={cx(styles.upAmount, t.kind === 'income' && styles.positive)}>
                {t.kind === 'income' ? formatCents(t.amountCents, { signed: true }) : formatCents(t.amountCents)}
              </span>
            </button>
            <button
              type="button"
              className={styles.confirm}
              aria-label={`Conferma ${t.title}`}
              onClick={async () => {
                await confirmPending(t.id);
                showToast('Confermata');
              }}
            >
              Conferma
            </button>
          </li>
        );
      })}
    </ListGroup>
  );
}
