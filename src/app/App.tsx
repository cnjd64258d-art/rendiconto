import { lazy, Suspense, useEffect } from 'react';
import { AddSheet } from '../features/add/AddSheet';
import { BudgetPage } from '../features/budget/BudgetPage';
import { useBudgetAlert } from '../features/budget/useBudgetAlert';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TodayPage } from '../features/today/TodayPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { EmptyState, Page, ToastLayer } from '../ui/components';
import { BackupPage } from '../features/settings/BackupPage';
import { ImportPage } from '../features/settings/ImportPage';
import { CategoriesPage } from '../features/settings/CategoriesPage';
import { MethodsPage } from '../features/settings/MethodsPage';
import { RecurringPage } from '../features/settings/RecurringPage';
import { PlansPage } from '../features/settings/PlansPage';
import { SharedPage } from '../features/settings/SharedPage';
import { generateRecurring } from '../db/recurring';
import { openEditor, openNewTransaction } from './editor';
import styles from './App.module.css';
import { consumeLaunchFlag, parseRoute, useHash, type Route } from './router';
import { TabBar } from './TabBar';
import { UpdatePrompt } from './UpdatePrompt';

const DesignPage = lazy(() => import('../features/design/DesignPage'));
// Analysis and "Tira una linea" load on first visit: a smaller initial bundle.
const AnalysisPage = lazy(() => import('../features/analysis/AnalysisPage'));
const ReviewPage = lazy(() => import('../features/review/ReviewPage'));

// Manifest shortcut / iOS Shortcuts / Action button: ".../rendiconto/?add=1"
const launchedToAdd = typeof window !== 'undefined' && consumeLaunchFlag('add');

export function App() {
  const route = parseRoute(useHash());
  const budgetAlert = useBudgetAlert();

  useEffect(() => {
    // No tap yet, so iOS won't show the keyboard: the sheet opens, one tap on the amount does the rest.
    if (launchedToAdd) openEditor(null);
  }, []);

  useEffect(() => {
    // Recurring payments that matured become "da confermare": at launch and whenever the app comes back.
    const run = () => {
      if (document.visibilityState === 'visible') void generateRecurring();
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => document.removeEventListener('visibilitychange', run);
  }, []);

  return (
    <div className={styles.app} data-print-flow>
      <main data-print-flow className={styles.screen} key={route.name}>
        <Screen route={route} />
      </main>
      <TabBar route={route.name} onAdd={openNewTransaction} budgetAlert={budgetAlert} />
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
      return (
        <Suspense fallback={null}>
          <AnalysisPage />
        </Suspense>
      );
    case 'review':
      return (
        <Suspense fallback={null}>
          <ReviewPage year={route.year} />
        </Suspense>
      );
    case 'budget':
      return <BudgetPage />;
    case 'settings':
      return <SettingsPage />;
    case 'backup':
      return <BackupPage />;
    case 'import':
      return <ImportPage />;
    case 'categories':
      return <CategoriesPage />;
    case 'methods':
      return <MethodsPage />;
    case 'recurring':
      return <RecurringPage />;
    case 'plans':
      return <PlansPage />;
    case 'shared':
      return <SharedPage />;
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
