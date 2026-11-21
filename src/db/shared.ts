import type { Id, InstallmentPlan, Person, Settlement } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';
import { newId } from './repo';

/* People */

export async function savePerson(p: Person, db: RendicontoDB = defaultDb): Promise<void> {
  await db.people.put(p);
}

export async function setPersonArchived(id: Id, archived: boolean, db: RendicontoDB = defaultDb): Promise<void> {
  await db.people.update(id, { archived });
}

/* Instalment plans */

export async function savePlan(plan: Omit<InstallmentPlan, 'id'>, id?: Id, db: RendicontoDB = defaultDb): Promise<InstallmentPlan> {
  const row: InstallmentPlan = { ...plan, id: id ?? newId() };
  await db.installmentPlans.put(row);
  return row;
}

export async function setPlanClosed(id: Id, closed: boolean, db: RendicontoDB = defaultDb): Promise<void> {
  await db.installmentPlans.update(id, { closed });
}

/** Deletes the plan; its instalments stay as normal expenses (only the link goes). */
export async function deletePlan(id: Id, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.installmentPlans, db.transactions, async () => {
    await db.installmentPlans.delete(id);
    const linked = await db.transactions.where('installmentPlanId').equals(id).toArray();
    for (const t of linked) {
      const next = { ...t, updatedAt: new Date().toISOString() };
      delete next.installmentPlanId;
      delete next.installmentIndex;
      await db.transactions.put(next);
    }
  });
}

/** Links an existing expense to a plan (past instalments from the imported history). */
export async function linkInstalment(planId: Id, transactionId: Id, index: number, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transactions.update(transactionId, { installmentPlanId: planId, installmentIndex: index, updatedAt: new Date().toISOString() });
}

export async function unlinkInstalment(transactionId: Id, db: RendicontoDB = defaultDb): Promise<void> {
  const t = await db.transactions.get(transactionId);
  if (!t) return;
  const next = { ...t, updatedAt: new Date().toISOString() };
  delete next.installmentPlanId;
  delete next.installmentIndex;
  await db.transactions.put(next);
}

/* Settlements (repayments between people: never income or expenses) */

export async function saveSettlement(s: Omit<Settlement, 'id'>, id?: Id, db: RendicontoDB = defaultDb): Promise<void> {
  await db.settlements.put({ ...s, id: id ?? newId() });
}

export async function deleteSettlement(id: Id, db: RendicontoDB = defaultDb): Promise<Settlement | undefined> {
  const s = await db.settlements.get(id);
  await db.settlements.delete(id);
  return s;
}

export async function restoreSettlement(s: Settlement, db: RendicontoDB = defaultDb): Promise<void> {
  await db.settlements.put(s);
}
