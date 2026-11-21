import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from '../seed';
import { tx } from '../test-utils';
import type { Tables } from '../types';
import {
  MIGRATIONS,
  SCHEMA_VERSION,
  backupReminder,
  createBackup,
  migrateTables,
  parseBackup,
  summarizeBackup,
} from './backup';

function tables(): Tables {
  return {
    transactions: [tx({ date: '2023-01-02' }), tx({ date: '2026-11-20', title: 'Caffè "al volo", ok' })],
    categoryGroups: SEED_GROUPS,
    categories: SEED_CATEGORIES,
    paymentMethods: SEED_PAYMENT_METHODS,
    people: [],
    recurringRules: [],
    installmentPlans: [],
    settlements: [],
    budgets: [],
    savingsGoals: [],
    savedViews: [],
    importBatches: [],
    yearNotes: [{ year: 2026, text: 'Risparmiare di più', updatedAt: '2026-11-20T10:00:00Z' }],
    meta: [{ key: 'lastBackupAt', value: '2026-11-01T10:00:00Z' }],
  };
}

describe('backup round trip', () => {
  it('restores exactly what was exported', () => {
    const backup = createBackup(tables(), '0.2.0', new Date('2026-11-21T10:00:00Z'));
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.tables).toEqual(backup.tables);
    expect(parsed.backup.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('accepts a BOM and missing future tables', () => {
    const b = createBackup(tables(), '0.2.0') as unknown as { tables: Record<string, unknown> };
    delete b.tables.savedViews;
    const parsed = parseBackup('﻿' + JSON.stringify(b));
    expect(parsed.ok && parsed.backup.tables.savedViews).toEqual([]);
  });

  it('summarises for the restore preview', () => {
    const s = summarizeBackup(createBackup(tables(), '0.2.0', new Date('2026-11-21T10:00:00Z')));
    expect(s).toMatchObject({ transactions: 2, categories: 16, paymentMethods: 4, firstDate: '2023-01-02', lastDate: '2026-11-20', otherRows: 1 });
  });
});

describe('parseBackup rejects bad files', () => {
  it.each([
    ['not json', 'non è un JSON'],
    ['{"format":"other"}', 'non è un backup'],
    ['{"format":"rendiconto-backup","schemaVersion":99,"tables":{}}', 'più recente'],
    ['{"format":"rendiconto-backup","schemaVersion":0,"tables":{}}', 'non riconosciuta'],
    ['{"format":"rendiconto-backup","schemaVersion":1}', 'non contiene dati'],
    ['{"format":"rendiconto-backup","schemaVersion":1,"tables":{"transactions":{}}}', 'non valida'],
  ])('%s', (text, message) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it('refuses float or negative amounts', () => {
    const t = tables();
    const bad = { ...t, transactions: [{ ...tx(), amountCents: 12.5 }, { ...tx(), amountCents: -100 }] };
    const r = parseBackup(JSON.stringify(createBackup(bad as Tables, '0.2.0')));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2 transazioni');
  });
});

describe('migrations', () => {
  it('chains steps from an old schema', () => {
    MIGRATIONS[1] = (t) => ({ ...t, transactions: t.transactions?.map((x) => ({ ...(x as object), migrated: true })) ?? [] });
    try {
      const out = migrateTables({ transactions: [{ id: 'a' }] }, 1, 2);
      expect(out.transactions).toEqual([{ id: 'a', migrated: true }]);
      expect(() => migrateTables({}, 1, 3)).toThrow();
    } finally {
      delete MIGRATIONS[1];
    }
  });
});

describe('backupReminder', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  it('stays quiet with no data or a recent backup', () => {
    expect(backupReminder(null, 0, now).due).toBe(false);
    expect(backupReminder('2026-11-15T12:00:00Z', 10, now)).toEqual({ due: false, daysAgo: 6 });
  });
  it('reminds after 7 days or if never done', () => {
    expect(backupReminder('2026-11-14T12:00:00Z', 10, now)).toEqual({ due: true, daysAgo: 7 });
    expect(backupReminder(null, 1, now)).toEqual({ due: true, daysAgo: null });
  });
});
