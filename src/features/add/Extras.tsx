import { useState } from 'react';
import { formatCents } from '../../core/format';
import { installmentLabel, type PlanProgress } from '../../core/installments';
import { parseAmount, sanitizeAmountTyping } from '../../core/money';
import { buildPerson, buildSplit, type SplitDraft } from '../../core/split';
import type { Id, Person } from '../../core/types';
import { savePerson } from '../../db/shared';
import { newId } from '../../db/repo';
import { Chip, Chips, SegmentedControl, Switch, showToast } from '../../ui/components';
import styles from './AddSheet.module.css';

export interface NewPlanDraft {
  total: string;
  count: string;
}

/** "È una rata di…": pick an open plan, start a new one, or none. */
export function InstallmentPicker({
  plans,
  value,
  newPlan,
  editingPlan,
  onPick,
  onNewPlan,
}: {
  plans: PlanProgress[];
  value: { planId: Id; index: number } | null;
  newPlan: NewPlanDraft | null;
  /** The plan of the transaction being edited, shown even when complete. */
  editingPlan: PlanProgress | undefined;
  onPick: (p: PlanProgress | null) => void;
  onNewPlan: (d: NewPlanDraft | null) => void;
}) {
  const list = editingPlan && !plans.some((p) => p.plan.id === editingPlan.plan.id) ? [editingPlan, ...plans] : plans;
  const selected = value ? list.find((p) => p.plan.id === value.planId) : undefined;
  return (
    <div className={styles.extra}>
      <div className={styles.extraTitle}>🧾 È una rata di…</div>
      <Chips label="Piano a rate">
        <Chip selected={value === null && newPlan === null} onClick={() => onPick(null)}>
          No
        </Chip>
        {list.map((p) => (
          <Chip key={p.plan.id} selected={value?.planId === p.plan.id} onClick={() => onPick(p)}>
            {p.plan.title}
          </Chip>
        ))}
        <Chip selected={newPlan !== null} onClick={() => onNewPlan(newPlan ? null : { total: '', count: '3' })}>
          ＋ Nuovo piano
        </Chip>
      </Chips>
      {selected && value && (
        <p className={styles.extraHint}>
          {installmentLabel(value.index, selected.plan.count)} di {selected.plan.count}
          {selected.remainingCents > 0 ? ` · restano ${formatCents(selected.remainingCents)} prima di questa` : ''}. La competenza è quella del piano.
        </p>
      )}
      {newPlan && (
        <div className={styles.extraGrid}>
          <label>
            <span>Totale €</span>
            <input
              className={styles.text}
              inputMode="decimal"
              placeholder="0,00"
              value={newPlan.total}
              onChange={(e) => onNewPlan({ ...newPlan, total: sanitizeAmountTyping(e.target.value) })}
            />
          </label>
          <label>
            <span>Numero di rate</span>
            <input
              className={styles.text}
              inputMode="numeric"
              pattern="[0-9]*"
              value={newPlan.count}
              onChange={(e) => onNewPlan({ ...newPlan, count: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
          </label>
          <p className={styles.extraHint}>Questa spesa diventa la prima rata. Il piano prende descrizione, categoria e competenza da qui.</p>
        </div>
      )}
    </div>
  );
}

/** "Spesa condivisa": who paid, with whom, and my share. */
export function SplitEditor({
  amount,
  people,
  value,
  onChange,
}: {
  amount: string;
  people: Person[];
  value: SplitDraft;
  onChange: (d: SplitDraft) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const active = people.filter((p) => !p.archived || value.people.includes(p.id) || value.paidBy === p.id);
  const total = parseAmount(amount, ',');
  const preview = value.enabled && total !== null && total > 0 ? buildSplit(total, value) : null;
  const name = (id: Id) => people.find((p) => p.id === id)?.name ?? '?';

  const toggle = (id: Id) => {
    const on = value.people.includes(id) || value.paidBy === id;
    onChange({
      ...value,
      people: on ? value.people.filter((x) => x !== id) : [...value.people, id],
      paidBy: on && value.paidBy === id ? 'me' : value.paidBy,
    });
  };

  const addPerson = async () => {
    if (adding === null) return;
    const r = buildPerson(adding, people, newId);
    if (!r.ok) {
      showToast(r.error, { icon: 'none' });
      return;
    }
    await savePerson(r.value);
    setAdding(null);
    onChange({ ...value, people: [...value.people, r.value.id] });
  };

  return (
    <div className={styles.extra}>
      <label className={styles.extraSwitch}>
        <span className={styles.extraTitle}>👥 Spesa condivisa</span>
        <Switch checked={value.enabled} label="Spesa condivisa" onChange={(enabled) => onChange({ ...value, enabled })} />
      </label>
      {value.enabled && (
        <>
          <div className={styles.extraLabel}>Con</div>
          <Chips label="Persone con cui dividi">
            {active.map((p) => (
              <Chip key={p.id} selected={value.people.includes(p.id) || value.paidBy === p.id} onClick={() => toggle(p.id)}>
                {p.name}
              </Chip>
            ))}
            <Chip selected={adding !== null} onClick={() => setAdding(adding === null ? '' : null)}>
              ＋ Persona
            </Chip>
          </Chips>
          {adding !== null && (
            <div className={styles.extraInline}>
              <input
                className={styles.text}
                autoFocus
                autoCapitalize="words"
                placeholder="Nome (es. Nicola)"
                value={adding}
                enterKeyHint="done"
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addPerson()}
              />
              <button type="button" className={styles.extraButton} onClick={() => void addPerson()}>
                Aggiungi
              </button>
            </div>
          )}
          <div className={styles.extraLabel}>Ha pagato</div>
          <Chips label="Chi ha pagato">
            <Chip selected={value.paidBy === 'me'} onClick={() => onChange({ ...value, paidBy: 'me' })}>
              Io
            </Chip>
            {active
              .filter((p) => value.people.includes(p.id) || value.paidBy === p.id)
              .map((p) => (
                <Chip key={p.id} selected={value.paidBy === p.id} onClick={() => onChange({ ...value, paidBy: p.id })}>
                  {p.name}
                </Chip>
              ))}
          </Chips>
          <div className={styles.extraSegment}>
            <SegmentedControl
              label="Come dividere"
              value={value.mode}
              onChange={(mode) => onChange({ ...value, mode })}
              options={[
                { value: 'equal', label: 'In parti uguali' },
                { value: 'mine', label: 'Indico la mia quota' },
              ]}
            />
          </div>
          {value.mode === 'mine' && (
            <label className={styles.extraInline}>
              <span>La mia quota €</span>
              <input
                className={styles.text}
                inputMode="decimal"
                placeholder="0,00"
                value={value.myShare}
                onChange={(e) => onChange({ ...value, myShare: sanitizeAmountTyping(e.target.value) })}
              />
            </label>
          )}
          {preview?.ok && preview.value && (
            <p className={styles.extraHint}>
              La tua quota: <strong>{formatCents(preview.value.myShareCents)}</strong> (conta solo questa nelle spese).{' '}
              {preview.value.paidBy === 'me'
                ? `Ti devono: ${preview.value.shares.map((s) => `${name(s.personId)} ${formatCents(s.amountCents)}`).join(', ')}.`
                : `Devi ${formatCents(preview.value.myShareCents)} a ${name(preview.value.paidBy)}.`}
            </p>
          )}
          {preview && !preview.ok && <p className={styles.extraHint}>{preview.error}</p>}
        </>
      )}
    </div>
  );
}
