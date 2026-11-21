import { useState } from 'react';
import { lockNow, setPinConfig, useLock } from '../../app/lock';
import { PinPad } from '../../app/PinPad';
import { createPinConfig, LOCK_AFTER_OPTIONS, DEFAULT_LOCK_AFTER, lockAfterLabel, verifyPin, type PinLength } from '../../core/pin';
import { removePin, savePin } from '../../db/pin';
import { BackLink, Button, ListGroup, Page, Row, Sheet, Switch, showToast } from '../../ui/components';
import own from './Shared.module.css';

type Purpose = 'enable' | 'change' | 'disable';
type Step = 'current' | 'new' | 'confirm';

interface Flow {
  purpose: Purpose;
  step: Step;
  length: PinLength;
  first: string;
  error: string | null;
  errorKey: number;
}

const TITLES: Record<Purpose, string> = { enable: 'Attiva il PIN', change: 'Cambia PIN', disable: 'Disattiva il PIN' };

export function PinPage() {
  const { config } = useLock();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const back = <BackLink href="#/impostazioni" label="Impostazioni" />;

  const start = (purpose: Purpose) =>
    setFlow({ purpose, step: purpose === 'enable' ? 'new' : 'current', length: config?.length ?? 4, first: '', error: null, errorKey: 0 });

  const fail = (f: Flow, error: string, patch: Partial<Flow> = {}) => setFlow({ ...f, ...patch, error, errorKey: f.errorKey + 1 });

  const onPin = async (f: Flow, pin: string) => {
    if (f.step === 'current') {
      if (!config) return;
      setBusy(true);
      const ok = await verifyPin(pin, config);
      setBusy(false);
      if (!ok) return fail(f, 'PIN errato');
      if (f.purpose === 'disable') {
        await removePin();
        setPinConfig(null);
        setFlow(null);
        showToast('PIN disattivato');
        return;
      }
      return setFlow({ ...f, step: 'new', error: null });
    }
    if (f.step === 'new') return setFlow({ ...f, step: 'confirm', first: pin, error: null });
    if (pin !== f.first) return fail(f, 'I PIN non coincidono, riprova', { step: 'new', first: '' });
    setBusy(true);
    const next = await createPinConfig(pin, f.length, config?.lockAfterSec ?? DEFAULT_LOCK_AFTER);
    await savePin(next);
    setBusy(false);
    setPinConfig(next);
    setFlow(null);
    showToast(f.purpose === 'enable' ? 'PIN attivato' : 'PIN cambiato');
  };

  const setDelay = async (lockAfterSec: number) => {
    if (!config) return;
    const next = { ...config, lockAfterSec };
    await savePin(next);
    setPinConfig(next);
  };

  const stepTitle = (f: Flow) =>
    f.step === 'current' ? 'Inserisci il PIN attuale' : f.step === 'new' ? (f.purpose === 'change' ? 'Scegli il nuovo PIN' : 'Scegli un PIN') : 'Ripeti il PIN';

  return (
    <Page title="Blocco con PIN" grouped leading={back}>
      <ListGroup
        footer="Il PIN blocca l'apertura dell'app: chi non lo conosce non vede i tuoi conti. Non cifra i dati e non finisce nei backup."
      >
        <Row
          icon="🔒"
          label="Blocco con PIN"
          value={<Switch checked={config !== null} label="Blocco con PIN" onChange={(on) => start(on ? 'enable' : 'disable')} />}
        />
        {config && <Row icon="🔢" label="Cambia PIN" chevron onClick={() => start('change')} />}
      </ListGroup>

      {config && (
        <ListGroup header="Blocca di nuovo" footer="Quando torni in Rendiconto dopo questo tempo in background, chiede il PIN. Si blocca sempre alla riapertura.">
          {LOCK_AFTER_OPTIONS.map((sec) => (
            <Row
              key={sec}
              label={lockAfterLabel(sec)}
              value={config.lockAfterSec === sec ? <span style={{ color: 'var(--color-accent)' }}>✓</span> : undefined}
              onClick={() => void setDelay(sec)}
              ariaLabel={`${lockAfterLabel(sec)}${config.lockAfterSec === sec ? ', selezionato' : ''}`}
            />
          ))}
        </ListGroup>
      )}

      {config && (
        <div className={own.caption} style={{ marginTop: 0 }}>
          <Button variant="secondary" block onClick={lockNow}>
            Blocca ora
          </Button>
        </div>
      )}

      <Sheet
        open={flow !== null}
        onClose={() => setFlow(null)}
        label={flow ? TITLES[flow.purpose] : 'PIN'}
        title={flow ? TITLES[flow.purpose] : undefined}
        leading={
          <Button variant="plain" onClick={() => setFlow(null)}>
            Annulla
          </Button>
        }
      >
        {flow && (
          <div className={own.pinSheet}>
            <PinPad
              key={`${flow.step}-${flow.length}`}
              length={flow.length}
              title={stepTitle(flow)}
              message={flow.step === 'confirm' ? 'Per essere sicuri di averlo digitato bene' : flow.step === 'new' ? `${flow.length} cifre` : undefined}
              error={flow.error}
              errorKey={flow.errorKey}
              busy={busy}
              onComplete={(pin) => void onPin(flow, pin)}
              footer={
                flow.step === 'new' && (
                  <button type="button" className={own.linkButton} onClick={() => setFlow({ ...flow, length: flow.length === 4 ? 6 : 4, error: null })}>
                    Usa {flow.length === 4 ? 6 : 4} cifre
                  </button>
                )
              }
            />
          </div>
        )}
      </Sheet>
    </Page>
  );
}
