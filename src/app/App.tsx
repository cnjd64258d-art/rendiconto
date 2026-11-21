import { lazy, Suspense, useEffect } from 'react';
import { AddSheet } from '../features/add/AddSheet';
import { AnalysisPage } from '../features/analysis/AnalysisPage';
import { BudgetPage } from '../features/budget/BudgetPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TodayPage } from '../features/today/TodayPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { EmptyState, Page, ToastLayer } from '../ui/components';
import { BackupPage } from '../features/settings/BackupPage';
import { ImportPage } from '../features/settings/ImportPage';
import { openEditor, openNewTransaction } from './editor';
import styles from './App.module.css';
import { consumeLaunchFlag, parseRoute, useHash, type Route } from './router';
import { TabBar } from './TabBar';
import { UpdatePrompt } from './UpdatePrompt';

const DesignPage = lazy(() => import('../features/design/DesignPage'));

// Manifest shortcut / iOS Shortcuts / Action button: ".../rendiconto/?add=1"
const launchedToAdd = typeof window !== 'undefined' && consumeLaunchFlag('add');

export function App() {
  const route = parseRoute(useHash());

  useEffect(() => {
    // No tap yet, so iOS won't show the keyboard: the sheet opens, one tap on the amount does the rest.
    if (launchedToAdd) openEditor(null);
  }, []);

  return (
    <div className={styles.app}>
      <main className={styles.screen} key={route.name}>
        <Screen route={route} />
      </main>
      <TabBar route={route.name} onAdd={openNewTransaction} />
      <UpdatePrompt />
      <AddSheet />
      <ToastLayer />
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayPage />;
    case 'transactions':
      return <TransactionsPage />;
    case 'analysis':
      return <AnalysisPage />;
    case 'budget':
      return <BudgetPage />;
    case 'settings':
      return <SettingsPage />;
    case 'backup':
      return <BackupPage />;
    case 'import':
      return <ImportPage />;
    case 'design':
      return (
        <Suspense fallback={null}>
          <DesignPage />
        </Suspense>
      );
    case 'notFound':
      return (
        <Page title="Pagina non trovata">
          <EmptyState emoji="🧭" title="Qui non c'è niente" action={<a href="#/">Torna a Oggi</a>}>
            L'indirizzo {route.path} non esiste.
          </EmptyState>
        </Page>
      );
  }
}
