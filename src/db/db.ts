import Dexie, { type EntityTable, type Transaction as DexieTransaction } from 'dexie';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from '../core/seed';
import type {
  Budget,
  Category,
  CategoryGroup,
  ImportBatch,
  InstallmentPlan,
  MetaEntry,
  PaymentMethod,
  Person,
  RecurringRule,
  SavedView,
  SavingsGoal,
  Settlement,
  Transaction,
  YearNote,
} from '../core/types';

/**
 * Local database. Every schema change adds a new `this.version(n)` with an
 * upgrade function AND a matching backup migration in core/backup.
 */
export class RendicontoDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  categoryGroups!: EntityTable<CategoryGroup, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  paymentMethods!: EntityTable<PaymentMethod, 'id'>;
  people!: EntityTable<Person, 'id'>;
  recurringRules!: EntityTable<RecurringRule, 'id'>;
  installmentPlans!: EntityTable<InstallmentPlan, 'id'>;
  settlements!: EntityTable<Settlement, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  savingsGoals!: EntityTable<SavingsGoal, 'year'>;
  savedViews!: EntityTable<SavedView, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  yearNotes!: EntityTable<YearNote, 'year'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'rendiconto') {
    super(name);
    this.version(1).stores({
      transactions:
        'id, date, accrualMonth, categoryId, paymentMethodId, kind, status, *tags, dedupeKey, importBatchId, recurringRuleId, installmentPlanId, [accrualMonth+categoryId]',
      categoryGroups: 'id, order',
      categories: 'id, groupId, order',
      paymentMethods: 'id, order',
      people: 'id',
      recurringRules: 'id, active',
      installmentPlans: 'id, closed',
      settlements: 'id, personId, date',
      budgets: 'id, [scope+targetId]',
      savingsGoals: 'year',
      savedViews: 'id, order',
      importBatches: 'id',
      yearNotes: 'year',
      meta: 'key',
    });
    this.on('populate', (tx) => seedLists(tx));
  }

  get allTables() {
    return [
      this.transactions,
      this.categoryGroups,
      this.categories,
      this.paymentMethods,
      this.people,
      this.recurringRules,
      this.installmentPlans,
      this.settlements,
      this.budgets,
      this.savingsGoals,
      this.savedViews,
      this.importBatches,
      this.yearNotes,
      this.meta,
    ];
  }
}

function seedLists(tx: DexieTransaction) {
  void tx.table('categoryGroups').bulkAdd(SEED_GROUPS);
  void tx.table('categories').bulkAdd(SEED_CATEGORIES);
  void tx.table('paymentMethods').bulkAdd(SEED_PAYMENT_METHODS);
}

export const db = new RendicontoDB();
