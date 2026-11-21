import type { CSSProperties, ReactNode } from 'react';
import type { TagColor } from '../../core/colors';
import styles from './Tag.module.css';
import { cx } from './cx';

export function tagStyle(color: TagColor): CSSProperties {
  return { '--tag-bg': `var(--tag-${color}-bg)`, '--tag-fg': `var(--tag-${color}-fg)` } as CSSProperties;
}

interface TagProps {
  color?: TagColor;
  emoji?: string;
  children: ReactNode;
}

/** Rounded, softly tinted Notion-style tag. */
export function Tag({ color = 'gray', emoji, children }: TagProps) {
  return (
    <span className={styles.tag} style={tagStyle(color)}>
      {emoji !== undefined && <span aria-hidden="true">{emoji}</span>}
      {children}
    </span>
  );
}

interface ChipsProps {
  label: string;
  children: ReactNode;
}

/** Horizontal, scrollable row of chips. */
export function Chips({ label, children }: ChipsProps) {
  return (
    <div className={styles.chips} role="radiogroup" aria-label={label}>
      {children}
    </div>
  );
}

interface ChipProps {
  selected?: boolean;
  emoji?: string;
  onClick?: () => void;
  children: ReactNode;
}

export function Chip({ selected = false, emoji, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cx(styles.chip, selected && styles.chipSelected)}
      onClick={onClick}
    >
      {emoji !== undefined && <span aria-hidden="true">{emoji}</span>}
      {children}
    </button>
  );
}
