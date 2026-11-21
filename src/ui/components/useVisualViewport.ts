import { useSyncExternalStore } from 'react';

interface ViewportState {
  height: number;
  /** Height covered by the on-screen keyboard, in px. */
  keyboardInset: number;
}

let snapshot: ViewportState = read();

function read(): ViewportState {
  if (typeof window === 'undefined') return { height: 0, keyboardInset: 0 };
  const vv = window.visualViewport;
  const height = vv?.height ?? window.innerHeight;
  const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  // Ignore tiny differences (toolbars, rounding).
  return { height: Math.round(height), keyboardInset: inset > 80 ? Math.round(inset) : 0 };
}

function subscribe(callback: () => void) {
  const vv = window.visualViewport;
  const update = () => {
    const next = read();
    if (next.height !== snapshot.height || next.keyboardInset !== snapshot.keyboardInset) {
      snapshot = next;
      callback();
    }
  };
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return () => {
    vv?.removeEventListener('resize', update);
    vv?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}

/** Tracks the visual viewport so sheets sit right above the iOS keyboard. */
export function useVisualViewport(): ViewportState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
