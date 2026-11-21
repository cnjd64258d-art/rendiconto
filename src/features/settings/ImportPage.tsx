import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  FIELD_LABELS,
  IMPORT_NOTE,
  INCOME_FIELDS,
  TX_FIELDS,
  checkTotals,
  detectDecimal,
  detectImportKind,
  guessMapping,
  planImport,
  type ColumnMapping,
  type ImportKind,
  type ImportPlan,
  type TotalsCheck,
} from '../../core/csv/import';
import { parseCsv, type ParsedCsv } from '../../core/csv/parse';
import { formatCents, formatFullDate } from '../../core/format';
import { normalizeText } from '../../core/transactions';
import type { Category, Id, PaymentMethod } from '../../core/types';
import { db } from '../../db/db';
import { useCategories, useCategoryGroups, usePaymentMethods } from '../../db/hooks';
import { commitImport, existingKeyCounts, undoImport } from '../../db/imports';
import { BackLink, Button, ConfirmSheet, ListGroup, Page, Row, SegmentedControl, showToast } from '../../ui/components';
import listStyles from '../../ui/components/ListGroup.module.css';
import styles from './ImportPage.module.css';

interface Loaded {
  fileName: string;
  csv: ParsedCsv;
}

export function ImportPage() {
  const categories = useCategories();
  const groups = useCategoryGroups();
  const methods = usePaymentMethods();
  const existing = useLiveQuery(() => existingKeyCounts(), []);
  const batches = useLiveQuery(() => db.importBatches.orderBy('id').toArray(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [kind, setKind] = useState<ImportKind>('transactions');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [decimal, setDecimal] = useState<',' | '.'>('.');
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Id>>({});
  const [methodOverrides, setMethodOverrides] = useState<Record<string, Id>>({});
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState<Id | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const csv = parseCsv(await file.text());
    if (csv.header.length === 0 || csv.rows.length === 0) {
      setReadError('Il file è vuoto o non è un CSV.');
      setLoaded(null);
      return;
    }
    const k = detectImportKind(csv.header);
    const m = guessMapping(csv.header, k);
    setReadError(null);
    setLoaded({ fileName: file.name, csv });
    setKind(k);
    setMapping(m);
    setDecimal(detectDecimal(csv.rows.map((r) => (m.amount === undefined ? '' : (r.cells[m.amount] ?? '')))));
    setCategoryOverrides({});
    setMethodOverrides({});
  };

  const changeKind = (k: ImportKind) => {
    setKind(k);
    if (loaded) setMapping(guessMapping(loaded.csv.header, k));
  };

  const plan = useMemo<ImportPlan | null>(() => {
    if (!loaded || !categories || !groups || !methods || !existing) return null;
    return planImport(
      loaded.csv,
      {
        kind,
        mapping,
        decimal,
        categoryOverrides,
        methodOverrides,
        defaultMethodId: methods[0]?.id ?? 'pm_conto',
        ...(kind === 'income' ? { extraNote: IMPORT_NOTE } : {}),
      },
      { categories, groups, methods, existing },
    );
  }, [loaded, categories, groups, methods, existing, kind, mapping, decimal, categoryOverrides, methodOverrides]);

  const totals = useMemo(() => (plan ? checkTotals(plan.totalsByYear) : []), [plan]);

  const doImport = async () => {
    if (!plan || !loaded) return;
    const batch = await commitImport(plan, loaded.fileName);
    setConfirming(false);
    setLoaded(null);
    showToast(`${batch.rowCount.toLocaleString('it-IT')} transazioni importate`);
  };

  const fields = kind === 'transactions' ? TX_FIELDS : INCOME_FIELDS;

  return (
    <Page title="Importa CSV" grouped leading={<BackLink href="#/impostazioni" label="Impostazioni" />}>
      <ListGroup
        header="File"
        footer="Il file viene letto solo su questo iPhone. Puoi importare lo stesso file più volte: le righe già presenti vengono saltate."
      >
        <Row icon="📄" label={loaded ? loaded.fileName : 'Scegli un file CSV…'} detail={loaded ? `${loaded.csv.rows.length.toLocaleString('it-IT')} righe` : undefined} onClick={() => fileInput.current?.click()} chevron />
      </ListGroup>
      <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => void onFile(e)} />
      {readError && <p className={styles.issue}>{readError}</p>}

      {loaded && plan && categories && methods && (
        <>
          <ListGroup header="Formato">
            <li className={styles.segment}>
              <SegmentedControl
                label="Tipo di file"
                value={kind}
                onChange={changeKind}
                options={[
                  { value: 'transactions', label: 'Transazioni' },
                  { value: 'income', label: 'Entrate per periodo' },
                ]}
              />
            </li>
            <li className={styles.segment}>
              <SegmentedControl
                label="Separatore decimale"
                value={decimal}
                onChange={setDecimal}
                options={[
                  { value: '.', label: 'Punto (12.50)' },
                  { value: ',', label: 'Virgola (12,50)' },
                ]}
              />
            </li>
          </ListGroup>

          <ListGroup header="Colonne" footer={plan.missingColumns.length > 0 ? `Mancano: ${plan.missingColumns.map((f) => FIELD_LABELS[f as keyof typeof FIELD_LABELS]).join(', ')}` : undefined}>
            {fields.map((f) => (
              <li key={f} className={listStyles.item}>
                <label className={styles.mapRow}>
                  <span className={styles.mapLabel}>{FIELD_LABELS[f]}</span>
                  <select
                    className={styles.select}
                    value={mapping[f] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping(Object.fromEntries([...Object.entries(mapping).filter(([k]) => k !== f), ...(v === '' ? [] : [[f, Number(v)]])]) as ColumnMapping);
                    }}
                  >
                    <option value="">—</option>
                    {loaded.csv.header.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `Colonna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ListGroup>

          {plan.unknownCategories.length > 0 && (
            <RemapGroup
              header="Categorie da rimappare"
              values={plan.unknownCategories}
              options={categories.filter((c) => !c.archived)}
              overrides={categoryOverrides}
              onChange={(key, id) => setCategoryOverrides((o) => ({ ...o, [key]: id }))}
            />
          )}
          {plan.unknownMethods.length > 0 && (
            <RemapGroup
              header="Metodi da rimappare"
              values={plan.unknownMethods}
              options={methods.filter((m) => !m.archived)}
              overrides={methodOverrides}
              onChange={(key, id) => setMethodOverrides((o) => ({ ...o, [key]: id }))}
            />
          )}

          {plan.missingColumns.length === 0 && (
            <>
              <div className={styles.stats}>
                <Stat value={plan.toImport.length} label="da importare" />
                <Stat value={plan.duplicates} label="già presenti (saltate)" />
                <Stat value={plan.errors.length} label="con errori (escluse)" />
                <Stat value={plan.warnings.length} label="avvisi" />
              </div>

              {totals.length > 0 && <TotalsTable totals={totals} hasErrors={plan.errors.length > 0} />}

              {plan.errors.length > 0 && <IssueList header="Righe escluse" issues={plan.errors} />}
              {plan.warnings.length > 0 && <IssueList header="Avvisi" issues={plan.warnings} />}

              <div className={styles.cta}>
                <Button size="large" block disabled={plan.toImport.length === 0} onClick={() => setConfirming(true)}>
                  {plan.toImport.length === 0
                    ? 'Niente da importare'
                    : `Importa ${plan.toImport.length.toLocaleString('it-IT')} ${plan.toImport.length === 1 ? 'riga' : 'righe'}`}
                </Button>
              </div>
            </>
          )}

          <ConfirmSheet
            open={confirming}
            onClose={() => setConfirming(false)}
            emoji="📥"
            title="Confermi l'import?"
            confirmLabel={`Importa ${plan.toImport.length.toLocaleString('it-IT')} righe`}
            onConfirm={doImport}
          >
            <TotalsTable totals={totals} hasErrors={plan.errors.length > 0} compact />
            Potrai annullare l'intero import da questa pagina.
          </ConfirmSheet>
        </>
      )}

      {batches && batches.length > 0 && (
        <ListGroup header="Import eseguiti" footer="«Annulla» elimina tutte le righe di quell'import, senza toccare il resto.">
          {[...batches]
            .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
            .map((b) => (
              <Row
                key={b.id}
                icon="🧾"
                label={b.fileName}
                detail={`${b.rowCount.toLocaleString('it-IT')} righe · ${formatFullDate(b.importedAt.slice(0, 10))}`}
                value="Annulla"
                onClick={() => setUndoing(b.id)}
              />
            ))}
        </ListGroup>
      )}

      <ConfirmSheet
        open={undoing !== null}
        onClose={() => setUndoing(null)}
        emoji="↩️"
        title="Annullare questo import?"
        confirmLabel="Elimina le righe importate"
        destructive
        onConfirm={async () => {
          if (!undoing) return;
          const n = await undoImport(undoing);
          setUndoing(null);
          showToast(`${n.toLocaleString('it-IT')} righe rimosse`);
        }}
      >
        Verranno eliminate tutte le transazioni arrivate con questo import, anche se le hai modificate dopo.
      </ConfirmSheet>
    </Page>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value.toLocaleString('it-IT')}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function TotalsTable({ totals, hasErrors, compact = false }: { totals: TotalsCheck[]; hasErrors: boolean; compact?: boolean }) {
  const table = (
    <table className={styles.table}>
      <caption className="visually-hidden">Totali per anno di competenza</caption>
      <thead>
        <tr>
          <th scope="col">Anno</th>
          <th scope="col">Uscite</th>
          <th scope="col">Entrate</th>
          <th scope="col">Verifica</th>
        </tr>
      </thead>
      <tbody>
        {totals.map((t) => (
          <tr key={t.year}>
            <td>{t.year}</td>
            <td>{formatCents(t.expenseCents)}</td>
            <td>{t.incomeCents > 0 ? formatCents(t.incomeCents) : '—'}</td>
            <td>
              {t.diffCents === null ? (
                <span className={styles.muted}>somma CSV</span>
              ) : t.diffCents === 0 || t.expenseCents === 0 ? (
                t.expenseCents === 0 ? (
                  <span className={styles.muted}>—</span>
                ) : (
                  <span className={styles.ok} aria-label="Corrisponde">
                    ✓
                  </span>
                )
              ) : (
                <span className={styles.ko}>{formatCents(t.diffCents, { signed: true })}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (compact) return <div style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>{table}</div>;
  return (
    <ListGroup
      header="Totali per competenza"
      footer={
        <>
          ✓ = uguale al tuo file Numbers (2023: 26.515,57 €, 2024: 19.773,87 €, 2025: 19.593,59 €). Il 2026 è la somma del
          CSV.{hasErrors ? ' Attenzione: ci sono righe escluse, i totali non le comprendono.' : ''}
        </>
      }
    >
      <li className={styles.block}>{table}</li>
    </ListGroup>
  );
}

function IssueList({ header, issues }: { header: string; issues: { line: number; message: string }[] }) {
  const shown = issues.slice(0, 50);
  return (
    <ListGroup header={header} footer={issues.length > shown.length ? `E altre ${issues.length - shown.length}.` : undefined}>
      {shown.map((i) => (
        <li key={`${i.line}-${i.message}`} className={styles.issue}>
          <span className={styles.issueLine}>riga {i.line}</span>
          <span>{i.message}</span>
        </li>
      ))}
    </ListGroup>
  );
}

function RemapGroup({
  header,
  values,
  options,
  overrides,
  onChange,
}: {
  header: string;
  values: { key: string; value: string; count: number }[];
  options: (Category | PaymentMethod)[];
  overrides: Record<string, Id>;
  onChange: (key: string, id: Id) => void;
}) {
  return (
    <ListGroup header={header} footer="Scegli a cosa corrisponde ogni valore del file. Le righe restano escluse finché non lo fai.">
      {values.map((v) => (
        <li key={v.key} className={listStyles.item}>
          <label className={styles.mapRow}>
            <span className={styles.mapLabel}>
              «{v.value}»<span className={styles.mapCount}>{v.count} righe</span>
            </span>
            <select className={styles.select} value={overrides[normalizeText(v.key)] ?? ''} onChange={(e) => onChange(v.key, e.target.value)}>
              <option value="">Scegli…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.emoji} {o.name}
                </option>
              ))}
            </select>
          </label>
        </li>
      ))}
    </ListGroup>
  );
}
