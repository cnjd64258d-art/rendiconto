import { useEffect, useState, type ReactNode } from 'react';
import { cx, useReducedMotion } from '../ui/components';
import { DeleteBackIcon } from '../ui/components/icons';
import styles from './PinPad.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * iOS-style passcode pad: dots plus a big keypad, no system keyboard. Calls `onComplete` when all digits are in.
 * A new `errorKey` clears the digits and shakes the dots (a fade when "Riduci movimento" is on).
 */
export function PinPad({
  length,
  title,
  message,
  error,
  errorKey = 0,
  disabled = false,
  busy = false,
  onComplete,
  footer,
}: {
  length: number;
  title: string;
  message?: ReactNode;
  error?: string | null;
  errorKey?: number;
  disabled?: boolean;
  busy?: boolean;
  onComplete: (pin: string) => void;
  footer?: ReactNode;
}) {
  const [digits, setDigits] = useState('');
  const reduced = useReducedMotion();
  // A new error clears the digits (state adjusted during render, no effect needed).
  const [seenError, setSeenError] = useState(errorKey);
  if (seenError !== errorKey) {
    setSeenError(errorKey);
    setDigits('');
  }

  const press = (d: string) => {
    if (disabled || busy || digits.length >= length) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === length) onComplete(next);
  };
  const back = () => {
    if (!busy) setDigits((v) => v.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={styles.pad}>
      <div className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {message && <p className={styles.message}>{message}</p>}
      </div>
      <div
        key={errorKey}
        className={cx(styles.dots, errorKey > 0 && (reduced ? styles.fade : styles.shake))}
        role="img"
        aria-label={`${digits.length} di ${length} cifre inserite`}
      >
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cx(styles.dot, i < digits.length && styles.filled)} />
        ))}
      </div>
      <p className={styles.error} role="alert">
        {error ?? ''}
      </p>
      <div className={styles.keys}>
        {KEYS.map((k) => (
          <button key={k} type="button" className={styles.key} disabled={disabled} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <span />
        <button type="button" className={styles.key} disabled={disabled} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className={cx(styles.key, styles.plain)} aria-label="Cancella cifra" disabled={digits.length === 0} onClick={back}>
          <DeleteBackIcon />
        </button>
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
