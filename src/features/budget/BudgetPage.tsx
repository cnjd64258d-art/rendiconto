import { EmptyState, Page } from '../../ui/components';

export function BudgetPage() {
  return (
    <Page title="Budget">
      <EmptyState emoji="🎯" title="Nessun budget impostato">
        Potrai fissare un limite mensile per categoria o macro-voce e un obiettivo di risparmio annuale.
      </EmptyState>
    </Page>
  );
}
