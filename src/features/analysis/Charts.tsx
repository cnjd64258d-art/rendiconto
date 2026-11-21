import { useId, useState, type ReactNode } from 'react';
import type { MonthPoint } from '../../core/analysis';
import { capitalize, formatCents, formatCentsCompact, formatMonth, formatMonthShort, formatPercent } from '../../core/format';
import { cx } from '../../ui/components';
import styles from './Charts.module.css';

const W = 340;
const PAD_L = 40;
const PAD_R = 6;
const PAD_T = 10;
const PAD_B = 22;

/** 1, 2, 2.5, 5 × 10^n steps so the axis reads in round numbers. */
function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

/** Bar with only the data end rounded (r=4 or less), anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  if (up) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

function monthLabel(m: string, multiYear: boolean, i: number, n: number): string {
  if (!multiYear) return n > 12 ? formatMonthShort(m).charAt(0) : formatMonthShort(m);
  return m.endsWith('-01') || i === 0 ? formatMonthShort(m, true) : '';
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className={styles.legend}>
      {items.map((i) => (
        <span key={i.label} className={styles.legendItem}>
          <span className={cx(styles.swatch, i.className)} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** "Andamento mensile entrate vs uscite": paired bars, tap a month for its numbers. */
export function MonthlyChart({ points, title }: { points: MonthPoint[]; title: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  const n = points.length;
  const H = 170;
  const plotH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...points.map((p) => Math.max(p.incomeCents, p.expenseCents)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;
  const slot = (W - PAD_L - PAD_R) / Math.max(1, n);
  const barW = Math.max(1.5, Math.min(12, (slot - 6) / 2));
  const multiYear = new Set(points.map((p) => p.month.slice(0, 4))).size > 1;
  const sel = selected !== null ? points[selected] : undefined;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.caption}>
        {title}
      </figcaption>
      <Legend
        items={[
          { label: 'Entrate', className: styles.income ?? '' },
          { label: 'Uscite', className: styles.expense ?? '' },
        ]}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${title}. Tocca un mese per i dettagli, o apri la tabella.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className={v === 0 ? styles.baseline : styles.grid} />
            <text x={PAD_L - 6} y={y(v) + 3.5} className={styles.axis} textAnchor="end">
              {formatCentsCompact(v)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x0 = PAD_L + i * slot + (slot - (barW * 2 + 2)) / 2;
          const dim = selected !== null && selected !== i;
          return (
            <g key={p.month} className={cx(styles.slot, dim && styles.dim)}>
              {selected === i && <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} className={styles.highlight} />}
              <path d={barPath(x0, y(p.incomeCents), barW, y(0) - y(p.incomeCents), true)} className={styles.income} />
              <path d={barPath(x0 + barW + 2, y(p.expenseCents), barW, y(0) - y(p.expenseCents), true)} className={styles.expense} />
              <text x={PAD_L + i * slot + slot / 2} y={H - 6} className={styles.axis} textAnchor="middle">
                {monthLabel(p.month, multiYear, i, n)}
              </text>
              {/* Hit target: the whole column, taller than the bars. */}
              <rect
                x={PAD_L + i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onClick={() => setSelected(selected === i ? null : i)}
              />
            </g>
          );
        })}
      </svg>
      <p className={styles.detail} aria-live="polite" data-noprint={sel ? undefined : true}>
        {sel ? (
          <>
            <strong>{capitalize(formatMonth(sel.month))}</strong>: entrate {formatCents(sel.incomeCents, { decimals: false })}, uscite{' '}
            {formatCents(sel.expenseCents, { decimals: false })}, {sel.savingsCents >= 0 ? 'risparmio' : 'disavanzo'}{' '}
            {formatCents(Math.abs(sel.savingsCents), { decimals: false })}
            {sel.savingsRate !== null && sel.savingsCents >= 0 ? ` (${formatPercent(sel.savingsRate)})` : ''}
          </>
        ) : (
          'Tocca un mese per vedere i numeri.'
        )}
      </p>
      <DataTable points={points} />
    </figure>
  );
}

/** Cumulative savings over the period (one series, one axis). */
export function SavingsLine({ points, title }: { points: MonthPoint[]; title: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  const n = points.length;
  const H = 130;
  const plotH = H - PAD_T - PAD_B;
  const values = points.map((p) => p.cumulativeSavingsCents);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const step = niceStep(Math.max(1, hi - lo), 3);
  const top = Math.ceil(hi / step) * step;
  const bottom = Math.floor(lo / step) * step;
  const span = Math.max(1, top - bottom);
  const y = (v: number) => PAD_T + plotH - ((v - bottom) / span) * plotH;
  const slot = (W - PAD_L - PAD_R) / Math.max(1, n);
  const x = (i: number) => PAD_L + i * slot + slot / 2;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const multiYear = new Set(points.map((p) => p.month.slice(0, 4))).size > 1;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1; v += step) ticks.push(v);
  const last = values[values.length - 1] ?? 0;
  const sel = selected !== null ? points[selected] : undefined;

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.caption}>
        {title}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${title}: ${formatCents(last, { decimals: false })} a fine periodo.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className={v === 0 ? styles.baseline : styles.grid} />
            <text x={PAD_L - 6} y={y(v) + 3.5} className={styles.axis} textAnchor="end">
              {formatCentsCompact(v)}
            </text>
          </g>
        ))}
        {selected !== null && <line x1={x(selected)} x2={x(selected)} y1={PAD_T} y2={PAD_T + plotH} className={styles.crosshair} />}
        <path d={d} className={styles.line} />
        {points.map((p, i) => (
          <g key={p.month}>
            {(i === n - 1 || selected === i) && <circle cx={x(i)} cy={y(values[i] ?? 0)} r={4} className={styles.dot} />}
            <text x={x(i)} y={H - 6} className={styles.axis} textAnchor="middle">
              {monthLabel(p.month, multiYear, i, n)}
            </text>
            <rect x={PAD_L + i * slot} y={0} width={slot} height={H} fill="transparent" onClick={() => setSelected(selected === i ? null : i)} />
          </g>
        ))}
      </svg>
      <p className={styles.detail} aria-live="polite">
        {sel ? (
          <>
            Fino a {formatMonth(sel.month)}: <strong>{formatCents(sel.cumulativeSavingsCents, { decimals: false })}</strong>
          </>
        ) : (
          <>
            A fine periodo: <strong className={last < 0 ? styles.negative : undefined}>{formatCents(last, { decimals: false })}</strong>
          </>
        )}
      </p>
    </figure>
  );
}

function DataTable({ points }: { points: MonthPoint[] }) {
  return (
    <details className={styles.table} data-noprint>
      <summary>Mostra tabella</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Mese</th>
            <th scope="col">Entrate</th>
            <th scope="col">Uscite</th>
            <th scope="col">Risparmio</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{formatMonthShort(p.month, true)}</th>
              <td>{formatCents(p.incomeCents, { decimals: false })}</td>
              <td>{formatCents(p.expenseCents, { decimals: false })}</td>
              <td className={p.savingsCents < 0 ? styles.negative : undefined}>{formatCents(p.savingsCents, { decimals: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface BarItem {
  id: string;
  label: ReactNode;
  cents: number;
  share: number;
  detail?: string;
  children?: BarItem[];
}

/** Sorted horizontal bars (no pies); a row with children expands in place. */
export function BarList({ items, tone, label }: { items: BarItem[]; tone: 'income' | 'expense'; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.cents));
  return (
    <ul className={styles.bars} aria-label={label}>
      {items.map((item) => {
        const expandable = (item.children?.length ?? 0) > 1;
        const isOpen = open === item.id;
        const row = (
          <>
            <span className={styles.barTop}>
              <span className={styles.barLabel}>{item.label}</span>
              <span className={styles.barValue}>
                {formatCents(item.cents, { decimals: false })} <span className={styles.barShare}>{formatPercent(item.share)}</span>
              </span>
            </span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={cx(styles.barFill, tone === 'income' ? styles.income : styles.expense)} style={{ width: `${(item.cents / max) * 100}%` }} />
            </span>
          </>
        );
        return (
          <li key={item.id} className={styles.barItem}>
            {expandable ? (
              <button type="button" className={styles.barRow} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.id)}>
                {row}
              </button>
            ) : (
              <div className={styles.barRow}>{row}</div>
            )}
            {expandable && isOpen && (
              <ul className={styles.subBars}>
                {item.children?.map((c) => (
                  <li key={c.id} className={styles.subBar}>
                    <span className={styles.barTop}>
                      <span className={styles.barLabel}>{c.label}</span>
                      <span className={styles.barValue}>
                        {formatCents(c.cents, { decimals: false })} <span className={styles.barShare}>{formatPercent(c.share)}</span>
                      </span>
                    </span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span className={cx(styles.barFill, styles.barSub)} style={{ width: `${(c.cents / max) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
