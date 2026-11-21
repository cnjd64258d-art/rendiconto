import { today as todayISO } from '../core/dates';
import { generateDue, kindResolver, type RuleInput } from '../core/recurring';
import type { Id, RecurringRule, Transaction } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';
import { newId } from './repo';

/**
 * Turns every occurrence that matured up to today into a pending transaction ("da confermare").
 * Runs at app open and when the app comes back to the foreground. Idempotent: each rule remembers
 * the last generated day (`generatedThrough`), and everything happens in one transaction.
 */
export async function generateRecurring(today: string = todayISO(), db: RendicontoDB = defaultDb): Promise<number> {
  return db.transaction('rw', db.recurringRules, db.transactions, db.categories, db.categoryGroups, async () => {
    const rules = await db.recurringRules.toArray();
    if (rules.length === 0) return 0;
    const kindOf = kindResolver(await db.categories.toArray(), await db.categoryGroups.toArray());
    const { transactions, advanced } = generateDue(rules, today, kindOf);
    const now = new Date().toISOString();
    const rows: Transaction[] = transactions.map((t) => ({ ...t, id: newId(), createdAt: now, updatedAt: now }));
    if (rows.length > 0) await db.transactions.bulkAdd(rows);
    for (const [id, through] of Object.entries(advanced)) await db.recurringRules.update(id, { generatedThrough: through });
    return rows.length;
  });
}

export async function confirmPending(id: Id, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transactions.update(id, { status: 'confirmed', updatedAt: new Date().toISOString() });
}

export async function saveRule(input: RuleInput, id?: Id, db: RendicontoDB = defaultDb): Promise<RecurringRule> {
  const rule: RecurringRule = { ...input, id: id ?? newId() };
  await db.recurringRules.put(rule);
  return rule;
}

/** Deletes a rule and its still-pending transactions. Confirmed ones stay (they are real payments). */
export async function deleteRule(id: Id, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.recurringRules, db.transactions, async () => {
    await db.transactions.where('recurringRuleId').equals(id).filter((t) => t.status === 'pending').delete();
    await db.recurringRules.delete(id);
  });
}
