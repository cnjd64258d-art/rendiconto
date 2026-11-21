import type { ReactNode } from 'react';
import { ChartIcon, GaugeIcon, ListIcon, PlusIcon, TodayIcon } from '../ui/components/icons';
import type { Route } from './router';
import styles from './TabBar.module.css';

interface TabBarProps {
  route: Route['name'];
  onAdd: () => void;
  /** Dot on the Budget tab when a budget is at 80% (warning) or 100% (over). */
  budgetAlert?: 'warning' | 'over' | null;
}

export function TabBar({ route, onAdd, budgetAlert = null }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Sezioni">
      <Tab href="#/" label="Oggi" active={route === 'today' || route === 'settings' || route === 'backup' || route === 'import' || route === 'categories' || route === 'methods' || route === 'recurring' || route === 'plans' || route === 'shared'} icon={(a) => <TodayIcon filled={a} />} />
      <Tab href="#/transazioni" label="Transazioni" active={route === 'transactions'} icon={(a) => <ListIcon filled={a} />} />
      <div className={styles.add}>
        <button type="button" className={styles.addButton} onClick={onAdd} aria-label="Aggiungi transazione">
          <PlusIcon />
        </button>
      </div>
      <Tab href="#/analisi" label="Analisi" active={route === 'analysis' || route === 'review'} icon={(a) => <ChartIcon filled={a} />} />
      <Tab
        href="#/budget"
        label="Budget"
        active={route === 'budget'}
        icon={(a) => <GaugeIcon filled={a} />}
        badge={budgetAlert}
        badgeLabel={budgetAlert === 'over' ? 'budget sforato' : budgetAlert === 'warning' ? 'budget oltre l’80%' : undefined}
      />
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  icon,
  badge = null,
  badgeLabel,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: (active: boolean) => ReactNode;
  badge?: 'warning' | 'over' | null;
  badgeLabel?: string | undefined;
}) {
  return (
    <a className={styles.tab} href={href} aria-current={active ? 'page' : undefined} aria-label={badgeLabel ? `${label}, ${badgeLabel}` : undefined}>
      <span className={styles.iconWrap}>
        {icon(active)}
        {badge && <span className={styles.badge} data-tone={badge} aria-hidden="true" />}
      </span>
      <span>{label}</span>
    </a>
  );
}
