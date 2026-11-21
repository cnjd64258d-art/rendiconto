import type { Category, CategoryGroup, PaymentMethod } from './types';

/** Starting lists. Ids are stable slugs so backups and imports stay consistent. */
export const SEED_GROUPS: CategoryGroup[] = [
  { id: 'grp_casa', name: 'Casa', kind: 'expense', order: 0 },
  { id: 'grp_spesa', name: 'Spesa', kind: 'expense', order: 1 },
  { id: 'grp_trasporti', name: 'Trasporti', kind: 'expense', order: 2 },
  { id: 'grp_personale', name: 'Personale', kind: 'expense', order: 3 },
  { id: 'grp_svago', name: 'Svago, viaggi, cibo', kind: 'expense', order: 4 },
  { id: 'grp_abbonamenti', name: 'Abbonamenti', kind: 'expense', order: 5 },
  { id: 'grp_entrate', name: 'Entrate', kind: 'income', order: 6 },
];

const c = (
  id: string,
  name: string,
  emoji: string,
  color: Category['color'],
  groupId: string,
  order: number,
): Category => ({ id, name, emoji, color, groupId, order, archived: false });

export const SEED_CATEGORIES: Category[] = [
  c('cat_mutuo', 'Mutuo', '🏠', 'brown', 'grp_casa', 0),
  c('cat_condominio', 'Condominio', '🏢', 'gray', 'grp_casa', 1),
  c('cat_utenze', 'Utenze', '💡', 'yellow', 'grp_casa', 2),
  c('cat_alimentari', 'Alimentari', '🛒', 'green', 'grp_spesa', 3),
  c('cat_trasporti', 'Trasporti', '🚗', 'blue', 'grp_trasporti', 4),
  c('cat_abbigliamento', 'Abbigliamento', '👕', 'pink', 'grp_personale', 5),
  c('cat_altri_oggetti', 'Altri Oggetti', '📦', 'gray', 'grp_personale', 6),
  c('cat_svago', 'Svago', '🎾', 'purple', 'grp_svago', 7),
  c('cat_viaggi', 'Viaggi', '✈️', 'blue', 'grp_svago', 8),
  c('cat_cibo', 'Cibo', '☕️', 'orange', 'grp_svago', 9),
  c('cat_abbonamenti', 'Abbonamenti', '🔁', 'red', 'grp_abbonamenti', 10),
  c('cat_stipendio', 'Stipendio', '💼', 'green', 'grp_entrate', 11),
  c('cat_investimenti', 'Investimenti', '📈', 'blue', 'grp_entrate', 12),
  c('cat_contanti', 'Contanti', '💶', 'yellow', 'grp_entrate', 13),
  c('cat_rimborsi', 'Rimborsi', '↩️', 'purple', 'grp_entrate', 14),
  c('cat_altre_entrate', 'Altre entrate', '✨', 'gray', 'grp_entrate', 15),
];

export const SEED_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm_conto', name: 'Conto Corrente', emoji: '🏦', order: 0, archived: false },
  { id: 'pm_paypal', name: 'PayPal', emoji: '🅿️', order: 1, archived: false },
  { id: 'pm_satispay', name: 'Satispay', emoji: '📲', order: 2, archived: false },
  { id: 'pm_contanti', name: 'Contanti', emoji: '💵', order: 3, archived: false },
];
