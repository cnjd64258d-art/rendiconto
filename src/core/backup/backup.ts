import { isISODate, isYearMonth } from '../dates';
import { DEVICE_META_KEYS } from '../pin';
import { TABLE_NAMES, type Tables, type Transaction } from '../types';

export const BACKUP_FORMAT = 'rendiconto-backup';
/** Bump together with a new Dexie version and add a migration below. */
export const SCHEMA_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: Tables;
}

export function createBackup(tables: Tables, appVersion: string, now: Date = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    // The PIN belongs to this iPhone: a backup never carries it.
    tables: { ...tables, meta: tables.meta.filter((m) => !DEVICE_META_KEYS.includes(m.key)) },
  };
}

type RawTables = Record<string, unknown[]>;

/**
 * Forward migrations: MIGRATIONS[n] turns schema n into n + 1.
 * Pure functions, so a backup from any older version can always be restored.
 */
export const MIGRATIONS: Record<number, (tables: RawTables) => RawTables> = {};

export function migrateTables(tables: RawTables, fromVersion: number, toVersion = SCHEMA_VERSION): RawTables {
  let current = tables;
  for (let v = fromVersion; v < toVersion; v += 1) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Missing migration from schema ${v}`);
    current = step(current);
  }
  return current;
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidTransaction(t: unknown): t is Transaction {
  if (!isRecord(t)) return false;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.amountCents === 'number' &&
    Number.isSafeInteger(t.amountCents) &&
    t.amountCents > 0 &&
    (t.kind === 'expense' || t.kind === 'income' || t.kind === 'transfer') &&
    typeof t.date === 'string' &&
    isISODate(t.date) &&
    typeof t.accrualMonth === 'string' &&
    isYearMonth(t.accrualMonth) &&
    typeof t.paymentMethodId === 'string'
  );
}

/** Reads a backup file, migrating it to the current schema. Never throws. */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, error: 'Il file non è un JSON valido.' };
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Questo file non è un backup di Rendiconto.' };
  }
  const version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Versione del backup non riconosciuta.' };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: "Il backup è stato creato con una versione più recente dell'app. Aggiorna l'app e riprova." };
  }
  if (!isRecord(data.tables)) return { ok: false, error: 'Il backup non contiene dati.' };

  const raw: RawTables = {};
  for (const name of TABLE_NAMES) {
    const table = data.tables[name];
    if (table === undefined) raw[name] = [];
    else if (Array.isArray(table)) raw[name] = table;
    else return { ok: false, error: `Tabella «${name}» non valida.` };
  }

  let migrated: RawTables;
  try {
    migrated = migrateTables(raw, version);
  } catch {
    return { ok: false, error: 'Impossibile aggiornare il backup alla versione attuale.' };
  }

  const bad = (migrated.transactions ?? []).filter((t) => !isValidTransaction(t)).length;
  if (bad > 0) return { ok: false, error: `${bad} transazioni nel backup non sono valide.` };

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: typeof data.appVersion === 'string' ? data.appVersion : 'sconosciuta',
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      tables: migrated as unknown as Tables,
    },
  };
}

export interface BackupSummary {
  exportedAt: string;
  appVersion: string;
  transactions: number;
  categories: number;
  paymentMethods: number;
  firstDate: string | null;
  lastDate: string | null;
  otherRows: number;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const dates = backup.tables.transactions.map((t) => t.date).sort();
  const t = backup.tables;
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    transactions: t.transactions.length,
    categories: t.categories.length,
    paymentMethods: t.paymentMethods.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    otherRows:
      t.people.length +
      t.recurringRules.length +
      t.installmentPlans.length +
      t.settlements.length +
      t.budgets.length +
      t.savingsGoals.length +
      t.savedViews.length +
      t.yearNotes.length,
  };
}

export function backupFileName(now: Date, ext: 'json' | 'csv'): string {
  const d = now.toISOString().slice(0, 10);
  return ext === 'json' ? `rendiconto-backup-${d}.json` : `rendiconto-transazioni-${d}.csv`;
}

const DAY = 24 * 60 * 60 * 1000;

/** Gentle reminder when the last export is older than 7 days. */
export function backupReminder(
  lastBackupAt: string | null,
  transactionCount: number,
  now: Date = new Date(),
): { due: boolean; daysAgo: number | null } {
  if (transactionCount === 0) return { due: false, daysAgo: null };
  if (!lastBackupAt) return { due: true, daysAgo: null };
  const days = Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / DAY);
  return { due: days >= 7, daysAgo: days };
}
