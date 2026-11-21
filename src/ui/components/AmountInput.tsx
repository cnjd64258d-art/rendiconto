import { forwardRef } from 'react';
import { parseAmount, sanitizeAmountTyping } from '../../core/money';
import styles from './AmountInput.module.css';
import { cx } from './cx';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
}

/** Big, light amount field with the iOS decimal keypad. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onChange, label = 'Importo in euro', autoFocus = false },
  ref,
) {
  const invalid = value !== '' && parseAmount(value, ',') === null;
  return (
    <label className={cx(styles.wrap, invalid && styles.invalid)}>
      <span className="visually-hidden">{label}</span>
      <input
        ref={ref}
        className={styles.input}
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="0,00"
        value={value}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        onChange={(e) => onChange(sanitizeAmountTyping(e.target.value))}
        style={{ width: `${Math.max(4, value.length) + 0.5}ch` }}
      />
      <span className={styles.currency} aria-hidden="true">
        €
      </span>
    </label>
  );
});
