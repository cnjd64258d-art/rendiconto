import { capitalize, formatDayLong } from '../../core/format';
import { today } from '../../core/dates';
import { EmptyState, IconButton, Page } from '../../ui/components';
import { GearIcon } from '../../ui/components/icons';

export function TodayPage() {
  return (
    <Page
      title="Oggi"
      subtitle={capitalize(formatDayLong(today()))}
      trailing={
        <IconButton label="Impostazioni" href="#/impostazioni">
          <GearIcon />
        </IconButton>
      }
    >
      <EmptyState emoji="🌱" title="Benvenuto in Rendiconto">
        Qui vedrai quanto hai speso questo mese, il saldo e le spese fisse in arrivo. Per ora prova il pulsante ＋ in
        basso: il salvataggio arriva con la prossima versione.
      </EmptyState>
    </Page>
  );
}
