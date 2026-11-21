import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { buildMethod, type MethodDraft } from '../../core/lists';
import type { PaymentMethod } from '../../core/types';
import { usePaymentMethods } from '../../db/hooks';
import { moveMethod, saveMethod, setMethodArchived, usageCounts } from '../../db/lists';
import { BackLink, Button, ListGroup, Page, Row, showToast } from '../../ui/components';
import { EditSheet } from './EditSheet';
import styles from './Form.module.css';

type Editing = { method: PaymentMethod | null; draft: MethodDraft } | null;

export function MethodsPage() {
  const methods = usePaymentMethods();
  const usage = useLiveQuery(() => usageCounts(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const back = <BackLink href="#/impostazioni" label="Impostazioni" />;
  if (!methods) return <Page title="Metodi di pagamento" grouped leading={back}>{null}</Page>;

  const open = (method: PaymentMethod | null) => {
    setError(null);
    setEditing({ method, draft: method ? { name: method.name, emoji: method.emoji } : { name: '', emoji: '' } });
  };
  const save = async () => {
    if (!editing) return;
    const r = buildMethod(editing.draft, methods, editing.method ?? undefined);
    if (!r.ok) return setError(r.error);
    await saveMethod(r.value);
    setEditing(null);
    showToast(editing.method ? 'Metodo aggiornato' : 'Metodo creato');
  };

  const active = methods.filter((m) => !m.archived);
  const archived = methods.filter((m) => m.archived);
  const current = editing?.method ? methods.find((m) => m.id === editing.method?.id) : undefined;
  const position = current ? active.findIndex((m) => m.id === current.id) : -1;
  const row = (m: PaymentMethod) => {
    const n = usage?.methods.get(m.id) ?? 0;
    return <Row key={m.id} icon={m.emoji} label={m.name} value={n > 0 ? n.toLocaleString('it-IT') : undefined} chevron onClick={() => open(m)} ariaLabel={`${m.name}, ${n} transazioni`} />;
  };

  return (
    <Page title="Metodi di pagamento" grouped leading={back}>
      <ListGroup footer="L'ordine è quello dei pulsanti nell'inserimento rapido.">
        {active.map(row)}
        <Row icon="＋" label={<span style={{ color: 'var(--color-accent)' }}>Nuovo metodo</span>} onClick={() => open(null)} />
      </ListGroup>
      {archived.length > 0 && <ListGroup header="Archiviati">{archived.map(row)}</ListGroup>}

      <EditSheet open={editing !== null} title={editing?.method ? 'Modifica metodo' : 'Nuovo metodo'} onClose={() => setEditing(null)} onSave={() => void save()}>
        {editing && (
          <div className={styles.section}>
            <label className={styles.row}>
              <span>Nome</span>
              <input
                className={styles.input}
                value={editing.draft.name}
                autoComplete="off"
                placeholder="Es. Revolut"
                onChange={(e) => {
                  setError(null);
                  setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } });
                }}
              />
            </label>
            <label className={styles.row}>
              <span>Emoji</span>
              <input
                className={`${styles.input} ${styles.emojiInput}`}
                value={editing.draft.emoji}
                autoComplete="off"
                placeholder="💳"
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, emoji: e.target.value } })}
              />
            </label>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {current && (
          <div className={styles.actions}>
            {!current.archived && active.length > 1 && (
              <div className={styles.moveRow}>
                <Button variant="secondary" disabled={position <= 0} onClick={() => void moveMethod(current.id, -1)}>
                  ↑ Sposta su
                </Button>
                <Button variant="secondary" disabled={position >= active.length - 1} onClick={() => void moveMethod(current.id, 1)}>
                  ↓ Sposta giù
                </Button>
              </div>
            )}
            <Button
              variant={current.archived ? 'secondary' : 'destructive'}
              block
              disabled={!current.archived && active.length <= 1}
              onClick={async () => {
                await setMethodArchived(current.id, !current.archived);
                setEditing(null);
                showToast(current.archived ? 'Metodo ripristinato' : 'Metodo archiviato');
              }}
            >
              {current.archived ? 'Ripristina' : 'Archivia'}
            </Button>
          </div>
        )}
      </EditSheet>
    </Page>
  );
}
