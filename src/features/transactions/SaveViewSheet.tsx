import { useState } from 'react';
import type { SavedView } from '../../core/types';
import { buildSavedView, type ViewConfig } from '../../core/views';
import { saveView } from '../../db/views';
import { newId } from '../../db/repo';
import { Button, Sheet, showToast } from '../../ui/components';
import styles from './Sheets.module.css';

/** Create a view from the current settings, or rename / delete an existing one. */
export function SaveViewSheet({
  open,
  onClose,
  config,
  views,
  editing,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  config: ViewConfig;
  views: SavedView[];
  editing: SavedView | null;
  onSaved: (view: SavedView) => void;
  onDelete: (view: SavedView) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={editing ? 'Modifica vista' : 'Nuova vista'}>
      {/* Remount per opening so the fields start from the view being edited. */}
      {open && <Form key={editing?.id ?? 'new'} onClose={onClose} config={config} views={views} editing={editing} onSaved={onSaved} onDelete={onDelete} />}
    </Sheet>
  );
}

function Form({ onClose, config, views, editing, onSaved, onDelete }: Omit<Parameters<typeof SaveViewSheet>[0], 'open'>) {
  const [name, setName] = useState(editing?.name ?? '');
  const [emoji, setEmoji] = useState(editing?.emoji ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const r = buildSavedView(name, emoji, config, views, editing ?? undefined, newId);
    if (!r.ok) return setError(r.error);
    await saveView(r.value);
    onSaved(r.value);
    showToast(editing ? 'Vista aggiornata' : 'Vista salvata');
  };

  return (
    <>
      <div className={styles.sheetHeader}>
        <Button variant="plain" onClick={onClose}>
          Annulla
        </Button>
        <h2 className={styles.sheetTitle}>{editing ? 'Modifica vista' : 'Nuova vista'}</h2>
        <Button variant="plain" onClick={() => void save()} style={{ fontWeight: 600 }}>
          Salva
        </Button>
      </div>
      <div className={styles.body}>
        <label className={styles.row}>
          <span>Emoji</span>
          <input className={`${styles.input} ${styles.emoji}`} value={emoji} placeholder="📄" autoComplete="off" onChange={(e) => setEmoji(e.target.value)} />
        </label>
        <label className={styles.row}>
          <span>Nome</span>
          <input
            className={styles.input}
            value={name}
            placeholder="Es. Cibo fuori casa 2026"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.hint}>
          {editing
            ? 'Salvando, la vista prende anche filtri, ordinamento e layout che vedi adesso.'
            : 'La vista ricorda filtri, ricerca, ordinamento, raggruppamento e layout attuali.'}
        </p>
        {editing && (
          <div className={styles.actions}>
            <Button variant="destructive" block onClick={() => onDelete(editing)}>
              Elimina vista
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
