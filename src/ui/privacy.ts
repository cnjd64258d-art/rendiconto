import { useSyncExternalStore } from 'react';
import { areAmountsHidden, setAmountsHidden } from '../core/format';

/**
 * "Nascondi importi" (bank style): every amount formatted through core/format shows as "••••• €".
 * A device preference kept in localStorage, read before the first paint so amounts never flash.
 */
const KEY = 'ledgerline.hideAmounts';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') setAmountsHidden(read());

export function toggleAmountsHidden(): void {
  const next = !areAmountsHidden();
  setAmountsHidden(next);
  try {
    if (next) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the choice lasts until the app closes.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe to re-render when amounts are hidden or shown. */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, areAmountsHidden, () => false);
}
