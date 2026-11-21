import { db as defaultDb, type RendicontoDB } from './db';

/** Saves the "note e obiettivi" of a year; empty text removes the row. */
export async function saveYearNote(year: number, text: string, db: RendicontoDB = defaultDb): Promise<void> {
  if (text.trim() === '') await db.yearNotes.delete(year);
  else await db.yearNotes.put({ year, text, updatedAt: new Date().toISOString() });
}
