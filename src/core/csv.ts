import type { Cents } from './money';
import { effectiveCents } from './transactions';
import type { Category, CategoryGroup, PaymentMethod, Transaction } from './types';

/** RFC 4180 field escaping. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  // BOM so Numbers/Excel open UTF-8 accents correctly.
  return '\uFEFF' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Dot decimal, as in the import format: 27150 → "271.50" */
export function centsToDecimal(cents: Cents): string {
  const abs = Math.abs(cents);
  const s = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

const KIND_LABEL = { expense: 'uscita', income: 'entrata', transfer: 'trasferimento' } as const;

export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  groups: readonly CategoryGroup[],
  methods: readonly PaymentMethod[],
): string {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const grp = new Map(groups.map((g) => [g.id, g.name]));
  const pm = new Map(methods.map((m) => [m.id, m.name]));
  const header = [
    'data',
    'descrizione',
    'importo',
    'mia_quota',
    'tipo',
    'categoria',
    'macro_voce',
    'metodo_pagamento',
    'metodo_destinazione',
    'competenza',
    'note',
    'tag',
    'stato',
  ];
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => {
      const c = t.categoryId ? cat.get(t.categoryId) : undefined;
      return [
        t.date,
        t.title,
        centsToDecimal(t.amountCents),
        centsToDecimal(effectiveCents(t)),
        KIND_LABEL[t.kind],
        c?.name ?? '',
        c ? (grp.get(c.groupId) ?? '') : '',
        pm.get(t.paymentMethodId) ?? '',
        t.toPaymentMethodId ? (pm.get(t.toPaymentMethodId) ?? '') : '',
        t.accrualMonth,
        t.notes,
        t.tags.join(' '),
        t.status === 'confirmed' ? 'confermata' : 'da confermare',
      ];
    });
  return toCsv([header, ...rows]);
}
