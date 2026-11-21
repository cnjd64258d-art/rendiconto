import { useEffect, useRef, useState } from 'react';
import { unlockWithBiometric } from './biometric';
import { blockText, registerFailure, remainingBlockMs, verifyPin, NO_ATTEMPTS, type PinAttempts } from '../core/pin';
import { eraseEverythingAndPin, readAttempts, saveAttempts } from '../db/pin';
import { ConfirmSheet } from '../ui/components';
import { setPinConfig, unlock, useLock } from './lock';
import { PinPad } from './PinPad';
import { FaceIdIcon } from '../ui/components/icons';
import styles from './LockScreen.module.css';

/** Covers the whole app while it is locked (or while the PIN setting is still being read). */
export function LockScreen() {
  const { status, config, biometric } = useLock();
  const [attempts, setAttempts] = useState<PinAttempts>(NO_ATTEMPTS);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (status === 'locked') void readAttempts().then(setAttempts);
  }, [status]);

  const passed = async () => {
    setError(null);
    setAttempts(NO_ATTEMPTS);
    await saveAttempts(NO_ATTEMPTS);
    unlock();
  };

  // With Face ID on, the lock shows one big "Usa Face ID" button and the keypad only on request.
  // iOS starts Face ID in a web app only from a tap, so there is no automatic attempt.
  const [usePin, setUsePin] = useState(false);
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    if (status === 'locked') {
      setUsePin(false);
      setError(null);
    }
  }
  const asking = useRef(false);
  const tryBiometric = async () => {
    if (!biometric || asking.current) return;
    asking.current = true;
    setError(null);
    const result = await unlockWithBiometric(biometric);
    asking.current = false;
    if (result === 'ok') await passed();
    else if (result === 'failed') setError('Face ID non riuscito: riprova o usa il PIN');
  };

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
      await passed();
      return;
    }
    const next = registerFailure(attempts, Date.now());
    setAttempts(next);
    setNow(Date.now());
    void saveAttempts(next);
    setError(next.blockedUntil > 0 ? 'PIN errato' : `PIN errato · ${5 - next.failures} ${5 - next.failures === 1 ? 'tentativo' : 'tentativi'} prima della pausa`);
    setErrorKey((k) => k + 1);
  };

  const forgotSheet = (
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
  );

  if (biometric && !usePin) {
    return (
      <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Ledgerline è bloccato">
        <div className={styles.face}>
          <span className={styles.faceGlyph} aria-hidden="true">
            <FaceIdIcon size={56} />
          </span>
          <h1 className={styles.faceTitle}>Ledgerline è bloccato</h1>
          <button type="button" className={styles.facePrimary} onClick={() => void tryBiometric()}>
            Usa Face ID
          </button>
          <p className={styles.faceError} role="alert">
            {error ?? ''}
          </p>
          <button type="button" className={styles.link} onClick={() => setUsePin(true)}>
            Usa il PIN
          </button>
        </div>
      </div>
    );
  }

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
          <>
            {biometric && (
              <button type="button" className={styles.faceId} onClick={() => void tryBiometric()}>
                <FaceIdIcon /> Usa Face ID
              </button>
            )}
            <button type="button" className={styles.link} onClick={() => setForgot(true)}>
              Hai dimenticato il PIN?
            </button>
          </>
        }
      />
      {forgotSheet}
    </div>
  );
}
