import { useState } from 'react';
import { parseAmount } from '../../core/money';
import { AmountInput, Button, Chip, Chips, SegmentedControl, Sheet, showToast } from '../../ui/components';
import styles from './AddSheet.module.css';

type Kind = 'expense' | 'income';

// Preview only: the real list comes from the database in M2.
const PREVIEW_CATEGORIES = [
  { emoji: '☕️', name: 'Cibo' },
  { emoji: '🛒', name: 'Alimentari' },
  { emoji: '🚗', name: 'Trasporti' },
  { emoji: '🎾', name: 'Svago' },
  { emoji: '🔁', name: 'Abbonamenti' },
  { emoji: '👕', name: 'Abbigliamento' },
  { emoji: '✈️', name: 'Viaggi' },
];

interface AddSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AddSheet({ open, onClose }: AddSheetProps) {
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Cibo');

  const valid = (parseAmount(amount, ',') ?? 0) > 0;

  const reset = () => {
    setAmount('');
    setTitle('');
  };
  const save = () => {
    showToast('Anteprima: niente salvato');
    reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={kind === 'expense' ? 'Nuova spesa' : 'Nuova entrata'}
      title={kind === 'expense' ? 'Nuova spesa' : 'Nuova entrata'}
      leading={
        <Button variant="plain" onClick={onClose}>
          Annulla
        </Button>
      }
      trailing={
        <Button variant="plain" onClick={save} disabled={!valid} style={{ fontWeight: 600 }}>
          Salva
        </Button>
      }
    >
      <div className={styles.kind}>
        <SegmentedControl
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Uscita' },
            { value: 'income', label: 'Entrata' },
          ]}
        />
      </div>
      {open && <AmountInput value={amount} onChange={setAmount} autoFocus />}
      <div className={styles.field}>
        <input
          className={styles.text}
          type="text"
          placeholder="Descrizione"
          aria-label="Descrizione"
          enterKeyHint="done"
          autoCapitalize="sentences"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <Chips label="Categoria">
        {PREVIEW_CATEGORIES.map((c) => (
          <Chip key={c.name} emoji={c.emoji} selected={category === c.name} onClick={() => setCategory(c.name)}>
            {c.name}
          </Chip>
        ))}
      </Chips>
      <p className={styles.note}>Anteprima della milestone 1: il salvataggio arriva con la prossima versione.</p>
    </Sheet>
  );
}
