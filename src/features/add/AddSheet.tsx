import { useMemo, useRef, useState } from 'react';
import { closeEditor, useEditor } from '../../app/editor';
import { today } from '../../core/dates';
import { formatCents } from '../../core/format';
import { centsToInput } from '../../core/money';
import {
  buildHistory,
  defaultPaymentMethod,
  orderCategoriesByUse,
  suggestCategory,
  suggestTitles,
  type TitleSuggestion,
} from '../../core/suggest';
import { applyExtras, EDITOR_LINKS } from '../../core/entry';
import { installmentTitle, planProgress, validatePlan, type PlanProgress } from '../../core/installments';
import { draftFromSplit, EMPTY_SPLIT, type SplitDraft } from '../../core/split';
import { draftFromTransaction, validateDraft, type DraftField, type TransactionDraft } from '../../core/transactions';
import type { Category, CategoryGroup, Id, InstallmentPlan, PaymentMethod, Person, Transaction, TransactionKind } from '../../core/types';
import { useCategories, useCategoryGroups, useInstallmentPlans, usePaymentMethods, usePeople, useTransactions } from '../../db/hooks';
import { addTransaction, deleteTransaction, restoreTransaction, updateTransaction } from '../../db/repo';
import { savePlan } from '../../db/shared';
import { InstallmentPicker, SplitEditor, type NewPlanDraft } from './Extras';
import { AmountInput, Button, Chip, Chips, SegmentedControl, Sheet, showToast } from '../../ui/components';
import styles from './AddSheet.module.css';

const KIND_OPTIONS = [
  { value: 'expense', label: 'Uscita' },
  { value: 'income', label: 'Entrata' },
  { value: 'transfer', label: 'Trasferimento' },
] as const;

const TITLES: Record<TransactionKind, [string, string]> = {
  expense: ['Nuova spesa', 'Modifica spesa'],
  income: ['Nuova entrata', 'Modifica entrata'],
  transfer: ['Nuovo trasferimento', 'Modifica trasferimento'],
};

/** Quick add / edit sheet. Opened from anywhere through app/editor. */
export function AddSheet() {
  const editor = useEditor();
  const transactions = useTransactions();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const methods = usePaymentMethods();
  const people = usePeople();
  const plans = useInstallmentPlans();
  const ready =
    transactions !== undefined && categories !== undefined && groups !== undefined && methods !== undefined && people !== undefined && plans !== undefined;
  const kindLabel = editor.editing ? TITLES[editor.editing.kind][1] : 'Nuova transazione';

  return (
    <Sheet open={editor.open} onClose={closeEditor} label={kindLabel}>
      {ready && (
        <TransactionForm
          key={editor.session}
          editing={editor.editing}
          transactions={transactions}
          categories={categories}
          groups={groups}
          methods={methods}
          people={people}
          plans={plans}
          presetPlanId={editor.planId}
        />
      )}
    </Sheet>
  );
}

interface FormProps {
  editing: Transaction | null;
  transactions: Transaction[];
  categories: Category[];
  groups: CategoryGroup[];
  methods: PaymentMethod[];
  people: Person[];
  plans: InstallmentPlan[];
  presetPlanId?: string | undefined;
}

function TransactionForm({ editing, transactions, categories, groups, methods, people, plans, presetPlanId }: FormProps) {
  const history = useMemo(() => buildHistory(transactions), [transactions]);
  const activeMethods = useMemo(() => methods.filter((m) => !m.archived || m.id === editing?.paymentMethodId), [methods, editing]);
  const fallbackMethod = activeMethods[0]?.id ?? null;

  // "Registra la prossima rata" from the Rate screen: start from the plan (computed once, at open).
  const [preset] = useState(() => {
    const plan = presetPlanId && !editing ? plans.find((p) => p.id === presetPlanId) : undefined;
    return plan ? planProgress(plan, transactions) : undefined;
  });
  const [draft, setDraft] = useState<TransactionDraft>(() =>
    editing
      ? draftFromTransaction(editing)
      : preset
        ? {
            kind: 'expense',
            amount: preset.nextAmountCents > 0 ? centsToInput(preset.nextAmountCents) : '',
            title: installmentTitle(preset.plan, preset.nextIndex),
            categoryId: preset.plan.categoryId,
            paymentMethodId: preset.plan.paymentMethodId,
            toPaymentMethodId: null,
            date: today(),
            accrualMonth: preset.plan.accrualMonth && preset.plan.accrualMonth !== today().slice(0, 7) ? preset.plan.accrualMonth : '',
            notes: '',
            tags: '',
          }
        : {
          kind: 'expense',
          amount: '',
          title: '',
          categoryId: null,
          paymentMethodId: fallbackMethod ? defaultPaymentMethod(history, null, fallbackMethod) : null,
          toPaymentMethodId: null,
          date: today(),
          accrualMonth: '',
          notes: '',
          tags: '',
        },
  );
  const [touched, setTouched] = useState({ category: editing !== null || preset !== undefined, method: editing !== null || preset !== undefined });
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [titleFocused, setTitleFocused] = useState(false);
  const [advanced, setAdvanced] = useState(
    preset !== undefined ||
    (editing !== null &&
      (editing.notes !== '' ||
        editing.tags.length > 0 ||
        editing.accrualMonth !== editing.date.slice(0, 7) ||
        editing.split !== undefined ||
        editing.installmentPlanId !== undefined)),
  );
  const [split, setSplit] = useState<SplitDraft>(() => draftFromSplit(editing?.split));
  const [link, setLink] = useState<{ planId: Id; index: number } | null>(() =>
    editing?.installmentPlanId
      ? { planId: editing.installmentPlanId, index: editing.installmentIndex ?? 1 }
      : preset
        ? { planId: preset.plan.id, index: preset.nextIndex }
        : null,
  );
  const [newPlan, setNewPlan] = useState<NewPlanDraft | null>(null);
  const progress = useMemo(() => plans.map((p) => planProgress(p, transactions)), [plans, transactions]);
  const openPlans = useMemo(() => progress.filter((p) => p.open), [progress]);
  const editingPlan = editing?.installmentPlanId ? progress.find((p) => p.plan.id === editing.installmentPlanId) : undefined;

  const pickPlan = (p: PlanProgress | null) => {
    setNewPlan(null);
    if (!p) return setLink(null);
    const keepIndex = editing?.installmentPlanId === p.plan.id ? (editing.installmentIndex ?? p.nextIndex) : p.nextIndex;
    setLink({ planId: p.plan.id, index: keepIndex });
    if (editing?.installmentPlanId === p.plan.id) return;
    // A new instalment takes its plan's details (decision 1A: the plan's accrual month).
    update({
      title: draft.title || installmentTitle(p.plan, keepIndex),
      amount: draft.amount || (p.nextAmountCents > 0 ? centsToInput(p.nextAmountCents) : ''),
      categoryId: p.plan.categoryId,
      paymentMethodId: p.plan.paymentMethodId,
      accrualMonth: p.plan.accrualMonth ?? draft.accrualMonth,
    });
    setTouched({ category: true, method: true });
  };
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const expenseGroupIds = useMemo(() => new Set(groups.filter((g) => g.kind === 'expense').map((g) => g.id)), [groups]);
  const kindCategories = useMemo(() => {
    const wanted = draft.kind === 'income' ? 'income' : 'expense';
    const list = categories.filter(
      (c) => (!c.archived || c.id === editing?.categoryId) && expenseGroupIds.has(c.groupId) === (wanted === 'expense'),
    );
    return orderCategoriesByUse(list, history);
  }, [categories, draft.kind, editing, expenseGroupIds, history]);

  const suggestions = useMemo(
    () => (titleFocused && draft.kind !== 'transfer' ? suggestTitles(history, draft.title, draft.kind) : []),
    [titleFocused, history, draft.title, draft.kind],
  );

  const update = (patch: Partial<TransactionDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (Object.keys(errors).length > 0) setErrors({});
  };

  const setKind = (kind: TransactionKind) => {
    update({ kind, categoryId: null, toPaymentMethodId: null });
    setTouched((t) => ({ ...t, category: false }));
  };

  const setTitle = (title: string) => {
    const patch: Partial<TransactionDraft> = { title };
    if (!touched.category && draft.kind !== 'transfer') {
      const cat = suggestCategory(history, title, draft.kind);
      patch.categoryId = cat;
      if (!touched.method && fallbackMethod) patch.paymentMethodId = defaultPaymentMethod(history, cat, fallbackMethod);
    }
    update(patch);
  };

  const applySuggestion = (s: TitleSuggestion) => {
    const patch: Partial<TransactionDraft> = { title: s.title };
    if (s.categoryId) patch.categoryId = s.categoryId;
    if (s.paymentMethodId && activeMethods.some((m) => m.id === s.paymentMethodId)) patch.paymentMethodId = s.paymentMethodId;
    if (s.amountCents !== undefined && draft.amount === '') patch.amount = centsToInput(s.amountCents);
    update(patch);
    setTouched({ category: true, method: true });
    setTitleFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const pickCategory = (id: string) => {
    const patch: Partial<TransactionDraft> = { categoryId: id };
    if (!touched.method && fallbackMethod) patch.paymentMethodId = defaultPaymentMethod(history, id, fallbackMethod);
    update(patch);
    setTouched((t) => ({ ...t, category: true }));
  };

  const save = async (another: boolean) => {
    if (saving) return;
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.amount) amountRef.current?.focus();
      return;
    }
    const plan =
      newPlan && draft.kind === 'expense'
        ? validatePlan({
            title: result.value.title,
            total: newPlan.total,
            count: newPlan.count,
            accrualMonth: result.value.accrualMonth,
            categoryId: result.value.categoryId ?? null,
            paymentMethodId: result.value.paymentMethodId,
            notes: '',
          })
        : null;
    if (plan && !plan.ok) {
      showToast(plan.error, { icon: 'none' });
      return;
    }
    const extras = applyExtras(result.value, { split, installment: plan ? null : link });
    if (!extras.ok) {
      showToast(extras.error, { icon: 'none' });
      return;
    }
    // Keep the keyboard up for the next entry: focus inside the tap gesture.
    if (another) amountRef.current?.focus();
    setSaving(true);
    try {
      const value = extras.value;
      if (plan?.ok) {
        const created = await savePlan(plan.value);
        value.installmentPlanId = created.id;
        value.installmentIndex = 1;
      }
      if (editing) await updateTransaction(editing.id, value, undefined, EDITOR_LINKS);
      else await addTransaction(value);
    } finally {
      setSaving(false);
    }
    const what = draft.kind === 'income' ? 'Entrata' : draft.kind === 'transfer' ? 'Trasferimento' : 'Spesa';
    showToast(editing ? 'Modifiche salvate' : `${what} registrata`);
    if (another) {
      setDraft((d) => ({ ...d, amount: '', title: '', notes: '', tags: '', categoryId: null, accrualMonth: '' }));
      setTouched({ category: false, method: false });
      setSplit(EMPTY_SPLIT);
      setLink(null);
      setNewPlan(null);
    } else {
      closeEditor();
    }
  };

  const remove = async () => {
    if (!editing) return;
    closeEditor();
    const deleted = await deleteTransaction(editing.id);
    if (deleted) {
      showToast('Eliminata', { icon: 'none', action: { label: 'Annulla', onClick: () => void restoreTransaction(deleted) } });
    }
  };

  const title = TITLES[draft.kind][editing ? 1 : 0];
  const firstError = Object.values(errors)[0];

  return (
    <>
      <SheetHeader title={title} onCancel={closeEditor} onSave={() => void save(false)} saving={saving} />
      <div className={styles.kind}>
        <SegmentedControl label="Tipo" value={draft.kind} onChange={setKind} options={KIND_OPTIONS} />
      </div>
      <AmountInput ref={amountRef} value={draft.amount} onChange={(amount) => update({ amount })} autoFocus={!editing} />

      <div className={styles.field}>
        <input
          className={styles.text}
          type="text"
          placeholder={draft.kind === 'transfer' ? 'Descrizione (es. Ricarica PayPal)' : 'Descrizione'}
          aria-label="Descrizione"
          enterKeyHint="done"
          autoCapitalize="sentences"
          autoComplete="off"
          value={draft.title}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => window.setTimeout(() => setTitleFocused(false), 150)}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={errors.title !== undefined}
        />
        {suggestions.length > 0 && (
          <ul className={styles.suggestions} aria-label="Suggerimenti">
            {suggestions.map((s) => (
              <li key={s.title}>
                <button
                  type="button"
                  className={styles.suggestion}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(s)}
                >
                  <span aria-hidden="true">{categories.find((c) => c.id === s.categoryId)?.emoji ?? '•'}</span>
                  <span className={styles.suggestionTitle}>{s.title}</span>
                  {s.amountCents !== undefined && <span className={styles.suggestionMeta}>{formatCents(s.amountCents)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft.kind === 'transfer' ? (
        <>
          <div className={styles.label}>Da</div>
          <MethodChips methods={activeMethods} value={draft.paymentMethodId} onChange={(id) => update({ paymentMethodId: id })} label="Metodo di origine" />
          <div className={styles.label}>A</div>
          <MethodChips methods={activeMethods} value={draft.toPaymentMethodId} onChange={(id) => update({ toPaymentMethodId: id })} label="Metodo di destinazione" />
        </>
      ) : (
        <>
          <div className={styles.label}>Categoria</div>
          <Chips label="Categoria">
            {kindCategories.map((c) => (
              <Chip key={c.id} emoji={c.emoji} selected={draft.categoryId === c.id} onClick={() => pickCategory(c.id)}>
                {c.name}
              </Chip>
            ))}
          </Chips>
          <div className={styles.label}>{draft.kind === 'income' ? 'Accreditata su' : 'Pagata con'}</div>
          <MethodChips
            methods={activeMethods}
            value={draft.paymentMethodId}
            onChange={(id) => {
              update({ paymentMethodId: id });
              setTouched((t) => ({ ...t, method: true }));
            }}
            label="Metodo di pagamento"
          />
        </>
      )}

      {firstError !== undefined && (
        <p className={styles.error} role="alert">
          {firstError}
        </p>
      )}

      <button type="button" className={styles.disclosure} aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
        <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
          <path d="M1.5 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Altre opzioni
      </button>
      {advanced && (
        <div className={styles.advanced}>
          <label className={styles.advancedRow}>
            <span>📅 Data</span>
            <input
              className={styles.text}
              type="date"
              value={draft.date}
              max="2100-12-31"
              onChange={(e) => update({ date: e.target.value })}
              aria-invalid={errors.date !== undefined}
            />
          </label>
          <label className={styles.advancedRow}>
            <span>🗓️ Competenza</span>
            <div>
              <input
                className={styles.text}
                type="month"
                value={draft.accrualMonth || draft.date.slice(0, 7)}
                onChange={(e) => update({ accrualMonth: e.target.value === draft.date.slice(0, 7) ? '' : e.target.value })}
              />
              <div className={styles.hint}>Il mese a cui appartiene la spesa (es. volo di Pasqua pagato a dicembre).</div>
            </div>
          </label>
          <label className={styles.advancedRow}>
            <span>📝 Nota</span>
            <textarea className={styles.text} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
          </label>
          <label className={styles.advancedRow}>
            <span># Tag</span>
            <div>
              <input
                className={styles.text}
                type="text"
                autoCapitalize="none"
                autoComplete="off"
                value={draft.tags}
                placeholder="lavoro, milano"
                onChange={(e) => update({ tags: e.target.value })}
              />
              <div className={styles.hint}>Separati da virgola.</div>
            </div>
          </label>
          {draft.kind === 'expense' && (
            <>
              <InstallmentPicker
                plans={openPlans}
                value={link}
                newPlan={newPlan}
                editingPlan={editingPlan}
                onPick={pickPlan}
                onNewPlan={(d) => {
                  setNewPlan(d);
                  if (d) setLink(null);
                }}
              />
              <SplitEditor amount={draft.amount} people={people} value={split} onChange={setSplit} />
            </>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {editing ? (
          <Button variant="destructive" block onClick={() => void remove()}>
            Elimina
          </Button>
        ) : (
          <Button variant="secondary" block onClick={() => void save(true)} disabled={saving}>
            Salva e aggiungi un'altra
          </Button>
        )}
      </div>
    </>
  );
}

function SheetHeader({ title, onCancel, onSave, saving }: { title: string; onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className={styles.header}>
      <Button variant="plain" onClick={onCancel}>
        Annulla
      </Button>
      <h2 className={styles.headerTitle}>{title}</h2>
      <Button variant="plain" onClick={onSave} disabled={saving} style={{ fontWeight: 600 }}>
        Salva
      </Button>
    </div>
  );
}

function MethodChips({
  methods,
  value,
  onChange,
  label,
}: {
  methods: PaymentMethod[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <Chips label={label}>
      {methods.map((m) => (
        <Chip key={m.id} emoji={m.emoji} selected={value === m.id} onClick={() => onChange(m.id)}>
          {m.name}
        </Chip>
      ))}
    </Chips>
  );
}
