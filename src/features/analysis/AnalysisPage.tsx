import { EmptyState, Page } from '../../ui/components';

export function AnalysisPage() {
  return (
    <Page title="Analisi">
      <EmptyState emoji="📊" title="Le analisi arrivano presto">
        Spesa per voce, entrate contro uscite, tasso di risparmio e "Tira una linea" a fine anno.
      </EmptyState>
    </Page>
  );
}
