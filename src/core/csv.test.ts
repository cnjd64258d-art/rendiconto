import { describe, expect, it } from 'vitest';
import { centsToDecimal, csvField, transactionsToCsv } from './csv';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from './seed';
import { tx } from './test-utils';

describe('csv export', () => {
  it('escapes fields', () => {
    expect(csvField('Caffè')).toBe('Caffè');
    expect(csvField('Pranzo, cena')).toBe('"Pranzo, cena"');
    expect(csvField('Il "Bar"')).toBe('"Il ""Bar"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });

  it('writes amounts with a dot decimal from integer cents', () => {
    expect(centsToDecimal(27150)).toBe('271.50');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(-1999)).toBe('-19.99');
  });

  it('exports sorted rows with names instead of ids', () => {
    const csv = transactionsToCsv(
      [
        tx({ date: '2026-02-01', title: 'Pranzo, Bar', amountCents: 1240, categoryId: 'cat_cibo', paymentMethodId: 'pm_satispay', tags: ['lavoro'] }),
        tx({ date: '2026-01-15', title: 'Mutuo', amountCents: 73443, categoryId: 'cat_mutuo', accrualMonth: '2026-01' }),
      ],
      SEED_CATEGORIES,
      SEED_GROUPS,
      SEED_PAYMENT_METHODS,
    );
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe('data,descrizione,importo,mia_quota,tipo,categoria,macro_voce,metodo_pagamento,metodo_destinazione,competenza,note,tag,stato');
    expect(lines[1]).toBe('2026-01-15,Mutuo,734.43,734.43,uscita,Mutuo,Casa,Conto Corrente,,2026-01,,,confermata');
    expect(lines[2]).toBe('2026-02-01,"Pranzo, Bar",12.40,12.40,uscita,Cibo,"Svago, viaggi, cibo",Satispay,,2026-02,,lavoro,confermata');
  });
});
