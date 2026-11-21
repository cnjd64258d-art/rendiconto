import { useEffect, useState } from 'react';

/** Ask Safari to keep our IndexedDB data (no eviction). Safe to call often. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export interface StorageStatus {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export function useStorageStatus(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>({ persisted: null, usage: null, quota: null });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
      const estimate = await navigator.storage?.estimate?.().catch(() => null);
      if (!cancelled) {
        setStatus({ persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/** True when launched from the Home Screen (standalone PWA). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
