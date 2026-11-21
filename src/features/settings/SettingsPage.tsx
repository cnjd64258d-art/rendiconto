import { formatBytes, formatFullDate } from '../../core/format';
import { isStandalone, useStorageStatus } from '../../app/storage';
import { BackLink, ListGroup, Page, Row } from '../../ui/components';

const SOON = 'In arrivo';

export function SettingsPage() {
  const storage = useStorageStatus();
  const persisted =
    storage.persisted === null ? 'Sconosciuto' : storage.persisted ? 'Protetto' : 'Non protetto';
  const usage =
    storage.usage === null
      ? '—'
      : storage.quota
        ? `${formatBytes(storage.usage)} di ${formatBytes(storage.quota)}`
        : formatBytes(storage.usage);

  return (
    <Page title="Impostazioni" grouped leading={<BackLink href="#/" label="Oggi" />}>
      <ListGroup header="Dati">
        <Row icon="🏷️" label="Categorie" value={SOON} disabled />
        <Row icon="💳" label="Metodi di pagamento" value={SOON} disabled />
        <Row icon="🔁" label="Ricorrenti" value={SOON} disabled />
        <Row icon="🧾" label="Piani a rate" value={SOON} disabled />
        <Row icon="🤝" label="Spese condivise" value={SOON} disabled />
      </ListGroup>

      <ListGroup
        header="Archivio"
        footer="I dati restano solo su questo iPhone. «Protetto» significa che Safari non li cancellerà per liberare spazio."
      >
        <Row icon="📥" label="Importa CSV" value={SOON} disabled />
        <Row icon="💾" label="Backup ed export" value={SOON} disabled />
        <Row icon="🛡️" label="Archivio" value={persisted} />
        <Row icon="📦" label="Spazio usato" value={usage} />
        <Row icon="📱" label="Modalità" value={isStandalone() ? 'App installata' : 'Safari'} />
      </ListGroup>

      <ListGroup header="Sicurezza">
        <Row icon="🔒" label="Blocco con PIN" value={SOON} disabled />
      </ListGroup>

      <ListGroup header="Info">
        <Row
          icon="ℹ️"
          label="Versione"
          value={`${__APP_VERSION__} (${__APP_COMMIT__})`}
          detail={`Pubblicata il ${formatFullDate(__BUILD_DATE__.slice(0, 10))}`}
        />
        <Row icon="🎨" label="Design system" href="#/design" chevron />
      </ListGroup>
    </Page>
  );
}
