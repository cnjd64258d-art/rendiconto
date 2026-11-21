import { addDays, isoWeekday, monthOf, parseISODate, type ISODate } from './dates';
import type { Cents } from './money';
import { dedupeKey } from './transactions';
import type { Id, Transaction, TransactionKind } from './types';

/** Tiny deterministic PRNG (mulberry32): demo data is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Row {
  title: string;
  cents: Cents;
  categoryId: Id;
  methodId: Id;
  kind?: TransactionKind;
}

/** Realistic everyday transactions for the `days` days up to `today`. */
export function generateDemoTransactions(today: ISODate, days = 120, seed = 2026): Transaction[] {
  const rand = rng(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const between = (min: number, max: number, step = 10) => Math.round((min + rand() * (max - min)) / step) * step;

  const out: Transaction[] = [];
  let n = 0;
  const add = (date: ISODate, r: Row) => {
    n += 1;
    const createdAt = `${date}T${String(8 + (n % 12)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}:00.000Z`;
    out.push({
      id: `demo_${String(n).padStart(5, '0')}`,
      title: r.title,
      amountCents: r.cents,
      kind: r.kind ?? 'expense',
      date,
      accrualMonth: monthOf(date),
      categoryId: r.categoryId,
      paymentMethodId: r.methodId,
      status: 'confirmed',
      notes: '',
      tags: ['demo'],
      dedupeKey: dedupeKey(date, r.cents, r.title),
      createdAt,
      updatedAt: createdAt,
    });
  };

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const wd = isoWeekday(date);
    const { day } = parseISODate(date);
    const workday = wd <= 5;

    if (rand() < 0.75) add(date, { title: 'Colazione', cents: pick([150, 240, 280, 320]), categoryId: 'cat_cibo', methodId: 'pm_satispay' });
    if (workday && rand() < 0.6) add(date, { title: 'Mensa Allianz', cents: pick([650, 700, 750]), categoryId: 'cat_cibo', methodId: 'pm_satispay' });
    if (rand() < 0.3) add(date, { title: 'ShareNow', cents: between(590, 1890), categoryId: 'cat_trasporti', methodId: 'pm_paypal' });
    if ((wd === 2 || wd === 6) && rand() < 0.7) add(date, { title: 'Padel', cents: pick([1000, 1200]), categoryId: 'cat_svago', methodId: 'pm_conto' });
    if (wd === 6 && rand() < 0.85) add(date, { title: 'Esselunga', cents: between(2800, 8500), categoryId: 'cat_alimentari', methodId: 'pm_conto' });
    if (wd === 5 && rand() < 0.5) add(date, { title: 'Cena fuori', cents: between(2500, 5500, 50), categoryId: 'cat_cibo', methodId: 'pm_conto' });
    if (rand() < 0.04) add(date, { title: pick(['Zara', 'Decathlon', 'Uniqlo']), cents: between(1990, 7990, 100), categoryId: 'cat_abbigliamento', methodId: 'pm_conto' });
    if (rand() < 0.03) add(date, { title: pick(['Amazon', 'Libreria', 'Ferramenta']), cents: between(990, 4990, 100), categoryId: 'cat_altri_oggetti', methodId: 'pm_paypal' });

    if (day === 15) add(date, { title: 'Rata Mutuo', cents: 73443, categoryId: 'cat_mutuo', methodId: 'pm_conto' });
    if (day === 18) add(date, { title: 'Rinnovo Vodafone Fibra', cents: 3000, categoryId: 'cat_abbonamenti', methodId: 'pm_conto' });
    if (day === 3) add(date, { title: 'Gympass', cents: 4590, categoryId: 'cat_abbonamenti', methodId: 'pm_conto' });
    if (day === 5) add(date, { title: 'UnipolMove', cents: between(900, 3200), categoryId: 'cat_trasporti', methodId: 'pm_conto' });
    if (day === 10 && rand() < 0.6) add(date, { title: 'Rata Condominio', cents: 18000, categoryId: 'cat_condominio', methodId: 'pm_conto' });
    if (day === 22 && rand() < 0.5) add(date, { title: 'Bolletta Luce e Gas', cents: between(6000, 14000), categoryId: 'cat_utenze', methodId: 'pm_paypal' });
    if (day === 27) add(date, { title: 'Stipendio', cents: 205000, categoryId: 'cat_stipendio', methodId: 'pm_conto', kind: 'income' });
  }
  return out;
}
