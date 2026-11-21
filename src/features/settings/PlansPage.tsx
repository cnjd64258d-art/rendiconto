import { useMemo, useState } from 'react';
import { openEditTransaction, openNewInstalment } from '../../app/editor';
import { monthOf, today } from '../../core/dates';
import { capitalize, formatCents, formatDayShort, formatMonth } from '../../core/format';
import { draftFromPlan, installmentLabel, linkCandidates, planProgress, validatePlan, type PlanDraft, type PlanProgress } from '../../core/installments';
import { sanitizeAmountTyping } from '../../core/money';
import type { InstallmentPlan } from '../../core/types';
import { useCategories, useCategoryGroups, useInstallmentPlans, usePaymentMethods, useTransactions } from '../../db/hooks';
import { deletePlan, linkInstalment, savePlan, setPlanClosed, unlinkInstalment } from '../../db/shared';
import { BackLink, Button, Chip, Chips, ConfirmSheet, ListGroup, Page, ProgressBar, Row, Sheet, showToast } from '../../ui/components';
import { EditSheet } from './EditSheet';
import styles from './Form.module.css';
import own from './Shared.module.css';

type Editing = { plan: InstallmentPlan | null; draft: PlanDraft } | null;

export function PlansPage() {
  const plans = useInstallmentPlans();
  const transactions = useTransactions();
  const categories = useCategories();
  const groups = useCategoryGroups();
  const methods = usePaymentMethods();
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InstallmentPlan | null>(null);
  const [linking, setLinking] = useState<PlanProgress | null>(null);
  const back = <BackLink href="#/impostazioni" label="Impostazioni" />;

  const progress = useMemo(
    () => (plans && transactions ? plans.map((p) => planProgress(p, transactions)).sort((a, b) => a.plan.title.localeCompare(b.plan.title, 'it')) : []),
    [plans, transactions],
  );

  if (!plans || !transactions || !categories || !groups || !methods) return <Page title="Piani a rate" grouped leading={back}>{null}</Page>;

  const open = progress.filter((p) => p.open);
  const done = progress.filter((p) => !p.open);
  const detail = progress.find((p) => p.plan.id === detailId);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const expenseGroups = new Set(groups.filter((g) => g.kind === 'expense').map((g) => g.id));

  const startNew = () => {
    setError(null);
    setEditing({
      plan: null,
      draft: { title: '', total: '', count: '3', accrualMonth: monthOf(today()), categoryId: null, paymentMethodId: methods.find((m) => !m.archived)?.id ?? null, notes: '' },
    });
  };

  const save = async () => {
    if (!editing) return;
    const r = validatePlan(editing.draft, editing.plan ?? undefined);
    if (!r.ok) return setError(r.error);
    await savePlan(r.value, editing.plan?.id);
    setEditing(null);
    showToast(editing.plan ? 'Piano aggiornato' : 'Piano creato');
  };

  const row = (p: PlanProgress) => (
    <Row
      key={p.plan.id}
      icon={catById.get(p.plan.categoryId)?.emoji ?? '🧾'}
      label={p.plan.title}
      detail={
        p.complete
          ? `Pagato: ${formatCents(p.paidCents)} in ${p.paidCount} rate`
          : `${p.paidCount} di ${p.plan.count} rate · restano ${formatCents(p.remainingCents, { decimals: false })}${p.plan.closed ? ' · chiuso' : ''}`
      }
      value={formatCents(p.plan.totalCents, { decimals: false })}
      onClick={() => setDetailId(p.plan.id)}
    />
  );

  return (
    <Page title="Piani a rate" grouped leading={back}>
      <ListGroup footer="Ogni rata è una spesa vera (conta quando la paghi) e prende il mese di competenza del piano: le rate del volo di Pasqua vanno ad aprile.">
        {open.map(row)}
        <Row icon="＋" label={<span style={{ color: 'var(--color-accent)' }}>Nuovo piano a rate</span>} onClick={startNew} />
      </ListGroup>
      {done.length > 0 && <ListGroup header="Conclusi o chiusi">{done.map(row)}</ListGroup>}

      <Sheet
        open={detail !== undefined}
        onClose={() => setDetailId(null)}
        label={detail?.plan.title ?? 'Piano'}
        title={detail?.plan.title}
        leading={
          <Button variant="plain" onClick={() => setDetailId(null)}>
            Chiudi
          </Button>
        }
        trailing={
          detail ? (
            <Button
              variant="plain"
              onClick={() => {
                setError(null);
                setEditing({ plan: detail.plan, draft: draftFromPlan(detail.plan) });
              }}
            >
              Modifica
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className={own.detail}>
            <div className={own.big}>
              {formatCents(detail.paidCents)} <span className={own.muted}>di {formatCents(detail.plan.totalCents)}</span>
            </div>
            <ProgressBar value={detail.ratio} label="Quanto hai già pagato" thick />
            <p className={own.caption}>
              {detail.complete
                ? 'Piano completato.'
                : `${detail.paidCount} di ${detail.plan.count} rate pagate · restano ${formatCents(detail.remainingCents)}${detail.remainingCount > 0 ? ` in ${detail.remainingCount} ${detail.remainingCount === 1 ? 'rata' : 'rate'}` : ''}.`}{' '}
              Competenza: {detail.plan.accrualMonth ? capitalize(formatMonth(detail.plan.accrualMonth)) : 'mese di ogni rata'}.
            </p>

            {!detail.complete && (
              <Button block onClick={() => {
                setDetailId(null);
                openNewInstalment(detail.plan.id);
              }}>
                Registra {withArticle(installmentLabel(detail.nextIndex, detail.plan.count).toLowerCase())} ({formatCents(detail.nextAmountCents)})
              </Button>
            )}

            <ListGroup header="Rate pagate">
              {detail.paid.length === 0 && <Row label="Nessuna rata ancora" />}
              {detail.paid.map((t) => (
                <Row
                  key={t.id}
                  label={installmentLabel(t.installmentIndex ?? 0, detail.plan.count)}
                  detail={`${formatDayShort(t.date)} · ${t.title}`}
                  value={formatCents(t.amountCents)}
                  onClick={() => {
                    setDetailId(null);
                    openEditTransaction(t);
                  }}
                />
              ))}
              <Row icon="🔗" label={<span style={{ color: 'var(--color-accent)' }}>Collega spese già pagate</span>} onClick={() => setLinking(detail)} />
            </ListGroup>

            <div className={styles.actions}>
              <Button variant="secondary" block onClick={() => void setPlanClosed(detail.plan.id, !detail.plan.closed).then(() => showToast(detail.plan.closed ? 'Piano riaperto' : 'Piano chiuso'))}>
                {detail.plan.closed ? 'Riapri il piano' : 'Chiudi il piano'}
              </Button>
              <Button variant="destructive" block onClick={() => setDeleting(detail.plan)}>
                Elimina piano
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <LinkSheet
        progress={linking}
        transactions={transactions}
        onClose={() => setLinking(null)}
        onLink={async (t) => {
          if (!linking) return;
          await linkInstalment(linking.plan.id, t.id, linking.nextIndex);
          setLinking((l) => (l ? { ...l, nextIndex: l.nextIndex + 1 } : l));
          showToast(`Collegata come ${installmentLabel(linking.nextIndex, linking.plan.count).toLowerCase()}`, {
            icon: 'none',
            action: { label: 'Annulla', onClick: () => void unlinkInstalment(t.id) },
          });
        }}
      />

      <EditSheet open={editing !== null} title={editing?.plan ? 'Modifica piano' : 'Nuovo piano a rate'} onClose={() => setEditing(null)} onSave={() => void save()}>
        {editing && (
          <>
            <div className={styles.section}>
              <label className={styles.row}>
                <span>Nome</span>
                <input className={styles.input} value={editing.draft.title} placeholder="Es. Volo Madeira" autoCapitalize="sentences" onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} />
              </label>
              <label className={styles.row}>
                <span>Totale €</span>
                <input className={styles.input} value={editing.draft.total} inputMode="decimal" placeholder="0,00" onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, total: sanitizeAmountTyping(e.target.value) } })} />
              </label>
              <label className={styles.row}>
                <span>Rate</span>
                <input className={styles.input} value={editing.draft.count} inputMode="numeric" pattern="[0-9]*" onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, count: e.target.value.replace(/\D/g, '').slice(0, 3) } })} />
              </label>
              <label className={styles.row}>
                <span>Competenza</span>
                <input className={styles.input} type="month" value={editing.draft.accrualMonth} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, accrualMonth: e.target.value } })} />
              </label>
            </div>
            <p className={styles.hint}>Il mese a cui appartiene la spesa: per un viaggio, il mese del viaggio. Ogni rata lo eredita.</p>
            <div className={styles.label}>Categoria</div>
            <div className={styles.chips}>
              <Chips label="Categoria">
                {categories
                  .filter((c) => expenseGroups.has(c.groupId) && (!c.archived || c.id === editing.draft.categoryId))
                  .map((c) => (
                    <Chip key={c.id} emoji={c.emoji} selected={editing.draft.categoryId === c.id} onClick={() => setEditing({ ...editing, draft: { ...editing.draft, categoryId: c.id } })}>
                      {c.name}
                    </Chip>
                  ))}
              </Chips>
            </div>
            <div className={styles.label}>Pagato con</div>
            <div className={styles.chips}>
              <Chips label="Metodo di pagamento">
                {methods
                  .filter((m) => !m.archived || m.id === editing.draft.paymentMethodId)
                  .map((m) => (
                    <Chip key={m.id} emoji={m.emoji} selected={editing.draft.paymentMethodId === m.id} onClick={() => setEditing({ ...editing, draft: { ...editing.draft, paymentMethodId: m.id } })}>
                      {m.name}
                    </Chip>
                  ))}
              </Chips>
            </div>
            <div className={styles.section}>
              <label className={styles.row}>
                <span>Note</span>
                <input className={styles.input} value={editing.draft.notes} placeholder="Facoltative" onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, notes: e.target.value } })} />
              </label>
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </EditSheet>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        emoji="🗑️"
        title={`Eliminare «${deleting?.title ?? ''}»?`}
        confirmLabel="Elimina piano"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deletePlan(deleting.id);
          setDeleting(null);
          setDetailId(null);
          showToast('Piano eliminato');
        }}
      >
        Le rate già registrate restano come spese normali: si perde solo il collegamento al piano.
      </ConfirmSheet>
    </Page>
  );
}

function LinkSheet({
  progress,
  transactions,
  onClose,
  onLink,
}: {
  progress: PlanProgress | null;
  transactions: Parameters<typeof linkCandidates>[1];
  onClose: () => void;
  onLink: (t: (typeof transactions)[number]) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const list = progress ? linkCandidates(progress.plan, transactions, query) : [];
  return (
    <Sheet
      open={progress !== null}
      onClose={onClose}
      label="Collega spese già pagate"
      title="Collega spese"
      trailing={
        <Button variant="plain" onClick={onClose} style={{ fontWeight: 600 }}>
          Fine
        </Button>
      }
    >
      <div className={own.detail}>
        <input className={own.search} type="search" placeholder="Cerca (es. Madeira, rata)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca spese" />
        <p className={own.caption}>
          {query ? 'Risultati della ricerca.' : 'Spese della stessa categoria non ancora collegate.'} Tocca una spesa per collegarla come{' '}
          {progress ? installmentLabel(progress.nextIndex, progress.plan.count).toLowerCase() : 'rata'}.
        </p>
        <ListGroup>
          {list.length === 0 && <Row label="Nessuna spesa trovata" />}
          {list.map((t) => (
            <Row key={t.id} label={t.title} detail={formatDayShort(t.date)} value={formatCents(t.amountCents)} onClick={() => void onLink(t)} />
          ))}
        </ListGroup>
      </div>
    </Sheet>
  );
}

/** "la prima rata", "l'ultima rata". */
function withArticle(label: string): string {
  return /^[aeiou]/.test(label) ? `l'${label}` : `la ${label}`;
}
