import { useMemo } from 'react';
import { openEditTransaction, openNewTransaction } from '../../app/editor';
import { backupReminder } from '../../core/backup/backup';
import { alertSummary, budgetMonth, spendIndex, type AlertSummary, type BudgetLine } from '../../core/budget';
import { addDays, monthOf, today } from '../../core/dates';
import { capitalize, formatCents, formatDayLong, formatDayShort, formatMonth, formatPercent, spokenCents } from '../../core/format';
import { monthOverview } from '../../core/month';
import { kindResolver, upcoming } from '../../core/recurring';
import { groupByDay } from '../../core/transactions';
import { suggestedReviewYear } from '../../core/yearReview';
import type { Transaction } from '../../core/types';
import { balances } from '../../core/split';
import { useBudgets, useCategories, useCategoryGroups, useMeta, usePeople, useRecurringRules, useSettlements, useTransactions } from '../../db/hooks';
import { balanceText } from '../settings/SharedPage';
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
  const people = usePeople();
  const settlements = useSettlements();
  const lastBackup = useMeta<string>(META_LAST_BACKUP);
  const todayISO = today();

  const kindOf = useMemo(() => kindResolver(categories ?? [], groups ?? []), [categories, groups]);

  const index = useMemo(() => spendIndex(transactions ?? []), [transactions]);
  const overview = useMemo(
    () =>
      transactions && rules && budgets && categories
        ? monthOverview({ transactions, rules, budgets, categories, kindOf, today: todayISO, index })
        : null,
    [transactions, rules, budgets, categories, kindOf, todayISO, index],
  );
  const alerts = useMemo(
    () =>
      transactions && budgets && categories
        ? alertSummary(budgetMonth({ budgets, transactions, categories, groups: [], month: monthOf(todayISO), index }).lines)
        : null,
    [transactions, budgets, categories, todayISO, index],
  );

  const pending = useMemo(
    () => (transactions ?? []).filter((t) => t.status === 'pending' && t.date <= todayISO).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [transactions, todayISO],
  );
  const open = useMemo(
    () => (people && settlements ? balances(transactions ?? [], settlements, people).filter((b) => b.netCents !== 0) : []),
    [transactions, settlements, people],
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

      {alerts && lookups && (
        <Banner icon={alerts.tone === 'over' ? '🚨' : '⚠️'} tone={alerts.tone === 'over' ? 'negative' : 'warning'} action={{ label: 'Budget', onClick: () => (window.location.hash = '/budget') }}>
          {alertText(alerts, (l) => (l.scope === 'group' ? groups?.find((g) => g.id === l.targetId)?.name : lookups.categories.get(l.targetId)?.name) ?? 'Budget')}
        </Banner>
      )}

      {empty && (
        <EmptyState
          emoji="🌱"
          title="Benvenuto in Ledgerline"
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
          {overview.budget !== null ? (
            <>
              <div className={styles.heroBudget}>
                {overview.budget.spentCents === overview.spentCents
                  ? `di ${formatCents(overview.budget.availableCents, { decimals: false })} di budget`
                  : `${formatCents(overview.budget.spentCents, { decimals: false })} di ${formatCents(overview.budget.availableCents, { decimals: false })} nelle categorie con budget`}
              </div>
              <ProgressBar value={overview.budget.ratio} label="Budget del mese usato" />
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
              <a href="#/budget">Imposta un budget</a> per vedere quanto puoi spendere ancora al giorno.
            </p>
          )}

          <dl className={styles.stats}>
            <Stat label="Entrate" cents={overview.incomeCents} tone={styles.statIncome} />
            <Stat label="Uscite" cents={overview.spentCents} tone={styles.statExpense} />
            <Stat label="Saldo" cents={overview.balanceCents} signed tone={overview.balanceCents < 0 ? styles.statNegative : styles.statPositive} />
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

      {!empty && suggestedReviewYear(todayISO) !== null && (
        <a className={styles.reviewCard} href={`#/analisi/anno/${suggestedReviewYear(todayISO)}`}>
          <span aria-hidden="true">📄</span>
          <span>
            <strong>Tira una linea {suggestedReviewYear(todayISO)}</strong>
            <span className={styles.reviewSub}>Quanto hai speso, dove, e quanto hai risparmiato</span>
          </span>
          <span className={styles.reviewChevron} aria-hidden="true">
            ›
          </span>
        </a>
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

      {people && open.length > 0 && (
        <ListGroup header="Conti in sospeso">
          {open.slice(0, 5).map((b) => (
            <li key={b.personId} className={styles.upcoming}>
              <a className={styles.upLink} href="#/impostazioni/condivise">
                <span className={styles.upEmoji} aria-hidden="true">
                  👥
                </span>
                <span className={styles.upText}>
                  <span className={styles.upTitle}>{balanceText(people.find((p) => p.id === b.personId)?.name ?? '?', b.netCents)}</span>
                  <span className={styles.upMeta}>
                    {pluralOpen(b.items.filter((i) => i.status !== 'settled').length)}
                  </span>
                </span>
                <span className={cx(styles.upAmount, b.netCents > 0 && styles.positive)}>{formatCents(Math.abs(b.netCents))}</span>
              </a>
            </li>
          ))}
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

function alertText(alerts: AlertSummary, nameOf: (l: BudgetLine) => string): string {
  const [first] = alerts.lines;
  if (!first) return '';
  if (alerts.lines.length === 1) {
    return first.status === 'over'
      ? `${nameOf(first)}: budget sforato di ${formatCents(-first.remainingCents, { decimals: false })}`
      : `${nameOf(first)}: hai usato il ${formatPercent(first.ratio)} del budget`;
  }
  const over = alerts.lines.filter((l) => l.status === 'over').length;
  const names = alerts.lines.slice(0, 3).map(nameOf).join(', ') + (alerts.lines.length > 3 ? '…' : '');
  return over > 0 ? `${alerts.lines.length} budget da tenere d'occhio (${over} sforati): ${names}` : `${alerts.lines.length} budget oltre l'80%: ${names}`;
}

function Stat({ label, cents, signed = false, tone }: { label: string; cents: number; signed?: boolean; tone?: string | undefined }) {
  return (
    <div className={cx(styles.stat, tone)}>
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

function pluralOpen(n: number): string {
  return n === 1 ? '1 spesa da saldare' : `${n} spese da saldare`;
}
