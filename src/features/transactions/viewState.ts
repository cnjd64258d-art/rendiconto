import { useSyncExternalStore } from 'react';
import { DEFAULT_VIEW, type ViewConfig } from '../../core/views';
import type { Id } from '../../core/types';

/**
 * The Transactions screen's current view. Kept outside React so it survives switching tabs
 * (the screen unmounts) but not a reload, like Notion's unsaved view changes.
 */
interface State {
  /** null = the built-in "Tutte" view. */
  viewId: Id | null;
  config: ViewConfig;
}

let state: State = { viewId: null, config: DEFAULT_VIEW };
const listeners = new Set<() => void>();

export function setViewState(next: State | ((s: State) => State)) {
  state = typeof next === 'function' ? next(state) : next;
  for (const l of listeners) l();
}

export function updateConfig(patch: Partial<ViewConfig> | ((c: ViewConfig) => ViewConfig)) {
  setViewState((s) => ({ ...s, config: typeof patch === 'function' ? patch(s.config) : { ...s.config, ...patch } }));
}

export function useViewState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
