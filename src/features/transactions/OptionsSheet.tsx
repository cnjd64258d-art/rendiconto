import { ALL_COLUMNS, COLUMN_LABELS, GROUP_LABELS, SORT_LABELS, type BoardField, type GroupField, type Layout, type SortField, type ViewConfig } from '../../core/views';
import { Button, Chip, Chips, SegmentedControl, Sheet } from '../../ui/components';
import styles from './Sheets.module.css';

const SORTS = Object.keys(SORT_LABELS) as SortField[];
const GROUPS = Object.keys(GROUP_LABELS) as GroupField[];

/** Layout, sort, grouping and (for the table) columns of the current view. */
export function OptionsSheet({ open, onClose, config, onChange }: { open: boolean; onClose: () => void; config: ViewConfig; onChange: (c: ViewConfig) => void }) {
  const set = (patch: Partial<ViewConfig>) => onChange({ ...config, ...patch });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Opzioni vista"
      title="Vista"
      trailing={
        <Button variant="plain" onClick={onClose} style={{ fontWeight: 600 }}>
          Fine
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.label}>Layout</div>
        <div className={styles.segment}>
          <SegmentedControl<Layout>
            label="Layout"
            value={config.layout}
            onChange={(layout) => set({ layout })}
            options={[
              { value: 'list', label: 'Lista' },
              { value: 'table', label: 'Tabella' },
              { value: 'board', label: 'Board' },
              { value: 'calendar', label: 'Calendario' },
            ]}
          />
        </div>

        {config.layout !== 'calendar' && (
          <>
            <div className={styles.label}>Ordina per</div>
            <Chips label="Ordina per">
              {SORTS.map((f) => (
                <Chip key={f} selected={config.sort.field === f} onClick={() => set({ sort: { ...config.sort, field: f } })}>
                  {SORT_LABELS[f]}
                </Chip>
              ))}
            </Chips>
            <div className={styles.segment}>
              <SegmentedControl
                label="Direzione"
                value={config.sort.direction}
                onChange={(direction) => set({ sort: { ...config.sort, direction } })}
                options={[
                  { value: 'desc', label: config.sort.field === 'date' ? 'Più recenti' : config.sort.field === 'amount' ? 'Più alti' : 'Z → A' },
                  { value: 'asc', label: config.sort.field === 'date' ? 'Più vecchie' : config.sort.field === 'amount' ? 'Più bassi' : 'A → Z' },
                ]}
              />
            </div>
          </>
        )}

        {(config.layout === 'list' || config.layout === 'table') && (
          <>
            <div className={styles.label}>Raggruppa per</div>
            <Chips label="Raggruppa per">
              {GROUPS.map((g) => (
                <Chip key={g} selected={config.groupBy === g} onClick={() => set({ groupBy: g })}>
                  {GROUP_LABELS[g]}
                </Chip>
              ))}
            </Chips>
          </>
        )}

        {config.layout === 'board' && (
          <>
            <div className={styles.label}>Colonne della board</div>
            <div className={styles.segment}>
              <SegmentedControl<BoardField>
                label="Colonne della board"
                value={config.boardBy}
                onChange={(boardBy) => set({ boardBy })}
                options={[
                  { value: 'category', label: 'Categoria' },
                  { value: 'group', label: 'Macro-voce' },
                  { value: 'method', label: 'Metodo' },
                ]}
              />
            </div>
          </>
        )}

        {config.layout === 'table' && (
          <>
            <div className={styles.label}>Colonne visibili</div>
            <div className={styles.wrap} role="group" aria-label="Colonne visibili">
              {ALL_COLUMNS.map((c) => {
                const on = config.columns.includes(c);
                return (
                  <Chip
                    key={c}
                    selected={on}
                    onClick={() => {
                      if (on && config.columns.length === 1) return;
                      // Keep the canonical column order.
                      set({ columns: on ? config.columns.filter((x) => x !== c) : ALL_COLUMNS.filter((x) => x === c || config.columns.includes(x)) });
                    }}
                  >
                    {COLUMN_LABELS[c]}
                  </Chip>
                );
              })}
            </div>
            <p className={styles.hint}>La prima colonna resta fissa quando scorri di lato. Tocca un'intestazione per ordinare.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
