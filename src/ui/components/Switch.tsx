import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** iOS-style on/off switch (a real checkbox underneath, so it is accessible). */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <span className={styles.wrap}>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </span>
  );
}
