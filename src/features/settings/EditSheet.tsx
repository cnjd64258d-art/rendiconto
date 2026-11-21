import type { ReactNode } from 'react';
import { Button, Sheet } from '../../ui/components';
import styles from './Form.module.css';

/** Bottom sheet with "Annulla … Salva" header, used by the settings editors. */
export function EditSheet({
  open,
  title,
  onClose,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={title}
      title={title}
      leading={
        <Button variant="plain" onClick={onClose}>
          Annulla
        </Button>
      }
      trailing={
        <Button variant="plain" onClick={onSave} style={{ fontWeight: 600 }}>
          Salva
        </Button>
      }
    >
      <div className={styles.form}>{children}</div>
    </Sheet>
  );
}
