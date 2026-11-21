import { useMemo, useRef, useState } from 'react';
import {
  averageSpent,
  budgetMonth,
  savingsProgress,
  spendIndex,
  type BudgetLine,
  type BudgetScope,
} from '../../core/budget';
import { addMonths, monthOf, today, yearOf, type YearMonth } from '../../core/dates';
import { capitalize, formatCents, formatMonth, formatPercent } from '../../core/format';
import { centsToInput, parseAmount, sanitizeAmountTyping } from '../../core/money';
import { monthOverview } from '../../core/month';
import { kindResolver } from '../../core/recurring';
import type { Category, CategoryGroup, Id } from '../../core/types';
import { saveBudget, saveSavingsGoal } from '../../db/budgets';
import { useBudgets, useCategories, useCategoryGroups, useRecurringRules, useSavingsGoal, useTransactions } from '../../db/hooks';
import {
  Button,
  EmptyState,
  IconButton,
  ListGroup,
  Page,
  ProgressBar,
  ProgressRing,
  Row,
  Sheet,
  Switch,
  cx,
  primeKeyboard,
  showToast,
} from '../../ui/components';
import { EditSheet } from '../settings/EditSheet';
import formStyles from '../settings/Form.module.css';
import styles from './BudgetPage.module.css';

interface Target {
  scope: BudgetScope;
  targetId: Id;
}
type Editing = (Target & { amount: string; rollover: boolean; existing: boolean }) | null;

export function BudgetPage() {
  const transactions = useTransactions();
  const budgets = useBudgets();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const rules = useRecurringRules();
  const todayISO = today();
  const currentMonth = monthOf(todayISO);
  const [month, setMonth] = useState<YearMonth>(currentMonth);
  const goal = useSavingsGoal(yearOf(month));
  const [editing, setEditing] = useState<Editing>(null);
  const [picking, setPicking] = useState(false);
  const [goalEditing, setGoalEditing] = useState<string | null>(null);

  const index = useMemo(() => spendIndex(transactions ?? []), [transactions]);
  const expenseGroups = useMemo(() => (groups ?? []).filter((g) => g.kind === 'expense'), [groups]);
  const data = useMemo(
    () =>
      transactions && budgets && categories
        ? budgetMonth({ budgets, transactions, categories, groups: expenseGroups, month, index })
        : null,
    [transactions, budgets, categories, expenseGroups, month, index],
  );
  const kindOf = useMemo(() => kindResolver(categories ?? [], groups ?? []), [categories, groups]);
  const overview = useMemo(
    () =>
      month === currentMonth && transactions && rules && budgets && categories
        ? monthOverview({ transactions, rules, budgets, categories, kindOf, today: todayISO, index })
        : null,
    [month, currentMonth, transactions, rules, budgets, categories, kindOf, todayISO, index],
  );
  const savings = useMemo(() => (goal && transactions ? savingsProgress(transactions, goal, todayISO) : null), [goal, transactions, todayISO]);

  const editable = month >= currentMonth;
  const monthLabel = capitalize(formatMonth(month));

  const stepper = (
    <div className={styles.stepper}>
      <IconButton label="Mese precedente" onClick={() => setMonth(addMonths(month, -1))}>
        <Chevron dir="left" />
      </IconButton>
      <button type="button" className={styles.stepperLabel} onClick={() => setMonth(currentMonth)} aria-label={`${monthLabel}, torna al mese corrente`}>
        {monthLabel}
        {month !== currentMonth && <span className={styles.stepperHint}>Torna a oggi</span>}
      </button>
      <IconButton label="Mese successivo" onClick={() => setMonth(addMonths(month, 1))}>
        <Chevron dir="right" />
      </IconButton>
    </div>
  );

  if (!data || !categories || !groups) return <Page title="Budget" grouped>{null}</Page>;

  const catById = new Map(categories.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nameOf = (t: Target) => (t.scope === 'group' ? groupById.get(t.targetId)?.name : catById.get(t.targetId)?.name) ?? 'Voce eliminata';

  const openEditor = (t: Target) => {
    if (!editable) {
      showToast('I mesi passati non si modificano: cambia il budget da questo mese in poi');
      return;
    }
    primeKeyboard();
    const line = data.lines.find((l) => l.scope === t.scope && l.targetId === t.targetId);
    setPicking(false);
    setEditing({
      ...t,
      amount: line ? centsToInput(line.limitCents) : '',
      rollover: line?.budget.rollover ?? false,
      existing: line !== undefined,
    });
  };

  const save = async () => {
    if (!editing) return;
    const cents = parseAmount(editing.amount, ',');
    if (cents === null || cents <= 0) {
      showToast('Inserisci un importo maggiore di zero');
      return;
    }
    await saveBudget(editing.scope, editing.targetId, month, { limitCents: cents, rollover: editing.rollover });
    setEditing(null);
    showToast(editing.existing ? 'Budget aggiornato' : 'Budget impostato');
  };

  const remove = async () => {
    if (!editing) return;
    await saveBudget(editing.scope, editing.targetId, month, null);
    setEditing(null);
    showToast('Budget rimosso');
  };

  const saveGoal = async () => {
    if (goalEditing === null) return;
    const cents = goalEditing.trim() === '' ? null : parseAmount(goalEditing, ',');
    if (goalEditing.trim() !== '' && (cents === null || cents < 0)) {
      showToast('Importo non valido');
      return;
    }
    await saveSavingsGoal(yearOf(month), cents);
    setGoalEditing(null);
    showToast(cents ? 'Obiettivo salvato' : 'Obiettivo rimosso');
  };

  const editingLine = editing ? data.lines.find((l) => l.scope === editing.scope && l.targetId === editing.targetId) : undefined;
  const average = editing ? averageSpent(index, categories, editing.scope, editing.targetId, month) : 0;
  const totals = data.totals;

  return (
    <Page title="Budget" grouped>
      {stepper}

      {totals ? (
        <section className={styles.summary} aria-label={`Budget di ${monthLabel}`}>
          <div className={styles.summaryTop}>
            <div>
              <div className={styles.summaryLabel}>{totals.remainingCents >= 0 ? 'Restano' : 'Sforato di'}</div>
              <div className={cx(styles.summaryAmount, totals.remainingCents < 0 && styles.negative)}>
                {formatCents(Math.abs(totals.remainingCents), { decimals: false })}
              </div>
            </div>
            <div className={styles.summaryRight}>
              <div>Spesi {formatCents(totals.spentCents, { decimals: false })}</div>
              <div>di {formatCents(totals.availableCents, { decimals: false })}</div>
            </div>
          </div>
          <ProgressBar value={totals.ratio} label="Budget del mese usato" thick />
          {overview?.perDayCents !== null && overview !== null && (
            <p className={styles.summaryNote}>
              {overview.perDayCents === 0 ? (
                <span className={styles.negative}>Budget esaurito, considerando le spese fisse ancora da pagare.</span>
              ) : (
                <>
                  Puoi spendere ancora <strong>{formatCents(overview.perDayCents ?? 0)}</strong> al giorno
                  {overview.daysLeft === 1 ? ' (ultimo giorno del mese)' : ` per ${overview.daysLeft} giorni`}
                  {(overview.budget?.dueCents ?? 0) > 0 && `, tolte le spese fisse ancora da pagare (${formatCents(overview.budget?.dueCents ?? 0, { decimals: false })})`}.
                </>
              )}
            </p>
          )}
        </section>
      ) : (
        <EmptyState
          emoji="🎯"
          title="Nessun budget per questo mese"
          action={
            editable ? (
              <Button variant="secondary" onClick={() => setPicking(true)}>
                Imposta un budget
              </Button>
            ) : undefined
          }
        >
          Fissa un limite mensile per una categoria o per una macro-voce: all'80% la barra diventa arancione, al 100% rossa.
        </EmptyState>
      )}

      {data.sections.map((s) => (
        <ListGroup key={s.group.id || 'orphans'} header={s.group.name}>
          {s.groupLine && <BudgetRow line={s.groupLine} name={`Tutta la macro-voce`} ring onClick={() => openEditor(s.groupLine as BudgetLine)} />}
          {s.categoryLines.map((l) => (
            <BudgetRow
              key={l.budget.id}
              line={l}
              name={nameOf(l)}
              emoji={catById.get(l.targetId)?.emoji ?? '•'}
              note={s.groupLine ? 'Inclusa nella macro-voce' : undefined}
              onClick={() => openEditor(l)}
            />
          ))}
        </ListGroup>
      ))}

      {editable && totals && (
        <ListGroup>
          <Row icon="＋" label={<span className={styles.accent}>Aggiungi budget</span>} onClick={() => setPicking(true)} />
        </ListGroup>
      )}

      {data.unbudgeted.length > 0 && (
        <ListGroup header="Senza budget" footer={editable ? 'Tocca una categoria per fissarle un limite.' : undefined}>
          {data.unbudgeted.map((u) => {
            const c = catById.get(u.categoryId);
            return (
              <Row
                key={u.categoryId}
                icon={c?.emoji ?? '•'}
                label={c?.name ?? 'Categoria eliminata'}
                value={formatCents(u.spentCents, { decimals: false })}
                {...(editable ? { onClick: () => openEditor({ scope: 'category', targetId: u.categoryId }) } : {})}
              />
            );
          })}
        </ListGroup>
      )}

      <ListGroup header={`Obiettivo di risparmio ${yearOf(month)}`}>
        {savings && goal ? (
          <li>
            <button type="button" className={styles.goal} onClick={() => setGoalEditing(centsToInput(goal.targetCents))} aria-label="Modifica obiettivo di risparmio">
              <ProgressRing value={Math.max(0, savings.ratio)} label="Obiettivo raggiunto" size={64} tone="positive" />
              <span className={styles.goalText}>
                <span className={styles.goalMain}>
                  {formatCents(savings.savedCents, { decimals: false })} <span className={styles.muted}>di {formatCents(savings.targetCents, { decimals: false })}</span>
                </span>
                <span className={styles.goalDetail}>{goalDetail(savings)}</span>
              </span>
            </button>
          </li>
        ) : (
          <Row icon="🐷" label={<span className={styles.accent}>Imposta un obiettivo annuale</span>} detail="Entrate meno uscite dell'anno, per competenza" onClick={() => setGoalEditing('')} />
        )}
      </ListGroup>

      <TargetPicker
        open={picking}
        onClose={() => setPicking(false)}
        groups={expenseGroups}
        categories={categories}
        budgeted={new Set(data.lines.map((l) => `${l.scope}:${l.targetId}`))}
        onPick={openEditor}
      />

      <EditSheet open={editing !== null} title={editing ? nameOf(editing) : ''} onClose={() => setEditing(null)} onSave={() => void save()}>
        {editing && (
          <>
            <div className={formStyles.section}>
              <label className={formStyles.row}>
                <span>Al mese €</span>
                <input
                  className={formStyles.input}
                  value={editing.amount}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoFocus
                  placeholder="0,00"
                  onChange={(e) => setEditing({ ...editing, amount: sanitizeAmountTyping(e.target.value) })}
                />
              </label>
              <label className={cx(formStyles.row, styles.switchRow)}>
                <span>Riporta</span>
                <span className={styles.switchText}>Il non speso passa al mese dopo</span>
                <Switch checked={editing.rollover} label="Riporta il non speso al mese dopo" onChange={(rollover) => setEditing({ ...editing, rollover })} />
              </label>
            </div>
            <p className={formStyles.hint}>
              {average > 0 ? `Negli ultimi 3 mesi hai speso in media ${formatCents(average, { decimals: false })} al mese. ` : ''}
              {editing.scope === 'group' ? 'Vale per tutte le categorie della macro-voce. ' : ''}
              La modifica vale da {formatMonth(month, false)} in poi; i mesi passati restano com'erano.
              {editingLine && editingLine.carryCents > 0 ? ` Questo mese hai ${formatCents(editingLine.carryCents)} riportati.` : ''}
            </p>
            {editing.existing && (
              <div className={formStyles.actions}>
                <Button variant="destructive" block onClick={() => void remove()}>
                  Rimuovi budget
                </Button>
              </div>
            )}
          </>
        )}
      </EditSheet>

      <EditSheet open={goalEditing !== null} title={`Obiettivo ${yearOf(month)}`} onClose={() => setGoalEditing(null)} onSave={() => void saveGoal()}>
        {goalEditing !== null && (
          <>
            <div className={formStyles.section}>
              <label className={formStyles.row}>
                <span>Risparmio €</span>
                <input
                  className={formStyles.input}
                  value={goalEditing}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoFocus
                  placeholder="Es. 6.000"
                  onChange={(e) => setGoalEditing(sanitizeAmountTyping(e.target.value))}
                />
              </label>
            </div>
            <p className={formStyles.hint}>
              Quanto vuoi mettere da parte nell'anno: entrate meno uscite confermate, per mese di competenza. Lascia vuoto per
              rimuoverlo.
            </p>
          </>
        )}
      </EditSheet>
    </Page>
  );
}

function goalDetail(s: ReturnType<typeof savingsProgress>): string {
  if (s.savedCents >= s.targetCents) return `Obiettivo raggiunto 🎉 (${formatPercent(s.ratio)})`;
  if (s.monthsLeft === 0) return `Mancano ${formatCents(s.targetCents - s.savedCents, { decimals: false })}: l'anno è chiuso`;
  const need = `Servono ${formatCents(s.neededPerMonthCents, { decimals: false })} al mese per ${s.monthsLeft === 1 ? 'questo mese' : `${s.monthsLeft} mesi`}`;
  if (s.expectedCents === 0) return need;
  return `${need} · ${s.onTrack ? 'sei in linea' : `sei indietro di ${formatCents(s.expectedCents - s.savedCents, { decimals: false })}`}`;
}

function BudgetRow({
  line,
  name,
  emoji,
  ring = false,
  note,
  onClick,
}: {
  line: BudgetLine;
  name: string;
  emoji?: string;
  ring?: boolean;
  note?: string | undefined;
  onClick: () => void;
}) {
  const over = line.remainingCents < 0;
  const right = over ? `Sforato di ${formatCents(-line.remainingCents, { decimals: false })}` : `Restano ${formatCents(line.remainingCents, { decimals: false })}`;
  return (
    <li className={styles.item} style={{ ['--row-inset' as string]: '56px' }}>
      <button type="button" className={styles.line} onClick={onClick} aria-label={`${name}: speso ${formatPercent(line.ratio)}, ${right}`}>
        <span className={styles.lead} aria-hidden="true">
          {ring ? <ProgressRing value={line.ratio} label={name} size={36} /> : emoji}
        </span>
        <span className={styles.body}>
          <span className={styles.top}>
            <span className={styles.name}>{name}</span>
            <span className={cx(styles.right, line.status === 'warning' && styles.warning, over && styles.negative)}>{right}</span>
          </span>
          {!ring && <ProgressBar value={line.ratio} label={name} />}
          <span className={styles.meta}>
            Spesi {formatCents(line.spentCents, { decimals: false })} di {formatCents(line.availableCents, { decimals: false })}
            {line.carryCents > 0 && <span className={styles.badge}>+{formatCents(line.carryCents, { decimals: false })} riportati</span>}
            {line.budget.rollover && line.carryCents === 0 && <span className={styles.badgeQuiet}>con riporto</span>}
            {note && <span className={styles.badgeQuiet}>{note}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function TargetPicker({
  open,
  onClose,
  groups,
  categories,
  budgeted,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  groups: CategoryGroup[];
  categories: Category[];
  budgeted: Set<string>;
  onPick: (t: Target) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Aggiungi budget"
      title="Aggiungi budget"
      leading={
        <Button variant="plain" onClick={onClose}>
          Annulla
        </Button>
      }
    >
      <div className={styles.picker} ref={scrollRef}>
        <p className={formStyles.hint} style={{ marginTop: 0 }}>
          Scegli una macro-voce intera oppure una singola categoria.
        </p>
        {groups.map((g) => {
          const cats = categories.filter((c) => c.groupId === g.id && !c.archived);
          return (
            <ListGroup key={g.id} header={g.name}>
              <Row
                icon={<span className={styles.groupIcon}>◎</span>}
                label={`Tutta «${g.name}»`}
                value={budgeted.has(`group:${g.id}`) ? 'Impostato' : undefined}
                onClick={() => onPick({ scope: 'group', targetId: g.id })}
              />
              {cats.map((c) => (
                <Row
                  key={c.id}
                  icon={c.emoji}
                  label={c.name}
                  value={budgeted.has(`category:${c.id}`) ? 'Impostato' : undefined}
                  onClick={() => onPick({ scope: 'category', targetId: c.id })}
                />
              ))}
            </ListGroup>
          );
        })}
      </div>
    </Sheet>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 2 2 10l8 8' : 'M2 2l8 8-8 8'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
