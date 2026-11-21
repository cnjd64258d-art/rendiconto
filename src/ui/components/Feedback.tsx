import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import styles from './Feedback.module.css';

interface BannerProps {
  icon?: ReactNode;
  tone?: 'neutral' | 'warning';
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}

/** Discreet inline banner (backup reminder, app update…). */
export function Banner({ icon, tone = 'neutral', action, children }: BannerProps) {
  return (
    <div className={styles.banner} data-tone={tone} role="status">
      {icon !== undefined && (
        <span className={styles.bannerIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.bannerText}>{children}</span>
      {action !== undefined && (
        <button type="button" className={styles.bannerAction} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  emoji: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ emoji, title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyEmoji} aria-hidden="true">
        {emoji}
      </div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children !== undefined && <p className={styles.emptyText}>{children}</p>}
      {action !== undefined && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/* Toast: a tiny global store, so any feature can confirm an action. */
type ToastState = { id: number; message: string } | null;
let toast: ToastState = null;
const listeners = new Set<() => void>();

export function showToast(message: string): void {
  toast = { id: (toast?.id ?? 0) + 1, message };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function ToastLayer() {
  const current = useSyncExternalStore(subscribe, () => toast, () => null);
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => {
      if (toast?.id === current.id) {
        toast = null;
        listeners.forEach((l) => l());
      }
    }, 1600);
    return () => window.clearTimeout(t);
  }, [current]);

  return (
    <div className={styles.toastLayer} aria-live="polite">
      {current && (
        <div key={current.id} className={styles.toast}>
          <svg className={styles.check} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 9.5l3.2 3L14 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {current.message}
        </div>
      )}
    </div>
  );
}
