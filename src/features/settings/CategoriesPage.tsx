import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { TAG_COLORS, TAG_COLOR_LABELS } from '../../core/colors';
import { buildCategory, type CategoryDraft } from '../../core/lists';
import type { Category, CategoryGroup } from '../../core/types';
import { useCategories, useCategoryGroups } from '../../db/hooks';
import { moveCategory, saveCategory, setCategoryArchived, usageCounts } from '../../db/lists';
import { BackLink, Button, Chip, Chips, ListGroup, Page, Row, showToast, tagStyle } from '../../ui/components';
import { EditSheet } from './EditSheet';
import styles from './Form.module.css';

type Editing = { category: Category | null; draft: CategoryDraft } | null;

export function CategoriesPage() {
  const categories = useCategories();
  const groups = useCategoryGroups();
  const usage = useLiveQuery(() => usageCounts(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);

  if (!categories || !groups) return <Page title="Categorie" grouped leading={<BackLink href="#/impostazioni" label="Impostazioni" />}>{null}</Page>;

  const open = (category: Category | null, groupId: string | null) => {
    setError(null);
    setEditing({
      category,
      draft: category
        ? { name: category.name, emoji: category.emoji, color: category.color, groupId: category.groupId }
        : { name: '', emoji: '', color: 'gray', groupId },
    });
  };

  const save = async () => {
    if (!editing) return;
    const r = buildCategory(editing.draft, categories, groups, editing.category ?? undefined);
    if (!r.ok) return setError(r.error);
    await saveCategory(r.value);
    setEditing(null);
    showToast(editing.category ? 'Categoria aggiornata' : 'Categoria creata');
  };

  const archived = categories.filter((c) => c.archived);
  const current = editing?.category ? categories.find((c) => c.id === editing.category?.id) : undefined;
  const siblings = current ? categories.filter((c) => c.groupId === current.groupId && !c.archived) : [];
  const position = current ? siblings.findIndex((c) => c.id === current.id) : -1;

  return (
    <Page title="Categorie" grouped leading={<BackLink href="#/impostazioni" label="Impostazioni" />}>
      {groups.map((g) => (
        <ListGroup key={g.id} header={`${g.name}${g.kind === 'income' ? ' · entrate' : ''}`}>
          {categories
            .filter((c) => c.groupId === g.id && !c.archived)
            .map((c) => (
              <CategoryRow key={c.id} c={c} count={usage?.categories.get(c.id) ?? 0} onClick={() => open(c, null)} />
            ))}
          <Row icon="＋" label={<span style={{ color: 'var(--color-accent)' }}>Nuova categoria</span>} onClick={() => open(null, g.id)} />
        </ListGroup>
      ))}

      {archived.length > 0 && (
        <ListGroup header="Archiviate" footer="Le categorie archiviate non compaiono più nell'inserimento, ma le loro transazioni restano nei totali.">
          {archived.map((c) => (
            <CategoryRow key={c.id} c={c} count={usage?.categories.get(c.id) ?? 0} onClick={() => open(c, null)} />
          ))}
        </ListGroup>
      )}

      <EditSheet open={editing !== null} title={editing?.category ? 'Modifica categoria' : 'Nuova categoria'} onClose={() => setEditing(null)} onSave={() => void save()}>
        {editing && (
          <CategoryForm
            draft={editing.draft}
            groups={groups}
            onChange={(draft) => {
              setError(null);
              setEditing({ ...editing, draft });
            }}
          />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {current && (
          <div className={styles.actions}>
            {!current.archived && siblings.length > 1 && (
              <div className={styles.moveRow}>
                <Button variant="secondary" disabled={position <= 0} onClick={() => void moveCategory(current.id, -1)}>
                  ↑ Sposta su
                </Button>
                <Button variant="secondary" disabled={position >= siblings.length - 1} onClick={() => void moveCategory(current.id, 1)}>
                  ↓ Sposta giù
                </Button>
              </div>
            )}
            <Button
              variant={current.archived ? 'secondary' : 'destructive'}
              block
              onClick={async () => {
                await setCategoryArchived(current.id, !current.archived);
                setEditing(null);
                showToast(current.archived ? 'Categoria ripristinata' : 'Categoria archiviata');
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

function CategoryRow({ c, count, onClick }: { c: Category; count: number; onClick: () => void }) {
  return (
    <Row
      icon={
        <span className={styles.tile} style={tagStyle(c.color)}>
          {c.emoji}
        </span>
      }
      label={c.name}
      value={count > 0 ? count.toLocaleString('it-IT') : undefined}
      chevron
      onClick={onClick}
      ariaLabel={`${c.name}, ${count} transazioni`}
    />
  );
}

function CategoryForm({ draft, groups, onChange }: { draft: CategoryDraft; groups: CategoryGroup[]; onChange: (d: CategoryDraft) => void }) {
  return (
    <>
      <div className={styles.section}>
        <label className={styles.row}>
          <span>Nome</span>
          <input
            className={styles.input}
            value={draft.name}
            autoCapitalize="sentences"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Es. Cene fuori"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
        <label className={styles.row}>
          <span>Emoji</span>
          <input
            className={`${styles.input} ${styles.emojiInput}`}
            value={draft.emoji}
            autoComplete="off"
            placeholder="🏷️"
            aria-describedby="emoji-hint"
            onChange={(e) => onChange({ ...draft, emoji: e.target.value })}
          />
        </label>
      </div>
      <p className={styles.hint} id="emoji-hint">
        Per l'emoji usa il tasto 🌐 o 😀 della tastiera.
      </p>
      <div className={styles.label}>Colore</div>
      <div className={styles.chips}>
        <Chips label="Colore">
          {TAG_COLORS.map((color) => (
            <Chip key={color} selected={draft.color === color} onClick={() => onChange({ ...draft, color })}>
              <span className={styles.swatch} style={tagStyle(color)} aria-hidden="true" /> {TAG_COLOR_LABELS[color]}
            </Chip>
          ))}
        </Chips>
      </div>
      <div className={styles.label}>Macro-voce</div>
      <div className={styles.chips}>
        <Chips label="Macro-voce">
          {groups.map((g) => (
            <Chip key={g.id} selected={draft.groupId === g.id} onClick={() => onChange({ ...draft, groupId: g.id })}>
              {g.name}
            </Chip>
          ))}
        </Chips>
      </div>
    </>
  );
}
