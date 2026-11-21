import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { isStandalone, useStorageStatus } from '../../app/storage';
import { today } from '../../core/dates';
import { formatBytes, formatFullDate } from '../../core/format';
import { db } from '../../db/db';
import { generateRecurring } from '../../db/recurring';
import { clearAllData, loadDemoData, removeDemoData } from '../../db/repo';
import { BackLink, ConfirmSheet, ListGroup, Page, Row, showToast } from '../../ui/components';

const SOON = 'In arrivo';

export function SettingsPage() {
  const storage = useStorageStatus();
  const counts = useLiveQuery(async () => ({
    all: await db.transactions.count(),
    demo: await db.transactions.where('id').startsWith('demo_').count(),
  }));
  const [confirm, setConfirm] = useState<'demo' | 'clear' | null>(null);

  const persisted = storage.persisted === null ? 'Sconosciuto' : storage.persisted ? 'Protetto' : 'Non protetto';
  const usage =
    storage.usage === null
      ? '—'
      : storage.quota
        ? `${formatBytes(storage.usage)} di ${formatBytes(storage.quota)}`
        : formatBytes(storage.usage);

  return (
    <Page title="Impostazioni" grouped leading={<BackLink href="#/" label="Oggi" />}>
      <ListGroup header="Dati">
        <Row icon="🏷️" label="Categorie" href="#/impostazioni/categorie" chevron />
        <Row icon="💳" label="Metodi di pagamento" href="#/impostazioni/metodi" chevron />
        <Row icon="🔁" label="Ricorrenti" href="#/impostazioni/ricorrenti" chevron />
        <Row icon="🧾" label="Piani a rate" href="#/impostazioni/rate" chevron />
        <Row icon="🤝" label="Spese condivise" href="#/impostazioni/condivise" chevron />
      </ListGroup>

      <ListGroup
        header="Archivio"
        footer="I dati restano solo su questo iPhone. «Protetto» significa che iOS non li cancellerà per liberare spazio."
      >
        <Row icon="💾" label="Backup ed export" href="#/impostazioni/backup" chevron />
        <Row icon="📥" label="Importa CSV" href="#/impostazioni/import" chevron />
        <Row icon="🧮" label="Transazioni salvate" value={counts ? counts.all.toLocaleString('it-IT') : '—'} />
        <Row icon="🛡️" label="Archivio" value={persisted} />
        <Row icon="📦" label="Spazio usato" value={usage} />
        <Row icon="📱" label="Modalità" value={isStandalone() ? 'App installata' : 'Safari'} />
      </ListGroup>

      <ListGroup header="Prova l'app" footer="I dati di esempio sono segnati con il tag «demo» e si possono rimuovere senza toccare i tuoi.">
        {counts && counts.demo > 0 ? (
          <Row
            icon="🧹"
            label="Rimuovi dati di esempio"
            value={counts.demo.toLocaleString('it-IT')}
            onClick={async () => {
              const n = await removeDemoData();
              showToast(`${n} transazioni di esempio rimosse`);
            }}
          />
        ) : (
          <Row icon="🧪" label="Carica dati di esempio" onClick={() => setConfirm('demo')} />
        )}
        <Row icon="🗑️" label="Cancella tutto" destructive onClick={() => setConfirm('clear')} />
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

      <ConfirmSheet
        open={confirm === 'demo'}
        onClose={() => setConfirm(null)}
        emoji="🧪"
        title="Caricare i dati di esempio?"
        confirmLabel="Carica dati di esempio"
        onConfirm={async () => {
          const n = await loadDemoData(today());
          await generateRecurring();
          setConfirm(null);
          showToast(`${n} transazioni di esempio`);
        }}
      >
        Circa 4 mesi di spese realistiche per provare l'app. Potrai rimuoverle in qualsiasi momento.
      </ConfirmSheet>

      <ConfirmSheet
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        emoji="⚠️"
        title="Cancellare tutti i dati?"
        confirmLabel="Cancella tutto"
        secondConfirmLabel="Sì, cancella definitivamente"
        destructive
        onConfirm={async () => {
          await clearAllData();
          setConfirm(null);
          showToast('Tutti i dati sono stati cancellati');
        }}
      >
        Transazioni, impostazioni e note verranno eliminate da questo iPhone. Non si può annullare: se non l'hai fatto, esporta
        prima un backup.
      </ConfirmSheet>
    </Page>
  );
}
