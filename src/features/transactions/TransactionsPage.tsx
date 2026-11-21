import { EmptyState, Page } from '../../ui/components';

export function TransactionsPage() {
  return (
    <Page title="Transazioni">
      <EmptyState emoji="🗂️" title="Ancora nessuna transazione">
        Le tue spese e le tue entrate compariranno qui, raggruppate per giorno, con viste e filtri stile Notion.
      </EmptyState>
    </Page>
  );
}
