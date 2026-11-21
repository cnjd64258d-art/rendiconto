import { META_PIN, META_PIN_ATTEMPTS, NO_ATTEMPTS, readPinAttempts, readPinConfig, type PinAttempts, type PinConfig } from '../core/pin';
import { clearAllData } from './repo';
import { db as defaultDb, type RendicontoDB } from './db';

export async function readPin(db: RendicontoDB = defaultDb): Promise<PinConfig | null> {
  return readPinConfig((await db.meta.get(META_PIN))?.value);
}

export async function savePin(config: PinConfig, db: RendicontoDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.put({ key: META_PIN, value: config });
    await db.meta.put({ key: META_PIN_ATTEMPTS, value: NO_ATTEMPTS });
  });
}

export async function removePin(db: RendicontoDB = defaultDb): Promise<void> {
  await db.meta.bulkDelete([META_PIN, META_PIN_ATTEMPTS]);
}

export async function readAttempts(db: RendicontoDB = defaultDb): Promise<PinAttempts> {
  return readPinAttempts((await db.meta.get(META_PIN_ATTEMPTS))?.value);
}

export async function saveAttempts(a: PinAttempts, db: RendicontoDB = defaultDb): Promise<void> {
  await db.meta.put({ key: META_PIN_ATTEMPTS, value: a });
}

/** "Hai dimenticato il PIN?": the only way out is to erase everything on this iPhone. */
export async function eraseEverythingAndPin(db: RendicontoDB = defaultDb): Promise<void> {
  await clearAllData(db, false);
}
