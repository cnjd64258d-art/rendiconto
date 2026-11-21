import { useEffect, useState } from 'react';
import { blockText, registerFailure, remainingBlockMs, verifyPin, NO_ATTEMPTS, type PinAttempts } from '../core/pin';
import { eraseEverythingAndPin, readAttempts, saveAttempts } from '../db/pin';
import { ConfirmSheet } from '../ui/components';
import { setPinConfig, unlock, useLock } from './lock';
import { PinPad } from './PinPad';
import styles from './LockScreen.module.css';

/** Covers the whole app while it is locked (or while the PIN setting is still being read). */
export function LockScreen() {
  const { status, config } = useLock();
  const [attempts, setAttempts] = useState<PinAttempts>(NO_ATTEMPTS);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (status === 'locked') void readAttempts().then(setAttempts);
  }, [status]);

  const blockedMs = remainingBlockMs(attempts, now);
  useEffect(() => {
    if (blockedMs <= 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [blockedMs]);

  if (status === 'open') return null;
  if (status === 'checking' || !config) return <div className={styles.screen} aria-hidden="true" />;

  const check = async (pin: string) => {
    setBusy(true);
    const ok = await verifyPin(pin, config);
    setBusy(false);
    if (ok) {
      setError(null);
      setAttempts(NO_ATTEMPTS);
      void saveAttempts(NO_ATTEMPTS);
      unlock();
      return;
    }
    const next = registerFailure(attempts, Date.now());
    setAttempts(next);
    setNow(Date.now());
    void saveAttempts(next);
    setError(next.blockedUntil > 0 ? 'PIN errato' : `PIN errato · ${5 - next.failures} ${5 - next.failures === 1 ? 'tentativo' : 'tentativi'} prima della pausa`);
    setErrorKey((k) => k + 1);
  };

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Ledgerline è bloccato">
      <PinPad
        length={config.length}
        title="Inserisci il PIN"
        message="Ledgerline è bloccato"
        error={blockedMs > 0 ? blockText(blockedMs) : error}
        errorKey={errorKey}
        disabled={blockedMs > 0}
        busy={busy}
        onComplete={(pin) => void check(pin)}
        footer={
          <button type="button" className={styles.link} onClick={() => setForgot(true)}>
            Hai dimenticato il PIN?
          </button>
        }
      />
      <ConfirmSheet
        open={forgot}
        onClose={() => setForgot(false)}
        emoji="🔑"
        title="PIN dimenticato"
        confirmLabel="Cancella tutto e togli il PIN"
        secondConfirmLabel="Sì, cancella tutti i dati"
        destructive
        onConfirm={async () => {
          await eraseEverythingAndPin();
          setForgot(false);
          setPinConfig(null);
        }}
      >
        Il PIN non si può recuperare: non viene mai salvato in chiaro. Per riaprire l'app devi cancellare tutti i dati
        di Ledgerline su questo iPhone. Dopo potrai ripristinare un backup da Impostazioni → Backup.
      </ConfirmSheet>
    </div>
  );
}
