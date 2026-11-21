import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './ConfirmSheet.module.css';
import { Sheet } from './Sheet';

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  emoji: string;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** When set, a second explicit tap is required (double confirmation). */
  secondConfirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmSheet(props: ConfirmSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} label={props.title}>
      {props.open && <ConfirmBody key={props.title} {...props} />}
    </Sheet>
  );
}

function ConfirmBody({ onClose, emoji, title, children, confirmLabel, secondConfirmLabel, destructive, onConfirm }: ConfirmSheetProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (step === 1 && secondConfirmLabel) {
      setStep(2);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className={styles.body}>
        <div className={styles.emoji} aria-hidden="true">
          {emoji}
        </div>
        <h2 className={styles.title}>{title}</h2>
        {children !== undefined && <div className={styles.message}>{children}</div>}
      </div>
      <div className={styles.actions}>
        <Button
          key={step}
          className={step === 2 ? styles.second : undefined}
          variant={destructive ? 'destructive' : 'primary'}
          size="large"
          block
          disabled={busy}
          onClick={() => void run()}
        >
          {step === 1 ? confirmLabel : secondConfirmLabel}
        </Button>
        <Button variant="plain" block onClick={onClose}>
          Annulla
        </Button>
      </div>
    </>
  );
}
