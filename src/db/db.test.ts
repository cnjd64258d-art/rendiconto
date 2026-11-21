import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from '../core/backup/backup';
import { validateDraft } from '../core/transactions';
import { RendicontoDB } from './db';
import {
  addTransaction,
  clearAllData,
  deleteTransaction,
  loadDemoData,
  readAllTables,
  removeDemoData,
  replaceAllTables,
  restoreTransaction,
  updateTransaction,
} from './repo';

let n = 0;
const dbs: RendicontoDB[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete();
});
function fresh() {
  const d = new RendicontoDB(`test-${++n}`);
  dbs.push(d);
  return d;
}

const input = () => {
  const r = validateDraft({
    kind: 'expense',
    amount: '12,40',
    title: 'Pranzo',
    categoryId: 'cat_cibo',
    paymentMethodId: 'pm_satispay',
    toPaymentMethodId: null,
    date: '2026-11-21',
    accrualMonth: '',
    notes: '',
    tags: '',
  });
  if (!r.ok) throw new Error('bad draft');
  return r.value;
};

describe('database', () => {
  it('seeds categories, groups and methods on first open', async () => {
    const db = fresh();
    expect(await db.categories.count()).toBe(16);
    expect(await db.categoryGroups.count()).toBe(7);
    expect((await db.paymentMethods.orderBy('order').toArray()).map((m) => m.name)).toEqual([
      'Conto Corrente',
      'PayPal',
      'Satispay',
      'Contanti',
    ]);
  });

  it('adds, edits, deletes and restores a transaction', async () => {
    const db = fresh();
    const t = await addTransaction(input(), db);
    await updateTransaction(t.id, { ...input(), amountCents: 999 }, db);
    expect((await db.transactions.get(t.id))?.amountCents).toBe(999);
    expect((await db.transactions.get(t.id))?.createdAt).toBe(t.createdAt);
    const deleted = await deleteTransaction(t.id, db);
    expect(await db.transactions.count()).toBe(0);
    if (deleted) await restoreTransaction(deleted, db);
    expect(await db.transactions.count()).toBe(1);
  });

  it('backs up and restores every table', async () => {
    const source = fresh();
    await addTransaction(input(), source);
    await loadDemoData('2026-11-21', source);
    await source.meta.put({ key: 'lastBackupAt', value: '2026-11-21T10:00:00Z' });
    const backup = createBackup(await readAllTables(source), 'test');

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const target = fresh();
    await addTransaction(input(), target); // will be replaced
    await replaceAllTables(parsed.backup.tables, target);
    expect(await readAllTables(target)).toEqual(await readAllTables(source));
  });

  it('removes demo data only, and clears everything back to the seed', async () => {
    const db = fresh();
    await addTransaction(input(), db);
    const count = await loadDemoData('2026-11-21', db);
    expect(await db.transactions.count()).toBe(count + 1);
    await removeDemoData(db);
    expect(await db.transactions.count()).toBe(1);
    await db.categories.update('cat_cibo', { name: 'Ristoranti' });
    await clearAllData(db);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.categories.get('cat_cibo'))?.name).toBe('Cibo');
  });

  it('keeps the PIN on this iPhone: not in backups, kept on restore and on clear', async () => {
    const source = fresh();
    await source.meta.put({ key: 'pinLock', value: { hash: 'source' } });
    const backup = createBackup(await readAllTables(source), 'test');
    expect(JSON.stringify(backup)).not.toContain('pinLock');

    const target = fresh();
    await target.meta.put({ key: 'pinLock', value: { hash: 'target' } });
    await replaceAllTables({ ...backup.tables, meta: [{ key: 'pinLock', value: { hash: 'evil' } }] }, target);
    expect((await target.meta.get('pinLock'))?.value).toEqual({ hash: 'target' });

    await clearAllData(target);
    expect((await target.meta.get('pinLock'))?.value).toEqual({ hash: 'target' });
    await clearAllData(target, false);
    expect(await target.meta.get('pinLock')).toBeUndefined();
  });
});

describe('imports', () => {
  it('commits a batch idempotently and can undo it', async () => {
    const { parseCsv } = await import('../core/csv/parse');
    const { planImport, guessMapping } = await import('../core/csv/import');
    const { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } = await import('../core/seed');
    const { commitImport, existingKeyCounts, undoImport } = await import('./imports');
    const db = fresh();
    const csv = parseCsv('data,descrizione,importo,categoria\n2026-01-01,Caffè,1.5,Cibo\n2026-01-01,Caffè,1.5,Cibo\n2026-01-02,Mutuo,734.43,Mutuo\n');
    const makePlan = async () =>
      planImport(
        csv,
        { kind: 'transactions', mapping: guessMapping(csv.header, 'transactions'), decimal: '.', categoryOverrides: {}, methodOverrides: {}, defaultMethodId: 'pm_conto' },
        { categories: SEED_CATEGORIES, groups: SEED_GROUPS, methods: SEED_PAYMENT_METHODS, existing: await existingKeyCounts(db) },
      );
    const first = await makePlan();
    const batch = await commitImport(first, 'a.csv', db);
    expect(await db.transactions.count()).toBe(3);
    expect((await makePlan()).toImport).toHaveLength(0);
    expect(await undoImport(batch.id, db)).toBe(3);
    expect(await db.importBatches.count()).toBe(0);
  });
});

describe('recurring', () => {
  it('generates pending rows once, confirms them, and deletes only pending rows with the rule', async () => {
    const db = fresh();
    const { saveRule, generateRecurring, confirmPending, deleteRule } = await import('./recurring');
    const rule = await saveRule(
      {
        title: 'Rata Mutuo',
        amountCents: 73443,
        isEstimate: false,
        frequency: 'monthly',
        dayOfMonth: 15,
        startDate: '2026-09-01',
        categoryId: 'cat_mutuo',
        paymentMethodId: 'pm_conto',
        active: true,
      },
      undefined,
      db,
    );
    expect(await generateRecurring('2026-11-21', db)).toBe(3);
    expect(await generateRecurring('2026-11-21', db)).toBe(0);
    const rows = await db.transactions.where('recurringRuleId').equals(rule.id).sortBy('date');
    expect(rows.map((r) => [r.date, r.status])).toEqual([
      ['2026-09-15', 'pending'],
      ['2026-10-15', 'pending'],
      ['2026-11-15', 'pending'],
    ]);
    await confirmPending(rows[0]?.id ?? '', db);
    await deleteRule(rule.id, db);
    expect(await db.recurringRules.count()).toBe(0);
    expect((await db.transactions.toArray()).map((t) => [t.date, t.status])).toEqual([['2026-09-15', 'confirmed']]);
  });

  it('demo data brings rules, and removing it takes their pending rows too', async () => {
    const db = fresh();
    const { generateRecurring } = await import('./recurring');
    await loadDemoData('2026-11-21', db);
    expect(await db.recurringRules.count()).toBeGreaterThan(0);
    expect(await generateRecurring('2026-11-21', db)).toBe(1);
    await removeDemoData(db);
    expect(await db.recurringRules.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });

  it('budgets: changes start this month, removal keeps history, demo budgets never shadow real ones', async () => {
    const db = fresh();
    const { saveBudget, saveSavingsGoal } = await import('./budgets');
    await saveBudget('category', 'cat_cibo', '2026-10', { limitCents: 10000, rollover: false }, db);
    await saveBudget('category', 'cat_cibo', '2026-10', { limitCents: 12000, rollover: true }, db);
    expect((await db.budgets.toArray()).map((b) => [b.validFrom, b.monthlyLimitCents, b.rollover])).toEqual([['2026-10', 12000, true]]);
    await saveBudget('category', 'cat_cibo', '2026-11', null, db);
    const rows = (await db.budgets.toArray()).sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
    expect(rows.map((b) => [b.validFrom, b.monthlyLimitCents])).toEqual([['2026-10', 12000], ['2026-11', 0]]);

    await saveBudget('category', 'cat_alimentari', '2026-11', { limitCents: 1, rollover: false }, db);
    await loadDemoData('2026-11-21', db);
    expect(await db.budgets.where('id').startsWith('demo_budget_').count()).toBe(3);
    await removeDemoData(db);
    expect(await db.budgets.count()).toBe(3);

    await saveSavingsGoal(2026, 500000, db);
    expect(await db.savingsGoals.get(2026)).toEqual({ year: 2026, targetCents: 500000 });
    await saveSavingsGoal(2026, null, db);
    expect(await db.savingsGoals.count()).toBe(0);
  });

  it('shared data: demo brings people, a plan and a repayment; deleting a plan keeps its instalments', async () => {
    const db = fresh();
    const { deletePlan } = await import('./shared');
    await loadDemoData('2026-11-21', db);
    expect(await db.people.count()).toBe(2);
    expect(await db.transactions.where('installmentPlanId').equals('demo_plan_madeira').count()).toBe(2);
    await deletePlan('demo_plan_madeira', db);
    expect(await db.transactions.where('installmentPlanId').equals('demo_plan_madeira').count()).toBe(0);
    expect(await db.transactions.where('id').startsWith('demo_shared_').count()).toBe(5);
    await removeDemoData(db);
    expect(await db.people.count()).toBe(0);
    expect(await db.settlements.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });

  it('the editor can remove a split or an instalment link', async () => {
    const db = fresh();
    const r = input();
    const t = await addTransaction({ ...r, split: { totalCents: r.amountCents, myShareCents: 1, paidBy: 'me', shares: [] }, installmentPlanId: 'p', installmentIndex: 1 }, db);
    await updateTransaction(t.id, r, db);
    expect((await db.transactions.get(t.id))?.split).toBeDefined();
    await updateTransaction(t.id, r, db, ['split', 'installmentPlanId', 'installmentIndex']);
    const after = await db.transactions.get(t.id);
    expect(after?.split).toBeUndefined();
    expect(after?.installmentPlanId).toBeUndefined();
  });
});
