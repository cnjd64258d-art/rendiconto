import type { ImportPlan } from '../core/csv/import';
import { countKeys } from '../core/csv/import';
import type { Id, ImportBatch, Transaction } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';
import { newId } from './repo';

export async function existingKeyCounts(db: RendicontoDB = defaultDb): Promise<Map<string, number>> {
  const keys: string[] = [];
  await db.transactions.each((t) => {
    keys.push(t.dedupeKey);
  });
  return countKeys(keys);
}

/** Writes the planned rows as one batch, so the whole import can be undone. */
export async function commitImport(plan: ImportPlan, fileName: string, db: RendicontoDB = defaultDb): Promise<ImportBatch> {
  const now = new Date().toISOString();
  const batch: ImportBatch = { id: newId(), fileName, importedAt: now, rowCount: plan.toImport.length };
  const rows: Transaction[] = plan.toImport.map((input) => ({
    ...input,
    id: newId(),
    importBatchId: batch.id,
    createdAt: now,
    updatedAt: now,
  }));
  await db.transaction('rw', db.transactions, db.importBatches, async () => {
    await db.importBatches.add(batch);
    await db.transactions.bulkAdd(rows);
  });
  return batch;
}

export async function undoImport(batchId: Id, db: RendicontoDB = defaultDb): Promise<number> {
  return db.transaction('rw', db.transactions, db.importBatches, async () => {
    const n = await db.transactions.where('importBatchId').equals(batchId).delete();
    await db.importBatches.delete(batchId);
    return n;
  });
}
