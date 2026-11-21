import { isTagColor, type TagColor } from './colors';
import { cleanTitle, normalizeText } from './transactions';
import type { Category, CategoryGroup, Id, PaymentMethod } from './types';

/** A stable, readable id from a name: `cat_` + "Cene fuori" → `cat_cene_fuori` (suffixed if taken). */
export function slugId(prefix: 'cat' | 'pm', name: string, taken: ReadonlySet<Id>): Id {
  const slug =
    normalizeText(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'voce';
  let id = `${prefix}_${slug}`;
  for (let n = 2; taken.has(id); n += 1) id = `${prefix}_${slug}_${n}`;
  return id;
}

/** First grapheme of the input (one emoji), or the fallback when empty. */
export function firstEmoji(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    for (const { segment } of new Segmenter('it', { granularity: 'grapheme' }).segment(trimmed)) return segment;
  }
  return Array.from(trimmed)[0] ?? fallback;
}

export interface CategoryDraft {
  name: string;
  emoji: string;
  color: string;
  groupId: Id | null;
}

export interface MethodDraft {
  name: string;
  emoji: string;
}

export type NameResult<T> = { ok: true; value: T } | { ok: false; error: string };

function checkName(name: string, others: readonly { id: Id; name: string }[], selfId: Id | undefined, what: string): string | null {
  if (!name) return `Dai un nome ${what}`;
  if (name.length > 40) return 'Il nome è troppo lungo (massimo 40 caratteri)';
  const key = normalizeText(name);
  const clash = others.find((o) => o.id !== selfId && normalizeText(o.name) === key);
  // Normalised comparison: "Alimentari", "alimentari " and "ALIMENTARI" are the same name.
  return clash ? `Esiste già «${clash.name}»` : null;
}

/** Validates and builds a category. Existing ids never change, so past transactions stay linked. */
export function buildCategory(
  draft: CategoryDraft,
  all: readonly Category[],
  groups: readonly CategoryGroup[],
  existing?: Category,
): NameResult<Category> {
  const name = cleanTitle(draft.name);
  const error = checkName(name, all, existing?.id, 'alla categoria');
  if (error) return { ok: false, error };
  const group = groups.find((g) => g.id === draft.groupId);
  if (!group) return { ok: false, error: 'Scegli una macro-voce' };
  const color: TagColor = isTagColor(draft.color) ? draft.color : 'gray';
  if (existing) {
    const moved = existing.groupId !== group.id;
    return {
      ok: true,
      value: {
        ...existing,
        name,
        emoji: firstEmoji(draft.emoji, existing.emoji),
        color,
        groupId: group.id,
        order: moved ? nextOrder(all.filter((c) => c.groupId === group.id)) : existing.order,
      },
    };
  }
  return {
    ok: true,
    value: {
      id: slugId('cat', name, new Set(all.map((c) => c.id))),
      name,
      emoji: firstEmoji(draft.emoji, '🏷️'),
      color,
      groupId: group.id,
      order: nextOrder(all.filter((c) => c.groupId === group.id)),
      archived: false,
    },
  };
}

export function buildMethod(draft: MethodDraft, all: readonly PaymentMethod[], existing?: PaymentMethod): NameResult<PaymentMethod> {
  const name = cleanTitle(draft.name);
  const error = checkName(name, all, existing?.id, 'al metodo');
  if (error) return { ok: false, error };
  if (existing) return { ok: true, value: { ...existing, name, emoji: firstEmoji(draft.emoji, existing.emoji) } };
  return {
    ok: true,
    value: {
      id: slugId('pm', name, new Set(all.map((m) => m.id))),
      name,
      emoji: firstEmoji(draft.emoji, '💳'),
      order: nextOrder(all),
      archived: false,
    },
  };
}

function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.order), -1) + 1;
}

/**
 * Moves `id` one place up or down among `siblings` (already sorted by order) and returns the
 * items whose order changed, renumbered 0..n so the order stays dense.
 */
export function move<T extends { id: Id; order: number }>(siblings: readonly T[], id: Id, direction: -1 | 1): T[] {
  const list = [...siblings].sort((a, b) => a.order - b.order);
  const from = list.findIndex((i) => i.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [];
  const [item] = list.splice(from, 1);
  if (!item) return [];
  list.splice(to, 0, item);
  return list.flatMap((i, index) => (i.order === index ? [] : [{ ...i, order: index }]));
}
