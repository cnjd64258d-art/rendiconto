import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Page.module.css';
import { cx } from './cx';

interface PageProps {
  title: string;
  subtitle?: ReactNode;
  /** "large": iOS large title that collapses into the bar on scroll. */
  titleMode?: 'large' | 'inline';
  grouped?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

export function Page({ title, subtitle, titleMode = 'large', grouped = false, leading, trailing, children }: PageProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!(entry?.isIntersecting ?? true)), {
      rootMargin: '-60px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={cx(styles.scroll, grouped && styles.grouped, titleMode === 'inline' && styles.inlineOnly)}>
      <header className={cx(styles.navbar, scrolled && styles.navbarScrolled)}>
        <div className={styles.navLeading}>{leading}</div>
        <div className={styles.navTitle} aria-hidden={titleMode === 'large'}>
          {title}
        </div>
        <div className={styles.navTrailing}>{trailing}</div>
      </header>
      {titleMode === 'large' ? (
        <div className={styles.largeTitle} ref={sentinel}>
          <h1>{title}</h1>
          {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      ) : (
        <div ref={sentinel} />
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a className={styles.back} href={href}>
      <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
        <path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  );
}

interface IconButtonProps {
  label: string;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}

export function IconButton({ label, onClick, href, children }: IconButtonProps) {
  if (href !== undefined) {
    return (
      <a className={styles.iconButton} href={href} aria-label={label}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={styles.iconButton} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}
