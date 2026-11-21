import type { TagColor } from './colors';
import type { ISODate, YearMonth } from './dates';
import type { Cents } from './money';

/** All persisted entities. Ids are UUIDs, except seed rows which use stable slugs. */
export type Id = string;

export type TransactionKind = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'confirmed' | 'pending';

export interface SplitShare {
  personId: Id;
  amountCents: Cents;
}

export interface Split {
  totalCents: Cents;
  myShareCents: Cents;
  /** 'me' when I paid the whole amount, otherwise the person who paid. */
  paidBy: 'me' | Id;
  shares: SplitShare[];
}

export interface Transaction {
  id: Id;
  title: string;
  /** Always a positive integer; the sign comes from `kind`. */
  amountCents: Cents;
  kind: TransactionKind;
  /** Payment date. */
  date: ISODate;
  /** Accrual month ("competenza"), defaults to the payment month. */
  accrualMonth: YearMonth;
  /** Absent for transfers. */
  categoryId?: Id;
  paymentMethodId: Id;
  /** Destination method for transfers. */
  toPaymentMethodId?: Id;
  status: TransactionStatus;
  notes: string;
  tags: string[];
  recurringRuleId?: Id;
  installmentPlanId?: Id;
  installmentIndex?: number;
  split?: Split;
  importBatchId?: Id;
  /** date|amount|normalised title, for duplicate detection. */
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryGroup {
  id: Id;
  name: string;
  kind: 'expense' | 'income';
  order: number;
}

export interface Category {
  id: Id;
  name: string;
  emoji: string;
  color: TagColor;
  groupId: Id;
  order: number;
  archived: boolean;
}

export interface PaymentMethod {
  id: Id;
  name: string;
  emoji: string;
  order: number;
  archived: boolean;
}

export interface Person {
  id: Id;
  name: string;
  archived: boolean;
}

export type Frequency = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringRule {
  id: Id;
  title: string;
  amountCents: Cents;
  isEstimate: boolean;
  frequency: Frequency;
  dayOfMonth: number;
  startDate: ISODate;
  endDate?: ISODate;
  categoryId: Id;
  paymentMethodId: Id;
  active: boolean;
  /** Last date already turned into a pending transaction (or skipped). Generation resumes the day after. */
  generatedThrough?: ISODate;
}

export interface InstallmentPlan {
  id: Id;
  title: string;
  totalCents: Cents;
  count: number;
  accrualMonth?: YearMonth;
  categoryId: Id;
  paymentMethodId: Id;
  notes: string;
  closed: boolean;
}

export interface Settlement {
  id: Id;
  personId: Id;
  /** 'in': they paid me back; 'out': I paid them. */
  direction: 'in' | 'out';
  amountCents: Cents;
  date: ISODate;
  paymentMethodId: Id;
  note: string;
}

export interface Budget {
  id: Id;
  scope: 'category' | 'group';
  targetId: Id;
  monthlyLimitCents: Cents;
  rollover: boolean;
  validFrom: YearMonth;
}

export interface SavingsGoal {
  year: number;
  targetCents: Cents;
}

export interface SavedView {
  id: Id;
  name: string;
  emoji: string;
  layout: 'list' | 'table' | 'board' | 'calendar';
  /** Serialised filter tree; defined in M5. */
  filter: unknown;
  sort: { field: string; direction: 'asc' | 'desc' }[];
  groupBy?: string;
  /** Board columns: category, group or method. */
  boardBy?: string;
  columns?: string[];
  order: number;
}

export interface ImportBatch {
  id: Id;
  fileName: string;
  importedAt: string;
  rowCount: number;
}

export interface YearNote {
  year: number;
  text: string;
  updatedAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Every table, as stored in backups. */
export interface Tables {
  transactions: Transaction[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  people: Person[];
  recurringRules: RecurringRule[];
  installmentPlans: InstallmentPlan[];
  settlements: Settlement[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  savedViews: SavedView[];
  importBatches: ImportBatch[];
  yearNotes: YearNote[];
  meta: MetaEntry[];
}

export const TABLE_NAMES = [
  'transactions',
  'categoryGroups',
  'categories',
  'paymentMethods',
  'people',
  'recurringRules',
  'installmentPlans',
  'settlements',
  'budgets',
  'savingsGoals',
  'savedViews',
  'importBatches',
  'yearNotes',
  'meta',
] as const satisfies readonly (keyof Tables)[];

export type TableName = (typeof TABLE_NAMES)[number];
