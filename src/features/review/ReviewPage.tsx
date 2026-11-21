import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { shareOrDownload } from '../../app/share';
import { formatCents, formatDayShort, formatMonth, formatPercent, capitalize } from '../../core/format';
import { today } from '../../core/dates';
import { effectiveCents } from '../../core/transactions';
import { reviewCsv, yearReview } from '../../core/yearReview';
import { useCategories, useCategoryGroups, useTransactions, useYearNote } from '../../db/hooks';
import { saveYearNote } from '../../db/yearNotes';
import { BackLink, Button, EmptyState, IconButton, Page, cx, showToast } from '../../ui/components';
import { MonthlyChart } from '../analysis/Charts';
import { setAnalysis, useAnalysis } from '../analysis/analysisState';
import styles from './ReviewPage.module.css';

export default function ReviewPage({ year }: { year: number }) {
  const transactions = useTransactions();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const { basis } = useAnalysis();
  const todayISO = today();

  const review = useMemo(
    () => (transactions && categories ? yearReview({ transactions, categories, year, basis, today: todayISO }) : null),
    [transactions, categories, year, basis, todayISO],
  );

  const back = <BackLink href="#/analisi" label="Analisi" />;
  const yearNav = (
    <span className={styles.yearNav} data-noprint>
      <IconButton label="Anno precedente" href={`#/analisi/anno/${year - 1}`}>
        ‹
      </IconButton>
      <IconButton label="Anno successivo" href={`#/analisi/anno/${year + 1}`}>
        ›
      </IconButton>
    </span>
  );

  if (!review || !categories || !groups) return <Page title={`Rendiconto ${year}`} leading={back}>{null}</Page>;

  const cat = new Map(categories.map((c) => [c.id, c]));
  const grp = new Map(groups.map((g) => [g.id, g]));
  const empty = review.totals.incomeCents === 0 && review.totals.expenseCents === 0;

  const exportCsv = () => {
    // Built synchronously so Web Share still sees the tap.
    const csv = reviewCsv(review, categories, groups);
    const file = new File([csv], `rendiconto-${year}.csv`, { type: 'text/csv' });
    void shareOrDownload([file], `Rendiconto ${year}`).then((r) => r === 'downloaded' && showToast('CSV scaricato'));
  };

  return (
    <Page title={`Rendiconto ${year}`} subtitle={subtitle(review.inProgress, basis)} leading={back} trailing={yearNav}>
      <article className={styles.doc}>

        {empty ? (
          <EmptyState emoji="📭" title={`Nessun movimento nel ${year}`}>
            Cambia anno con le frecce in alto.
          </EmptyState>
        ) : (
          <>
            <dl className={styles.summary}>
              <Line label="Entrate" value={formatCents(review.totals.incomeCents)} />
              <Line label="Uscite" value={formatCents(review.totals.expenseCents)} />
              <Line
                strong
                label="Delta"
                value={
                  <>
                    <span className={review.totals.savingsCents >= 0 ? styles.positive : styles.negative}>
                      {formatCents(review.totals.savingsCents, { signed: true })}
                    </span>
                    {review.totals.savingsRate !== null && <span className={styles.muted}> · {formatPercent(review.totals.savingsRate)} delle entrate</span>}
                  </>
                }
              />
            </dl>

            {review.previous.length > 0 && (
              <Section title="Confronto con gli anni precedenti">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Anno</th>
                      <th scope="col">Entrate</th>
                      <th scope="col">Uscite</th>
                      <th scope="col">Delta</th>
                      <th scope="col">Tasso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[{ year, totals: review.totals }, ...review.previous].map((p) => (
                      <tr key={p.year} className={p.year === year ? styles.current : undefined}>
                        <th scope="row">{p.year}</th>
                        <td>{formatCents(p.totals.incomeCents, { decimals: false })}</td>
                        <td>{formatCents(p.totals.expenseCents, { decimals: false })}</td>
                        <td className={p.totals.savingsCents < 0 ? styles.negative : undefined}>{formatCents(p.totals.savingsCents, { decimals: false, signed: true })}</td>
                        <td>{p.totals.savingsRate === null ? '—' : formatPercent(p.totals.savingsRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {review.inProgress && <p className={styles.note}>Il {year} è ancora in corso: gli anni passati sono interi.</p>}
              </Section>
            )}

            {review.income.length > 0 && (
              <Section title="Entrate per voce">
                <table className={styles.table}>
                  <tbody>
                    {review.income.flatMap((g) =>
                      g.categories.map((c) => (
                        <tr key={c.categoryId}>
                          <th scope="row">
                            {cat.get(c.categoryId)?.emoji} {cat.get(c.categoryId)?.name ?? 'Senza categoria'}
                          </th>
                          <td>{formatCents(c.cents)}</td>
                          <td className={styles.share}>{formatPercent(c.share * g.share)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </Section>
            )}

            {review.expenses.length > 0 && (
              <Section title="Uscite per macro-voce">
                <table className={styles.table}>
                  <tbody>
                    {review.expenses.map((g) => [
                      <tr key={g.groupId} className={styles.groupRow}>
                        <th scope="row">{grp.get(g.groupId)?.name ?? 'Senza macro-voce'}</th>
                        <td>{formatCents(g.cents)}</td>
                        <td className={styles.share}>{formatPercent(g.share)}</td>
                      </tr>,
                      ...(g.categories.length > 1
                        ? g.categories.map((c) => (
                            <tr key={`${g.groupId}:${c.categoryId}`} className={styles.subRow}>
                              <th scope="row">
                                {cat.get(c.categoryId)?.emoji} {cat.get(c.categoryId)?.name ?? 'Senza categoria'}
                              </th>
                              <td>{formatCents(c.cents)}</td>
                              <td className={styles.share}>{formatPercent(c.share * g.share)}</td>
                            </tr>
                          ))
                        : []),
                    ])}
                  </tbody>
                </table>
              </Section>
            )}

            <Section title="In sintesi">
              <dl className={styles.facts}>
                {review.priciest && <Line label="Mese più caro" value={`${capitalize(formatMonth(review.priciest.month, false))} · ${formatCents(review.priciest.cents, { decimals: false })}`} />}
                {review.cheapest && <Line label="Mese più economico" value={`${capitalize(formatMonth(review.cheapest.month, false))} · ${formatCents(review.cheapest.cents, { decimals: false })}`} />}
                <Line label="Spesa media al giorno" value={`${formatCents(review.dailyAverageCents)}${review.inProgress ? ` (su ${review.days} giorni)` : ''}`} />
              </dl>
            </Section>

            <Section title="Mese per mese">
              <MonthlyChart points={review.months} title={`Entrate e uscite ${year}`} />
            </Section>

            {review.top.length > 0 && (
              <Section title={`Le ${review.top.length} spese più grandi`}>
                <ol className={styles.top}>
                  {review.top.map((t) => (
                    <li key={t.id}>
                      <span className={styles.topText}>
                        <span className={styles.topTitle}>
                          {(t.categoryId && cat.get(t.categoryId)?.emoji) ?? '•'} {t.title}
                        </span>
                        <span className={styles.topMeta}>{formatDayShort(t.date)}</span>
                      </span>
                      <span className={styles.topAmount}>{formatCents(effectiveCents(t))}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </>
        )}

        <Notes key={year} year={year} />

        <div className={styles.actions} data-noprint>
          <Button
            block
            onClick={() => {
              setAnalysis({ year });
              window.print();
            }}
          >
            Esporta PDF
          </Button>
          <Button block variant="secondary" onClick={exportCsv} disabled={empty}>
            Esporta CSV
          </Button>
          <p className={styles.note}>
            «Esporta PDF» apre la stampa di iOS: tocca Condividi (o allarga l'anteprima) e scegli «Salva su File».
          </p>
        </div>
      </article>
    </Page>
  );
}

function subtitle(inProgress: boolean, basis: 'accrual' | 'payment'): string {
  const b = basis === 'accrual' ? 'per mese di competenza' : 'per data di pagamento';
  return inProgress ? `Anno in corso, aggiornato a ${formatDayShort(today())}, ${b}` : `Anno intero, ${b}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cx(styles.line, strong && styles.lineStrong)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Free notes for the year ("riflessioni e obiettivi"), saved as you type. */
function Notes({ year }: { year: number }) {
  const stored = useYearNote(year);
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const value = text ?? stored ?? '';

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (next: string) => {
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveYearNote(year, next), 500);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>✍︎ Note e obiettivi per il {year + 1}</h2>
      <textarea
        className={styles.notes}
        value={value}
        placeholder="Riflessioni sull'anno, cose da cambiare, obiettivi…"
        rows={5}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          window.clearTimeout(timer.current);
          if (text !== null) void saveYearNote(year, text);
        }}
        aria-label={`Note e obiettivi per il ${year + 1}`}
      />
      <div className={styles.notesPrint}>{value || '—'}</div>
    </section>
  );
}
