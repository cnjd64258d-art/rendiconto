import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { shareOrDownload } from '../../app/share';
import { backupFileName, createBackup, parseBackup, summarizeBackup, type BackupFile } from '../../core/backup/backup';
import { transactionsToCsv } from '../../core/csv';
import { formatDayShort, formatFullDate } from '../../core/format';
import { generateRecurring } from '../../db/recurring';
import { readAllTables, replaceAllTables, setMeta, META_LAST_BACKUP } from '../../db/repo';
import { BackLink, ConfirmSheet, ListGroup, Page, Property, Row, showToast } from '../../ui/components';
import styles from './Settings.module.css';

export function BackupPage() {
  const tables = useLiveQuery(() => readAllTables(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ backup: BackupFile; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastBackup = tables?.meta.find((m) => m.key === META_LAST_BACKUP)?.value as string | undefined;

  // Files are prepared ahead of time: iOS only allows sharing right inside the tap.
  const files = useMemo(() => {
    if (!tables) return null;
    const now = new Date();
    const backup = createBackup(tables, __APP_VERSION__, now);
    const json = new File([JSON.stringify(backup)], backupFileName(now, 'json'), { type: 'application/json' });
    const csv = new File(
      [transactionsToCsv(tables.transactions, tables.categories, tables.categoryGroups, tables.paymentMethods)],
      backupFileName(now, 'csv'),
      { type: 'text/csv' },
    );
    return [json, csv];
  }, [tables]);

  const exportNow = async () => {
    if (!files) return;
    const result = await shareOrDownload(files, 'Backup Ledgerline');
    if (result === 'cancelled') return;
    await setMeta(META_LAST_BACKUP, new Date().toISOString());
    showToast(result === 'shared' ? 'Backup esportato' : 'Backup scaricato');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = parseBackup(await file.text());
    if (result.ok) {
      setError(null);
      setCandidate({ backup: result.backup, fileName: file.name });
    } else {
      setError(result.error);
    }
  };

  const summary = candidate ? summarizeBackup(candidate.backup) : null;

  return (
    <Page title="Backup" grouped leading={<BackLink href="#/impostazioni" label="Impostazioni" />}>
      <ListGroup
        header="Esporta"
        footer="Crea un file JSON completo e un CSV delle transazioni. Salvali in File, su iCloud Drive o inviali a te stesso."
      >
        <Row
          icon="📤"
          label="Esporta backup"
          detail={lastBackup ? `Ultimo backup: ${formatFullDate(lastBackup.slice(0, 10))}` : 'Mai eseguito'}
          onClick={() => void exportNow()}
          disabled={!files}
          chevron
        />
      </ListGroup>

      <ListGroup header="Ripristina" footer="Sostituisce tutti i dati di questo iPhone con quelli del backup. Prima vedrai un'anteprima.">
        <Row icon="📥" label="Ripristina da file…" onClick={() => fileInput.current?.click()} chevron />
      </ListGroup>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e)} />

      <ConfirmSheet
        open={candidate !== null}
        onClose={() => setCandidate(null)}
        emoji="♻️"
        title="Ripristinare questo backup?"
        confirmLabel="Sostituisci i dati attuali"
        secondConfirmLabel="Sì, ripristina ora"
        destructive
        onConfirm={async () => {
          if (!candidate) return;
          await replaceAllTables(candidate.backup.tables);
          await generateRecurring();
          // The restored data is exactly what that backup contains: it counts as backed up.
          await setMeta(META_LAST_BACKUP, candidate.backup.exportedAt || new Date().toISOString());
          setCandidate(null);
          showToast('Backup ripristinato');
          window.location.hash = '/';
        }}
      >
        {summary && (
          <div className={styles.preview}>
            <Property name="File">{candidate?.fileName}</Property>
            <Property name="Creato il">{summary.exportedAt ? formatFullDate(summary.exportedAt.slice(0, 10)) : '—'}</Property>
            <Property name="Transazioni">{summary.transactions.toLocaleString('it-IT')}</Property>
            <Property name="Periodo">
              {summary.firstDate && summary.lastDate
                ? `${formatDayShort(summary.firstDate)} ${summary.firstDate.slice(0, 4)} → ${formatDayShort(summary.lastDate)} ${summary.lastDate.slice(0, 4)}`
                : '—'}
            </Property>
            <Property name="Categorie">{summary.categories}</Property>
            <Property name="Metodi">{summary.paymentMethods}</Property>
            <p className={styles.warning}>
              I dati attuali ({tables?.transactions.length ?? 0} transazioni) verranno sostituiti. Se vuoi tenerli, esporta
              prima un backup.
            </p>
          </div>
        )}
      </ConfirmSheet>
    </Page>
  );
}
