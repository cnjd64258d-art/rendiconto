import { move } from '../core/lists';
import type { Category, Id, PaymentMethod } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';

export async function saveCategory(category: Category, db: RendicontoDB = defaultDb): Promise<void> {
  await db.categories.put(category);
}

export async function saveMethod(method: PaymentMethod, db: RendicontoDB = defaultDb): Promise<void> {
  await db.paymentMethods.put(method);
}

/** Archived items disappear from pickers but keep their transactions and totals. */
export async function setCategoryArchived(id: Id, archived: boolean, db: RendicontoDB = defaultDb): Promise<void> {
  await db.categories.update(id, { archived });
}

export async function setMethodArchived(id: Id, archived: boolean, db: RendicontoDB = defaultDb): Promise<void> {
  await db.paymentMethods.update(id, { archived });
}

export async function moveCategory(id: Id, direction: -1 | 1, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const cat = await db.categories.get(id);
    if (!cat) return;
    const siblings = (await db.categories.toArray()).filter((c) => c.groupId === cat.groupId && !c.archived);
    await db.categories.bulkPut(move(siblings, id, direction));
  });
}

export async function moveMethod(id: Id, direction: -1 | 1, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.paymentMethods, async () => {
    const siblings = (await db.paymentMethods.toArray()).filter((m) => !m.archived);
    await db.paymentMethods.bulkPut(move(siblings, id, direction));
  });
}

/** How many transactions use each category / method (shown in the lists, informs archiving). */
export async function usageCounts(db: RendicontoDB = defaultDb): Promise<{ categories: Map<Id, number>; methods: Map<Id, number> }> {
  const categories = new Map<Id, number>();
  const methods = new Map<Id, number>();
  await db.transactions.each((t) => {
    if (t.categoryId) categories.set(t.categoryId, (categories.get(t.categoryId) ?? 0) + 1);
    methods.set(t.paymentMethodId, (methods.get(t.paymentMethodId) ?? 0) + 1);
    if (t.toPaymentMethodId) methods.set(t.toPaymentMethodId, (methods.get(t.toPaymentMethodId) ?? 0) + 1);
  });
  return { categories, methods };
}
