import { describe, expect, it } from 'vitest';
import {
  IMPORT_NOTE,
  accrualFromPeriod,
  checkTotals,
  countKeys,
  detectDecimal,
  detectImportKind,
  guessMapping,
  parseDateCell,
  planImport,
  type ImportKind,
  type ImportOptions,
} from '../src/core/csv/import';
import { parseCsv } from '../src/core/csv/parse';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from '../src/core/seed';

import entrate from './fixtures/entrate_sintetiche.csv?raw';
import transazioni from './fixtures/transazioni_sintetiche.csv?raw';

const FIXTURES: Record<string, string> = {
  'transazioni_sintetiche.csv': transazioni,
  'entrate_sintetiche.csv': entrate,
};
const read = (name: string) => FIXTURES[name] ?? '';

function plan(name: string, existing: string[] = [], overrides: Partial<ImportOptions> = {}) {
  const csv = parseCsv(read(name));
  const kind: ImportKind = detectImportKind(csv.header);
  const amountIdx = guessMapping(csv.header, kind).amount ?? 0;
  const options: ImportOptions = {
    kind,
    mapping: guessMapping(csv.header, kind),
    decimal: detectDecimal(csv.rows.map((r) => r.cells[amountIdx] ?? '')),
    categoryOverrides: {},
    methodOverrides: {},
    defaultMethodId: 'pm_conto',
    ...(kind === 'income' ? { extraNote: IMPORT_NOTE } : {}),
    ...overrides,
  };
  return planImport(csv, options, {
    categories: SEED_CATEGORIES,
    groups: SEED_GROUPS,
    methods: SEED_PAYMENT_METHODS,
    existing: countKeys(existing),
  });
}

describe('cell helpers', () => {
  it('parses Italian and ISO dates', () => {
    expect(parseDateCell('2026-01-15')).toBe('2026-01-15');
    expect(parseDateCell('15/01/2026')).toBe('2026-01-15');
    expect(parseDateCell('5/1/26')).toBe('2026-01-05');
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseDateCell('')).toBeNull();
  });

  it('keeps late-December expenses in the year they were reported', () => {
    expect(accrualFromPeriod('2022-12-23', '2023')).toBe('2023-01');
    expect(accrualFromPeriod('2024-01-03', '2023')).toBe('2023-12');
    expect(accrualFromPeriod('2023-06-10', '2023')).toBe('2023-06');
    expect(accrualFromPeriod('2026-05-31', '2026-06')).toBe('2026-06');
    expect(accrualFromPeriod('2026-05-31', '')).toBe('2026-05');
    expect(accrualFromPeriod('2026-05-31', 'boh')).toBeNull();
  });
});

describe('transactions CSV (synthetic fixture with the real edge cases)', () => {
  const p = plan('transazioni_sintetiche.csv');

  it('maps the real header automatically', () => {
    expect(p.kind).toBe('transactions');
    expect(p.missingColumns).toEqual([]);
  });

  it('imports every row, normalising case, spaces and synonyms', () => {
    expect(p.totalRows).toBe(17);
    expect(p.errors).toEqual([]);
    expect(p.toImport).toHaveLength(17);
    expect(p.unknownCategories).toEqual([]);
    const pranzo = p.toImport.find((t) => t.title === 'Pranzo, Bar Centrale');
    expect(pranzo).toMatchObject({ categoryId: 'cat_cibo', paymentMethodId: 'pm_satispay', amountCents: 1290 });
    expect(p.toImport.find((t) => t.title === 'Regalo "Natale"')?.amountCents).toBe(4599);
    expect(p.toImport.find((t) => t.title.startsWith('Weekend'))?.title).toBe('Weekend, "neve" nota su due righe');
    expect(p.toImport.find((t) => t.title === 'McDonald’s'.replace('’', "'"))?.notes).toBe('data corretta (era 2023-06-01)');
  });

  it('uses periodo_rendiconto for the accrual month', () => {
    expect(p.toImport.find((t) => t.title === 'Corso Sci CAI Milano')?.accrualMonth).toBe('2023-01');
    expect(p.toImport.find((t) => t.title === 'Regalo "Natale"')?.accrualMonth).toBe('2023-12');
    expect(p.toImport.find((t) => t.title === 'Volo Pasqua 2025')?.accrualMonth).toBe('2024-12');
  });

  it('computes totals by accrual year (cent exact)', () => {
    const byYear = Object.fromEntries(p.totalsByYear.map((y) => [y.year, y.expenseCents]));
    // 271.50 + 197.00 + 2.40 + 2.40 + 12.90 + 8.50 + 120.00 + 45.99
    expect(byYear[2023]).toBe(66069);
    // 14.90 + 734.43 + 210.00
    expect(byYear[2024]).toBe(95933);
    // 68.12 + 60.00: the cells that went "missing" in Numbers are counted
    expect(byYear[2025]).toBe(12812);
    // 734.43 + 68.12 + 60 + 150
    expect(byYear[2026]).toBe(101255);
  });

  it('flags identical rows but keeps them (two coffees on the same day are real)', () => {
    expect(p.warnings).toEqual([{ line: 5, message: 'Uguale alla riga 4 (stessa data, importo e descrizione)' }]);
  });

  it('is idempotent: importing again adds nothing', () => {
    const again = plan(
      'transazioni_sintetiche.csv',
      p.toImport.map((t) => t.dedupeKey),
    );
    expect(again.toImport).toEqual([]);
    expect(again.duplicates).toBe(17);
  });

  it('imports only the missing copy of a legit duplicate', () => {
    const oneCoffee = p.toImport.filter((t) => t.title === 'Colazione').slice(0, 1).map((t) => t.dedupeKey);
    const again = plan('transazioni_sintetiche.csv', oneCoffee);
    expect(again.toImport.filter((t) => t.title === 'Colazione')).toHaveLength(1);
  });
});

describe('remapping and errors', () => {
  const csv = (body: string) =>
    `data,descrizione,importo,categoria,metodo_pagamento\n${body}`;
  const run = (body: string, o: Partial<ImportOptions> = {}) => {
    const parsed = parseCsv(csv(body));
    return planImport(
      parsed,
      {
        kind: 'transactions',
        mapping: guessMapping(parsed.header, 'transactions'),
        decimal: '.',
        categoryOverrides: {},
        methodOverrides: {},
        defaultMethodId: 'pm_conto',
        ...o,
      },
      { categories: SEED_CATEGORIES, groups: SEED_GROUPS, methods: SEED_PAYMENT_METHODS, existing: new Map() },
    );
  };

  it('lists unknown categories and methods for remapping', () => {
    const p = run('2026-01-01,Pizza,10,Ristoranti,Amex\n2026-01-02,Sushi,20,ristoranti,Amex\n');
    expect(p.unknownCategories).toEqual([{ key: 'ristoranti', value: 'Ristoranti', count: 2 }]);
    expect(p.unknownMethods).toEqual([{ key: 'amex', value: 'Amex', count: 2 }]);
    expect(p.errors).toHaveLength(2);
    const fixed = run('2026-01-01,Pizza,10,Ristoranti,Amex\n', {
      categoryOverrides: { ristoranti: 'cat_cibo' },
      methodOverrides: { amex: 'pm_conto' },
    });
    expect(fixed.errors).toEqual([]);
    expect(fixed.toImport[0]).toMatchObject({ categoryId: 'cat_cibo', paymentMethodId: 'pm_conto' });
  });

  it('reports bad rows with their line number and skips them', () => {
    const p = run('2026-02-30,X,10,Cibo,Satispay\n2026-01-01,,10,Cibo,Satispay\n2026-01-01,Y,abc,Cibo,Satispay\n2026-01-01,Z,-5,Cibo,Satispay\n');
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(p.errors[0]?.message).toContain('Data non valida');
    expect(p.errors[1]?.message).toContain('Descrizione mancante');
    expect(p.errors[2]?.message).toContain('Importo non valido');
    expect(p.errors[3]?.message).toContain('non positivo');
    expect(p.toImport).toEqual([]);
  });

  it('reports missing required columns', () => {
    const parsed = parseCsv('foo,bar\n1,2\n');
    const p = planImport(
      parsed,
      { kind: 'transactions', mapping: guessMapping(parsed.header, 'transactions'), decimal: '.', categoryOverrides: {}, methodOverrides: {}, defaultMethodId: 'pm_conto' },
      { categories: SEED_CATEGORIES, groups: SEED_GROUPS, methods: SEED_PAYMENT_METHODS, existing: new Map() },
    );
    expect(p.missingColumns).toEqual(['date', 'title', 'amount', 'category']);
  });

  it('supports Italian decimal commas and dd/mm/yyyy with a custom mapping', () => {
    const parsed = parseCsv('Giorno;Causale;Euro;Voce di spesa\n15/01/2026;Mutuo;"734,43";Mutuo\n');
    expect(detectDecimal(['734,43'])).toBe(',');
    const p = planImport(
      parsed,
      { kind: 'transactions', mapping: guessMapping(parsed.header, 'transactions'), decimal: ',', categoryOverrides: {}, methodOverrides: {}, defaultMethodId: 'pm_conto' },
      { categories: SEED_CATEGORIES, groups: SEED_GROUPS, methods: SEED_PAYMENT_METHODS, existing: new Map() },
    );
    expect(p.toImport[0]).toMatchObject({ date: '2026-01-15', amountCents: 73443, categoryId: 'cat_mutuo', paymentMethodId: 'pm_conto' });
  });
});

describe('income CSV', () => {
  const p = plan('entrate_sintetiche.csv');

  it('imports yearly totals on 31/12 with the note, monthly ones at month end', () => {
    expect(p.kind).toBe('income');
    expect(p.errors).toEqual([]);
    const stip2023 = p.toImport.find((t) => t.title === 'Stipendio' && t.date.startsWith('2023'));
    expect(stip2023).toMatchObject({
      kind: 'income',
      date: '2023-12-31',
      accrualMonth: '2023-12',
      amountCents: 2361700,
      categoryId: 'cat_stipendio',
      notes: IMPORT_NOTE,
    });
    expect(p.toImport.find((t) => t.date === '2026-01-31')?.amountCents).toBe(205000);
    expect(p.toImport.find((t) => t.title === 'Altro')?.categoryId).toBe('cat_altre_entrate');
  });

  it('totals income per year', () => {
    const y2023 = p.totalsByYear.find((y) => y.year === 2023);
    expect(y2023).toMatchObject({ incomeCents: 3040150, expenseCents: 0 });
  });
});

describe('checkTotals', () => {
  it('compares each year with the Numbers reference', () => {
    const rows = checkTotals([
      { year: 2023, expenseCents: 2_651_557, incomeCents: 0, count: 10 },
      { year: 2024, expenseCents: 1_977_386, incomeCents: 0, count: 10 },
      { year: 2026, expenseCents: 100, incomeCents: 0, count: 1 },
    ]);
    expect(rows.map((r) => r.diffCents)).toEqual([0, -1, null]);
    expect(rows[2]?.expectedCents).toBeNull();
  });
});
