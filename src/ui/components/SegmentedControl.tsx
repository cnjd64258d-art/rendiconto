import type { CSSProperties } from 'react';
import styles from './SegmentedControl.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const thumb: CSSProperties = {
    width: `calc((100% - 4px) / ${options.length})`,
    transform: `translateX(${index * 100}%)`,
  };
  return (
    <div className={styles.control} role="radiogroup" aria-label={label}>
      <span className={styles.thumb} style={thumb} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={styles.option}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
