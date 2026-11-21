import styles from './Progress.module.css';
import { cx } from './cx';

/** Visual budget state: warning from 80%, over from 100%. */
export function progressTone(ratio: number): 'normal' | 'warning' | 'over' {
  if (ratio >= 1) return 'over';
  if (ratio >= 0.8) return 'warning';
  return 'normal';
}

interface ProgressProps {
  /** 0..n, where 1 is 100%. */
  value: number;
  label: string;
  thick?: boolean;
}

export function ProgressBar({ value, label, thick = false }: ProgressProps) {
  const tone = progressTone(value);
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      className={cx(styles.bar, thick && styles.thick, tone === 'warning' && styles.warning, tone === 'over' && styles.over)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className={styles.fill} style={{ transform: `scaleX(${clamped})` }} />
    </div>
  );
}

export function ProgressRing({ value, label, size = 44 }: ProgressProps & { size?: number }) {
  const tone = progressTone(value);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <svg
      className={cx(styles.ring, tone === 'warning' && styles.warning, tone === 'over' && styles.over)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label}: ${Math.round(value * 100)}%`}
    >
      <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className={styles.ringFill}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
