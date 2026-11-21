import { useState } from 'react';
import { centsToInput, parseAmount, sanitizeAmountTyping } from '../../core/money';
import type { Category, CategoryGroup, PaymentMethod, TransactionKind } from '../../core/types';
import { EMPTY_FILTER, KIND_LABELS, PERIOD_LABELS, type PeriodPreset, type ViewFilter } from '../../core/views';
import { Button, Chip, Chips, SegmentedControl, Sheet } from '../../ui/components';
import styles from './Sheets.module.css';

const PERIODS: PeriodPreset[] = ['all', 'thisMonth', 'lastMonth', 'last30', 'thisYear', 'lastYear', 'custom'];
const KINDS: TransactionKind[] = ['expense', 'income', 'transfer'];

const toggle = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** Composable filters: OR inside each property, AND between properties (like Notion's simple filters). */
export function FilterSheet({
  open,
  onClose,
  filter,
  onChange,
  categories,
  groups,
  methods,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  filter: ViewFilter;
  onChange: (f: ViewFilter) => void;
  categories: Category[];
  groups: CategoryGroup[];
  methods: PaymentMethod[];
  tags: string[];
}) {
  const set = (patch: Partial<ViewFilter>) => onChange({ ...filter, ...patch });
  // Bumped by "Azzera" so the amount fields drop their local text.
  const [resets, setResets] = useState(0);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Filtri"
      title="Filtri"
      leading={
        <Button
          variant="plain"
          onClick={() => {
            onChange({ ...EMPTY_FILTER, text: filter.text });
            setResets((n) => n + 1);
          }}
        >
          Azzera
        </Button>
      }
      trailing={
        <Button variant="plain" onClick={onClose} style={{ fontWeight: 600 }}>
          Fine
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.label}>Periodo</div>
        <Chips label="Periodo">
          {PERIODS.map((p) => (
            <Chip key={p} selected={filter.period === p} onClick={() => set({ period: p })}>
              {PERIOD_LABELS[p]}
            </Chip>
          ))}
        </Chips>
        {filter.period === 'custom' && (
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Dal</span>
              <input className={styles.input} type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Al</span>
              <input className={styles.input} type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </div>
        )}
        <div className={styles.segment}>
          <SegmentedControl
            label="Periodo calcolato su"
            value={filter.basis}
            onChange={(basis) => set({ basis })}
            options={[
              { value: 'accrual', label: 'Competenza' },
              { value: 'payment', label: 'Data pagamento' },
            ]}
          />
        </div>

        <div className={styles.label}>Tipo</div>
        <Chips label="Tipo">
          {KINDS.map((k) => (
            <Chip key={k} selected={filter.kinds.includes(k)} onClick={() => set({ kinds: toggle(filter.kinds, k) })}>
              {KIND_LABELS[k]}
            </Chip>
          ))}
        </Chips>

        <div className={styles.label}>Macro-voce</div>
        <Chips label="Macro-voce">
          {groups.map((g) => (
            <Chip key={g.id} selected={filter.groupIds.includes(g.id)} onClick={() => set({ groupIds: toggle(filter.groupIds, g.id) })}>
              {g.name}
            </Chip>
          ))}
        </Chips>

        <div className={styles.label}>Categoria</div>
        <div className={styles.wrap} role="group" aria-label="Categoria">
          {categories
            .filter((c) => !c.archived || filter.categoryIds.includes(c.id))
            .map((c) => (
              <Chip key={c.id} emoji={c.emoji} selected={filter.categoryIds.includes(c.id)} onClick={() => set({ categoryIds: toggle(filter.categoryIds, c.id) })}>
                {c.name}
              </Chip>
            ))}
        </div>

        <div className={styles.label}>Metodo</div>
        <Chips label="Metodo">
          {methods.map((m) => (
            <Chip key={m.id} emoji={m.emoji} selected={filter.methodIds.includes(m.id)} onClick={() => set({ methodIds: toggle(filter.methodIds, m.id) })}>
              {m.name}
            </Chip>
          ))}
        </Chips>

        {tags.length > 0 && (
          <>
            <div className={styles.label}>Tag</div>
            <Chips label="Tag">
              {tags.map((t) => (
                <Chip key={t} selected={filter.tags.includes(t)} onClick={() => set({ tags: toggle(filter.tags, t) })}>
                  #{t}
                </Chip>
              ))}
            </Chips>
          </>
        )}

        <div className={styles.label}>Importo</div>
        <AmountRange key={resets} filter={filter} onChange={set} />
      </div>
    </Sheet>
  );
}

function AmountRange({ filter, onChange }: { filter: ViewFilter; onChange: (p: Partial<ViewFilter>) => void }) {
  // Local text so typing "12," is not reformatted mid-way; the filter gets parsed cents.
  const [min, setMin] = useState(filter.minCents === null ? '' : centsToInput(filter.minCents));
  const [max, setMax] = useState(filter.maxCents === null ? '' : centsToInput(filter.maxCents));
  const parse = (v: string) => (v.trim() ? parseAmount(v, ',') : null);
  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>Da €</span>
        <input
          className={styles.input}
          inputMode="decimal"
          placeholder="0"
          value={min}
          onChange={(e) => {
            const v = sanitizeAmountTyping(e.target.value);
            setMin(v);
            onChange({ minCents: parse(v) });
          }}
        />
      </label>
      <label className={styles.field}>
        <span>A €</span>
        <input
          className={styles.input}
          inputMode="decimal"
          placeholder="∞"
          value={max}
          onChange={(e) => {
            const v = sanitizeAmountTyping(e.target.value);
            setMax(v);
            onChange({ maxCents: parse(v) });
          }}
        />
      </label>
    </div>
  );
}
