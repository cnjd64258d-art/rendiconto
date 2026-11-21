import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import styles from './Feedback.module.css';

interface BannerProps {
  icon?: ReactNode;
  tone?: 'neutral' | 'warning' | 'negative';
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
interface ToastOptions {
  action?: { label: string; onClick: () => void };
  icon?: 'check' | 'none';
}
type ToastState = ({ id: number; message: string } & ToastOptions) | null;
let toast: ToastState = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(message: string, options: ToastOptions = {}): void {
  toast = { id: nextId++, message, ...options };
  emit();
}

export function hideToast(): void {
  toast = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function ToastLayer() {
  const current = useSyncExternalStore(subscribe, () => toast, () => null);
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(
      () => {
        if (toast?.id === current.id) hideToast();
      },
      current.action ? 4500 : 1600,
    );
    return () => window.clearTimeout(t);
  }, [current]);

  return (
    <div className={styles.toastLayer} aria-live="polite">
      {current && (
        <div key={current.id} className={styles.toast}>
          {current.icon !== 'none' && (
            <svg className={styles.check} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 9.5l3.2 3L14 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {current.message}
          {current.action && (
            <button
              type="button"
              className={styles.toastAction}
              onClick={() => {
                current.action?.onClick();
                hideToast();
              }}
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
