import { useMemo, useState } from 'react';
import { today } from '../../core/dates';
import { formatCents, formatDayShort } from '../../core/format';
import { sanitizeAmountTyping } from '../../core/money';
import {
  draftFromRule,
  emptyRuleDraft,
  kindResolver,
  nextOccurrence,
  validateRuleDraft,
  yearlyCents,
  type RuleDraft,
  type RuleField,
} from '../../core/recurring';
import type { Category, CategoryGroup, Frequency, PaymentMethod, RecurringRule } from '../../core/types';
import { useCategories, useCategoryGroups, usePaymentMethods, useRecurringRules } from '../../db/hooks';
import { deleteRule, generateRecurring, saveRule } from '../../db/recurring';
import { BackLink, Button, Chip, Chips, ConfirmSheet, ListGroup, Page, Row, SegmentedControl, showToast, EmptyState } from '../../ui/components';
import { EditSheet } from './EditSheet';
import styles from './Form.module.css';

const FREQUENCY_SHORT: Record<Frequency, string> = { monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' };

type Editing = { rule: RecurringRule | null; draft: RuleDraft } | null;

export function RecurringPage() {
  const rules = useRecurringRules();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const methods = usePaymentMethods();
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<Partial<Record<RuleField, string>>>({});
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const todayISO = today();
  const kindOf = useMemo(() => kindResolver(categories ?? [], groups ?? []), [categories, groups]);
  const back = <BackLink href="#/impostazioni" label="Impostazioni" />;

  const sorted = useMemo(
    () =>
      (rules ?? [])
        .map((r) => ({ rule: r, next: r.active ? nextOccurrence(r, todayISO) : null }))
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.rule.title.localeCompare(b.rule.title, 'it')),
    [rules, todayISO],
  );

  if (!rules || !categories || !groups || !methods) return <Page title="Ricorrenti" grouped leading={back}>{null}</Page>;

  const catById = new Map(categories.map((c) => [c.id, c]));
  const active = sorted.filter((s) => s.rule.active);
  const paused = sorted.filter((s) => !s.rule.active);
  const yearlyExpense = active.filter((s) => kindOf(s.rule.categoryId) === 'expense').reduce((sum, s) => sum + yearlyCents(s.rule), 0);

  const open = (rule: RecurringRule | null) => {
    setErrors({});
    setEditing({ rule, draft: rule ? draftFromRule(rule) : { ...emptyRuleDraft(todayISO), paymentMethodId: methods.find((m) => !m.archived)?.id ?? null } });
  };

  const save = async () => {
    if (!editing) return;
    const r = validateRuleDraft(editing.draft, todayISO, editing.rule ?? undefined);
    if (!r.ok) return setErrors(r.errors);
    await saveRule(r.value, editing.rule?.id);
    const generated = await generateRecurring(todayISO);
    setEditing(null);
    showToast(generated > 0 ? `Salvata · ${generated} da confermare` : 'Ricorrente salvata');
  };

  const row = ({ rule, next }: { rule: RecurringRule; next: string | null }) => {
    const cat = catById.get(rule.categoryId);
    const income = kindOf(rule.categoryId) === 'income';
    const amount = `${rule.isEstimate ? '≈ ' : ''}${income ? formatCents(rule.amountCents, { signed: true }) : formatCents(rule.amountCents)}`;
    const when = !rule.active ? 'in pausa' : next ? formatDayShort(next) : 'terminata';
    return (
      <Row
        key={rule.id}
        icon={cat?.emoji ?? '🔁'}
        label={rule.title}
        detail={`${FREQUENCY_SHORT[rule.frequency]} · ${when}`}
        value={amount}
        onClick={() => open(rule)}
      />
    );
  };

  return (
    <Page title="Ricorrenti" grouped leading={back}>
      {rules.length === 0 && (
        <EmptyState emoji="🔁" title="Nessuna spesa ricorrente">
          Affitto, abbonamenti, bollette: inseriscili una volta e te li ricordo io alla scadenza.
        </EmptyState>
      )}
      <ListGroup
        footer={
          active.length > 0
            ? `Spese fisse attive: ${formatCents(yearlyExpense, { decimals: false })} l'anno. Alla scadenza ogni voce diventa una transazione «da confermare» in Oggi.`
            : 'Alla scadenza ogni voce diventa una transazione «da confermare» in Oggi: la confermi con un tap, o correggi prima l’importo.'
        }
      >
        {active.map(row)}
        <Row icon="＋" label={<span style={{ color: 'var(--color-accent)' }}>Nuova ricorrente</span>} onClick={() => open(null)} />
      </ListGroup>
      {paused.length > 0 && <ListGroup header="In pausa o terminate">{paused.map(row)}</ListGroup>}

      <EditSheet open={editing !== null} title={editing?.rule ? 'Modifica ricorrente' : 'Nuova ricorrente'} onClose={() => setEditing(null)} onSave={() => void save()}>
        {editing && (
          <RuleForm
            draft={editing.draft}
            errors={errors}
            categories={categories}
            groups={groups}
            methods={methods}
            onChange={(draft) => {
              setErrors({});
              setEditing({ ...editing, draft });
            }}
          />
        )}
        {editing?.rule && (
          <div className={styles.actions}>
            <Button variant="destructive" block onClick={() => setDeleting(editing.rule)}>
              Elimina ricorrente
            </Button>
          </div>
        )}
      </EditSheet>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        emoji="🗑️"
        title={`Eliminare «${deleting?.title ?? ''}»?`}
        confirmLabel="Elimina"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteRule(deleting.id);
          setDeleting(null);
          setEditing(null);
          showToast('Ricorrente eliminata');
        }}
      >
        Le transazioni già confermate restano. Quelle ancora da confermare vengono eliminate. Per sospenderla senza perderla, mettila in pausa.
      </ConfirmSheet>
    </Page>
  );
}

function RuleForm({
  draft,
  errors,
  categories,
  groups,
  methods,
  onChange,
}: {
  draft: RuleDraft;
  errors: Partial<Record<RuleField, string>>;
  categories: Category[];
  groups: CategoryGroup[];
  methods: PaymentMethod[];
  onChange: (d: RuleDraft) => void;
}) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  const groupOrder = new Map(groups.map((g) => [g.id, g.order]));
  const cats = categories
    .filter((c) => !c.archived || c.id === draft.categoryId)
    .sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) || a.order - b.order);
  const firstError = Object.values(errors)[0];
  return (
    <>
      <div className={styles.section}>
        <label className={styles.row}>
          <span>Nome</span>
          <input
            className={styles.input}
            value={draft.title}
            autoComplete="off"
            autoCapitalize="sentences"
            placeholder="Es. Rata Mutuo"
            aria-invalid={errors.title !== undefined}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className={styles.row}>
          <span>Importo €</span>
          <input
            className={styles.input}
            value={draft.amount}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={errors.amount !== undefined}
            onChange={(e) => set({ amount: sanitizeAmountTyping(e.target.value) })}
          />
        </label>
        <div className={styles.segment}>
          <SegmentedControl
            label="Tipo di importo"
            value={draft.isEstimate ? 'estimate' : 'fixed'}
            onChange={(v) => set({ isEstimate: v === 'estimate' })}
            options={[
              { value: 'fixed', label: 'Fisso' },
              { value: 'estimate', label: 'Stimato' },
            ]}
          />
        </div>
      </div>
      {draft.isEstimate && <p className={styles.hint}>Importo indicativo (es. Telepass): lo correggi quando confermi.</p>}

      <div className={styles.section}>
        <div className={styles.segment}>
          <SegmentedControl<Frequency>
            label="Frequenza"
            value={draft.frequency}
            onChange={(frequency) => set({ frequency })}
            options={[
              { value: 'monthly', label: 'Mensile' },
              { value: 'quarterly', label: 'Trimestrale' },
              { value: 'yearly', label: 'Annuale' },
            ]}
          />
        </div>
        <label className={styles.row}>
          <span>Giorno</span>
          <input
            className={styles.input}
            value={draft.dayOfMonth}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            aria-invalid={errors.dayOfMonth !== undefined}
            onChange={(e) => set({ dayOfMonth: e.target.value.replace(/\D/g, '') })}
          />
        </label>
        <label className={styles.row}>
          <span>{draft.frequency === 'monthly' ? 'Dal' : 'Prima volta'}</span>
          <input className={styles.input} type="date" value={draft.startDate} aria-invalid={errors.startDate !== undefined} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
        <label className={styles.row}>
          <span>Fino al</span>
          <input className={styles.input} type="date" value={draft.endDate} aria-invalid={errors.endDate !== undefined} onChange={(e) => set({ endDate: e.target.value })} />
        </label>
      </div>
      <p className={styles.hint}>
        {draft.frequency === 'monthly'
          ? 'Il 31 diventa l’ultimo giorno nei mesi più corti. Lascia vuoto «Fino al» se non ha una fine.'
          : 'Si ripete ogni ' + (draft.frequency === 'quarterly' ? '3 mesi' : 'anno') + ' a partire dal mese della prima volta.'}
      </p>

      <div className={styles.label}>Categoria</div>
      <div className={styles.chips}>
        <Chips label="Categoria">
          {cats.map((c) => (
            <Chip key={c.id} emoji={c.emoji} selected={draft.categoryId === c.id} onClick={() => set({ categoryId: c.id })}>
              {c.name}
            </Chip>
          ))}
        </Chips>
      </div>
      <div className={styles.label}>Metodo</div>
      <div className={styles.chips}>
        <Chips label="Metodo">
          {methods
            .filter((m) => !m.archived || m.id === draft.paymentMethodId)
            .map((m) => (
              <Chip key={m.id} emoji={m.emoji} selected={draft.paymentMethodId === m.id} onClick={() => set({ paymentMethodId: m.id })}>
                {m.name}
              </Chip>
            ))}
        </Chips>
      </div>

      <div className={styles.section}>
        <div className={styles.segment}>
          <SegmentedControl
            label="Stato"
            value={draft.active ? 'on' : 'off'}
            onChange={(v) => set({ active: v === 'on' })}
            options={[
              { value: 'on', label: 'Attiva' },
              { value: 'off', label: 'In pausa' },
            ]}
          />
        </div>
      </div>
      {firstError !== undefined && (
        <p className={styles.error} role="alert">
          {firstError}
        </p>
      )}
      <p className={styles.hint}>Le scadenze già passate non vengono create: si parte da oggi.</p>
    </>
  );
}
