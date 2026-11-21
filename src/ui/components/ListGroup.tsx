import type { CSSProperties, ReactNode } from 'react';
import styles from './ListGroup.module.css';
import { cx } from './cx';

interface ListGroupProps {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** iOS Settings-style grouped list. */
export function ListGroup({ header, footer, children }: ListGroupProps) {
  return (
    <section className={styles.group}>
      {header !== undefined && <h2 className={styles.header}>{header}</h2>}
      <ul className={styles.list}>{children}</ul>
      {footer !== undefined && <p className={styles.footer}>{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function Row({ icon, label, detail, value, chevron, destructive, disabled, href, onClick, ariaLabel }: RowProps) {
  const content = (
    <>
      {icon !== undefined && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {detail !== undefined && <span className={styles.detail}>{detail}</span>}
      </span>
      {value !== undefined && <span className={styles.value}>{value}</span>}
      {chevron && <Chevron />}
    </>
  );
  const className = cx(styles.row, destructive && styles.destructive, disabled && styles.disabled);
  const style = icon !== undefined ? { '--row-inset': '56px' } : undefined;

  return (
    <li className={styles.item} style={style as CSSProperties | undefined}>
      {href !== undefined && !disabled ? (
        <a className={className} href={href} aria-label={ariaLabel}>
          {content}
        </a>
      ) : onClick !== undefined ? (
        <button className={className} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
          {content}
        </button>
      ) : (
        <div className={className} aria-label={ariaLabel}>
          {content}
        </div>
      )}
    </li>
  );
}

function Chevron() {
  return (
    <svg className={styles.chevron} width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PropertyProps {
  icon?: ReactNode;
  name: ReactNode;
  children: ReactNode;
}

/** Notion-style "key → value" property line. */
export function Property({ icon, name, children }: PropertyProps) {
  return (
    <div className={styles.property}>
      <span className={styles.propertyKey}>
        {icon !== undefined && <span aria-hidden="true">{icon}</span>}
        {name}
      </span>
      <span className={styles.propertyValue}>{children}</span>
    </div>
  );
}
