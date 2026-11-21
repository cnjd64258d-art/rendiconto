import { useMemo } from 'react';
import {
  BASIS_LABELS,
  breakdown,
  inPeriod,
  monthPeriod,
  monthlySeries,
  normalizePeriod,
  totalsOf,
  yearOverYear,
  yearPeriod,
  yearsWithData,
  type Basis,
  type GroupAmount,
  type Period,
} from '../../core/analysis';
import { addMonths, isYearMonth, monthOf, today, yearOf } from '../../core/dates';
import { capitalize, formatCents, formatCentsCompact, formatMonth, formatPercent } from '../../core/format';
import { insights } from '../../core/insights';
import type { Category, CategoryGroup } from '../../core/types';
import { useCategories, useCategoryGroups, useRecurringRules, useTransactions } from '../../db/hooks';
import { EmptyState, IconButton, Page, SegmentedControl, cx } from '../../ui/components';
import { BarList, MonthlyChart, SavingsLine, type BarItem } from './Charts';
import { setAnalysis, useAnalysis, type PeriodMode } from './analysisState';
import styles from './AnalysisPage.module.css';

const YOY_YEARS = 4;

export default function AnalysisPage() {
  const transactions = useTransactions();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const rules = useRecurringRules();
  const state = useAnalysis();
  const todayISO = today();
  const currentMonth = monthOf(todayISO);

  const period: Period = state.mode === 'month' ? monthPeriod(state.month) : state.mode === 'year' ? yearPeriod(state.year) : normalizePeriod({ from: state.from, to: state.to });
  const reviewYear = state.mode === 'year' ? state.year : yearOf(period.to);
  const chartPeriod: Period = state.mode === 'month' ? { from: addMonths(state.month, -11), to: state.month } : period;

  const data = useMemo(() => {
    if (!transactions || !categories || !groups || !rules) return null;
    const rows = inPeriod(transactions, period, state.basis);
    const years = yearsWithData(transactions, state.basis).filter((y) => y <= reviewYear).slice(-YOY_YEARS);
    const upTo = reviewYear === yearOf(currentMonth) ? Number(currentMonth.slice(5, 7)) : 12;
    return {
      totals: totalsOf(rows),
      count: rows.length,
      series: monthlySeries(transactions, chartPeriod, state.basis),
      expenses: breakdown(rows, 'expense', { categories }),
      income: breakdown(rows, 'income', { categories }),
      insights: insights({
        transactions,
        rules,
        categories,
        groups,
        basis: state.basis,
        month: period.to > currentMonth ? currentMonth : period.to,
        today: todayISO,
      }),
      yoy: years.length >= 2 ? { ...yearOverYear(transactions, years, state.basis, { categories }, upTo), partial: upTo < 12 } : null,
    };
    // period/chartPeriod are derived from state; listing their parts keeps the memo stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categories, groups, rules, state, reviewYear, currentMonth, todayISO]);

  const stepper =
    state.mode === 'custom' ? (
      <div className={styles.custom}>
        <label>
          <span>Da</span>
          <input type="month" value={state.from} max={state.to} onChange={(e) => isYearMonth(e.target.value) && setAnalysis({ from: e.target.value })} />
        </label>
        <label>
          <span>A</span>
          <input type="month" value={state.to} min={state.from} onChange={(e) => isYearMonth(e.target.value) && setAnalysis({ to: e.target.value })} />
        </label>
      </div>
    ) : (
      <div className={styles.stepper}>
        <IconButton label={state.mode === 'month' ? 'Mese precedente' : 'Anno precedente'} onClick={() => (state.mode === 'month' ? setAnalysis({ month: addMonths(state.month, -1) }) : setAnalysis({ year: state.year - 1 }))}>
          <Chevron dir="left" />
        </IconButton>
        <span className={styles.stepperLabel}>{state.mode === 'month' ? capitalize(formatMonth(state.month)) : state.year}</span>
        <IconButton label={state.mode === 'month' ? 'Mese successivo' : 'Anno successivo'} onClick={() => (state.mode === 'month' ? setAnalysis({ month: addMonths(state.month, 1) }) : setAnalysis({ year: state.year + 1 }))}>
          <Chevron dir="right" />
        </IconButton>
      </div>
    );

  return (
    <Page title="Analisi" grouped>
      <div className={styles.controls}>
        <SegmentedControl<PeriodMode>
          label="Periodo"
          value={state.mode}
          onChange={(mode) => setAnalysis({ mode })}
          options={[
            { value: 'month', label: 'Mese' },
            { value: 'year', label: 'Anno' },
            { value: 'custom', label: 'Personalizzato' },
          ]}
        />
        {stepper}
        <SegmentedControl<Basis>
          label="Calcola per"
          value={state.basis}
          onChange={(basis) => setAnalysis({ basis })}
          options={[
            { value: 'accrual', label: BASIS_LABELS.accrual },
            { value: 'payment', label: 'Pagamento' },
          ]}
        />
      </div>

      <a className={styles.review} href={`#/analisi/anno/${reviewYear}`}>
        <span className={styles.reviewEmoji} aria-hidden="true">
          📄
        </span>
        <span className={styles.reviewText}>
          <span className={styles.reviewTitle}>Tira una linea {reviewYear}</span>
          <span className={styles.reviewSub}>Il rendiconto dell'anno, da stampare in PDF</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </a>

      {data && data.count === 0 && (
        <EmptyState emoji="📊" title="Nessun movimento nel periodo">
          Cambia periodo, oppure registra o importa le tue spese.
        </EmptyState>
      )}

      {data && data.count > 0 && categories && groups && (
        <>
          <section className={styles.kpis} aria-label="Totali del periodo">
            <Kpi label="Entrate" value={formatCents(data.totals.incomeCents, { decimals: false })} />
            <Kpi label="Uscite" value={formatCents(data.totals.expenseCents, { decimals: false })} />
            <Kpi
              label={data.totals.savingsCents >= 0 ? 'Risparmio' : 'Disavanzo'}
              value={formatCents(Math.abs(data.totals.savingsCents), { decimals: false })}
              tone={data.totals.savingsCents >= 0 ? 'positive' : 'negative'}
            />
            <Kpi label="Tasso di risparmio" value={data.totals.savingsRate === null ? '—' : formatPercent(data.totals.savingsRate)} />
          </section>

          {data.insights.length > 0 && (
            <section className={styles.card} aria-label="In breve">
              <h2 className={styles.cardTitle}>In breve</h2>
              <ul className={styles.insights}>
                {data.insights.map((i) => (
                  <li key={i.id} className={cx(styles.insight, i.tone === 'warning' && styles.insightWarning, i.tone === 'positive' && styles.insightPositive)}>
                    <span aria-hidden="true">{i.emoji}</span>
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.card}>
            <MonthlyChart points={data.series} title={state.mode === 'month' ? 'Entrate e uscite, ultimi 12 mesi' : 'Entrate e uscite per mese'} />
          </section>

          {data.series.length > 1 && (
            <section className={styles.card}>
              <SavingsLine points={data.series} title={state.mode === 'month' ? 'Risparmio cumulato, ultimi 12 mesi' : 'Risparmio cumulato'} />
            </section>
          )}

          {data.expenses.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Uscite per macro-voce</h2>
              <p className={styles.cardHint}>Tocca una macro-voce per vedere le categorie.</p>
              <BarList items={toBars(data.expenses, categories, groups)} tone="expense" label="Uscite per macro-voce" />
            </section>
          )}

          {data.income.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Entrate per voce</h2>
              <BarList items={toBars(data.income, categories, groups).flatMap((g) => g.children ?? [g])} tone="income" label="Entrate per voce" />
            </section>
          )}

          {data.yoy && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Anno su anno</h2>
              <p className={styles.cardHint}>
                Uscite per macro-voce{data.yoy.partial ? `, da gennaio a ${formatMonth(currentMonth, false)} di ogni anno` : ''}. La variazione è{' '}
                {data.yoy.years.at(-1)} contro {data.yoy.years.at(-2)}.
              </p>
              <div className={styles.yoyScroll}>
                <table className={styles.yoy}>
                  <thead>
                    <tr>
                      <th scope="col">Voce</th>
                      {data.yoy.years.map((y) => (
                        <th key={y} scope="col">
                          {y}
                        </th>
                      ))}
                      <th scope="col">Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.yoy.groups.map((g) => (
                      <tr key={g.id}>
                        <th scope="row">{groups.find((x) => x.id === g.id)?.name ?? 'Altro'}</th>
                        {g.values.map((v, i) => (
                          <td key={i}>{formatCentsCompact(v)}</td>
                        ))}
                        <Delta cents={g.deltaCents} ratio={g.deltaRatio} />
                      </tr>
                    ))}
                    <tr className={styles.yoyTotal}>
                      <th scope="row">Totale</th>
                      {data.yoy.total.values.map((v, i) => (
                        <td key={i}>{formatCentsCompact(v)}</td>
                      ))}
                      <Delta cents={data.yoy.total.deltaCents} ratio={data.yoy.total.deltaRatio} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className={styles.footnote}>
            Calcolato per {state.basis === 'accrual' ? 'mese di competenza' : 'data di pagamento'}, solo movimenti confermati. Per le spese condivise conta la tua quota.
          </p>
        </>
      )}
    </Page>
  );
}

function Delta({ cents, ratio }: { cents: number; ratio: number | null }) {
  // Spending less is good: the colour says so, the sign says the direction.
  const tone = cents > 0 ? styles.up : cents < 0 ? styles.down : undefined;
  return (
    <td className={tone} aria-label={`${cents > 0 ? 'più' : cents < 0 ? 'meno' : 'uguale'} ${formatCents(Math.abs(cents), { decimals: false })}${ratio !== null ? `, ${formatPercent(Math.abs(ratio))}` : ''}`}>
      <span className={styles.deltaMain}>{ratio === null ? '—' : `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${formatPercent(Math.abs(ratio))}`}</span>
      <span className={styles.deltaSub}>{formatCents(cents, { decimals: false, signed: true })}</span>
    </td>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={cx(styles.kpiValue, tone === 'positive' && styles.positive, tone === 'negative' && styles.negativeText)}>{value}</div>
    </div>
  );
}

function toBars(list: GroupAmount[], categories: Category[], groups: CategoryGroup[]): BarItem[] {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const grp = new Map(groups.map((g) => [g.id, g]));
  return list.map((g) => ({
    id: g.groupId,
    label: grp.get(g.groupId)?.name ?? 'Senza macro-voce',
    cents: g.cents,
    share: g.share,
    children: g.categories.map((c) => {
      const category = cat.get(c.categoryId);
      return {
        id: c.categoryId,
        label: `${category?.emoji ?? '•'} ${category?.name ?? 'Senza categoria'}`,
        cents: c.cents,
        share: c.share * g.share,
      };
    }),
  }));
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 2 2 10l8 8' : 'M2 2l8 8-8 8'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
