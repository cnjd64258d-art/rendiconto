import { useSyncExternalStore } from 'react';
import type { Transaction } from '../core/types';
import { primeKeyboard } from '../ui/components';

/** Global state of the add/edit sheet, so any screen can open it. */
export interface EditorState {
  open: boolean;
  /** Changes every time the sheet opens, to reset the form. */
  session: number;
  editing: Transaction | null;
  /** New entry already linked to an instalment plan ("Registra la prossima rata"). */
  planId?: string;
}

let state: EditorState = { open: false, session: 0, editing: null };
const listeners = new Set<() => void>();

function set(next: EditorState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Call from a tap handler: opens the keyboard on iOS for a new entry. */
export function openNewTransaction(): void {
  primeKeyboard('decimal');
  set({ open: true, session: state.session + 1, editing: null });
}

/** Call from a tap handler: a new expense that is the next instalment of a plan. */
export function openNewInstalment(planId: string): void {
  primeKeyboard('decimal');
  set({ open: true, session: state.session + 1, editing: null, planId });
}

export function openEditTransaction(t: Transaction): void {
  openEditor(t);
}

export function openEditor(editing: Transaction | null): void {
  set({ open: true, session: state.session + 1, editing });
}

export function closeEditor(): void {
  (document.activeElement as HTMLElement | null)?.blur();
  set({ ...state, open: false });
}

export function useEditor(): EditorState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
