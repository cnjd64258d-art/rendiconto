import { describe, expect, it } from 'vitest';
import { buildCategory, buildMethod, firstEmoji, move, slugId } from './lists';
import { SEED_CATEGORIES, SEED_GROUPS, SEED_PAYMENT_METHODS } from './seed';

describe('slugId', () => {
  it('builds readable ids and avoids clashes', () => {
    expect(slugId('cat', 'Cene fuori', new Set())).toBe('cat_cene_fuori');
    expect(slugId('cat', 'Caffè & Bar', new Set())).toBe('cat_caffe_bar');
    expect(slugId('pm', 'Revolut', new Set(['pm_revolut', 'pm_revolut_2']))).toBe('pm_revolut_3');
    expect(slugId('cat', '🎉', new Set())).toBe('cat_voce');
  });
});

describe('firstEmoji', () => {
  it('keeps one grapheme, including composed emoji', () => {
    expect(firstEmoji('🍕🍔', '•')).toBe('🍕');
    expect(firstEmoji('👨‍👩‍👧 famiglia', '•')).toBe('👨‍👩‍👧');
    expect(firstEmoji('  ', '•')).toBe('•');
  });
});

describe('buildCategory', () => {
  const draft = { name: '  Cene   fuori ', emoji: '🍝', color: 'orange', groupId: 'grp_svago' };
  it('creates a category at the end of its group', () => {
    const r = buildCategory(draft, SEED_CATEGORIES, SEED_GROUPS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inGroup = SEED_CATEGORIES.filter((c) => c.groupId === 'grp_svago');
    expect(r.value).toMatchObject({ id: 'cat_cene_fuori', name: 'Cene fuori', emoji: '🍝', color: 'orange', archived: false });
    expect(r.value.order).toBe(Math.max(...inGroup.map((c) => c.order)) + 1);
  });
  it('rejects empty and duplicate names, ignoring case and spaces', () => {
    expect(buildCategory({ ...draft, name: ' ' }, SEED_CATEGORIES, SEED_GROUPS).ok).toBe(false);
    const dup = buildCategory({ ...draft, name: 'alimentari ' }, SEED_CATEGORIES, SEED_GROUPS);
    expect(dup).toEqual({ ok: false, error: 'Esiste già «Alimentari»' });
  });
  it('requires a group and falls back to gray for unknown colors', () => {
    expect(buildCategory({ ...draft, groupId: null }, SEED_CATEGORIES, SEED_GROUPS).ok).toBe(false);
    const r = buildCategory({ ...draft, color: 'neon' }, SEED_CATEGORIES, SEED_GROUPS);
    expect(r.ok && r.value.color).toBe('gray');
  });
  it('editing keeps the id, and renaming to its own name is fine', () => {
    const cibo = SEED_CATEGORIES.find((c) => c.id === 'cat_cibo');
    if (!cibo) throw new Error('seed');
    const r = buildCategory({ name: 'CIBO', emoji: '', color: cibo.color, groupId: cibo.groupId }, SEED_CATEGORIES, SEED_GROUPS, cibo);
    expect(r.ok && r.value).toMatchObject({ id: 'cat_cibo', name: 'CIBO', emoji: cibo.emoji, order: cibo.order });
  });
});

describe('buildMethod', () => {
  it('creates and validates', () => {
    const r = buildMethod({ name: 'Revolut', emoji: '' }, SEED_PAYMENT_METHODS);
    expect(r.ok && r.value).toMatchObject({ id: 'pm_revolut', emoji: '💳', order: SEED_PAYMENT_METHODS.length });
    expect(buildMethod({ name: 'paypal', emoji: '' }, SEED_PAYMENT_METHODS).ok).toBe(false);
  });
});

describe('move', () => {
  const items = [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 2 },
  ];
  it('swaps neighbours and returns only changed rows', () => {
    expect(move(items, 'c', -1)).toEqual([
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });
  it('does nothing at the edges', () => {
    expect(move(items, 'a', -1)).toEqual([]);
    expect(move(items, 'c', 1)).toEqual([]);
  });
  it('renumbers sparse orders', () => {
    expect(move([{ id: 'a', order: 3 }, { id: 'b', order: 7 }], 'b', -1)).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ]);
  });
});
