import type { Id, SavedView } from '../core/types';
import { db as defaultDb, type RendicontoDB } from './db';

export async function saveView(view: SavedView, db: RendicontoDB = defaultDb): Promise<void> {
  await db.savedViews.put(view);
}

export async function deleteView(id: Id, db: RendicontoDB = defaultDb): Promise<void> {
  await db.savedViews.delete(id);
}
