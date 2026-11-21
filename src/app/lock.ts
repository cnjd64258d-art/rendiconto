import { useSyncExternalStore } from 'react';
import { shouldLockOnReturn, type PinConfig } from '../core/pin';
import { readPin } from '../db/pin';

/** "checking" until the PIN setting is read, so the content never flashes before the lock. */
export type LockStatus = 'checking' | 'locked' | 'open';

interface LockState {
  status: LockStatus;
  config: PinConfig | null;
}

let state: LockState = { status: 'checking', config: null };
let hiddenAt: number | null = null;
const listeners = new Set<() => void>();

function set(next: LockState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useLock(): LockState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function unlock(): void {
  set({ ...state, status: 'open' });
}

export function lockNow(): void {
  if (state.config) set({ ...state, status: 'locked' });
}

/** After a change in Settings: the app stays open. */
export function setPinConfig(config: PinConfig | null): void {
  set({ status: 'open', config });
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    // "Subito": cover the content before iOS takes the app-switcher snapshot.
    if (state.config?.lockAfterSec === 0) lockNow();
    return;
  }
  if (state.config && shouldLockOnReturn(hiddenAt, Date.now(), state.config.lockAfterSec)) lockNow();
  hiddenAt = null;
}

let started = false;
/** Reads the setting once at launch and watches background/foreground. */
export function startLock(): void {
  if (started) return;
  started = true;
  void readPin()
    .then((config) => set({ status: config ? 'locked' : 'open', config }))
    .catch(() => set({ status: 'open', config: null }));
  document.addEventListener('visibilitychange', onVisibility);
}
