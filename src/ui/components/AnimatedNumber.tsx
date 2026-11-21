import { useEffect, useRef, useState } from 'react';
import { formatCents, spokenCents } from '../../core/format';
import type { Cents } from '../../core/money';
import { useReducedMotion } from './useReducedMotion';

interface AnimatedAmountProps {
  cents: Cents;
  className?: string | undefined;
  decimals?: boolean;
  signed?: boolean;
  duration?: number;
}

/** An amount that rolls smoothly to its new value. Integer cents all the way. */
export function AnimatedAmount({ cents, className, decimals = true, signed = false, duration = 420 }: AnimatedAmountProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  const shownRef = useRef(cents);

  useEffect(() => {
    if (reduced) {
      shownRef.current = cents;
      return;
    }
    from.current = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from.current + (cents - from.current) * eased);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents, duration, reduced]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }} aria-label={spokenCents(cents)} role="text">
      <span aria-hidden="true">{formatCents(reduced ? cents : shown, { decimals, signed })}</span>
    </span>
  );
}
