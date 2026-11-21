import type { ReactNode } from 'react';
import { ChartIcon, GaugeIcon, ListIcon, PlusIcon, TodayIcon } from '../ui/components/icons';
import type { Route } from './router';
import styles from './TabBar.module.css';

interface TabBarProps {
  route: Route['name'];
  onAdd: () => void;
}

export function TabBar({ route, onAdd }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Sezioni">
      <Tab href="#/" label="Oggi" active={route === 'today' || route === 'settings'} icon={(a) => <TodayIcon filled={a} />} />
      <Tab href="#/transazioni" label="Transazioni" active={route === 'transactions'} icon={(a) => <ListIcon filled={a} />} />
      <div className={styles.add}>
        <button type="button" className={styles.addButton} onClick={onAdd} aria-label="Aggiungi transazione">
          <PlusIcon />
        </button>
      </div>
      <Tab href="#/analisi" label="Analisi" active={route === 'analysis'} icon={(a) => <ChartIcon filled={a} />} />
      <Tab href="#/budget" label="Budget" active={route === 'budget'} icon={(a) => <GaugeIcon filled={a} />} />
    </nav>
  );
}

function Tab({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: (active: boolean) => ReactNode }) {
  return (
    <a className={styles.tab} href={href} aria-current={active ? 'page' : undefined}>
      {icon(active)}
      <span>{label}</span>
    </a>
  );
}
