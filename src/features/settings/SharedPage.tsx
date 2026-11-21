import { useMemo, useState } from 'react';
import { openEditTransaction } from '../../app/editor';
import { today } from '../../core/dates';
import { formatCents, formatDayShort } from '../../core/format';
import { sanitizeAmountTyping } from '../../core/money';
import { balanceTotals, balances, buildPerson, settlementForBalance, validateSettlement, type PersonBalance, type SettlementDraft } from '../../core/split';
import type { Person } from '../../core/types';
import { usePaymentMethods, usePeople, useSettlements, useTransactions } from '../../db/hooks';
import { newId } from '../../db/repo';
import { deleteSettlement, restoreSettlement, savePerson, saveSettlement, setPersonArchived } from '../../db/shared';
import { BackLink, Button, Chip, Chips, EmptyState, ListGroup, Page, Row, SegmentedControl, Sheet, cx, primeKeyboard, showToast } from '../../ui/components';
import { EditSheet } from './EditSheet';
import styles from './Form.module.css';
import own from './Shared.module.css';

/** "Nicola ti deve 25 €" / "Devi 20 € a Nicola" / "Siete pari". */
export function balanceText(name: string, net: number): string {
  if (net > 0) return `${name} ti deve ${formatCents(net)}`;
  if (net < 0) return `Devi ${formatCents(-net)} a ${name}`;
  return `Tu e ${name} siete pari`;
}

export function SharedPage() {
  const people = usePeople();
  const transactions = useTransactions();
  const settlements = useSettlements();
  const methods = usePaymentMethods();
  const [personId, setPersonId] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ person: Person | null; name: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [settling, setSettling] = useState<SettlementDraft | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const back = <BackLink href="#/impostazioni" label="Impostazioni" />;

  const list = useMemo(() => (people && transactions && settlements ? balances(transactions, settlements, people) : []), [people, transactions, settlements]);

  if (!people || !transactions || !settlements || !methods) return <Page title="Spese condivise" grouped leading={back}>{null}</Page>;

  const byId = new Map(list.map((b) => [b.personId, b]));
  const totals = balanceTotals(list);
  const active = people.filter((p) => !p.archived);
  const archived = people.filter((p) => p.archived);
  const person = people.find((p) => p.id === personId);
  const balance = personId ? byId.get(personId) : undefined;
  const methodName = new Map(methods.map((m) => [m.id, `${m.emoji} ${m.name}`]));

  const saveName = async () => {
    if (!naming) return;
    const r = buildPerson(naming.name, people, newId, naming.person ?? undefined);
    if (!r.ok) return setNameError(r.error);
    await savePerson(r.value);
    setNaming(null);
    showToast(naming.person ? 'Nome aggiornato' : 'Persona aggiunta');
  };

  const startSettle = (b: PersonBalance | undefined, id: string) => {
    primeKeyboard();
    setSettleError(null);
    setSettling({
      personId: id,
      ...settlementForBalance(b?.netCents ?? 0),
      date: today(),
      paymentMethodId: methods.find((m) => !m.archived)?.id ?? null,
      note: '',
    });
  };

  const saveSettle = async () => {
    if (!settling) return;
    const r = validateSettlement(settling);
    if (!r.ok) return setSettleError(r.error);
    await saveSettlement(r.value);
    setSettling(null);
    showToast('Rimborso registrato');
  };

  const personRow = (p: Person) => {
    const net = byId.get(p.id)?.netCents ?? 0;
    return (
      <Row
        key={p.id}
        icon={<span className={own.avatar}>{p.name.charAt(0).toUpperCase()}</span>}
        label={p.name}
        detail={net > 0 ? 'ti deve' : net < 0 ? 'gli devi' : 'pari'}
        value={net === 0 ? '—' : <span className={net > 0 ? own.positive : own.negative}>{formatCents(Math.abs(net))}</span>}
        onClick={() => setPersonId(p.id)}
      />
    );
  };

  return (
    <Page title="Spese condivise" grouped leading={back}>
      {people.length === 0 ? (
        <EmptyState emoji="🤝" title="Nessuna spesa condivisa">
          Quando dividi una cena o la benzina, segna la spesa come condivisa: qui vedi chi ti deve cosa.
        </EmptyState>
      ) : (
        <section className={own.summary} aria-label="Saldo complessivo">
          <div>
            <div className={own.summaryLabel}>Ti devono</div>
            <div className={cx(own.summaryValue, own.positive)}>{formatCents(totals.owedToMeCents)}</div>
          </div>
          <div>
            <div className={own.summaryLabel}>Devi</div>
            <div className={cx(own.summaryValue, totals.iOweCents > 0 && own.negative)}>{formatCents(totals.iOweCents)}</div>
          </div>
        </section>
      )}

      <ListGroup
        header="Persone"
        footer="Nelle spese conta solo la tua quota. Quando qualcuno ti restituisce la sua parte, registra il rimborso: chiude il debito e non è un'entrata."
      >
        {active.map(personRow)}
        <Row
          icon="＋"
          label={<span style={{ color: 'var(--color-accent)' }}>Aggiungi persona</span>}
          onClick={() => {
            setNameError(null);
            setNaming({ person: null, name: '' });
          }}
        />
      </ListGroup>
      {archived.length > 0 && <ListGroup header="Archiviate">{archived.map(personRow)}</ListGroup>}

      <Sheet
        open={person !== undefined && settling === null && naming === null}
        onClose={() => setPersonId(null)}
        label={person?.name ?? 'Persona'}
        title={person?.name}
        leading={
          <Button variant="plain" onClick={() => setPersonId(null)}>
            Chiudi
          </Button>
        }
        trailing={
          person ? (
            <Button
              variant="plain"
              onClick={() => {
                setNameError(null);
                setNaming({ person, name: person.name });
              }}
            >
              Rinomina
            </Button>
          ) : undefined
        }
      >
        {person && (
          <div className={own.detail}>
            <div className={own.big}>{balanceText(person.name, balance?.netCents ?? 0)}</div>
            <Button block onClick={() => startSettle(balance, person.id)}>
              Registra rimborso
            </Button>

            <ListGroup header="Spese condivise">
              {(balance?.items.length ?? 0) === 0 && <Row label="Nessuna spesa condivisa" />}
              {balance?.items.map((i) => (
                <Row
                  key={i.transaction.id}
                  label={i.transaction.title}
                  detail={`${formatDayShort(i.transaction.date)} · ${i.cents > 0 ? 'ti deve' : 'gli devi'} · ${i.status === 'settled' ? 'saldata' : i.status === 'partial' ? `restano ${formatCents(Math.abs(i.cents) - i.settledCents)}` : 'da saldare'}`}
                  value={<span className={i.status === 'settled' ? own.settled : undefined}>{formatCents(Math.abs(i.cents))}</span>}
                  onClick={() => {
                    setPersonId(null);
                    openEditTransaction(i.transaction);
                  }}
                />
              ))}
            </ListGroup>

            {(balance?.settlements.length ?? 0) > 0 && (
              <ListGroup header="Rimborsi" footer="Tocca un rimborso per eliminarlo.">
                {balance?.settlements.map((s) => (
                  <Row
                    key={s.id}
                    label={s.direction === 'in' ? `${person.name} ti ha dato` : `Hai dato a ${person.name}`}
                    detail={`${formatDayShort(s.date)} · ${methodName.get(s.paymentMethodId) ?? ''}${s.note ? ` · ${s.note}` : ''}`}
                    value={formatCents(s.amountCents)}
                    onClick={async () => {
                      const removed = await deleteSettlement(s.id);
                      if (removed) showToast('Rimborso eliminato', { icon: 'none', action: { label: 'Annulla', onClick: () => void restoreSettlement(removed) } });
                    }}
                  />
                ))}
              </ListGroup>
            )}

            <div className={styles.actions}>
              <Button
                variant="secondary"
                block
                onClick={() => void setPersonArchived(person.id, !person.archived).then(() => showToast(person.archived ? 'Persona ripristinata' : 'Persona archiviata'))}
              >
                {person.archived ? 'Ripristina' : 'Archivia'}
              </Button>
              <p className={styles.hint} style={{ margin: 0 }}>
                Archiviata non compare più tra le scelte, ma il suo saldo e le spese restano.
              </p>
            </div>
          </div>
        )}
      </Sheet>

      <EditSheet open={naming !== null} title={naming?.person ? 'Rinomina' : 'Nuova persona'} onClose={() => setNaming(null)} onSave={() => void saveName()}>
        {naming && (
          <>
            <div className={styles.section}>
              <label className={styles.row}>
                <span>Nome</span>
                <input className={styles.input} value={naming.name} autoFocus autoCapitalize="words" placeholder="Es. Nicola" onChange={(e) => setNaming({ ...naming, name: e.target.value })} />
              </label>
            </div>
            {nameError && (
              <p className={styles.error} role="alert">
                {nameError}
              </p>
            )}
          </>
        )}
      </EditSheet>

      <EditSheet open={settling !== null} title="Rimborso" onClose={() => setSettling(null)} onSave={() => void saveSettle()}>
        {settling && person && (
          <>
            <div className={styles.segment} style={{ margin: '0 var(--gutter) var(--space-3)' }}>
              <SegmentedControl
                label="Direzione"
                value={settling.direction}
                onChange={(direction) => setSettling({ ...settling, direction })}
                options={[
                  { value: 'in', label: `${person.name} mi ha dato` },
                  { value: 'out', label: `Ho dato a ${person.name}` },
                ]}
              />
            </div>
            <div className={styles.section}>
              <label className={styles.row}>
                <span>Importo €</span>
                <input className={styles.input} value={settling.amount} inputMode="decimal" autoFocus placeholder="0,00" onChange={(e) => setSettling({ ...settling, amount: sanitizeAmountTyping(e.target.value) })} />
              </label>
              <label className={styles.row}>
                <span>Data</span>
                <input className={styles.input} type="date" value={settling.date} onChange={(e) => setSettling({ ...settling, date: e.target.value })} />
              </label>
              <label className={styles.row}>
                <span>Nota</span>
                <input className={styles.input} value={settling.note} placeholder="Es. Saldo cena" onChange={(e) => setSettling({ ...settling, note: e.target.value })} />
              </label>
            </div>
            <div className={styles.label}>{settling.direction === 'in' ? 'Ricevuto su' : 'Pagato con'}</div>
            <div className={styles.chips}>
              <Chips label="Metodo">
                {methods
                  .filter((m) => !m.archived)
                  .map((m) => (
                    <Chip key={m.id} emoji={m.emoji} selected={settling.paymentMethodId === m.id} onClick={() => setSettling({ ...settling, paymentMethodId: m.id })}>
                      {m.name}
                    </Chip>
                  ))}
              </Chips>
            </div>
            <p className={styles.hint}>Il rimborso chiude il debito: non è un'entrata e non cambia le tue spese.</p>
            {settleError && (
              <p className={styles.error} role="alert">
                {settleError}
              </p>
            )}
          </>
        )}
      </EditSheet>
    </Page>
  );
}
